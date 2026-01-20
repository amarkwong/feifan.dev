terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

locals {
  default_env = {
    NODE_VERSION = var.node_version
  }

  pages_cname_target = (
    endswith(cloudflare_pages_project.site.subdomain, ".pages.dev")
      ? cloudflare_pages_project.site.subdomain
      : "${cloudflare_pages_project.site.subdomain}.pages.dev"
  )
}

data "cloudflare_zone" "managed" {
  count      = var.managed_zone == "" ? 0 : 1
  account_id = var.cloudflare_account_id
  name       = var.managed_zone
}

locals {
  managed_zone_id = var.managed_zone == "" ? null : data.cloudflare_zone.managed[0].id

  managed_zone_domains = local.managed_zone_id == null ? {} : {
    for domain in var.custom_domains : domain => domain
    if domain != "" && (domain == var.managed_zone || endswith(domain, ".${var.managed_zone}"))
  }
}

resource "cloudflare_pages_project" "site" {
  account_id        = var.cloudflare_account_id
  name              = var.pages_project_name
  production_branch = var.production_branch

  build_config {
    build_command   = var.build_command
    destination_dir = var.build_output_dir
    root_dir        = var.project_root
  }

  source {
    type = "github"

    config {
      owner               = var.github_owner
      repo_name           = var.github_repo
      production_branch   = var.production_branch
      deployments_enabled = true
      pr_comments_enabled = var.enable_pr_comments
      preview_branch_includes = var.preview_branch_includes
      preview_branch_excludes = var.preview_branch_excludes
    }
  }

  deployment_configs {
    production {
      environment_variables = merge(local.default_env, var.production_env_vars)
    }

    preview {
      environment_variables = merge(local.default_env, var.preview_env_vars)
    }
  }
}

resource "cloudflare_pages_domain" "custom" {
  for_each    = { for domain in var.custom_domains : domain => domain }
  account_id  = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  domain      = each.value
}

resource "cloudflare_record" "pages_cname" {
  for_each = local.managed_zone_domains

  zone_id = local.managed_zone_id
  name    = each.value == var.managed_zone ? "@" : trimsuffix(each.value, ".${var.managed_zone}")
  type    = "CNAME"
  value   = local.pages_cname_target
  proxied = var.pages_cname_proxied
  ttl     = 1
}

# Vercel Proxy Workers - routes feifan.dev/<app>/* to Vercel deployments
resource "cloudflare_worker_script" "vercel_proxy" {
  for_each   = var.vercel_proxies
  account_id = var.cloudflare_account_id
  name       = "${each.key}-proxy"
  content    = <<-EOF
    export default {
      async fetch(request, env) {
        const url = new URL(request.url);
        const pathname = url.pathname;
        const prefix = "/${each.key}";

        if (!pathname.startsWith(prefix)) {
          return fetch(request);
        }

        const targetPath = pathname.slice(prefix.length) || "/";
        const targetUrl = new URL(targetPath, env.VERCEL_TARGET);
        targetUrl.search = url.search;

        const proxyRequest = new Request(targetUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.body,
          redirect: "manual",
        });

        const response = await fetch(proxyRequest);

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("Location");
          if (location) {
            const locationUrl = new URL(location, env.VERCEL_TARGET);
            if (locationUrl.origin === new URL(env.VERCEL_TARGET).origin) {
              const newLocation = prefix + locationUrl.pathname + locationUrl.search;
              const newHeaders = new Headers(response.headers);
              newHeaders.set("Location", newLocation);
              return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders,
              });
            }
          }
        }

        return response;
      },
    };
  EOF

  plain_text_binding {
    name = "VERCEL_TARGET"
    text = each.value.vercel_url
  }

  module = true
}

resource "cloudflare_worker_route" "vercel_proxy" {
  for_each    = var.vercel_proxies
  zone_id     = local.managed_zone_id
  pattern     = each.value.route_pattern
  script_name = cloudflare_worker_script.vercel_proxy[each.key].name
}

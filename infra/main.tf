terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
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
      owner                   = var.github_owner
      repo_name               = var.github_repo
      production_branch       = var.production_branch
      deployments_enabled     = true
      pr_comments_enabled     = var.enable_pr_comments
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
  for_each     = { for domain in var.custom_domains : domain => domain }
  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.site.name
  domain       = each.value
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

# --- Resend transactional email DNS ---
# Verifies each sending domain registered in Resend. Every key of
# var.resend_sending_domains gets its own MX/SPF/DKIM (and optionally DMARC)
# record set, e.g. giftcards.feifan.dev for the Discount Tracker
# ("Discount Tracker <notifications@giftcards.feifan.dev>") and the apex
# feifan.dev for the default sender. Record values come from the Resend
# Domains screen; records whose value is still blank are skipped so a
# plan/apply never publishes placeholder data.

locals {
  resend_domains = local.managed_zone_id == null ? {} : {
    for domain, cfg in var.resend_sending_domains : domain => merge(cfg, {
      # Record-name fragment relative to the managed zone: "giftcards" for
      # giftcards.feifan.dev, "" for the zone apex itself.
      relative = domain == var.managed_zone ? "" : trimsuffix(domain, ".${var.managed_zone}")
      dmarc_value = (
        cfg.dmarc_rua == ""
        ? "v=DMARC1; p=none;"
        : "v=DMARC1; p=none; rua=mailto:${cfg.dmarc_rua};"
      )
    })
    if domain == var.managed_zone || endswith(domain, ".${var.managed_zone}")
  }

  resend_record_names = {
    for domain, cfg in local.resend_domains : domain => {
      return_path = join(".", compact([cfg.return_path_subdomain, cfg.relative]))
      dkim        = join(".", compact(["${cfg.dkim_selector}._domainkey", cfg.relative]))
      dmarc       = join(".", compact(["_dmarc", cfg.relative]))
    }
  }
}

resource "cloudflare_record" "resend_return_path_mx" {
  for_each = { for domain, cfg in local.resend_domains : domain => cfg if cfg.mx_value != "" }

  zone_id  = local.managed_zone_id
  name     = local.resend_record_names[each.key].return_path
  type     = "MX"
  value    = each.value.mx_value
  priority = each.value.mx_priority
  ttl      = 1
}

resource "cloudflare_record" "resend_spf" {
  for_each = { for domain, cfg in local.resend_domains : domain => cfg if cfg.spf_value != "" }

  zone_id = local.managed_zone_id
  name    = local.resend_record_names[each.key].return_path
  type    = "TXT"
  value   = each.value.spf_value
  ttl     = 1
}

resource "cloudflare_record" "resend_dkim" {
  for_each = { for domain, cfg in local.resend_domains : domain => cfg if cfg.dkim_value != "" }

  zone_id = local.managed_zone_id
  name    = local.resend_record_names[each.key].dkim
  type    = "TXT"
  value   = each.value.dkim_value
  ttl     = 1
}

# Conservative monitoring-only DMARC policy per sending domain. Domains can
# opt out with manage_dmarc = false (e.g. to leave the apex domain's email
# policy untouched).
resource "cloudflare_record" "resend_dmarc" {
  for_each = { for domain, cfg in local.resend_domains : domain => cfg if cfg.manage_dmarc }

  zone_id = local.managed_zone_id
  name    = local.resend_record_names[each.key].dmarc
  type    = "TXT"
  value   = each.value.dmarc_value
  ttl     = 1
}

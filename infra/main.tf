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

# --- Resend transactional email DNS (Discount Tracker) ---
# Verifies the giftcards.feifan.dev sending subdomain with Resend so the app
# (hosted separately) can send as "Discount Tracker <notifications@giftcards.feifan.dev>".
# Record values come from the Resend Domains screen; records whose value is
# still blank are skipped so a plan/apply never publishes placeholder data.

locals {
  resend_enabled = local.managed_zone_id != null && var.resend_sending_domain != ""

  # Record names relative to the managed zone, e.g. "giftcards" for
  # giftcards.feifan.dev inside the feifan.dev zone.
  resend_domain_relative  = trimsuffix(var.resend_sending_domain, ".${var.managed_zone}")
  resend_return_path_name = "${var.resend_return_path_subdomain}.${local.resend_domain_relative}"
  resend_dkim_name        = "${var.resend_dkim_selector}._domainkey.${local.resend_domain_relative}"
  resend_dmarc_name       = "_dmarc.${local.resend_domain_relative}"

  resend_dmarc_value = (
    var.resend_dmarc_rua == ""
    ? "v=DMARC1; p=none;"
    : "v=DMARC1; p=none; rua=mailto:${var.resend_dmarc_rua};"
  )
}

resource "cloudflare_record" "resend_return_path_mx" {
  count = local.resend_enabled && var.resend_mx_value != "" ? 1 : 0

  zone_id  = local.managed_zone_id
  name     = local.resend_return_path_name
  type     = "MX"
  value    = var.resend_mx_value
  priority = var.resend_mx_priority
  ttl      = 1
}

resource "cloudflare_record" "resend_spf" {
  count = local.resend_enabled && var.resend_spf_value != "" ? 1 : 0

  zone_id = local.managed_zone_id
  name    = local.resend_return_path_name
  type    = "TXT"
  value   = var.resend_spf_value
  ttl     = 1
}

resource "cloudflare_record" "resend_dkim" {
  count = local.resend_enabled && var.resend_dkim_value != "" ? 1 : 0

  zone_id = local.managed_zone_id
  name    = local.resend_dkim_name
  type    = "TXT"
  value   = var.resend_dkim_value
  ttl     = 1
}

# Conservative monitoring-only DMARC policy scoped to the sending subdomain.
# Deliberately does not touch the parent feifan.dev domain.
resource "cloudflare_record" "resend_dmarc" {
  count = local.resend_enabled ? 1 : 0

  zone_id = local.managed_zone_id
  name    = local.resend_dmarc_name
  type    = "TXT"
  value   = local.resend_dmarc_value
  ttl     = 1
}

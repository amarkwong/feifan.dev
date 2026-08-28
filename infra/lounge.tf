locals {
  lounge_pages_subdomain = one(cloudflare_pages_project.lounge[*].subdomain)
  lounge_pages_cname_target = var.enable_lounge_access ? (
    endswith(local.lounge_pages_subdomain, ".pages.dev")
    ? local.lounge_pages_subdomain
    : "${local.lounge_pages_subdomain}.pages.dev"
  ) : ""
}

resource "cloudflare_pages_project" "lounge" {
  count = var.enable_lounge_access ? 1 : 0

  account_id        = var.cloudflare_account_id
  name              = var.lounge_pages_project_name
  production_branch = var.production_branch

  build_config {
    build_command   = "exit 0"
    destination_dir = "."
    root_dir        = "lounge"
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
}

resource "cloudflare_pages_domain" "lounge" {
  count = var.enable_lounge_access ? 1 : 0

  account_id   = var.cloudflare_account_id
  project_name = cloudflare_pages_project.lounge[0].name
  domain       = var.lounge_hostname
}

resource "cloudflare_record" "lounge_pages_cname" {
  count = var.enable_lounge_access && local.managed_zone_id != null ? 1 : 0

  zone_id = local.managed_zone_id
  name    = trimsuffix(var.lounge_hostname, ".${var.managed_zone}")
  type    = "CNAME"
  value   = local.lounge_pages_cname_target
  proxied = true
  ttl     = 1
}

# MVR reuses the private Lounge Access application and homeserver tunnel.
# The application verifies the signed Lounge JWT, including at its origin hostname.
resource "cloudflare_worker_script" "mvr" {
  account_id = var.cloudflare_account_id
  name       = "lounge-mvr"
  content    = file("${path.module}/mvr-worker.js")
  module     = true
}

resource "cloudflare_worker_route" "mvr" {
  zone_id     = local.managed_zone_id
  pattern     = "${var.lounge_hostname}/mvr*"
  script_name = cloudflare_worker_script.mvr.name
}

resource "cloudflare_record" "mvr_origin" {
  zone_id = local.managed_zone_id
  name    = "mvr-origin"
  type    = "CNAME"
  value   = cloudflare_zero_trust_tunnel_cloudflared.homeserver[0].cname
  proxied = true
  ttl     = 1
}

output "mvr_access_audience" {
  value = cloudflare_zero_trust_access_application.friends[var.lounge_hostname].aud
}

output "mvr_access_issuer" {
  value = "https://${var.cloudflare_access_team_name}.cloudflareaccess.com"
}

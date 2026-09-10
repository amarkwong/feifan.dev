# Slide Studio keeps the existing Pages lounge and Access policy.
resource "cloudflare_worker_script" "powerpoint" {
  account_id = var.cloudflare_account_id
  name       = "lounge-powerpoint"
  content    = file("${path.module}/powerpoint-worker.js")
  module     = true
}
resource "cloudflare_worker_route" "powerpoint" {
  zone_id     = local.managed_zone_id
  pattern     = "${var.lounge_hostname}/ppt*"
  script_name = cloudflare_worker_script.powerpoint.name
}
resource "cloudflare_record" "powerpoint_origin" {
  zone_id = local.managed_zone_id
  name    = "ppt-origin"
  type    = "CNAME"
  value   = cloudflare_zero_trust_tunnel_cloudflared.homeserver[0].cname
  proxied = true
  ttl     = 1
}
output "powerpoint_access_audience" {
  value = cloudflare_zero_trust_access_application.friends[var.lounge_hostname].aud
}
output "powerpoint_access_issuer" {
  value = "https://${var.cloudflare_access_team_name}.cloudflareaccess.com"
}

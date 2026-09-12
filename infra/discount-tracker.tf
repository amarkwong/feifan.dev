# Keep the former Discount Tracker hostname working without maintaining a
# second application origin. Cloudflare Access protects both hostnames before
# this Worker permanently redirects authenticated visitors to the canonical URL.
resource "cloudflare_worker_script" "discount_tracker_redirect" {
  account_id = var.cloudflare_account_id
  name       = "discount-tracker-legacy-redirect"
  content    = file("${path.module}/discount-tracker-worker.js")
  module     = true
}

resource "cloudflare_worker_route" "discount_tracker_redirect" {
  zone_id     = local.managed_zone_id
  pattern     = "${var.discount_tracker_legacy_hostname}/*"
  script_name = cloudflare_worker_script.discount_tracker_redirect.name
}

# --- Cloudflare Tunnel to the homeserver (Discount Tracker) ---
# Exposes services running on the homeserver without opening any router ports
# (works behind CGNAT). cloudflared on the homeserver dials out using the
# tunnel token; the ingress rules below map public hostnames to services as
# cloudflared sees them from inside the homeserver's compose network.
#
# The tunnel secret and token live in Terraform state, which is local and
# gitignored. Retrieve the token for the homeserver's .env with:
#   terraform output -raw homeserver_tunnel_token
#
# NOTE: the Cloudflare API token needs Account → Cloudflare Tunnel → Edit
# in addition to the existing Pages/DNS permissions.

locals {
  tunnel_enabled = var.homeserver_tunnel_name != ""

  # Ingress hostnames inside the managed zone each get a proxied CNAME to the
  # tunnel endpoint. Hostnames outside the zone are routed by the tunnel but
  # must have DNS managed elsewhere.
  tunnel_dns_hostnames = local.tunnel_enabled && local.managed_zone_id != null ? {
    for rule in var.homeserver_tunnel_ingress : rule.hostname => rule.hostname
    if rule.hostname == var.managed_zone || endswith(rule.hostname, ".${var.managed_zone}")
  } : {}
}

resource "random_id" "homeserver_tunnel_secret" {
  count       = local.tunnel_enabled ? 1 : 0
  byte_length = 32
}

resource "cloudflare_zero_trust_tunnel_cloudflared" "homeserver" {
  count      = local.tunnel_enabled ? 1 : 0
  account_id = var.cloudflare_account_id
  name       = var.homeserver_tunnel_name
  secret     = random_id.homeserver_tunnel_secret[0].b64_std
  config_src = "cloudflare" # ingress managed remotely via the config resource below
}

resource "cloudflare_zero_trust_tunnel_cloudflared_config" "homeserver" {
  count      = local.tunnel_enabled ? 1 : 0
  account_id = var.cloudflare_account_id
  tunnel_id  = cloudflare_zero_trust_tunnel_cloudflared.homeserver[0].id

  config {
    dynamic "ingress_rule" {
      for_each = var.homeserver_tunnel_ingress
      content {
        hostname = ingress_rule.value.hostname
        service  = ingress_rule.value.service
      }
    }

    # Required catch-all: hostnames not matched above return 404 at the edge.
    ingress_rule {
      service = "http_status:404"
    }
  }
}

resource "cloudflare_record" "tunnel_cname" {
  for_each = local.tunnel_dns_hostnames

  zone_id = local.managed_zone_id
  name    = each.value == var.managed_zone ? "@" : trimsuffix(each.value, ".${var.managed_zone}")
  type    = "CNAME"
  value   = cloudflare_zero_trust_tunnel_cloudflared.homeserver[0].cname
  proxied = true # tunnels are only reachable through the proxy (orange cloud)
  ttl     = 1
}

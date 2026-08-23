output "pages_project_name" {
  description = "Cloudflare Pages project name"
  value       = cloudflare_pages_project.site.name
}

output "pages_project_subdomain" {
  description = "Default *.pages.dev hostname provisioned by Cloudflare"
  value       = cloudflare_pages_project.site.subdomain
}

output "custom_domains" {
  description = "Custom domains attached to the Pages project"
  value       = keys(cloudflare_pages_domain.custom)
}

output "dns_records" {
  description = "DNS records created for Pages custom domains"
  value = {
    for domain, record in cloudflare_record.pages_cname : domain => {
      name    = record.hostname
      proxied = record.proxied
      type    = record.type
      target  = record.value
    }
  }
}

output "homeserver_tunnel_id" {
  description = "ID of the homeserver Cloudflare Tunnel (null when disabled)"
  value       = one(cloudflare_zero_trust_tunnel_cloudflared.homeserver[*].id)
}

output "homeserver_tunnel_token" {
  description = "Token for cloudflared on the homeserver — goes into TUNNEL_TOKEN in the Discount Tracker deploy .env; read with: terraform output -raw homeserver_tunnel_token"
  value       = one(cloudflare_zero_trust_tunnel_cloudflared.homeserver[*].tunnel_token)
  sensitive   = true
}

output "homeserver_tunnel_dns_records" {
  description = "Proxied CNAME records pointing tunnel hostnames at the tunnel endpoint"
  value = {
    for hostname, record in cloudflare_record.tunnel_cname : hostname => {
      name   = record.hostname
      type   = record.type
      target = record.value
    }
  }
}

output "resend_dns_records" {
  description = "DNS records managed for Resend email verification, grouped by sending domain"
  value = {
    for domain in keys(var.resend_sending_domains) : domain => {
      for kind, records in {
        return_path_mx = cloudflare_record.resend_return_path_mx
        spf            = cloudflare_record.resend_spf
        dkim           = cloudflare_record.resend_dkim
        dmarc          = cloudflare_record.resend_dmarc
        } : kind => {
        name  = records[domain].hostname
        type  = records[domain].type
        value = records[domain].value
      } if contains(keys(records), domain)
    }
  }
}

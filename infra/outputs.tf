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
      name     = record.hostname
      proxied  = record.proxied
      type     = record.type
      target   = record.value
    }
  }
}

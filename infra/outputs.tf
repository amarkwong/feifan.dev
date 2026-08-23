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

output "resend_dns_records" {
  description = "DNS records created for Resend email verification of the sending subdomain"
  value = {
    for key, records in {
      return_path_mx = cloudflare_record.resend_return_path_mx
      spf            = cloudflare_record.resend_spf
      dkim           = cloudflare_record.resend_dkim
      dmarc          = cloudflare_record.resend_dmarc
      } : key => {
      name  = records[0].hostname
      type  = records[0].type
      value = records[0].value
    } if length(records) > 0
  }
}

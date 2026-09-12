variable "cloudflare_api_token" {
  type        = string
  description = "API token with Pages, Workers KV, and DNS:Edit (if managing domains)"
  sensitive   = true
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account identifier"
}

variable "pages_project_name" {
  type        = string
  description = "Name of the Cloudflare Pages project"
  default     = "feifan-dev"
}

variable "production_branch" {
  type        = string
  description = "Git branch that should publish to production"
  default     = "main"
}

variable "github_owner" {
  type        = string
  description = "GitHub organization or user that owns the repository"
  default     = "amarkwong"
}

variable "github_repo" {
  type        = string
  description = "Repository name in GitHub"
  default     = "feifan.dev"
}

variable "node_version" {
  type        = string
  description = "Node version used during Cloudflare Pages builds"
  default     = "20.9.0"
}

variable "build_command" {
  type        = string
  description = "Command Cloudflare Pages runs to build the site"
  default     = "npm run build"
}

variable "build_output_dir" {
  type        = string
  description = "Directory that contains the generated site"
  default     = "dist"
}

variable "project_root" {
  type        = string
  description = "Subdirectory containing the project (empty string means repo root)"
  default     = ""
}

variable "custom_domains" {
  type        = list(string)
  description = "List of custom domains to attach to the Pages project"
  default     = []
}

variable "managed_zone" {
  type        = string
  description = "Cloudflare zone (apex domain) to manage DNS records for custom domains; leave blank to skip DNS management"
  default     = ""
}

variable "pages_cname_proxied" {
  type        = bool
  description = "Whether Terraform-created CNAME records for Pages should be proxied (orange-cloud). Set false temporarily if you hit CF error 1014."
  default     = true
}

variable "production_env_vars" {
  type        = map(string)
  description = "Environment variables for production deployments (e.g., NOTION_API_KEY)"
  default     = {}
  sensitive   = true
}

variable "preview_env_vars" {
  type        = map(string)
  description = "Environment variables for preview deployments"
  default     = {}
  sensitive   = true
}

variable "enable_pr_comments" {
  type        = bool
  description = "Whether Cloudflare should comment on GitHub pull requests"
  default     = true
}

variable "preview_branch_includes" {
  type        = list(string)
  description = "List of branch globs that should create preview builds"
  default     = ["*"]
}

variable "preview_branch_excludes" {
  type        = list(string)
  description = "Branch globs that should NOT create preview builds"
  default     = []
}

variable "primary_domain" {
  type        = string
  description = "Optional helper: the apex domain for outputs"
  default     = ""
}

# --- Private Lounge authentication and authorization ---

variable "enable_lounge_access" {
  type        = bool
  description = "Create the Auth0 client and Cloudflare Access resources for the private Lounge"
  default     = false
}

variable "auth0_domain" {
  type        = string
  description = "Auth0 tenant domain without https://; this is configuration, not the Terraform provider credential"
  default     = ""
}

variable "auth0_connection_name" {
  type        = string
  description = "Existing Auth0 database or social connection to enable for invited Lounge members"
  default     = "Username-Password-Authentication"
}

variable "cloudflare_access_team_name" {
  type        = string
  description = "Cloudflare Zero Trust team name used in <team>.cloudflareaccess.com callback URLs"
  default     = ""
}

variable "lounge_hostname" {
  type        = string
  description = "Private friends portal hostname"
  default     = "lounge.feifan.dev"
}

variable "lounge_pages_project_name" {
  type        = string
  description = "Cloudflare Pages project serving the static private Lounge"
  default     = "feifan-lounge"
}

variable "owner_email" {
  type        = string
  description = "Exact verified Auth0 email allowed to reach the owner-only homeserver homepage"
  default     = ""
  sensitive   = true
}

variable "lounge_allowed_emails" {
  type        = set(string)
  description = "Exact Auth0 emails allowed into friend-facing Lounge applications; include the owner"
  default     = []
  sensitive   = true
}

variable "lounge_friend_hostnames" {
  type        = set(string)
  description = "Browser-based applications protected by the Lounge email allowlist; Jellyfin is deliberately excluded for native-client compatibility"
  default = [
    "lounge.feifan.dev",
    "discounts.feifan.dev",
    "giftcards.feifan.dev",
    "seerr.feifan.dev",
  ]
}

variable "discount_tracker_hostname" {
  type        = string
  description = "Canonical public hostname for Discount Tracker"
  default     = "discounts.feifan.dev"
}

variable "discount_tracker_legacy_hostname" {
  type        = string
  description = "Previous Discount Tracker hostname retained as a permanent redirect"
  default     = "giftcards.feifan.dev"
}

variable "discount_tracker_service" {
  type        = string
  description = "Discount Tracker origin as resolved by cloudflared on the homeserver network"
  default     = "http://tracker:3000"
}

variable "home_hostname" {
  type        = string
  description = "Owner-only homeserver homepage hostname"
  default     = "home.feifan.dev"
}


# --- Resend transactional email DNS ---
# Values below are DNS verification data published publicly once applied, so
# they are intentionally not marked sensitive. The Resend API key is NOT a
# Terraform input; it lives only in each application's runtime.

variable "resend_sending_domains" {
  type = map(object({
    mx_value              = optional(string, "")
    mx_priority           = optional(number, 10)
    spf_value             = optional(string, "")
    dkim_selector         = optional(string, "resend")
    dkim_value            = optional(string, "")
    return_path_subdomain = optional(string, "send")
    manage_dmarc          = optional(bool, true)
    dmarc_rua             = optional(string, "")
  }))
  description = <<-EOT
    Sending domains registered in Resend, keyed by domain (the managed zone
    apex or a subdomain of it). Per-domain values come from the Resend
    Domains screen: mx_value/mx_priority for the return-path MX,
    spf_value for the return-path SPF TXT, dkim_value ("p=...") for the
    <dkim_selector>._domainkey TXT. Records whose value is "" are skipped.
    manage_dmarc controls whether a monitoring-only DMARC record is
    published for the domain; dmarc_rua optionally adds an aggregate-report
    mailbox (address only, no mailto:).
  EOT
  default     = {}
}

# --- Cloudflare Tunnel to the homeserver (Discount Tracker) ---

variable "homeserver_tunnel_name" {
  type        = string
  description = "Name of the Cloudflare Tunnel connecting the homeserver; set to \"\" to disable the tunnel, its config, and its DNS records"
  default     = "homeserver"
}

variable "homeserver_tunnel_ingress" {
  type = list(object({
    hostname = string
    service  = string
  }))
  description = "Public hostname → origin service routes for the homeserver tunnel; service addresses are resolved by cloudflared inside the homeserver's Docker compose network"
  default     = []
}

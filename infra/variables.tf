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


# --- Resend transactional email DNS (Discount Tracker) ---
# Values below are DNS verification data published publicly once applied, so
# they are intentionally not marked sensitive. The Resend API key is NOT a
# Terraform input; it lives only in the Discount Tracker runtime.

variable "resend_sending_domain" {
  type        = string
  description = "Subdomain registered as the sending domain in Resend (must live inside managed_zone); set to \"\" to disable all Resend DNS records"
  default     = "giftcards.feifan.dev"
}

variable "resend_return_path_subdomain" {
  type        = string
  description = "Host prefix Resend shows for the return-path MX/SPF records (Resend's default is \"send\")"
  default     = "send"
}

variable "resend_mx_value" {
  type        = string
  description = "MX target copied from the Resend Domains screen (e.g. feedback-smtp.<region>.amazonses.com); leave \"\" until copied so no record is created"
  default     = ""
}

variable "resend_mx_priority" {
  type        = number
  description = "Priority for the Resend return-path MX record, as shown on the Resend Domains screen"
  default     = 10
}

variable "resend_spf_value" {
  type        = string
  description = "SPF TXT value copied from the Resend Domains screen; leave \"\" until copied so no record is created"
  default     = ""
}

variable "resend_dkim_selector" {
  type        = string
  description = "DKIM selector shown by Resend (record name <selector>._domainkey.<sending domain>)"
  default     = "resend"
}

variable "resend_dkim_value" {
  type        = string
  description = "DKIM public-key TXT value (\"p=...\") copied from the Resend Domains screen; leave \"\" until copied so no record is created"
  default     = ""
}

variable "resend_dmarc_rua" {
  type        = string
  description = "Optional mailbox (address only, no mailto:) for DMARC aggregate reports; leave \"\" to publish p=none without reporting"
  default     = ""
}

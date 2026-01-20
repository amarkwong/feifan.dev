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

# Vercel proxy workers - routes subpaths to Vercel apps
variable "vercel_proxies" {
  type = map(object({
    vercel_url     = string
    route_patterns = list(string)
  }))
  description = "Map of Vercel proxy configurations. Key is the app name, value contains vercel_url and route_patterns (list)."
  default     = {}
}

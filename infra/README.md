# Cloudflare Pages infrastructure

This folder contains Terraform configuration that provisions a Cloudflare Pages project for `feifan.dev`, connects it to the GitHub repository, and optionally binds custom domains + environment variables.

## Prerequisites

1. **Terraform** v1.5 or newer installed locally.
2. **Cloudflare API token** with the following permissions:
   - Account → Cloudflare Pages: Edit
   - Account → Workers KV Storage: Read (needed internally by Pages)
   - Zone → DNS: Edit (only if you plan to manage DNS via Terraform)
3. **GitHub ↔️ Cloudflare Pages OAuth** connection already established via the Cloudflare dashboard (Terraform references the repo but cannot create the OAuth link).

## Customization

Set variables either via a `terraform.tfvars` file, CLI flags, or environment variables with the `TF_VAR_` prefix.

Common variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `cloudflare_account_id` | Target Cloudflare account ID | _none_ |
| `cloudflare_api_token` | Token described above | _none_ |
| `pages_project_name` | Pages project name | `feifan-dev` |
| `production_branch` | Branch to publish to production | `main` |
| `github_owner` / `github_repo` | Repository coordinates | `amarkwong` / `feifan.dev` |
| `custom_domains` | Optional list of custom domains (apex + www) | `[]` |
| `managed_zone` | Apex domain in Cloudflare DNS to manage records for | `""` |
| `production_env_vars` / `preview_env_vars` | Maps of environment variables (e.g., `NOTION_TOKEN`) | `{}` |

Example `terraform.tfvars`:

```hcl
cloudflare_account_id   = "1234567890abcdef"
cloudflare_api_token    = "CFPAT-..."
custom_domains          = ["feifan.dev", "www.feifan.dev"]
production_env_vars = {
  NOTION_API_KEY = "secret"
}
preview_env_vars = {
  NOTION_API_KEY = "secret-preview"
}
```

## Usage

```bash
cd infra
terraform init
terraform plan
terraform apply
```

### What gets created

- `cloudflare_pages_project.site`: Configures the Pages project with Astro build settings and connects the GitHub repo/branch.
- `cloudflare_pages_domain.custom`: Adds each domain in `custom_domains` to the project (DNS records must already resolve to Cloudflare).
- `cloudflare_record.pages_cname`: (Optional) When `managed_zone` is set, creates proxied CNAME records pointing the apex/`www` at `<project>.pages.dev` so verification succeeds automatically.

> **Tip:** Set `custom_domains = ["feifan.dev", "www.feifan.dev"]` and `managed_zone = "feifan.dev"` to create both records. Additional subdomains must belong to the same zone.

## Deploy flow

1. Push to `main` → Cloudflare Pages pulls from GitHub, runs `npm run build`, and serves `dist/`.
2. Pull requests trigger Preview builds (branch filters controlled by `preview_branch_includes/excludes`).
3. Environment variables from `production_env_vars` and `preview_env_vars` are injected into their respective builds alongside the enforced `NODE_VERSION`.

If you later need Workers, R2, or KV bindings, extend `deployment_configs` with the appropriate keys per Cloudflare’s provider schema.

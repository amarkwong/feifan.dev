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

Set variables either via a `terraform.tfvars` file (start from `terraform.tfvars.example`), CLI flags, or environment variables with the `TF_VAR_` prefix.

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
| `pages_cname_proxied` | Whether Terraform-created CNAMEs are orange-cloud proxied | `true` |
| `production_env_vars` / `preview_env_vars` | Maps of environment variables (e.g., `NOTION_API_KEY`, `NOTION_DATABASE_ID`) | `{}` |

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

- `cloudflare_pages_project.site`: Configures the Pages project with Astro-friendly build settings (Cloudflare auto-detects the framework) and connects the GitHub repo/branch.
- `cloudflare_pages_domain.custom`: Adds each domain in `custom_domains` to the project (DNS records must already resolve to Cloudflare).
- `cloudflare_record.pages_cname`: (Optional) When `managed_zone` is set, creates CNAME records pointing the apex/`www` at `<project>.pages.dev`. Control whether they’re proxied via `pages_cname_proxied` (set to `false` if you need DNS-only until Cloudflare finishes verifying the custom host).

> **Tip:** Set `custom_domains = ["feifan.dev", "www.feifan.dev"]` and `managed_zone = "feifan.dev"` to create both records. Additional subdomains must belong to the same zone.

## Deploy flow

1. Push to `main` → Cloudflare Pages pulls from GitHub, runs `npm run build`, and serves `dist/`.
2. Pull requests trigger Preview builds (branch filters controlled by `preview_branch_includes/excludes`).
3. Environment variables from `production_env_vars` and `preview_env_vars` are injected into their respective builds alongside the enforced `NODE_VERSION`.

If you later need Workers, R2, or KV bindings, extend `deployment_configs` with the appropriate keys per Cloudflare’s provider schema.

## Resend email DNS (Discount Tracker)

Terraform also manages the DNS records that verify `giftcards.feifan.dev` as a
Resend sending domain, so the separately hosted Discount Tracker app can send
transactional email as **`Discount Tracker <notifications@giftcards.feifan.dev>`**.

Scope notes:

- Only DNS lives here. Email code, templates, user preferences, and the
  **Resend API key** belong to the DiscountTracker repository — never put the
  API key in Terraform, tfvars, Cloudflare, or state.
- The existing record serving the app at `giftcards.feifan.dev` is not managed
  or modified by these resources; the email records use different names
  (`send.giftcards`, `resend._domainkey.giftcards`, `_dmarc.giftcards`).
- DMARC is published only at `_dmarc.giftcards.feifan.dev` with a conservative
  `p=none` policy. The parent `feifan.dev` domain is untouched.

### 1. Copy values from Resend

In the Resend dashboard, add the domain `giftcards.feifan.dev`
(Resend → Domains → Add Domain), then copy from its verification screen:

| Resend screen shows | Put it in (terraform.tfvars) |
| --- | --- |
| MX record target, e.g. `feedback-smtp.<region>.amazonses.com` | `resend_mx_value` (and `resend_mx_priority` if not 10) |
| SPF TXT value, e.g. `v=spf1 include:amazonses.com ~all` | `resend_spf_value` |
| DKIM TXT value (long `p=...` string) | `resend_dkim_value` |
| Return-path host prefix (usually `send`) | `resend_return_path_subdomain` |
| DKIM selector (usually `resend`) | `resend_dkim_selector` |

Copy the values exactly — do not guess them. While a value is still `""`,
Terraform simply skips that record, so a partial apply never publishes
placeholder data. Optionally set `resend_dmarc_rua` to a mailbox that should
receive DMARC aggregate reports; leave it empty otherwise.

### 2. Plan and apply

```bash
cd infra
terraform fmt -check
terraform validate
terraform plan
terraform apply
```

Expected records (all DNS-only / grey-cloud, in the `feifan.dev` zone):

- `send.giftcards.feifan.dev` — MX → the Resend/SES feedback target
- `send.giftcards.feifan.dev` — TXT (SPF)
- `resend._domainkey.giftcards.feifan.dev` — TXT (DKIM)
- `_dmarc.giftcards.feifan.dev` — TXT `v=DMARC1; p=none;`

### 3. Verify in Resend

After applying, wait for DNS propagation (usually minutes, up to an hour), then
press **Verify DNS Records** on the domain's page in Resend → Domains. Status
should move to *Verified*. You can check propagation yourself with:

```bash
dig +short MX send.giftcards.feifan.dev
dig +short TXT send.giftcards.feifan.dev
dig +short TXT resend._domainkey.giftcards.feifan.dev
dig +short TXT _dmarc.giftcards.feifan.dev
```

Once verified, the Discount Tracker runtime (configured in its own repo with
the Resend API key) can send from `notifications@giftcards.feifan.dev`.

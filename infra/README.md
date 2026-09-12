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

Terraform also manages the DNS records that verify `discounts.feifan.dev` as a
Resend sending domain, so the separately hosted Discount Tracker app can send
transactional email as **`Discount Tracker <notifications@discounts.feifan.dev>`**.

Scope notes:

- Only DNS lives here. Email code, templates, user preferences, and the
  **Resend API key** belong to the DiscountTracker repository — never put the
  API key in Terraform, tfvars, Cloudflare, or state.
- The existing record serving the app at `discounts.feifan.dev` is not managed
  or modified by these resources; the email records use different names
  (`send.discounts`, `resend._domainkey.discounts`, `_dmarc.discounts`).
- DMARC is published only at `_dmarc.discounts.feifan.dev` with a conservative
  `p=none` policy. The parent `feifan.dev` domain is untouched.

### 1. Copy values from Resend

In the Resend dashboard, add the domain `discounts.feifan.dev`
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

- `send.discounts.feifan.dev` — MX → the Resend/SES feedback target
- `send.discounts.feifan.dev` — TXT (SPF)
- `resend._domainkey.discounts.feifan.dev` — TXT (DKIM)
- `_dmarc.discounts.feifan.dev` — TXT `v=DMARC1; p=none;`

### 3. Verify in Resend

After applying, wait for DNS propagation (usually minutes, up to an hour), then
press **Verify DNS Records** on the domain's page in Resend → Domains. Status
should move to *Verified*. You can check propagation yourself with:

```bash
dig +short MX send.discounts.feifan.dev
dig +short TXT send.discounts.feifan.dev
dig +short TXT resend._domainkey.discounts.feifan.dev
dig +short TXT _dmarc.discounts.feifan.dev
```

Once verified, the Discount Tracker runtime (configured in its own repo with
the Resend API key) can send from `notifications@discounts.feifan.dev`.

## Private Lounge access

Terraform can create the Auth0 client and Cloudflare Access boundary for
`lounge.feifan.dev`, Discount Tracker, Seerr, and the owner-only homeserver
homepage. Jellyfin deliberately keeps its native authentication so television,
mobile, and desktop clients continue to work.

The feature is off by default. Before setting `enable_lounge_access = true`:

1. Create an Auth0 Machine-to-Machine application for Terraform and authorize
   it for client, client-credential (`read:client_credentials`), and connection
   management.
2. Export `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, and `AUTH0_CLIENT_SECRET` in the
   shell running Terraform. Never store the M2M secret in tfvars.
3. Give the Cloudflare API token Access Apps/Policies and Access Identity
   Providers/Groups edit permissions.
4. Configure `auth0_domain`, `auth0_connection_name`,
   `cloudflare_access_team_name`, `owner_email`, and the exact invited emails in
   `lounge_allowed_emails` in the ignored tfvars file. Include the owner email.

The allowlist does not contact invitees or require their Auth0 accounts to
exist in advance. On first use they can sign up through the configured Auth0
database connection, after which Cloudflare admits only an exact email match.
Keep Discount Tracker's application-level invitation check during migration;
it can be retired after the Cloudflare boundary has been verified.

The generated Auth0 OIDC client secret is necessarily stored in Terraform
state because Cloudflare needs it. Keep the local state private and migrate it
to encrypted remote state before sharing Terraform administration.

## Slide Studio at /ppt

`powerpoint.tf` and `powerpoint-worker.js` route `lounge.feifan.dev/ppt/` to
`ppt-origin.feifan.dev` through the existing homeserver tunnel. The Lounge
Access policy remains in force. The Python origin verifies signed Access JWTs
against the Lounge audience, so the origin hostname cannot bypass authentication.
The existing Pages homepage remains unchanged apart from a Slide Studio link.

The PowerPointDrawer repository owns the container and NixOS module. Its
`DEPLOY.md` describes the shared LLM credential handling and installation.

Existing live tunnel and Access settings were recovered from state into local,
gitignored `live.auto.tfvars.json`; preserve that file and supply Auth0 management
credentials before a full plan. Never disable Access simply to run a plan. The
initial /ppt deployment used a reviewed targeted plan for its three new resources
and the existing tunnel configuration because Auth0 management credentials were
not available in this shell. All prior tunnel routes were preserved.

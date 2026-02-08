# feifan.dev

Minimal Astro site for Feifan’s portfolio, timelines, and writing hub.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:4321 by default.

## Environment variables

The Thoughts page fetches the “Latest writing” section from a Notion database at runtime via Cloudflare Pages Functions (`/api/notion/highlights`). Secrets stay outside version control via `.env`.

1. Duplicate `.env.example` → `.env`.
2. Fill in the values:
	- `NOTION_API_KEY`: A Notion integration token with `read` access to the database.
	- `NOTION_DATABASE_ID`: The database ID that stores writing entries.
3. Share the database with your integration in Notion.

If either variable is missing the UI gracefully falls back to the hard-coded sample entries.

### Connecting the integration

1. Visit [notion.so/my-integrations](https://www.notion.so/my-integrations) and create a new internal integration (name it something like “feifan.dev”).
2. Copy the generated secret and paste it into your local `.env` as `NOTION_API_KEY`.
3. Inside Notion, open the target database or page, click **Share → Connect**, and grant access to the new integration (similar to how “NextJS” shows up in the screenshot).
4. Repeat for any page you want to expose (for example, the Julia EMS article).
5. Provide `NOTION_DATABASE_ID` by opening the database in a browser and copying the ID from the URL.

## Commands

| Command         | Description                               |
| -------------- | ----------------------------------------- |
| `npm run dev`   | Start the local dev server                |
| `npm run build` | Type-check and build the static site      |
| `npm run preview` | Serve the production build locally      |

## Notion data shape

The runtime endpoint at `functions/api/notion/highlights.js` expects the database to expose these properties:

- **Title** (or Name): Title property used for the card heading.
- **Summary** (rich text): Short description shown under the title.
- **Status** (select): Status pill (“Published”, “In progress”, etc.).
- **URL** (url): Public link to the post; falls back to the page URL if omitted.

Adjust the mapping as your Notion schema evolves.

## Runtime Notion endpoint

- Route: `/api/notion/highlights?limit=3`
- Implementation: `functions/api/notion/highlights.js`
- Cache policy: `s-maxage=900` with `stale-while-revalidate=86400`

This keeps writing cards fresh without requiring a full site rebuild.

Local `astro dev` does not run Cloudflare Functions, so the Thoughts page will show fallback cards unless you run in a Pages-compatible dev environment.

## Infrastructure (Cloudflare Pages)

Terraform configuration under `infra/` provisions the Cloudflare Pages project, ties it to the GitHub repo, and optionally attaches custom domains plus environment variables. To deploy:

1. Install Terraform ≥ 1.5 and create a Cloudflare API token with Pages + DNS permissions.
2. Populate `infra/terraform.tfvars` (or export `TF_VAR_…` values) with your account ID, token, and any env vars like `NOTION_API_KEY`.
3. Run `terraform init`, `terraform plan`, and `terraform apply` from the `infra/` directory.

Each success will (a) ensure the Pages project references `main` for production builds and (b) register the domains you list in `custom_domains`. Set `managed_zone` (e.g., `feifan.dev`) if you want Terraform to create the necessary proxied CNAME records in Cloudflare DNS automatically.

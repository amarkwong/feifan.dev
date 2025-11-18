# feifan.dev

Minimal Astro site for Feifan’s portfolio, timelines, and writing hub.

## Getting started

```bash
npm install
npm run dev
```

The dev server runs on http://localhost:4321 by default.

## Environment variables

The Thoughts page fetches the “Latest writing” section from a Notion database at build time. Secrets stay outside version control via `.env`.

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

The helper at `src/lib/notion.ts` expects the database to expose these properties (feel free to rename inside the helper if needed):

- **Title** (or Name): Title property used for the card heading.
- **Summary** (rich text): Short description shown under the title.
- **Status** (select): Status pill (“Published”, “In progress”, etc.).
- **URL** (url): Public link to the post; falls back to the page URL if omitted.

Adjust the mapping as your Notion schema evolves.

## Infrastructure (Cloudflare Pages)

Terraform configuration under `infra/` provisions the Cloudflare Pages project, ties it to the GitHub repo, and optionally attaches custom domains plus environment variables. To deploy:

1. Install Terraform ≥ 1.5 and create a Cloudflare API token with Pages + DNS permissions.
2. Populate `infra/terraform.tfvars` (or export `TF_VAR_…` values) with your account ID, token, and any env vars like `NOTION_API_KEY`.
3. Run `terraform init`, `terraform plan`, and `terraform apply` from the `infra/` directory.

Each success will (a) ensure the Pages project references `main` for production builds and (b) register the domains you list in `custom_domains`. Set `managed_zone` (e.g., `feifan.dev`) if you want Terraform to create the necessary proxied CNAME records in Cloudflare DNS automatically.

## Blog slugs sourced from Notion

Static blog routes live under `src/pages/blog/[slug].astro`. You can populate them in two ways via `src/data/blogEntries.ts`:

### Manual entries (`blogEntries`)

1. Duplicate one of the objects in `blogEntries`.
2. Give it a new slug (used in the URL) and the corresponding Notion page ID.
3. Share that Notion page with your integration so the build can fetch blocks.
4. Optionally update the `summary`/`tags` fields for on-page metadata.

### Auto-generated collections (`blogCollections`)

- Add a new object with the parent Notion page ID (often an index page where each child page is an article).
- When you run `npm run dev` or `npm run build`, Astro fetches all `child_page` blocks under that parent, slugifies their titles, and creates routes automatically. Use `slugPrefix` to namespace the URLs if needed.
- `tags` and `summary` on the collection act as defaults for every child. The page content itself is pulled live from Notion, so updating or adding subpages requires no code changes—just re-run the build.

During the build the site fetches every referenced page’s blocks, renders headings/lists/quotes/code, and outputs static HTML. If the integration key is missing, the route falls back to a placeholder paragraph reminding you to set up the credentials locally.

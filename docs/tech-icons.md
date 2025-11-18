# Tech Stack Icons

All stack badges requested on 2025-11-16 live in `/public/icons/tech-stack.svg` as individual `<symbol>` entries. Use them anywhere in the Astro site without extra JavaScript by referencing the symbol ID.

## Usage

```astro
<svg width="48" height="48" role="img" aria-label="TypeScript">
  <use href="/icons/tech-stack.svg#icon-typescript" />
</svg>
```

Available symbol IDs (prefix `icon-`):

- `typescript`, `aws`, `azure`, `c`, `cpp`, `react`, `hono`, `terraform`, `aws-lambda`
- `docker`, `newrelic`, `splunk`, `matlab`, `julia`, `golang`, `neuralnetwork`
- `dotnet`, `sqlserver`, `aix`, `linux`

Each symbol is a 64×64 rounded square that inherits no additional CSS; feel free to scale the wrapping `<svg>` or add drop shadows via external styles.

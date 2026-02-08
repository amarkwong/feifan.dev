const NOTION_VERSION = '2022-06-28';
const CACHE_SECONDS = 900;
const STALE_SECONDS = 86400;
const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 12;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`,
    },
  });
}

function extractPlainText(chunks = []) {
  return chunks
    .map((chunk) => chunk?.plain_text?.trim())
    .filter(Boolean)
    .join(' ');
}

function mapPage(page) {
  const properties = page?.properties ?? {};
  const titleProp = properties.Title ?? properties.Name;
  const summaryProp = properties.Summary ?? properties.Description;
  const statusProp = properties.Status ?? properties.Stage;
  const linkProp = properties.URL ?? properties.Link ?? properties['External Link'];

  const title = extractPlainText(titleProp?.title) || 'Untitled';
  const summary = extractPlainText(summaryProp?.rich_text) || 'Read this piece on Notion.';
  const status = (statusProp?.select?.name || 'Published').toUpperCase();
  const href = linkProp?.url || page?.public_url || page?.url;
  const updatedAt = page?.last_edited_time ?? new Date().toISOString();

  if (!href) return null;

  return { title, summary, status, href, updatedAt };
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const notionApiKey = env.NOTION_API_KEY;
  const notionDatabaseId = env.NOTION_DATABASE_ID;

  if (!notionApiKey || !notionDatabaseId) {
    return jsonResponse({
      items: [],
      source: 'notion',
      cached: false,
      reason: 'missing_notion_env',
    });
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(rawLimit)))
    : DEFAULT_LIMIT;

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${notionDatabaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${notionApiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': NOTION_VERSION,
      },
      body: JSON.stringify({
        page_size: limit,
        sorts: [
          {
            timestamp: 'last_edited_time',
            direction: 'descending',
          },
        ],
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      console.error('[Notion API] Query failed', response.status, message);
      return jsonResponse({
        items: [],
        source: 'notion',
        cached: false,
        reason: 'query_failed',
      }, 502);
    }

    const data = await response.json();
    const items = (data?.results ?? []).map(mapPage).filter(Boolean);
    const payload = {
      items,
      source: 'notion',
      cached: false,
      fetchedAt: new Date().toISOString(),
    };

    const result = jsonResponse(payload);
    context.waitUntil(cache.put(cacheKey, result.clone()));
    return result;
  } catch (error) {
    console.error('[Notion API] Unexpected error', error);
    return jsonResponse({
      items: [],
      source: 'notion',
      cached: false,
      reason: 'unexpected_error',
    }, 500);
  }
}

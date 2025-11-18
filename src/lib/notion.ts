import katex from 'katex';

export interface WritingEntry {
  title: string;
  summary: string;
  status: string;
  href: string;
}

export interface NotionIcon {
  type: 'emoji' | 'image';
  value: string;
}

export interface NotionArticle {
  title: string;
  updatedAt: string | null;
  content: string;
  coverUrl?: string | null;
  icon?: NotionIcon | null;
  publicUrl?: string | null;
}

const NOTION_API_KEY = import.meta.env.NOTION_API_KEY;
const NOTION_DATABASE_ID = import.meta.env.NOTION_DATABASE_ID;
const NOTION_VERSION = '2022-06-28';

const POST_OPTIONS = {
  sorts: [
    {
      timestamp: 'last_edited_time' as const,
      direction: 'descending' as const,
    },
  ],
};

function normalizeId(id: string): string {
  return id?.replace(/-/g, '') ?? '';
}

function buildNotionImageUrl(source?: string, resourceId?: string): string | null {
  if (!source) return null;
  if (source.startsWith('data:')) return source;
  if (source.startsWith('https://www.notion.so/image/')) return source;
  const encoded = encodeURIComponent(source);
  const idFragment = resourceId ? `&id=${resourceId}` : '';
  return `https://www.notion.so/image/${encoded}?table=block${idFragment}&cache=v2`;
}

function resolveNotionFileUrl(file: any, resourceId?: string): string | null {
  if (!file) return null;
  const type = file.type;
  if (!type) return null;
  const source = file?.[type]?.url;
  if (!source) return null;
  return buildNotionImageUrl(source, resourceId);
}

function getHeaders() {
  if (!NOTION_API_KEY) return null;
  return {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Content-Type': 'application/json',
    'Notion-Version': NOTION_VERSION,
  };
}

function extractPlainText(chunks: Array<{ plain_text?: string }> = []): string {
  return chunks
    .map((chunk) => chunk.plain_text?.trim())
    .filter(Boolean)
    .join(' ');
}

function mapPageToEntry(page: any): WritingEntry | null {
  const properties = page?.properties ?? {};
  const titleProp = properties.Title ?? properties.Name;
  const summaryProp = properties.Summary ?? properties.Description;
  const statusProp = properties.Status ?? properties.Stage;
  const linkProp = properties.URL ?? properties.Link ?? properties['External Link'];

  const title = extractPlainText(titleProp?.title) || 'Untitled';
  const summary = extractPlainText(summaryProp?.rich_text) || 'More notes coming soon.';
  const status = statusProp?.select?.name || 'Draft';
  const href = linkProp?.url || page?.url;

  if (!href) {
    return null;
  }

  return {
    title,
    summary,
    status,
    href,
  };
}

export async function fetchLatestWriting(limit = 6): Promise<WritingEntry[]> {
  const headers = getHeaders();
  if (!headers || !NOTION_DATABASE_ID) {
    return [];
  }

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...POST_OPTIONS, page_size: limit }),
    });

    if (!response.ok) {
      console.error('[Notion] Failed to fetch entries', await response.text());
      return [];
    }

    const data = await response.json();
    return (data?.results ?? [])
      .map((page: any) => mapPageToEntry(page))
      .filter(Boolean) as WritingEntry[];
  } catch (error) {
    console.error('[Notion] Unexpected error', error);
    return [];
  }
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char]);
}

function renderRichText(richText: any[] = []): string {
  return richText
    .map((item) => {
      const text = item?.plain_text ? escapeHtml(item.plain_text) : '';
      if (!text) return '';

      const annotations = item.annotations ?? {};
      let content = text;

      if (annotations.code) content = `<code>${content}</code>`;
      if (annotations.bold) content = `<strong>${content}</strong>`;
      if (annotations.italic) content = `<em>${content}</em>`;
      if (annotations.strikethrough) content = `<s>${content}</s>`;
      if (annotations.underline) content = `<u>${content}</u>`;

      if (item.href) {
        return `<a href="${item.href}" target="_blank" rel="noreferrer">${content}</a>`;
      }

      return content;
    })
    .join('');
}

function renderBlock(block: any): string {
  switch (block.type) {
    case 'paragraph':
      return `<p>${renderRichText(block.paragraph?.rich_text)}</p>`;
    case 'heading_1':
      return `<h1>${renderRichText(block.heading_1?.rich_text)}</h1>`;
    case 'heading_2':
      return `<h2>${renderRichText(block.heading_2?.rich_text)}</h2>`;
    case 'heading_3':
      return `<h3>${renderRichText(block.heading_3?.rich_text)}</h3>`;
    case 'quote':
      return `<blockquote>${renderRichText(block.quote?.rich_text)}</blockquote>`;
    case 'divider':
      return '<hr />';
    case 'code':
      return `<pre><code>${renderRichText(block.code?.rich_text)}</code></pre>`;
    case 'bulleted_list_item':
      return `<li data-list="bullet">${renderRichText(block.bulleted_list_item?.rich_text)}</li>`;
    case 'numbered_list_item':
      return `<li data-list="numbered">${renderRichText(block.numbered_list_item?.rich_text)}</li>`;
    case 'callout':
      return `<aside class="notion-callout">${renderRichText(block.callout?.rich_text)}</aside>`;
    case 'image':
      return renderImageBlock(block);
    case 'equation':
      return renderEquationBlock(block);
    default:
      return '';
  }
}

function resolveImageSource(block: any): string | null {
  const resourceId = block?.id ? normalizeId(block.id) : undefined;
  return resolveNotionFileUrl(block?.image, resourceId);
}

function renderImageBlock(block: any): string {
  const url = resolveImageSource(block);
  if (!url) return '';

  const isFullWidth = Boolean(block?.format?.block_full_width);
  const figureClass = `notion-image${isFullWidth ? ' notion-image--full' : ''}`;
  const captionHtml = renderRichText(block.image?.caption);
  const altText = extractPlainText(block.image?.caption) || 'Notion image';

  return `<figure class="${figureClass}">
    <img src="${url}" alt="${escapeHtml(altText)}" loading="lazy" />
    ${captionHtml ? `<figcaption>${captionHtml}</figcaption>` : ''}
  </figure>`;
}

function renderEquationBlock(block: any): string {
  const expression = block?.equation?.expression;
  if (!expression) return '';

  try {
    const rendered = katex.renderToString(expression, {
      throwOnError: false,
      displayMode: true,
      output: 'html',
    });
    return `<div class="notion-equation" aria-label="Equation">${rendered}</div>`;
  } catch (error) {
    console.error('[Notion] KaTeX render error', error);
    return `<div class="notion-equation notion-equation--fallback" aria-label="Equation">
      <code>${escapeHtml(expression)}</code>
    </div>`;
  }
}

function groupLists(blocks: any[]): string {
  const html: string[] = [];
  let currentList: 'bullet' | 'numbered' | null = null;

  const closeList = () => {
    if (!currentList) return;
    html.push(currentList === 'bullet' ? '</ul>' : '</ol>');
    currentList = null;
  };

  for (const block of blocks) {
    const rendered = renderBlock(block);
    if (!rendered) continue;

    if (rendered.startsWith('<li')) {
      const listType = rendered.includes('data-list="numbered"') ? 'numbered' : 'bullet';
      if (currentList !== listType) {
        closeList();
        currentList = listType;
        html.push(listType === 'bullet' ? '<ul>' : '<ol>');
      }
      html.push(rendered.replace(' data-list="bullet"', '').replace(' data-list="numbered"', ''));
    } else {
      closeList();
      html.push(rendered);
    }
  }

  closeList();
  return html.join('\n');
}

async function fetchBlockChildren(blockId: string): Promise<any[]> {
  const headers = getHeaders();
  if (!headers) return [];

  const blocks: any[] = [];
  let cursor: string | undefined;

  try {
    do {
      const response = await fetch(
        `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`,
        {
          method: 'GET',
          headers,
        }
      );

      if (!response.ok) {
        console.error('[Notion] Failed to fetch blocks', await response.text());
        return blocks;
      }

      const data = await response.json();
      blocks.push(...(data?.results ?? []));
      cursor = data?.has_more ? data.next_cursor : undefined;
    } while (cursor);
  } catch (error) {
    console.error('[Notion] Block fetch error', error);
  }

  return blocks;
}

async function fetchNotionPage(pageId: string, headers: Record<string, string>) {
  try {
    const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      console.error('[Notion] Failed to fetch page', await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Notion] Unexpected page fetch error', error);
    return null;
  }
}

export async function fetchNotionPublicUrl(pageId: string): Promise<string | null> {
  const headers = getHeaders();
  if (!headers || !pageId) return null;
  const pageData = await fetchNotionPage(pageId, headers);
  return pageData?.public_url ?? null;
}

export async function fetchNotionArticle(pageId: string): Promise<NotionArticle | null> {
  const headers = getHeaders();
  if (!headers || !pageId) {
    return null;
  }

  try {
    const pageData = await fetchNotionPage(pageId, headers);
    if (!pageData) return null;
    const normalizedPageId = normalizeId(pageData?.id ?? pageId);
    const title =
      extractPlainText(pageData?.properties?.Title?.title ?? pageData?.properties?.Name?.title ?? []) || 'Untitled';
    const blocks = await fetchBlockChildren(pageId);
    const content = groupLists(blocks);
    const coverUrl = resolveNotionFileUrl(pageData?.cover, normalizedPageId);

    let icon: NotionIcon | null = null;
    if (pageData?.icon?.type === 'emoji' && pageData.icon.emoji) {
      icon = { type: 'emoji', value: pageData.icon.emoji };
    } else if (pageData?.icon) {
      const iconUrl = resolveNotionFileUrl(pageData.icon, normalizedPageId);
      if (iconUrl) {
        icon = { type: 'image', value: iconUrl };
      }
    }

    return {
      title,
      updatedAt: pageData?.last_edited_time ?? null,
      content,
      coverUrl,
      icon,
      publicUrl: pageData?.public_url ?? null,
    };
  } catch (error) {
    console.error('[Notion] Unexpected page fetch error', error);
    return null;
  }
}

export interface NotionChildPage {
  id: string;
  title: string;
  publicUrl?: string | null;
}

export async function fetchChildPages(parentPageId: string): Promise<NotionChildPage[]> {
  if (!parentPageId) return [];
  const blocks = await fetchBlockChildren(parentPageId);
  const childPages = blocks
    .filter((block) => block.type === 'child_page')
    .map((block) => ({
      id: normalizeId(block.id),
      title: block.child_page?.title ?? 'Untitled',
    }));

  return Promise.all(
    childPages.map(async (child) => ({
      ...child,
      publicUrl: await fetchNotionPublicUrl(child.id),
    }))
  );
}

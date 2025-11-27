export function normalizeNotionId(value?: string | null): string | null {
  if (!value) return null;
  return value.replace(/-/g, '').trim() || null;
}

function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function parseNotionPublicUrl(publicUrl?: string | null) {
  if (!publicUrl) return null;
  try {
    const url = new URL(publicUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments.pop() ?? '';
    const match = last.match(/(.+)-([0-9a-f]{32})$/i);
    const slugSegment = match ? match[1] : last;
    const normalizedId = match ? match[2].toLowerCase() : null;
    return {
      origin: url.origin,
      slugSegment,
      normalizedId,
    };
  } catch (error) {
    console.warn('[Notion] Failed to parse public URL', publicUrl, error);
    return null;
  }
}

export function deriveNotionSlug(options: {
  publicUrl?: string | null;
  title?: string | null;
  fallbackSlug?: string | null;
  pageId?: string | null;
}): string {
  const { publicUrl, title, fallbackSlug, pageId } = options;
  const parsed = parseNotionPublicUrl(publicUrl);
  const raw =
    parsed?.slugSegment ||
    title ||
    fallbackSlug ||
    normalizeNotionId(pageId) ||
    'note';
  return slugifySegment(raw).replace(/^-+|-+$/g, '') || 'note';
}

export function deriveNotionEmbedSrc(publicUrl?: string | null, pageId?: string | null): string | null {
  const parsed = parseNotionPublicUrl(publicUrl);
  const normalizedId = parsed?.normalizedId || normalizeNotionId(pageId);
  if (parsed?.origin && normalizedId) {
    return `${parsed.origin}/ebd/${normalizedId}`;
  }
  return publicUrl ?? null;
}

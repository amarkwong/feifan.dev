export interface BlogEntry {
  slug: string;
  notionPageId: string;
  summary?: string;
  tags?: string[];
  titleOverride?: string;
}

export interface BlogCollection {
  parentPageId: string;
  slugPrefix?: string;
  tags?: string[];
  summary?: string;
}

export const blogEntries: BlogEntry[] = [];

export const blogCollections: BlogCollection[] = [
  {
    parentPageId: 'bdba8cdeb9054c2db7f6f099a3ed8ce8',
    slugPrefix: '',
    tags: ['Notebook'],
    summary: 'Notes and links from the Profile Website hub.',
  },
];
export interface BlogEntry {
  slug: string;
  notionPageId: string;
  summary: string;
  tags: string[];
}

export const blogEntries: BlogEntry[] = [
  {
    slug: 'why-i-choose-julia',
    notionPageId: '69064ec1c03a42b2a46dc579280c2358',
    summary: 'Lessons from building an energy management system with Julia.',
    tags: ['Energy', 'Julia', 'Case study'],
  },
];

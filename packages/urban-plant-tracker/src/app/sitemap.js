import { SITE_URL, PUBLIC_PAGES } from '@/lib/site';

export const revalidate = 3600;

// Add dynamic public URLs (e.g. listings, events, profiles) by querying the DB here.
async function dynamicEntries() {
  return [];
}

export default async function sitemap() {
  const now = new Date();
  let extra = [];
  try {
    extra = await dynamicEntries();
  } catch (err) {
    console.error('sitemap', err);
  }
  return [...PUBLIC_PAGES.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority })), ...extra];
}

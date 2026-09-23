import { SITE_URL } from '@/lib/site';
import { listGigs } from '@/lib/services';

export const revalidate = 3600;

export default async function sitemap() {
  const now = new Date();
  const pages = [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE_URL}/gigs`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${SITE_URL}/stay-to-play`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/signup`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ].map((p) => ({ ...p, lastModified: now }));
  let gigs = [];
  try {
    gigs = await listGigs({ limit: 200 });
  } catch (err) {
    console.error('sitemap gigs', err);
  }
  return [
    ...pages,
    ...gigs.map((g) => ({ url: `${SITE_URL}/gigs/${g.id}`, lastModified: new Date(g.created_at), changeFrequency: 'daily', priority: 0.8 })),
  ];
}

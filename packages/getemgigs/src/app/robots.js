import { SITE_URL, PRIVATE_PATHS } from '@/lib/site';

// Search engines, AI search/answer engines and AI agents are all welcome on public pages
// (home, gigs, Stay-To-Play, legal). Private, per-user and API routes are off limits to everyone.
// To opt out of AI *training* while staying in AI *search*, move GPTBot, ClaudeBot, CCBot,
// Google-Extended, Applebot-Extended and Meta-ExternalAgent into a `disallow: '/'` rule.
const SEARCH_ENGINES = ['Googlebot', 'Googlebot-Image', 'Bingbot', 'DuckDuckBot', 'Applebot', 'Slurp', 'YandexBot', 'Baiduspider'];
const AI_SEARCH_AND_AGENTS = [
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',
  'Claude-SearchBot', 'Claude-User', 'ClaudeBot',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended', 'Amazonbot', 'DuckAssistBot', 'MistralAI-User',
  'Meta-ExternalAgent', 'Meta-ExternalFetcher', 'CCBot', 'cohere-ai',
];
const LINK_PREVIEWS = ['facebookexternalhit', 'Twitterbot', 'LinkedInBot', 'Slackbot', 'Discordbot', 'WhatsApp', 'TelegramBot'];

export default function robots() {
  const rule = (userAgent) => ({ userAgent, allow: ['/', '/llms.txt'], disallow: PRIVATE_PATHS });
  return {
    rules: [rule(SEARCH_ENGINES), rule(AI_SEARCH_AND_AGENTS), rule(LINK_PREVIEWS), rule('*')],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

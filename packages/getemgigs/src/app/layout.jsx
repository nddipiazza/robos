import './globals.css';
import Link from 'next/link';
import { currentUser } from '@/lib/session';
import CaptchaScript from '@/components/CaptchaScript';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME_ASCII, DESCRIPTION, SHORT_DESCRIPTION, KEYWORDS } from '@/lib/site';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Get 'Em Gigs — Buddy Gigs for local bands | Fill the room, kill pay-to-play",
    template: "%s · Get 'Em Gigs",
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME_ASCII,
  keywords: KEYWORDS,
  authors: [{ name: SITE_NAME_ASCII, url: SITE_URL }],
  creator: SITE_NAME_ASCII,
  publisher: SITE_NAME_ASCII,
  category: 'music',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME_ASCII,
    locale: 'en_US',
    url: SITE_URL,
    title: "Get 'Em Gigs — Fill the room. Kill pay-to-play.",
    description: SHORT_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: "Get 'Em Gigs — Fill the room. Kill pay-to-play.",
    description: SHORT_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: SITE_NAME_ASCII, statusBarStyle: 'black-translucent' },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } } : {}),
  },
};

const ORG_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#org`,
      name: SITE_NAME_ASCII,
      alternateName: ['Get Em Gigs', 'The Gig Bandit', 'getemgigs'],
      url: SITE_URL,
      logo: `${SITE_URL}/icon-512.png`,
      description: SHORT_DESCRIPTION,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME_ASCII,
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#org` },
      inLanguage: 'en-US',
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/gigs?city={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0c0a12',
};

export default async function RootLayout({ children }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <head>
        <CaptchaScript />
        <link rel="alternate" type="text/plain" title="LLM-readable site summary" href="/llms.txt" />
        <JsonLd data={ORG_LD} />
      </head>
      <body className={user ? 'has-tabbar' : ''}>
        <a href="#main" className="skip">Skip to content</a>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link href="/" className="logo" aria-label="Get 'Em Gigs home">
              <span className="logo-mark" aria-hidden="true">GG</span>
              <span className="logo-text">Get ’Em Gigs</span>
            </Link>
            <nav className="topnav" aria-label="Primary">
              <Link href="/gigs">Find gigs</Link>
              <Link href="/stay-to-play">Stay-To-Play</Link>
              {user ? (
                <>
                  <Link href="/dashboard" data-testid="nav-dashboard">Dashboard</Link>
                  <Link href="/gigs/new" className="btn btn-primary btn-sm">List a gig</Link>
                </>
              ) : (
                <>
                  <Link href="/login" data-testid="nav-login">Log in</Link>
                  <Link href="/signup" className="btn btn-primary btn-sm" data-testid="nav-signup">Sign up free</Link>
                </>
              )}
            </nav>
            {!user && (
              <div className="topnav-mobile">
                <Link href="/login" className="btn btn-ghost btn-sm" data-testid="nav-login-m">Log in</Link>
                <Link href="/signup" className="btn btn-primary btn-sm" data-testid="nav-signup-m">Join</Link>
              </div>
            )}
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="wrap footer-inner">
            <div>
              <strong>Get ’Em Gigs</strong> · The Gig Bandit
              <p className="muted small">Built for local bands. Beta — deposits use gig credits; no real card payments yet.</p>
            </div>
            <nav className="footer-links" aria-label="Footer">
              <Link href="/gigs">Gigs</Link>
              <Link href="/stay-to-play">Stay-To-Play</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <a href="https://rowbose.com/projects/getemgigs/" rel="noopener">Built with RobOS</a>
            </nav>
          </div>
        </footer>
        {user && (
          <nav className="tabbar" aria-label="App">
            <Link href="/gigs"><span aria-hidden="true">🎟️</span>Gigs</Link>
            <Link href="/gigs/new"><span aria-hidden="true">➕</span>List</Link>
            <Link href="/dashboard" data-testid="tab-dashboard"><span aria-hidden="true">🤝</span>Deals</Link>
            <Link href="/account" data-testid="tab-account"><span aria-hidden="true">👤</span>Account</Link>
          </nav>
        )}
      </body>
    </html>
  );
}

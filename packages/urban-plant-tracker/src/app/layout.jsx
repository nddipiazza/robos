import './globals.css';
import Link from 'next/link';
import { currentUser } from '@/lib/session';
import CaptchaScript from '@/components/CaptchaScript';
import JsonLd from '@/components/JsonLd';
import { SITE_URL, SITE_NAME, SITE_INITIALS, TAGLINE, DESCRIPTION, SHORT_DESCRIPTION, KEYWORDS, THEME } from '@/lib/site';

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${TAGLINE}`, template: `%s · ${SITE_NAME}` },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: KEYWORDS,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: SITE_NAME, locale: 'en_US', url: SITE_URL, title: `${SITE_NAME} — ${TAGLINE}`, description: SHORT_DESCRIPTION },
  twitter: { card: 'summary_large_image', title: `${SITE_NAME} — ${TAGLINE}`, description: SHORT_DESCRIPTION },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
  formatDetection: { telephone: false, email: false, address: false },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } : {}),
    ...(process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION ? { other: { 'msvalidate.01': process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION } } : {}),
  },
};

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: THEME.background };

const SITE_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#org`, name: SITE_NAME, url: SITE_URL, logo: `${SITE_URL}/icon/large`, description: SHORT_DESCRIPTION },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: SITE_NAME, url: SITE_URL, publisher: { '@id': `${SITE_URL}/#org` }, inLanguage: 'en-US' },
  ],
};

export default async function RootLayout({ children }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <head>
        <CaptchaScript />
        <link rel="alternate" type="text/plain" title="LLM-readable site summary" href="/llms.txt" />
        <JsonLd data={SITE_LD} />
      </head>
      <body className={user ? 'has-tabbar' : ''}>
        <a href="#main" className="skip">Skip to content</a>
        <header className="topbar">
          <div className="wrap topbar-inner">
            <Link href="/" className="logo" aria-label={`${SITE_NAME} home`}>
              <span className="logo-mark" aria-hidden="true">{SITE_INITIALS}</span>
              <span className="logo-text">{SITE_NAME}</span>
            </Link>
            <nav className="topnav" aria-label="Primary">
              {user ? (
                <>
                  <Link href="/dashboard" data-testid="nav-dashboard">Dashboard</Link>
                  <Link href="/account">Account</Link>
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
              <strong>{SITE_NAME}</strong>
              <p className="muted small">{TAGLINE}</p>
            </div>
            <nav className="footer-links" aria-label="Footer">
              <Link href="/terms">Terms</Link>
              <Link href="/privacy">Privacy</Link>
              <a href="https://rowbose.com" rel="noopener">Built with RobOS</a>
            </nav>
          </div>
        </footer>
        {user && (
          <nav className="tabbar" aria-label="App">
            <Link href="/"><span aria-hidden="true">🏠</span>Home</Link>
            <Link href="/dashboard" data-testid="tab-dashboard"><span aria-hidden="true">📋</span>Dashboard</Link>
            <Link href="/account" data-testid="tab-account"><span aria-hidden="true">👤</span>Account</Link>
          </nav>
        )}
      </body>
    </html>
  );
}

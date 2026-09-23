import './globals.css';
import Link from 'next/link';
import { currentUser } from '@/lib/session';
import CaptchaScript from '@/components/CaptchaScript';

export const metadata = {
  metadataBase: new URL('https://www.getemgigs.com'),
  title: {
    default: "Get 'Em Gigs — fill the room with Buddy Gigs",
    template: "%s · Get 'Em Gigs",
  },
  description:
    "Local bands trade attendance: I'll come to your show if you come to mine. Deposits keep everyone honest — check in at the venue to get yours back, bail and it pays the band you stood up.",
  openGraph: {
    title: "Get 'Em Gigs — The Gig Bandit",
    description: "Buddy Gigs and Stay-To-Play for local bands. Fill rooms, kill pay-to-play.",
    url: 'https://www.getemgigs.com',
    siteName: "Get 'Em Gigs",
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  icons: { icon: '/icon.svg' },
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

import './globals.css';

export const metadata = {
  title: "The Gig Bandit — Get 'Em Gigs (getemgigs.com)",
  description: "Revolutionary platform for the local music scene with Buddy Gig geolocation escrow and Venue Stay-To-Play reciprocal ticket economics.",
  keywords: ["live music", "local bands", "indie gigs", "buddy gig", "stay to play", "getemgigs", "Austin live music", "Nashville music", "Brooklyn music"],
  authors: [{ name: "The Gig Bandit Engineering Team" }],
  openGraph: {
    title: "The Gig Bandit — Get 'Em Gigs",
    description: "You scratch my back, I'll scratch yours. Geolocation-verified Buddy Gigs & Stay-To-Play fair booking for local bands.",
    url: "https://getemgigs.com",
    siteName: "The Gig Bandit",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body>
        <header className="header">
          <div className="container nav">
            <a href="/" className="brand-logo">
              <span>🎸</span>
              <span>The Gig Bandit</span>
              <span className="brand-badge">Beta</span>
            </a>
            <nav className="nav-links">
              <a href="#buddy-gig" className="nav-link">Buddy Gig Feature</a>
              <a href="#stay-to-play" className="nav-link">Stay-To-Play</a>
              <a href="#gigs-explorer" className="nav-link">Explore Gigs</a>
              <a href="#architecture" className="nav-link">Vercel & KGraph</a>
              <a href="https://rowbose.com/projects/getemgigs/" target="_blank" rel="noopener noreferrer" className="btn btn-secondary">RobOS Showcase</a>
              <a href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fnddipiazza%2Fgetemgigs" target="_blank" rel="noopener noreferrer" className="btn btn-primary">Deploy to Vercel ⚡</a>
            </nav>
          </div>
        </header>

        <main>{children}</main>

        <footer className="footer">
          <div className="container">
            <p>🎸 <strong>The Gig Bandit</strong> (<code>getemgigs.com</code>) · Powered by RobOS AI-First SDLC Platform & Vercel Serverless Edge</p>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
              Solving the local music attendance and exploitation problem with game-theory incentives.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}

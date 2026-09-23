export const metadata = { title: 'Privacy' };

export default function Privacy() {
  return (
    <div className="wrap narrow page prose">
      <h1 className="page-title">Privacy policy</h1>
      <p className="muted">Last updated September 23, 2026</p>
      <h2>What we collect</h2>
      <ul>
        <li>Account: your name, email and a salted password hash (we never store your password).</li>
        <li>Band profile, gigs, venues and deals you create.</li>
        <li>Check-ins: when a band scans your check-in code we record who scanned whom and when. The camera is only used on your device to read QR codes; no images are uploaded.</li>
        <li>Security: IP address and browser type on sign-up, log-in and check-in, used for rate limiting and abuse prevention.</li>
      </ul>
      <h2>What we don’t do</h2>
      <p>We don’t sell your data, run ad trackers, or collect your location.</p>
      <h2>Deleting your data</h2>
      <p>Delete your account any time from the Account page. This permanently removes your account, band, gigs and deals.</p>
    </div>
  );
}

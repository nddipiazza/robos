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
        <li>Location: only when you tap “check in”, a single GPS reading is sent to verify distance to the venue. We store the distance in meters, not your coordinates.</li>
        <li>Security: IP address and browser type on sign-up, log-in and check-in, used for rate limiting and abuse prevention.</li>
      </ul>
      <h2>What we don’t do</h2>
      <p>We don’t sell your data, run ad trackers, or track your location in the background.</p>
      <h2>Deleting your data</h2>
      <p>Delete your account any time from the Account page. This permanently removes your account, band, gigs and deals.</p>
    </div>
  );
}

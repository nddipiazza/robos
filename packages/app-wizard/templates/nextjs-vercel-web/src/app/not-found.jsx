import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap narrow page center">
      <h1 className="page-title">404</h1>
      <p className="muted">That page doesn’t exist.</p>
      <Link href="/" className="btn btn-primary">Home</Link>
    </div>
  );
}

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="wrap narrow page center">
      <h1 className="page-title">404 — wrong venue</h1>
      <p className="muted">That page isn’t on the bill.</p>
      <Link href="/gigs" className="btn btn-primary">Find gigs</Link>
    </div>
  );
}

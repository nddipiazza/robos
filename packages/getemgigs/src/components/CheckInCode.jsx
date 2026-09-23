'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';

// Attendee-side rotating check-in QR. The host band scans it at the door.
export default function CheckInCode({ agreementId, attendanceId, hostBandName }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [secs, setSecs] = useState(30);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await api(`/api/agreements/${agreementId}/code`, { method: 'GET' });
      if (!alive) return;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.status !== 'PENDING') {
        router.refresh();
        return;
      }
      setError('');
      setData(res);
      const ms = new Date(res.rotatesAt).getTime() - Date.now();
      clearTimeout(timer.current);
      timer.current = setTimeout(load, Math.max(1500, ms + 300));
    }
    load();
    // Notice as soon as the host scans us.
    const poll = setInterval(async () => {
      const res = await api(`/api/agreements/${agreementId}`, { method: 'GET' });
      const mine = res.agreement?.attendance?.find((x) => x.id === attendanceId);
      if (mine && mine.status !== 'PENDING') router.refresh();
    }, 4000);
    const tick = setInterval(() => {
      setData((d) => {
        if (d) setSecs(Math.max(0, Math.round((new Date(d.rotatesAt).getTime() - Date.now()) / 1000)));
        return d;
      });
    }, 1000);
    return () => {
      alive = false;
      clearTimeout(timer.current);
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [agreementId, attendanceId, router]);

  if (error) return <p className="alert alert-error" data-testid="code-error">{error}</p>;
  return (
    <div className="checkin-code" data-testid="checkin-code" data-code={data?.code || ''} data-url={data?.url || ''}>
      <div className="qr" aria-label="Your check-in QR code" dangerouslySetInnerHTML={{ __html: data?.svg || '' }} />
      <p className="qr-caption">
        Show this to <strong>{hostBandName}</strong> at the door. They scan it to check you in.
      </p>
      <p className="tiny muted">Code refreshes in {secs}s · keep this screen open</p>
    </div>
  );
}

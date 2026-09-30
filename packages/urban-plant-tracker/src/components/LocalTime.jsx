'use client';

import { useEffect, useState } from 'react';

const FORMATS = {
  full: { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' },
  date: { weekday: 'short', month: 'short', day: 'numeric' },
  time: { hour: 'numeric', minute: '2-digit' },
  mon: { month: 'short' },
  day: { day: 'numeric' },
};

export default function LocalTime({ iso, format = 'full' }) {
  const d = new Date(iso);
  const short = format === 'mon' || format === 'day';
  const [text, setText] = useState(
    () => d.toLocaleString('en-US', { ...FORMATS[format], timeZone: 'America/Chicago' }) + (short ? '' : ' CT'),
  );
  useEffect(() => {
    setText(new Date(iso).toLocaleString('en-US', FORMATS[format]));
  }, [iso, format]);
  return (
    <time dateTime={d.toISOString()} suppressHydrationWarning>
      {text}
    </time>
  );
}

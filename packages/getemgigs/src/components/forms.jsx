'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getCaptchaToken } from './api';

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function run(fn) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn({ setError, setNotice });
    } catch (err) {
      setError(err?.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, run, setError, setNotice };
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function Alert({ error, notice }) {
  if (error) {
    return (
      <p className="alert alert-error" role="alert" data-testid="form-error">
        {error}
      </p>
    );
  }
  if (notice) {
    return (
      <p className="alert alert-ok" role="status" data-testid="form-notice">
        {notice}
      </p>
    );
  }
  return null;
}

function Honeypot() {
  // Hidden from humans; bots tend to fill every field.
  return (
    <div className="hp" aria-hidden="true">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

// -------------------------------------------------------------------- auth

export function SignupForm({ next = '/dashboard' }) {
  const router = useRouter();
  const startedAt = useRef(Date.now());
  const s = useSubmit();
  return (
    <form
      className="stack"
      data-testid="signup-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = formData(e.currentTarget);
        s.run(async ({ setError }) => {
          const captchaToken = await getCaptchaToken('signup');
          const res = await api('/api/auth/signup', { body: { ...body, formStartedAt: startedAt.current, captchaToken } });
          if (!res.ok) return setError(res.error);
          router.push(next);
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>Your name</span>
        <input name="displayName" required minLength={2} maxLength={60} autoComplete="name" placeholder="Jess Rivera" />
      </label>
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="you@band.com" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required minLength={10} maxLength={200} autoComplete="new-password" />
        <small>At least 10 characters.</small>
      </label>
      <Honeypot />
      <Alert error={s.error} />
      <button className="btn btn-primary btn-block" disabled={s.busy} data-testid="signup-submit">
        {s.busy ? 'Creating account…' : 'Create free account'}
      </button>
    </form>
  );
}

export function LoginForm({ next = '/dashboard' }) {
  const router = useRouter();
  const s = useSubmit();
  return (
    <form
      className="stack"
      data-testid="login-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = formData(e.currentTarget);
        s.run(async ({ setError }) => {
          const captchaToken = await getCaptchaToken('login');
          const res = await api('/api/auth/login', { body: { ...body, captchaToken } });
          if (!res.ok) return setError(res.error);
          router.push(next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <Alert error={s.error} />
      <button className="btn btn-primary btn-block" disabled={s.busy} data-testid="login-submit">
        {s.busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>
  );
}

export function LogoutButton({ className = 'btn btn-ghost' }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      data-testid="logout"
      onClick={async () => {
        await api('/api/auth/logout');
        router.push('/');
        router.refresh();
      }}
    >
      Log out
    </button>
  );
}

export function DeleteAccountForm({ email }) {
  const router = useRouter();
  const s = useSubmit();
  return (
    <form
      className="stack"
      data-testid="delete-account-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = formData(e.currentTarget);
        s.run(async ({ setError }) => {
          const res = await api('/api/account', { method: 'DELETE', body });
          if (!res.ok) return setError(res.error);
          router.push('/?deleted=1');
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>
          Type <strong>{email}</strong> to permanently delete your account, band, gigs and deals.
        </span>
        <input name="confirm" autoComplete="off" required />
      </label>
      <Alert error={s.error} />
      <button className="btn btn-danger" disabled={s.busy} data-testid="delete-account-submit">
        Delete my account
      </button>
    </form>
  );
}

// -------------------------------------------------------------------- band

export function BandForm({ band }) {
  const router = useRouter();
  const s = useSubmit();
  return (
    <form
      className="stack"
      data-testid="band-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = formData(e.currentTarget);
        s.run(async ({ setError, setNotice }) => {
          const res = await api('/api/bands', { body });
          if (!res.ok) return setError(res.error);
          if (band) {
            setNotice('Band profile saved.');
            router.refresh();
          } else {
            router.push('/dashboard?welcome=1');
            router.refresh();
          }
        });
      }}
    >
      <label className="field">
        <span>Band / artist name</span>
        <input name="name" required minLength={2} maxLength={60} defaultValue={band?.name} />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Genre</span>
          <input name="genre" maxLength={60} defaultValue={band?.genre} placeholder="Garage rock" />
        </label>
        <label className="field">
          <span>Hometown</span>
          <input name="hometown" maxLength={80} defaultValue={band?.hometown} placeholder="Austin, TX" />
        </label>
      </div>
      <label className="field">
        <span>Short bio</span>
        <textarea name="bio" rows={3} maxLength={500} defaultValue={band?.bio} />
      </label>
      <Alert error={s.error} notice={s.notice} />
      <button className="btn btn-primary" disabled={s.busy} data-testid="band-submit">
        {band ? 'Save band' : 'Create band profile'}
      </button>
    </form>
  );
}

// -------------------------------------------------------------------- gigs

function defaultStart() {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  d.setHours(20, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function GigForm({ venues }) {
  const router = useRouter();
  const s = useSubmit();
  const [venueList, setVenueList] = useState(venues);
  const [venueId, setVenueId] = useState(venues[0]?.id || '');
  const [addingVenue, setAddingVenue] = useState(false);
  const venueForm = useRef(null);

  async function saveVenue() {
    const root = venueForm.current;
    const body = Object.fromEntries(
      [...root.querySelectorAll('input')].map((i) => [i.name, i.type === 'checkbox' ? i.checked : i.value]),
    );
    const res = await api('/api/venues', { body });
    if (!res.ok) return s.setError(res.error);
    setVenueList((v) => [...v, res.venue]);
    setVenueId(res.venue.id);
    setAddingVenue(false);
    s.setNotice(`Added ${res.venue.name}.`);
  }

  return (
    <form
      className="stack"
      data-testid="gig-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = formData(e.currentTarget);
        body.venueId = venueId;
        body.startsAt = new Date(body.startsAtLocal).toISOString();
        delete body.startsAtLocal;
        s.run(async ({ setError }) => {
          const res = await api('/api/gigs', { body });
          if (!res.ok) return setError(res.error);
          router.push(`/gigs/${res.gig.id}?created=1`);
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>Gig title</span>
        <input name="title" required minLength={3} maxLength={100} placeholder="Record release show" />
      </label>
      <label className="field">
        <span>Venue</span>
        <select value={venueId} onChange={(e) => setVenueId(e.target.value)} name="venuePick" data-testid="venue-select">
          {venueList.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} — {v.city}
              {v.stay_to_play ? ' ★' : ''}
            </option>
          ))}
        </select>
        <small>★ = Stay-To-Play partner venue</small>
      </label>
      {!addingVenue ? (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingVenue(true)} data-testid="add-venue">
          + Venue not listed? Add it
        </button>
      ) : (
        <fieldset className="card card-inset stack" ref={venueForm} data-testid="venue-form">
          <legend>New venue</legend>
          <label className="field">
            <span>Venue name</span>
            <input name="name" maxLength={80} />
          </label>
          <div className="grid-2">
            <label className="field">
              <span>Street address</span>
              <input name="address" maxLength={120} />
            </label>
            <label className="field">
              <span>City</span>
              <input name="city" maxLength={60} placeholder="Austin, TX" />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="stayToPlay" /> This venue supports Stay-To-Play
          </label>
          <div className="row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={saveVenue} data-testid="save-venue">
              Save venue
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingVenue(false)}>
              Cancel
            </button>
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>Start time</span>
        <input name="startsAtLocal" type="datetime-local" required defaultValue={defaultStart()} data-testid="starts-at" />
      </label>
      <div className="grid-2">
        <label className="field">
          <span>Ticket price ($)</span>
          <input name="ticketPrice" type="number" min="0" max="500" step="1" defaultValue="12" inputMode="numeric" />
        </label>
        <label className="field">
          <span>Buddy Gig deposit ($)</span>
          <input name="deposit" type="number" min="10" max="100" step="5" defaultValue="25" inputMode="numeric" />
          <small>Each band locks this; no-shows forfeit it to the host.</small>
        </label>
      </div>
      <Alert error={s.error} notice={s.notice} />
      <button className="btn btn-primary" disabled={s.busy} data-testid="gig-submit">
        {s.busy ? 'Listing…' : 'List gig'}
      </button>
    </form>
  );
}

export function CancelGigButton({ gigId }) {
  const router = useRouter();
  const s = useSubmit();
  return (
    <div className="stack-sm">
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={s.busy}
        onClick={() =>
          s.run(async ({ setError }) => {
            if (!window.confirm('Cancel this gig? Pending Buddy Gig offers will be withdrawn.')) return;
            const res = await api(`/api/gigs/${gigId}`, { method: 'DELETE' });
            if (!res.ok) return setError(res.error);
            router.push('/dashboard');
            router.refresh();
          })
        }
      >
        Cancel gig
      </button>
      <Alert error={s.error} />
    </div>
  );
}

// ------------------------------------------------------------- buddy gigs

export function ProposeForm({ targetGigId, myGigs }) {
  const router = useRouter();
  const s = useSubmit();
  if (!myGigs.length) {
    return (
      <p className="muted">
        List one of your own upcoming gigs first, then come back to offer a Buddy Gig. <a href="/gigs/new">List a gig →</a>
      </p>
    );
  }
  return (
    <form
      className="stack"
      data-testid="propose-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...formData(e.currentTarget), targetGigId };
        s.run(async ({ setError }) => {
          const res = await api('/api/agreements', { body });
          if (!res.ok) return setError(res.error);
          router.push(`/deals/${res.agreement.id}?sent=1`);
          router.refresh();
        });
      }}
    >
      <label className="field">
        <span>In exchange, they come to your gig:</span>
        <select name="myGigId" data-testid="my-gig-select">
          {myGigs.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} — {g.venue_name} ({new Date(g.starts_at).toLocaleDateString()})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Message (optional)</span>
        <textarea name="message" rows={2} maxLength={280} placeholder="We'll bring the whole crew. See you at the front!" />
      </label>
      <Alert error={s.error} />
      <button className="btn btn-primary" disabled={s.busy} data-testid="propose-submit">
        🤝 Offer Buddy Gig
      </button>
    </form>
  );
}

export function AgreementActions({ agreementId, canAccept, canCancel }) {
  const router = useRouter();
  const s = useSubmit();
  const act = (action) =>
    s.run(async ({ setError }) => {
      const res = await api(`/api/agreements/${agreementId}`, { body: { action } });
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  return (
    <div className="stack-sm">
      <div className="row">
        {canAccept && (
          <>
            <button className="btn btn-primary" disabled={s.busy} onClick={() => act('accept')} data-testid="accept-deal">
              Accept &amp; lock deposit
            </button>
            <button className="btn btn-ghost" disabled={s.busy} onClick={() => act('decline')} data-testid="decline-deal">
              Decline
            </button>
          </>
        )}
        {canCancel && (
          <button className="btn btn-ghost" disabled={s.busy} onClick={() => act('cancel')} data-testid="cancel-deal">
            Withdraw offer
          </button>
        )}
      </div>
      <Alert error={s.error} />
    </div>
  );
}

// ------------------------------------------------------------ stay to play

export function StayForm({ targetGigId, myGigsSameVenue }) {
  const router = useRouter();
  const s = useSubmit();
  if (!myGigsSameVenue.length) {
    return <p className="muted">You need your own upcoming gig at this venue to Stay-To-Play here.</p>;
  }
  return (
    <form
      className="stack"
      data-testid="stay-form"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...formData(e.currentTarget), targetGigId };
        s.run(async ({ setError, setNotice }) => {
          const res = await api('/api/stay-to-play', { body });
          if (!res.ok) return setError(res.error);
          setNotice(`Committed to ${res.commitment.tickets} tickets. The venue sees your support on your booking.`);
          router.refresh();
        });
      }}
    >
      <div className="grid-2">
        <label className="field">
          <span>Your gig here</span>
          <select name="ownGigId">
            {myGigsSameVenue.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tickets you’ll buy</span>
          <input name="tickets" type="number" min="2" max="10" defaultValue="4" inputMode="numeric" />
        </label>
      </div>
      <Alert error={s.error} notice={s.notice} />
      <button className="btn btn-secondary" disabled={s.busy} data-testid="stay-submit">
        Stay-To-Play: commit tickets
      </button>
    </form>
  );
}

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
        <input name="email" type="email" required maxLength={254} autoComplete="email" inputMode="email" placeholder="you@example.com" />
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
          Type <strong>{email}</strong> to permanently delete your account and all of its data.
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


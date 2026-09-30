// Loads Google reCAPTCHA v3 only when explicitly enabled. Disabled by default.
export default function CaptchaScript() {
  if (process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED !== 'true' || !process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY) return null;
  return (
    <script
      src={`https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY)}`}
      async
      defer
    />
  );
}

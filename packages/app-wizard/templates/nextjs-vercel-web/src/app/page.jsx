import Link from 'next/link';
import { currentUser } from '@/lib/session';
import JsonLd from '@/components/JsonLd';
import { FAQ, SITE_URL, SITE_NAME, TAGLINE, DESCRIPTION, HERO_IMAGE } from '@/lib/site';

export const dynamic = 'force-dynamic';

const HOME_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: SITE_URL,
      description: DESCRIPTION,
      applicationCategory: 'LifestyleApplication',
      operatingSystem: 'Any (web browser, iOS, Android)',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@id': `${SITE_URL}/#org` },
    },
    {
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/#faq`,
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ],
};

export default async function Home() {
  const user = await currentUser();
  const primaryHref = user ? '/dashboard' : '/signup';
  const primaryLabel = user ? 'Go to your dashboard' : 'Get started — free';
  return (
    <>
      <JsonLd data={HOME_LD} />
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{SITE_NAME}</p>
            <h1 className="hero-title"><span className="hl">{TAGLINE}</span></h1>
            <p className="lead">{DESCRIPTION}</p>
            <div className="cta-row">
              <Link href={primaryHref} className="btn btn-primary btn-lg" data-testid="hero-cta">{primaryLabel}</Link>
              <a href="#faq" className="btn btn-ghost btn-lg">How it works</a>
            </div>
          </div>
          <div className="hero-media">
            <div className="phone">
              <img src={HERO_IMAGE} alt={`${SITE_NAME} on a phone`} width="390" height="844" fetchPriority="high" />
            </div>
          </div>
        </div>
      </section>

      <section className="section section-alt" id="faq">
        <div className="wrap narrow">
          <h2 className="section-title">Questions</h2>
          <div className="faq">
            {FAQ.map(([qText, a]) => (
              <details key={qText}>
                <summary>{qText}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="section final-cta">
        <div className="wrap narrow center">
          <h2 className="section-title">Ready?</h2>
          <Link href={primaryHref} className="btn btn-primary btn-lg">{primaryLabel}</Link>
        </div>
      </section>
    </>
  );
}

// Canonical site facts shared by metadata, robots, sitemap, JSON-LD and llms.txt.
export const SITE_URL = 'https://www.getemgigs.com';
export const SITE_NAME = 'Get ’Em Gigs';
export const SITE_NAME_ASCII = "Get 'Em Gigs";
export const TAGLINE = 'Fill the room. Kill pay-to-play.';
export const DESCRIPTION =
  'Get ’Em Gigs helps local bands fill the room: trade attendance with other bands (“I’ll come to your gig if you come to mine”), lock a small deposit, and get scanned in at the door to get it back. Bail and it pays the band you stood up. Plus Venue Stay-To-Play instead of pay-to-play.';
export const SHORT_DESCRIPTION = 'Buddy Gigs and Stay-To-Play for local bands. Trade attendance, get scanned in at the door, kill pay-to-play.';
export const KEYWORDS = [
  'local bands', 'live music', 'indie bands', 'gig swap', 'band gig exchange', 'buddy gig', 'pay to play',
  'stay to play', 'fill the room', 'band promotion', 'local music scene', 'gig attendance', 'music venues',
  'Austin live music', 'Nashville live music', 'Brooklyn live music', 'Chicago live music', 'Seattle live music',
];

export const FAQ = [
  [
    'Is it free?',
    'Yes. Signing up, listing gigs and making Buddy Gig deals is free. During the beta, deposits use gig credits (every band starts with $100 in credits) — no card payments are processed yet.',
  ],
  [
    'How does check-in work?',
    'Like Venmo. When doors open, open the deal on your phone and show your check-in QR code to the band that’s playing. They scan it with their phone and your deposit is released on the spot. The code changes every 30 seconds, so a screenshot texted to a friend at home won’t work.',
  ],
  [
    'What happens if a band bails?',
    'The next morning our settlement job closes out every deal. Anyone who never showed up forfeits their deposit to the band whose show they skipped, and their reputation drops. If you opened your code at the show but the host never scanned it, nobody profits — you just get your deposit back.',
  ],
  [
    'What is Stay-To-Play?',
    'Instead of buying a stack of tickets to your own show (pay-to-play), you commit to buying a few tickets to another band’s show at the same venue. The venue still gets a crowd — and you’re out supporting the scene.',
  ],
  [
    'Can I use it on my phone?',
    'It’s built phone-first. Add getemgigs.com to your home screen and it works like an app, including the camera scanner for check-ins.',
  ],
];

/** Pages that should never be indexed (private or per-user). */
export const PRIVATE_PATHS = ['/api/', '/dashboard', '/account', '/deals/', '/scan', '/gigs/new'];
export const NO_INDEX = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

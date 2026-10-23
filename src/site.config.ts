// ONE config file. Change values here; every page reads from it.
// Keep this file plain (no type-only syntax): scripts/deploy.mjs imports it directly.
const cfg = {
  name: 'Funny Award Certificate Maker',       // shown in header, title, footer
  domain: 'bingemind.com',                     // no https://, no www.
  cloudflareProject: 'funny-award-certificate',              // Cloudflare Pages project name (used by npm run deploy)
  keyword: 'funny award certificate maker',                // main keyword
  keywords: ['funny award certificate', 'funny award certificates for coworkers', 'funny award certificates for students', 'funny awards for coworkers', 'award certificate maker free', 'printable award certificate'],
  tagline: 'Free, kind and printable',
  description:
    'Make funny award certificates for coworkers, students, teams and family. Pick from 180+ kind award ideas, then print or save a PDF. Free, no sign-up.',
  email: 'hello@bingemind.com',                // contact email (shown on the Contact, Privacy and Terms pages)
  ga4: '',                                     // GA4 measurement ID, e.g. 'G-XXXXXXXXXX'. Empty = Google Analytics off
  adsense: '',                                 // AdSense publisher ID, e.g. 'ca-pub-1234567890123456'. Empty = ads off
  brand: '#be123c',                            // brand color (hex). Ribbon red; no other tool uses it.
  locale: 'en-US',                             // BCP 47 language tag
  ogImage: '/og.png',                          // 1200x630 file in public/
  category: 'DesignApplication',            // schema.org applicationCategory
  owner: 'Funny Award Certificate Maker',      // name used in legal pages
};

// Bingemind mode (SITE_MODE=bingemind): the tool lives at bingemind.com/funny-award-certificate/.
// Canonical links always name that address. Legal pages name Bingemind as the owner.
const bingemind = process.env.SITE_MODE === 'bingemind';
export default {
  ...cfg,
  domain: 'bingemind.com/funny-award-certificate',
  origin: 'https://bingemind.com/funny-award-certificate',
  bingemind,
  owner: bingemind ? 'Bingemind (Abhishek Mishra)' : cfg.owner,
  contactWord: bingemind ? 'Contact' : 'Email',
  contactHref: bingemind ? 'https://bingemind.com/#contact' : `mailto:${cfg.email}`,
  contactLabel: bingemind ? 'bingemind.com/#contact' : cfg.email,
};

# Independent review: funny-award-certificate

Reviewer: Matt (independent; not the builder). Date: 2026-10-21. Scope: personal (Bingemind microtools).
Lenses: code (maintainer, minimalism, regression, readability), design and SEO (with no fake affordances and accessibility), 8 mock customers, and the 4 focus areas in the brief.
Commits: `07a76b4` (review fixes), `7a229d4` (script lettering after the competitor check). Last builder commit before review: `9813cfb`.

## Verdict
1 High and 7 Medium issues found and fixed. Ready for assembly.

| Gate | Before | After |
|---|---|---|
| `npm test` | 38 pass | 44 pass |
| Browser gate (network and UI tests, both builds) | 191 checks | 217 checks, network test clean |
| Lighthouse (local build, mobile) | 100/100/100/100, CLS 0 | 100/100/100/100, LCP 1.2 s, CLS 0.013, 40 KiB |
| Batch PDF, 30 names, Letter | about 7.5 MB | 2.6 MB, about 1.4 s |
| Batch PDF, 300 names | 79 MB | 22.5 MB, 5.7 s |

## Focus 1: are all 184 awards kind?
All 184 read. 13 lines that could embarrass a kid or a coworker were replaced; counts stay 38/38/36/36/36 = 184. A new test blocks the removed patterns.

| Was | Why it could hurt | Now |
|---|---|---|
| Sideline Superstar | Tells a kid they sat on the bench | The Playmaker Award |
| Water Bottle Hero, Orange Slice Captain, Gear Guardian | Chores, not play | The Big Smile, The Fearless, The Quick Learner |
| Loudest Cheer | Bench reading | Reason now about a team cheer |
| The Could Have Been an Email Award | Reads as a dig | The Short Meeting Hero Award |
| Handwriting Hero ("got neater") | Implies it was messy | "letters so neat that they look like a book" |
| Cool as a Cucumber ("on test day") | Touches tests and grades | "even on busy days" |
| Nap Champion of the Year | Age joke for a grandparent | The Family Comedian Award |
| Treat Finder General | Food-seeking joke about a child | The Hide and Seek Champion Award |
| Chore Champion ("Mostly."), Sibling ("most of the time") | Backhanded | Plain praise |
| Grand Entrance | Reads as "always late" | "making the whole room smile" |

## Focus 2: batch PDF size
One shared background image plus one band per page, each cut from that page's own full render at the same quality (0.85) and DPI (200). About 85 KB per page instead of 220 to 260 KB. Rasterised comparison of batch vs single PDFs for all 6 designs on Letter and A4: largest pixel difference 7 of 255; visually identical. Single-page PDFs unchanged.

## Focus 3: print output
- Print gives 1 sheet per certificate at 792 x 612 and 842 x 595, equal margins.
- High, fixed: Classic frame 0.21 in from the edge (home printers clip); now 0.3 in.
- Medium, fixed: A4 seal tails crossed the frame; Ctrl+P printed the whole page; paper default now Letter in Letter countries, A4 elsewhere (saved choice wins).
- A print hint: "Choose Landscape and no margins if asked".

## Focus 4: premium look
Engraved 16-petal corner medallions, curly quotes, striped two-strap medal ribbon, trophy shine, confetti clear of text. Optional Script lettering for the name (Great Vibes, SIL OFL, self-hosted, loaded on demand; licence in `public/fonts`). Trophy and Confetti stay friendly flat art.

## Code lenses
| Sev | File | Finding | Status |
|---|---|---|---|
| must | `core.js` parseBatch | "Brooks, Ava" became name "Brooks", award "Ava" | Fixed: one-click "Each line is one person" |
| must | `draw.js` LAYOUT | Seal tails crossed the A4 frame | Fixed |
| should | `draw.js` describe | Label read "week after week.." | Fixed |
| should | `test-ui.mjs` | Locale-dependent tests | Pinned en-US, 5 locales checked |
| should | `pdf.js` | Full-page images only | Shared-background mode with a known-answer test |
| nice | `Base.astro` (template) | Default build og:image points at bingemind.com/og.png | Left for the template fixer |

## Design, SEO and accessibility
Title 49 chars, description 151, one H1, three JSON-LD blocks (WebApplication, BreadcrumbList, FAQPage), no aggregateRating, canonical and og:image correct. Every control clicked. axe: no serious issues. Open (should): on phones the preview scrolls out of view while typing; desktop Tab reaches Save before the form.

## Mock customers (8)
Office manager, 2nd-grade teacher (roster bug found and fixed), U10 coach, HR, parent, college club lead, 72-year-old on iPad, phone-only user: all completed their task after the fixes. Ranked asks: roster fix (done), kind sports awards (done), right print sheet (done), preview visible while typing (open, 3 asks), logo (later), photo (out of scope).

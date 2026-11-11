# Website review — 11 November 2026

Scope: LiveStream Studio marketing site and GitHub Pages output. No running desktop app or broadcast was changed.

## Findings and fixes

| Priority | Finding | Result |
| --- | --- | --- |
| High | Hash-only page URLs and navigation buttons prevented reliable discovery of separate download/support pages. | Real trailing-slash routes and HTML links; old hash URLs redirect to their equivalents. |
| High | Original HTML contained an empty React root. Non-JavaScript clients could not read product information or find installers. | Twelve pages are rendered to HTML at build time, including published direct installer links and release information. A verified release snapshot preserves downloads when the public API is rate-limited. |
| High | robots.txt and sitemap.xml were absent. | Generated root robots.txt permits crawling and points to an XML sitemap of all twelve canonical pages. |
| Medium | Every page inherited the homepage title, description and canonical; social metadata was missing. | Unique titles/descriptions/canonicals, Open Graph/Twitter cards and truthful Organization/WebSite/WebPage/SoftwareApplication structured data. No invented reviews or ratings. |
| Medium | Seeded public download counter harmed visual polish and credibility. | Removed entirely from homepage/downloads. Real host download statistics continue independently; aggregation service/tests remain for reporting. |
| Medium | Pale CTA gradient endpoint had 2.73:1 contrast with white labels. | New endpoint is 4.83:1; blue endpoint is 5.33:1. Heading cyan is darker as well. This is a targeted color check, not a claim of full WCAG certification. |
| Medium | Cross-page FAQ links were reset to the top on mount. Mobile menus could remain open on same-page section navigation. | Fragment-aware initial scroll and menu-close behavior, verified at 390px width. |
| Medium | Marketing entry eagerly loaded the entire desktop UI. | Desktop app now loads on demand for Tauri and the explicit studio preview. Website main JS is about 200 KB versus 408 KB before splitting (uncompressed). |
| Low | Download headline was poetic but not descriptive. Hero did not immediately explain finished-video/local operation. | Explicit Download LiveStream Studio heading and clearer pre-recorded/local broadcasting copy. |
| Low | Motion preferences were ignored. | Reduced-motion CSS disables site animations and transitions. |

Three distinct guides now cover free desktop livestreaming software, YouTube playlist broadcasting and multistreaming. They are linked from the homepage and each other, rendered as HTML, included in the sitemap and listed in llms.txt. llms.txt is a supplementary page index; it is not an AI indexing or ranking guarantee.

## Validation

- `npm run build:site` generates static pages and release snapshot.
- `npm run test:site` verifies twelve rendered pages, one H1 and canonical each, unique titles/descriptions, social metadata, valid structured JSON, local links/assets, installers, sitemap, robots and noindex 404.
- Browser review covers desktop and 390px mobile layout, light/dark theme, mobile navigation, FAQ anchors, direct page loading and old hash-link compatibility.
- Sitemap contains only real canonical routes; no fake last-modified dates or fragment routes.
- 404.html is a true missing-page document on GitHub Pages and has noindex metadata.

## Remaining limitations / priorities

1. Search Console ownership and sitemap submission are not verified. Publishing a sitemap does not prove Google has indexed the site; confirm indexing in the owner's Search Console.
2. Code-signing/notarization remain the largest download trust issue. Platform guides explain current warnings, but the website cannot remove unsigned-installer warnings.
3. The authentic dashboard screenshot is a 1.4 MB PNG. Responsive WebP/AVIF variants would reduce image transfer further while keeping the original full-size screenshot available.
4. No field Core Web Vitals or Lighthouse score was measured in this review. Do not present the bundle reduction as a measured real-user speed improvement.
5. Static release snapshots refresh when the website is rebuilt; JavaScript clients also fetch the latest published release. Rebuild the site when publishing a new desktop version.

Reference: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics — crawlable links, real URLs, unique metadata and pre-rendered HTML.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const SITE_URL = 'https://www.deaths-in-war.com';

const INTENSITY_LABELS: Record<string, string> = {
  major_war: 'Major War (10,000+ deaths/year)',
  war: 'War (1,000–9,999 deaths/year)',
  minor_conflict: 'Minor Conflict (100–999 deaths/year)',
  skirmish: 'Skirmish (<100 deaths/year)',
};

interface Conflict {
  id: string;
  name: string;
  location: string;
  countries: string[];
  startYear: number;
  deathToll: { total: number; totalDisplay: string; recent?: number };
  intensity: string;
  sourceUrl: string;
  lastUpdated: string;
  affectedRegions?: { name: string; lat: number; lng: number; eventCount: number }[];
}

interface ConflictsData {
  conflicts: Conflict[];
  lastScraped: string;
  totalDeaths: number;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadConflictsData(): ConflictsData | null {
  const localPath = path.join(__dirname, '..', '..', 'backend', 'src', 'data', 'conflicts.json');
  if (fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf-8'));
  }
  return null;
}

function readDistHtml(): string {
  const htmlPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`dist/index.html not found. Run "vite build" first.`);
  }
  return fs.readFileSync(htmlPath, 'utf-8');
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

function buildHomeSeoContent(data: ConflictsData): string {
  const { conflicts, totalDeaths, lastScraped } = data;
  const date = formatDate(lastScraped);
  const sorted = [...conflicts].sort((a, b) => b.deathToll.total - a.deathToll.total);
  const deadliest = sorted[0];

  const byIntensity: Record<string, number> = {};
  for (const c of conflicts) {
    byIntensity[c.intensity] = (byIntensity[c.intensity] || 0) + 1;
  }

  const lines: string[] = [];
  lines.push('<div id="seo-content" aria-hidden="true" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap">');
  lines.push(`  <h1>Deaths in War — Ongoing Armed Conflicts Tracker</h1>`);

  lines.push(`  <section>`);
  lines.push(`    <h2>Global Conflict Statistics</h2>`);
  lines.push(`    <p>As of ${date}, there are ${conflicts.length} ongoing armed conflicts worldwide, with an estimated ${totalDeaths.toLocaleString('en-US')} total fatalities.</p>`);
  lines.push(`    <ul>`);
  for (const [key, count] of Object.entries(byIntensity)) {
    lines.push(`      <li>${escapeHtml(INTENSITY_LABELS[key] || key)}: ${count}</li>`);
  }
  lines.push(`    </ul>`);
  lines.push(`  </section>`);

  lines.push(`  <section>`);
  lines.push(`    <h2>All Ongoing Armed Conflicts</h2>`);
  lines.push('    <table>');
  lines.push('      <thead><tr><th>Conflict</th><th>Region</th><th>Deaths</th><th>Intensity</th><th>Since</th></tr></thead>');
  lines.push('      <tbody>');
  for (const c of sorted) {
    lines.push(`        <tr><td><a href="/conflict/${escapeHtml(c.id)}">${escapeHtml(c.name)}</a></td><td>${escapeHtml(c.location)}</td><td>${escapeHtml(c.deathToll.totalDisplay)}</td><td>${escapeHtml(INTENSITY_LABELS[c.intensity] || c.intensity)}</td><td>${c.startYear}</td></tr>`);
  }
  lines.push('      </tbody>');
  lines.push('    </table>');
  lines.push(`  </section>`);

  lines.push(`  <section>`);
  lines.push(`    <h2>Frequently Asked Questions</h2>`);
  lines.push(`    <h3>How many wars are happening right now?</h3>`);
  lines.push(`    <p>As of ${date}, there are ${conflicts.length} ongoing armed conflicts tracked worldwide, ranging from major wars to low-intensity skirmishes.</p>`);
  lines.push(`    <h3>What is the deadliest ongoing conflict?</h3>`);
  lines.push(`    <p>The deadliest ongoing conflict is the ${escapeHtml(deadliest.name)} in ${escapeHtml(deadliest.location)}, with an estimated ${escapeHtml(deadliest.deathToll.totalDisplay)} total fatalities since ${deadliest.startYear}.</p>`);
  lines.push(`    <h3>Where does the data come from?</h3>`);
  lines.push(`    <p>All conflict data is sourced from Wikipedia's List of Ongoing Armed Conflicts, enriched with geolocation data from the Uppsala Conflict Data Program (UCDP). The data is automatically updated daily.</p>`);
  lines.push(`  </section>`);

  lines.push('</div>');
  return lines.join('\n');
}

function buildConflictSeoContent(conflict: Conflict, allConflicts: Conflict[]): string {
  const related = allConflicts
    .filter(c => c.id !== conflict.id && c.intensity === conflict.intensity)
    .slice(0, 5);

  const lines: string[] = [];
  lines.push('<div id="seo-content">');
  lines.push('  <article>');
  lines.push(`    <h1>${escapeHtml(conflict.name)}</h1>`);
  lines.push('    <dl>');
  lines.push(`      <dt>Total Deaths</dt><dd>${escapeHtml(conflict.deathToll.totalDisplay)}</dd>`);
  if (conflict.deathToll.recent && conflict.deathToll.recent > 0) {
    lines.push(`      <dt>Recent Annual Deaths</dt><dd>${conflict.deathToll.recent.toLocaleString('en-US')}</dd>`);
  }
  lines.push(`      <dt>Intensity</dt><dd>${escapeHtml(INTENSITY_LABELS[conflict.intensity] || conflict.intensity)}</dd>`);
  lines.push(`      <dt>Since</dt><dd>${conflict.startYear}</dd>`);
  lines.push(`      <dt>Location</dt><dd>${escapeHtml(conflict.countries.join(', '))}</dd>`);
  lines.push('    </dl>');
  if (conflict.affectedRegions && conflict.affectedRegions.length > 0) {
    lines.push(`    <h2>Affected Regions</h2>`);
    lines.push('    <ul>');
    for (const r of conflict.affectedRegions.slice(0, 20)) {
      lines.push(`      <li>${escapeHtml(r.name)} (${r.eventCount} recorded events)</li>`);
    }
    lines.push('    </ul>');
  }
  lines.push(`    <p>Data sourced from <a href="${escapeHtml(conflict.sourceUrl)}">Wikipedia</a>. Last updated: ${escapeHtml(conflict.lastUpdated)}.</p>`);
  if (related.length > 0) {
    lines.push(`    <h2>Related Conflicts</h2>`);
    lines.push('    <ul>');
    for (const r of related) {
      lines.push(`      <li><a href="/conflict/${escapeHtml(r.id)}">${escapeHtml(r.name)}</a> — ${escapeHtml(r.deathToll.totalDisplay)} deaths</li>`);
    }
    lines.push('    </ul>');
  }
  lines.push(`    <nav><a href="/">← View all conflicts on the globe</a></nav>`);
  lines.push('  </article>');
  lines.push('</div>');
  return lines.join('\n');
}

function injectSeoContent(html: string, seoContent: string): string {
  return html.replace('<div id="root"></div>', `${seoContent}\n    <div id="root"></div>`);
}

function replaceHeadMeta(html: string, overrides: {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogUrl: string;
  jsonLd?: string;
}): string {
  let result = html;
  result = result.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(overrides.title)}</title>`);
  result = result.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${escapeHtml(overrides.description)}$2`
  );
  result = result.replace(
    /(<link rel="canonical" href=")[^"]*(")/,
    `$1${overrides.canonical}$2`
  );
  result = result.replace(
    /(<meta property="og:title" content=")[^"]*(")/,
    `$1${escapeHtml(overrides.ogTitle)}$2`
  );
  result = result.replace(
    /(<meta property="og:description" content=")[^"]*(")/,
    `$1${escapeHtml(overrides.ogDescription)}$2`
  );
  result = result.replace(
    /(<meta property="og:url" content=")[^"]*(")/,
    `$1${overrides.ogUrl}$2`
  );
  result = result.replace(
    /(<meta name="twitter:title" content=")[^"]*(")/,
    `$1${escapeHtml(overrides.ogTitle)}$2`
  );
  result = result.replace(
    /(<meta name="twitter:description" content=")[^"]*(")/,
    `$1${escapeHtml(overrides.ogDescription)}$2`
  );
  if (overrides.jsonLd) {
    const marker = '<!-- JSON-LD Structured Data -->';
    const jsonLdEnd = '</script>\n\n    <link rel="preconnect"';
    const jsonLdSectionRegex = /<!-- JSON-LD Structured Data -->[\s\S]*?<\/script>\s*<\/script>/;
    const match = result.match(jsonLdSectionRegex);
    if (match) {
      result = result.replace(match[0], `${marker}\n${overrides.jsonLd}`);
    }
  }
  return result;
}

function buildConflictJsonLd(conflict: Conflict): string {
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${conflict.name} — Death Toll & Conflict Data`,
    description: `${conflict.deathToll.totalDisplay} deaths since ${conflict.startYear}. Track the ${conflict.name} death toll, casualties, and conflict data.`,
    dateModified: conflict.lastUpdated,
    url: `${SITE_URL}/conflict/${conflict.id}`,
    publisher: { '@type': 'Organization', name: 'Deaths in War' },
    about: {
      '@type': 'Event',
      name: conflict.name,
      startDate: String(conflict.startYear),
      location: {
        '@type': 'Place',
        name: conflict.countries.join(', '),
      },
    },
  };
  return `    <script type="application/ld+json">\n    ${JSON.stringify(articleLd, null, 2).replace(/\n/g, '\n    ')}\n    </script>`;
}

function buildFaqJsonLd(data: ConflictsData): string {
  const { conflicts, totalDeaths, lastScraped } = data;
  const date = formatDate(lastScraped);
  const sorted = [...conflicts].sort((a, b) => b.deathToll.total - a.deathToll.total);
  const deadliest = sorted[0];

  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'How many ongoing armed conflicts are there right now?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `As of ${date}, there are ${conflicts.length} ongoing armed conflicts worldwide, with a combined estimated death toll of ${totalDeaths.toLocaleString('en-US')}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'What is the deadliest ongoing conflict?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: `The deadliest ongoing conflict is the ${deadliest.name} in ${deadliest.location}, with an estimated ${deadliest.deathToll.totalDisplay} total fatalities since ${deadliest.startYear}.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Where does the conflict data come from?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: "All data is sourced from Wikipedia's List of Ongoing Armed Conflicts, enriched with geolocation data from the Uppsala Conflict Data Program (UCDP). The dataset is automatically updated daily.",
        },
      },
    ],
  };
  return `    <script type="application/ld+json">\n    ${JSON.stringify(faq, null, 2).replace(/\n/g, '\n    ')}\n    </script>`;
}

function buildWebPageJsonLd(): string {
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['#seo-content', '#seo-content > section:first-of-type'],
    },
  };
  return `    <script type="application/ld+json">\n    ${JSON.stringify(webPage, null, 2).replace(/\n/g, '\n    ')}\n    </script>`;
}

function patchHomeMetaDescription(html: string, data: ConflictsData): string {
  const desc = `Track ${data.conflicts.length} ongoing armed conflicts worldwide with ${data.totalDeaths.toLocaleString('en-US')}+ total fatalities. Interactive 3D globe with daily updated death toll data from Wikipedia.`;
  return html.replace(
    /(<meta name="description" content=")[^"]*(")/,
    `$1${escapeHtml(desc)}$2`,
  );
}

function patchDatasetJsonLd(html: string, data: ConflictsData): string {
  const scriptTagRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = scriptTagRegex.exec(html)) !== null) {
    const content = match[1].trim();
    if (!content.includes('"Dataset"')) continue;

    try {
      const dataset = JSON.parse(content);
      dataset.temporalCoverage = `2024/${new Date().getFullYear()}`;
      dataset.dateModified = data.lastScraped;

      const newScript = `<script type="application/ld+json">\n    ${JSON.stringify(dataset, null, 2).replace(/\n/g, '\n    ')}\n    </script>`;
      html = html.replace(match[0], newScript);
      break;
    } catch {
      break;
    }
  }
  return html;
}

function generateLlmsFullTxt(data: ConflictsData): string {
  const { conflicts, totalDeaths, lastScraped } = data;
  const date = formatDate(lastScraped);
  const sorted = [...conflicts].sort((a, b) => b.deathToll.total - a.deathToll.total);

  const byIntensity: Record<string, number> = {};
  for (const c of conflicts) {
    byIntensity[c.intensity] = (byIntensity[c.intensity] || 0) + 1;
  }
  const intensityBreakdown = Object.entries(byIntensity)
    .map(([key, count]) => `- ${INTENSITY_LABELS[key] || key}: ${count}`)
    .join('\n');

  const conflictList = sorted
    .map((c, i) =>
      `${i + 1}. **${c.name}** — ${c.location}\n   Deaths: ${c.deathToll.totalDisplay} | Intensity: ${INTENSITY_LABELS[c.intensity] || c.intensity} | Since: ${c.startYear}\n   Source: ${c.sourceUrl}`)
    .join('\n\n');

  return `# Deaths in War — Full Data

> Interactive 3D globe tracking ongoing armed conflicts worldwide and their human cost.
> Data last updated: ${date}

## Summary

As of ${date}, there are **${conflicts.length}** ongoing armed conflicts worldwide
with an estimated **${totalDeaths.toLocaleString('en-US')}** total fatalities.

### Breakdown by Intensity
${intensityBreakdown}

## API Endpoints

- GET /api/conflicts — JSON array of all ongoing conflicts with death tolls, coordinates, and intensity
- GET /api/stats — Aggregated statistics (total deaths, conflict counts by intensity)
- GET /api/last-updated — Timestamp of most recent data update

Base URL: ${SITE_URL}

## All Ongoing Armed Conflicts

${conflictList}

## Data Sources

- Wikipedia: https://en.wikipedia.org/wiki/List_of_ongoing_armed_conflicts
- UCDP GED (Uppsala Conflict Data Program): https://ucdp.uu.se/downloads/

## License

Data: CC BY-SA 4.0 | Code: MIT

## About

This project scrapes Wikipedia daily for up-to-date data on all ongoing armed conflicts,
then renders an interactive 3D globe (Three.js) with conflict markers sized by cumulative
death toll and colored by intensity level.

Website: ${SITE_URL}
`;
}

function generateSitemap(conflicts: Conflict[], lastScraped: string): string {
  const today = lastScraped.split('T')[0];
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  lines.push('  <url>');
  lines.push(`    <loc>${SITE_URL}/</loc>`);
  lines.push(`    <lastmod>${today}</lastmod>`);
  lines.push('    <changefreq>daily</changefreq>');
  lines.push('    <priority>1.0</priority>');
  lines.push('  </url>');
  for (const c of conflicts) {
    lines.push('  <url>');
    lines.push(`    <loc>${SITE_URL}/conflict/${c.id}</loc>`);
    lines.push(`    <lastmod>${today}</lastmod>`);
    lines.push('    <changefreq>daily</changefreq>');
    lines.push('    <priority>0.8</priority>');
    lines.push('  </url>');
  }
  lines.push('  <url>');
  lines.push(`    <loc>${SITE_URL}/api/conflicts</loc>`);
  lines.push(`    <lastmod>${today}</lastmod>`);
  lines.push('    <changefreq>daily</changefreq>');
  lines.push('    <priority>0.7</priority>');
  lines.push('  </url>');
  lines.push('  <url>');
  lines.push(`    <loc>${SITE_URL}/llms.txt</loc>`);
  lines.push('    <changefreq>monthly</changefreq>');
  lines.push('    <priority>0.5</priority>');
  lines.push('  </url>');
  lines.push('  <url>');
  lines.push(`    <loc>${SITE_URL}/llms-full.txt</loc>`);
  lines.push(`    <lastmod>${today}</lastmod>`);
  lines.push('    <changefreq>daily</changefreq>');
  lines.push('    <priority>0.7</priority>');
  lines.push('  </url>');
  lines.push('</urlset>');
  return lines.join('\n');
}

function main() {
  console.log('[Prerender] Loading conflict data...');
  const data = loadConflictsData();
  if (!data) {
    console.warn('[Prerender] Skipped — conflicts.json not found. SEO pages will not be generated.');
    return;
  }
  console.log(`[Prerender] Found ${data.conflicts.length} conflicts.`);

  const baseHtml = readDistHtml();

  // 1. Enhance home page with SEO content, JSON-LD, and dynamic meta
  console.log('[Prerender] Generating home page with SEO content...');
  const homeSeo = buildHomeSeoContent(data);
  let homeHtml = injectSeoContent(baseHtml, homeSeo);
  homeHtml = patchHomeMetaDescription(homeHtml, data);
  homeHtml = patchDatasetJsonLd(homeHtml, data);
  const faqLd = buildFaqJsonLd(data);
  const webPageLd = buildWebPageJsonLd();
  homeHtml = homeHtml.replace('</head>', `\n${faqLd}\n${webPageLd}\n  </head>`);
  fs.writeFileSync(path.join(DIST_DIR, 'index.html'), homeHtml, 'utf-8');

  // 2. Generate conflict detail pages
  console.log('[Prerender] Generating conflict detail pages...');
  for (const conflict of data.conflicts) {
    const slug = conflict.id;
    const dir = path.join(DIST_DIR, 'conflict', slug);
    fs.mkdirSync(dir, { recursive: true });

    const desc = `${conflict.deathToll.totalDisplay} deaths since ${conflict.startYear}. Track the ${conflict.name} death toll and conflict intensity data.`;
    const conflictJsonLd = buildConflictJsonLd(conflict);

    let conflictHtml = replaceHeadMeta(baseHtml, {
      title: `${conflict.name} — Deaths & Casualties | Deaths in War`,
      description: desc,
      canonical: `${SITE_URL}/conflict/${slug}`,
      ogTitle: `${conflict.name} — Death Toll & Conflict Data`,
      ogDescription: desc,
      ogUrl: `${SITE_URL}/conflict/${slug}`,
      jsonLd: conflictJsonLd,
    });

    const conflictSeo = buildConflictSeoContent(conflict, data.conflicts);
    conflictHtml = injectSeoContent(conflictHtml, conflictSeo);

    fs.writeFileSync(path.join(dir, 'index.html'), conflictHtml, 'utf-8');
  }
  console.log(`[Prerender] Generated ${data.conflicts.length} conflict pages.`);

  // 3. Generate llms-full.txt
  console.log('[Prerender] Generating llms-full.txt...');
  const llmsFull = generateLlmsFullTxt(data);
  fs.writeFileSync(path.join(DIST_DIR, 'llms-full.txt'), llmsFull, 'utf-8');

  // 4. Generate dynamic sitemap
  console.log('[Prerender] Generating sitemap.xml...');
  const sitemap = generateSitemap(data.conflicts, data.lastScraped);
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap, 'utf-8');

  console.log('[Prerender] Done!');
}

main();

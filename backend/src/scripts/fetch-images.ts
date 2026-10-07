/**
 * S3.7 — fetches openly licensed photos (OD-11) into seed-data/images/manifest.json and
 * storage/catalogue/*.webp. No API key needed.
 *  - Wikimedia Commons (primary): no daily cap; licence, author and page come from the file metadata.
 *  - Openverse (top-up only): anonymous limit of 200 requests/day, so it's used sparingly.
 * Only licences that allow commercial use and modification are kept: CC0, public domain, CC BY, CC BY-SA.
 * Photos are downloaded once and resized to a 900 px-wide WebP (format change only, no cropping)
 * so pages stay fast (FE-006). Resumable: finished queries and existing files are skipped.
 *
 *   pnpm images:fetch            # fetch everything still missing
 *   pnpm images:fetch --dry-run  # list the queries without fetching
 *   pnpm images:fetch --categories-only  # only category/section and content images (quick, broad)
 *   pnpm images:fetch --only "folded briefs underwear,bras on hanger"  # just these queries
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { generateCatalogue } from '../seed/catalogue/generate.js';
import type { ImageManifest, ManifestPhoto } from '../seed/catalogue/images.js';
import { fallbackQueriesFor } from '../seed/queries.js';
import { isRelevant, isUnsuitablePhoto, keywordsFor } from '../seed/catalogue/relevance.js';
import { loadImageBlocklist } from '../seed/files.js';
import { flattenTree, loadTree, SEED_DIR } from '../seed/tree.js';

const MANIFEST = resolve(SEED_DIR, 'images/manifest.json');
const STORE = resolve(import.meta.dirname, '../../storage/catalogue');
const UA = 'WardrobeDemoSeed/1.0 (demo store seed script; +https://github.com/ChiragKumar601/ecommerce-app)';
const dryRun = process.argv.includes('--dry-run');
/** Owner request: only category/section-level and content queries (fast, broad coverage; reuse allowed). */
const categoriesOnly = process.argv.includes('--categories-only');
/** Restrict the run to these queries (comma-separated), e.g. after changing a few image queries. */
const onlyArg = process.argv.find((a, i) => process.argv[i - 1] === '--only' || a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.replace(/^--only=/, '').split(',').map((q) => q.trim().toLowerCase()).filter(Boolean)) : null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ALLOWED_LICENCE = /^(cc0|public domain|pdm|cc by(-sa)? \d(\.\d)?)/i;
const BLOCKED_LICENCE = /\b(nc|nd|non-?commercial|no ?deriv)/i;
/** Off-topic or trademark-heavy results (fictional brands sit next to these photos — D-28). */
const BLOCKED_TITLE = /\b(map|logo|flag|coat of arms|diagram|icon|museum|century|antique|clevelandart|portrait|location|svg|chart|poster|advert|adidas|nike|puma|reebok|vans|converse|yeezy|dior|chanel|gucci|louis vuitton|prada|rolex|apple|samsung|iphone|lg|sony|old navy|zara|h&m|levi|ikea)\b/i;

interface Candidate { title: string; imageUrl: string; width: number; height: number; mime: string; licence: string; licenceUrl: string | null; author: string; authorUrl: string | null; pageUrl: string; source: string }

const stripHtml = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const cleanTitle = (t: string) => t.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\(\d+\)/g, '').trim();

/** Photos removed after review are never fetched again (owner request, 2026-10-07). */
const BLOCKED_IDS = loadImageBlocklist();

function acceptable(c: Candidate, keywords: string[] | null): boolean {
  if (keywords && !isRelevant(c.title, keywords)) return false;
  if (isUnsuitablePhoto(c.title) || BLOCKED_IDS.has(photoId(c))) return false;
  return (
    ALLOWED_LICENCE.test(c.licence) && !BLOCKED_LICENCE.test(c.licence) && !BLOCKED_TITLE.test(c.title) &&
    /image\/(jpeg|png|webp)/.test(c.mime) && c.width >= 600 && c.height >= 500
  );
}

async function getJson(url: string): Promise<{ status: number; body: unknown; headers: Headers }> {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    return { status: res.status, body: res.ok ? await res.json() : null, headers: res.headers };
  }
}

async function wikimedia(query: string): Promise<Candidate[]> {
  const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrnamespace: '6', gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: '50', prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '900', maxlag: '5',
  });
  const { body } = await getJson(url);
  const pages = Object.values((body as { query?: { pages?: Record<string, unknown> } })?.query?.pages ?? {}) as {
    title: string; index: number;
    imageinfo?: { thumburl?: string; url: string; width: number; height: number; mime: string; descriptionurl: string; extmetadata: Record<string, { value: string } | undefined> }[];
  }[];
  return pages
    .sort((a, b) => a.index - b.index)
    .flatMap((p) => {
      const ii = p.imageinfo?.[0];
      if (!ii) return [];
      const m = ii.extmetadata;
      return [{
        title: cleanTitle(p.title), imageUrl: ii.thumburl ?? ii.url, width: ii.width, height: ii.height, mime: ii.mime,
        licence: stripHtml(m['LicenseShortName']?.value ?? ''), licenceUrl: m['LicenseUrl']?.value ?? null,
        author: stripHtml(m['Artist']?.value ?? 'Unknown') || 'Unknown', authorUrl: null, pageUrl: ii.descriptionurl, source: 'wikimedia',
      }];
    });
}

let openverseLeft = Number.POSITIVE_INFINITY;
async function openverse(query: string): Promise<Candidate[]> {
  if (openverseLeft <= 5) return [];
  const url = 'https://api.openverse.org/v1/images/?' + new URLSearchParams({ q: query, license_type: 'commercial,modification', page_size: '20', mature: 'false' });
  const { body, headers } = await getJson(url);
  openverseLeft = Number(headers.get('x-ratelimit-available-anon_sustained') ?? openverseLeft);
  await sleep(3_200); // stay under 20 requests/minute
  const results = ((body as { results?: unknown[] })?.results ?? []) as {
    title: string; url: string; width: number | null; height: number | null; filetype: string | null; license: string; license_version: string;
    license_url: string | null; creator: string | null; creator_url: string | null; foreign_landing_url: string; provider: string;
  }[];
  return results.map((r) => ({
    title: r.title ?? query, imageUrl: r.url, width: r.width ?? 0, height: r.height ?? 0,
    mime: `image/${(r.filetype ?? 'jpeg').replace('jpg', 'jpeg')}`,
    licence: r.license === 'cc0' ? 'CC0' : r.license === 'pdm' ? 'Public domain' : `CC ${r.license.toUpperCase()} ${r.license_version}`,
    licenceUrl: r.license_url, author: r.creator ?? 'Unknown', authorUrl: r.creator_url, pageUrl: r.foreign_landing_url, source: `openverse:${r.provider}`,
  }));
}

/** A photo's id: stable for its source page. */
function photoId(c: Pick<Candidate, 'pageUrl'>): string {
  return createHash('sha1').update(c.pageUrl).digest('hex').slice(0, 16);
}

async function download(c: Candidate): Promise<ManifestPhoto | null> {
  const id = photoId(c);
  const file = resolve(STORE, `${id}.webp`);
  if (!existsSync(file)) {
    try {
      const res = await fetch(c.imageUrl, { headers: { 'User-Agent': UA } });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 25 * 1024 * 1024) return null;
      await sharp(buf).rotate().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 72 }).toFile(file);
    } catch {
      return null;
    }
  }
  return {
    id, url: `/media/catalogue/${id}.webp`, alt: c.title, photographer: c.author, photographerUrl: c.authorUrl,
    pageUrl: c.pageUrl, licence: c.licence, licenceUrl: c.licenceUrl, source: c.source, downloadUrl: c.imageUrl,
  };
}

interface Planned { want: number; keywords: string[] | null }

/**
 * Searches to run: one per item type (with its relevance keywords) plus hero/card content.
 * `--categories-only` instead plans the broad category/section searches (no keyword filter at fetch
 * time; photos are filtered per product when assigned).
 */
function plannedQueries(): Map<string, Planned> {
  const nodes = flattenTree(loadTree());
  const cat = generateCatalogue(nodes);
  const fallback = fallbackQueriesFor(new Map(nodes.map((n) => [n.id, n])));
  const q = new Map<string, Planned>();
  const add = (query: string, n: number, keywords: string[] | null) => {
    const cur = q.get(query);
    const merged = cur?.keywords && keywords ? [...new Set([...cur.keywords, ...keywords])] : (keywords ?? cur?.keywords ?? null);
    q.set(query, { want: Math.min(40, Math.max(cur?.want ?? 0, n)), keywords: merged });
  };
  if (categoriesOnly) {
    for (const p of cat.products) for (const f of fallback(p)) add(f, 8, null);
  } else {
    const bySubcat = new Map<string, { n: number; noun: string }>();
    for (const p of cat.products) {
      const k = `${p.primaryNodeId}|${p.imageQuery}`;
      bySubcat.set(k, { n: (bySubcat.get(k)?.n ?? 0) + 1, noun: p.noun });
    }
    for (const [k, v] of bySubcat) add(k.split('|')[1]!, Math.max(8, Math.ceil(v.n / 2) + 4), keywordsFor(v.noun));
  }
  const content = (file: string, field: string) =>
    JSON.parse(readFileSync(resolve(SEED_DIR, file), 'utf8'))[field] as { imageQuery: string; imageKeywords: string[] }[];
  for (const s of content('content/hero-slides.json', 'slides')) add(s.imageQuery, 6, s.imageKeywords);
  for (const c of content('content/shop-by-category.json', 'cards')) add(c.imageQuery, 6, c.imageKeywords);
  return q;
}

function loadManifest(): ImageManifest {
  if (existsSync(MANIFEST)) return JSON.parse(readFileSync(MANIFEST, 'utf8')) as ImageManifest;
  return { sources: ['wikimedia', 'openverse'], fetchedAt: new Date().toISOString(), queries: {} };
}

const LOCK = resolve(SEED_DIR, 'images/.fetch.lock');

/** Only one fetch may write the manifest at a time (two writers overwrite each other's results). */
function acquireLock(): void {
  if (existsSync(LOCK)) {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) {
      console.error(`[images] another fetch is running (pid ${pid}). Stop it first, or wait for it to finish.`);
      process.exit(1);
    }
  }
  writeFileSync(LOCK, String(process.pid));
  const release = () => rmSync(LOCK, { force: true });
  process.on('exit', release);
  for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => process.exit(130));
}

async function main() {
  mkdirSync(STORE, { recursive: true });
  if (!dryRun) acquireLock();
  const planned = plannedQueries();
  const manifest = loadManifest();
  // Re-download any files missing locally (e.g. on a fresh clone) for queries already in the manifest.
  const missingFiles = Object.values(manifest.queries).flat().filter((p) => !BLOCKED_IDS.has(p.id) && !existsSync(resolve(STORE, `${p.id}.webp`)));
  const relevantHave = (q: string, keywords: string[] | null) =>
    (manifest.queries[q] ?? []).filter((p) => (!keywords || isRelevant(p.alt, keywords)) && !BLOCKED_IDS.has(p.id) && !isUnsuitablePhoto(p.alt));
  const todo = [...planned].filter(([q, { want, keywords }]) => (!only || only.has(q)) && relevantHave(q, keywords).length < Math.min(want, 6));
  console.log(`[images] ${planned.size} queries planned, ${todo.length} to fetch, ${missingFiles.length} files to restore`);
  if (dryRun) return;
  for (const p of missingFiles) {
    const fresh = await download({ title: p.alt, imageUrl: p.downloadUrl, width: 0, height: 0, mime: '', licence: p.licence, licenceUrl: p.licenceUrl, author: p.photographer, authorUrl: p.photographerUrl, pageUrl: p.pageUrl, source: p.source });
    if (!fresh) console.warn(`[images] could not restore ${p.id} from ${p.downloadUrl}`);
  }
  let i = 0;
  for (const [query, { want, keywords }] of todo) {
    i += 1;
    // Keep the relevant photos already fetched for this query; add new relevant ones.
    const picked: ManifestPhoto[] = relevantHave(query, keywords);
    const seen = new Set<string>(picked.map((p) => p.pageUrl));
    // Download acceptable candidates 4 at a time, keeping the source's relevance order.
    const take = async (cands: Candidate[]) => {
      const fresh = cands.filter((c) => !seen.has(c.pageUrl) && acceptable(c, keywords));
      fresh.forEach((c) => seen.add(c.pageUrl));
      for (let k = 0; k < fresh.length && picked.length < want; k += 4) {
        const batch = await Promise.all(fresh.slice(k, k + 4).map(download));
        for (const photo of batch) if (photo && picked.length < want) picked.push(photo);
      }
    };
    await take(await wikimedia(query));
    if (picked.length < Math.min(want, 6)) await take(await openverse(query));
    manifest.queries[query] = picked;
    manifest.fetchedAt = new Date().toISOString();
    writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
    console.log(`[images] ${i}/${todo.length} "${query}": ${picked.length}/${want}`);
    await sleep(300); // be polite to Wikimedia
  }
  const total = Object.values(manifest.queries).reduce((s, x) => s + x.length, 0);
  console.log(`[images] done: ${Object.keys(manifest.queries).length} queries, ${total} photos`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

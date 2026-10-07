import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ImageManifest } from './catalogue/images.js';
import { isRelevant, isUnsuitablePhoto } from './catalogue/relevance.js';
import { SEED_DIR } from './tree.js';

const read = <T>(rel: string): T => JSON.parse(readFileSync(resolve(SEED_DIR, rel), 'utf8')) as T;

export interface CouponJson { code: string; description: string; type: 'percent' | 'flat'; value: number; maxDiscount: number | null; minEligibleValue: number; eligibleNodeIds: string[]; validFrom: string; validTo: string; perCustomerLimit: number; active: boolean }
export interface BankOfferJson { id: string; bankName: string; cardTypes: string[]; percent: number; maxDiscount: number; minEligibleValue: number; validFrom: string; validTo: string; summary: string; termsText: string; active: boolean }
export interface SlideJson { id: string; headline: string; subheadline: string; ctaLabel: string; href: string; imageQuery: string; imageKeywords: string[]; imageId?: string; order: number; active: boolean }
export interface CardJson { id: string; name: string; discountText: string; href: string; imageQuery: string; imageKeywords: string[]; imageId?: string; order: number }

/** All config, content, reference and demo seed files (spec §5, DAT-004…009). */
export function loadSeedFiles() {
  const settings = read<Record<string, unknown>>('config/settings.json');
  delete settings['_source'];
  const pages = readdirSync(resolve(SEED_DIR, 'content/pages')).filter((f) => f.endsWith('.md')).map((f) => {
    const raw = readFileSync(resolve(SEED_DIR, 'content/pages', f), 'utf8');
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`Page ${f} has no front matter`);
    const meta = Object.fromEntries(m[1]!.split('\n').map((l) => l.split(/:\s*/, 2) as [string, string]));
    return { slug: f.replace(/\.md$/, ''), title: meta['title'] ?? f, isPlaceholder: meta['placeholder'] === 'true', body: m[2]!.trim() };
  });
  return {
    settings,
    coupons: read<{ coupons: CouponJson[] }>('config/coupons.json').coupons,
    bankOffers: read<{ offers: BankOfferJson[] }>('config/bank-offers.json').offers,
    taxRates: read<{ rates: Record<string, number> }>('config/tax-rates.json').rates,
    returnPolicy: read<{ windowDays: number; nonReturnableNodeIds: string[] }>('config/return-policy.json'),
    zones: read<{ zones: { zone: string; deliveryDays: number }[] }>('config/delivery-zones.json').zones,
    states: read<{ states: { code: string; name: string; type: string }[] }>('reference/states.json').states,
    pincodes: read<{ pincodes: { pincode: string; city: string; state: string; zone: string }[] }>('reference/pincodes.json').pincodes,
    securityQuestions: read<{ questions: string[] }>('reference/security-questions.json').questions,
    blockedWords: read<{ words: string[] }>('reference/blocked-words.json').words,
    testCards: read<{ cards: { number: string; last4: string; network: string; issuingBank: string; cardType: string; forcedOutcome: string | null; label: string }[] }>('demo/test-cards.json').cards,
    testUpi: read<{ upi: { upiId: string; forcedOutcome: string }[] }>('demo/test-upi.json').upi,
    giftCodes: read<{ codes: { code: string; faceValue: number; validityDays: number; active: boolean }[] }>('demo/gift-card-codes.json').codes,
    slides: read<{ slides: SlideJson[] }>('content/hero-slides.json').slides,
    cards: read<{ cards: CardJson[] }>('content/shop-by-category.json').cards,
    popularSearches: read<{ terms: string[] }>('content/popular-searches.json').terms,
    footer: read<Record<string, unknown>>('content/footer.json'),
    faqs: read<{ faqs: { topic: string; question: string; answer: string }[] }>('content/faqs.json').faqs,
    pages,
  };
}

/** Photo ids removed after review (owner request, 2026-10-07); see seed-data/images/blocklist.json. */
export function loadImageBlocklist(): Set<string> {
  const file = resolve(SEED_DIR, 'images/blocklist.json');
  return existsSync(file) ? new Set(Object.keys((JSON.parse(readFileSync(file, 'utf8')) as { ids: Record<string, unknown> }).ids)) : new Set();
}

/**
 * Photo ids reviewed and approved one by one (owner request, 2026-10-07). When the file exists, only
 * these photos are used; newly fetched photos stay unused until they're reviewed and added.
 */
export function loadImageApprovals(): Map<string, Set<string>> | null {
  const file = resolve(SEED_DIR, 'images/approved.json');
  if (!existsSync(file)) return null;
  const ids = (JSON.parse(readFileSync(file, 'utf8')) as { ids: Record<string, { for?: string[] }> }).ids;
  return new Map(Object.entries(ids).map(([id, v]) => [id, new Set(v.for ?? [])]));
}

/** The image manifest limited to approved photos (and never blocklisted or unsuitable ones). */
export function loadImageManifest(): ImageManifest | null {
  const file = resolve(SEED_DIR, 'images/manifest.json');
  if (!existsSync(file)) return null;
  const manifest = JSON.parse(readFileSync(file, 'utf8')) as ImageManifest;
  const blocked = loadImageBlocklist();
  const approved = loadImageApprovals();
  for (const [q, photos] of Object.entries(manifest.queries)) {
    manifest.queries[q] = photos.filter((ph) => !blocked.has(ph.id) && !isUnsuitablePhoto(ph.alt) && (!approved || approved.has(ph.id)));
  }
  if (approved) manifest.approvedFor = approved;
  return manifest;
}

/**
 * First relevant photo for a content query (hero slide, category card), searching every query in
 * the manifest if the content's own query has no relevant match; otherwise a marked placeholder.
 */
export function contentImage(manifest: ImageManifest | null, query: string, keywords: string[], avoid: Set<string> = new Set(), imageId?: string): { url: string; alt: string } {
  const own = manifest?.queries[query] ?? [];
  const everywhere = Object.values(manifest?.queries ?? {}).flat();
  // A hand-picked approved photo wins (owner request, 2026-10-07: tiles must show what they advertise).
  const picked = imageId ? everywhere.find((ph) => ph.id === imageId) : undefined;
  if (picked) {
    avoid.add(picked.id);
    return { url: picked.url, alt: picked.alt };
  }
  const photo = [...own, ...everywhere].find((ph) => !avoid.has(ph.id) && isRelevant(ph.alt, keywords));
  if (photo) avoid.add(photo.id);
  // No approved photo: the section's on-theme placeholder, never an empty frame.
  const section = query.split(' ')[0] ?? '';
  const art = ['men', 'women', 'kids', 'home', 'beauty'].includes(section) ? section : 'gen-z';
  return photo ? { url: photo.url, alt: photo.alt } : { url: `/media/placeholder/${art}.svg`, alt: '' };
}

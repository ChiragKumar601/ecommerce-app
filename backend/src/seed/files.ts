import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ImageManifest } from './catalogue/images.js';
import { isRelevant } from './catalogue/relevance.js';
import { SEED_DIR } from './tree.js';

const read = <T>(rel: string): T => JSON.parse(readFileSync(resolve(SEED_DIR, rel), 'utf8')) as T;

export interface CouponJson { code: string; description: string; type: 'percent' | 'flat'; value: number; maxDiscount: number | null; minEligibleValue: number; eligibleNodeIds: string[]; validFrom: string; validTo: string; perCustomerLimit: number; active: boolean }
export interface BankOfferJson { id: string; bankName: string; cardTypes: string[]; percent: number; maxDiscount: number; minEligibleValue: number; validFrom: string; validTo: string; summary: string; termsText: string; active: boolean }
export interface SlideJson { id: string; headline: string; subheadline: string; ctaLabel: string; href: string; imageQuery: string; imageKeywords: string[]; order: number; active: boolean }
export interface CardJson { id: string; name: string; discountText: string; href: string; imageQuery: string; imageKeywords: string[]; order: number }

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

export function loadImageManifest(): ImageManifest | null {
  const file = resolve(SEED_DIR, 'images/manifest.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as ImageManifest) : null;
}

/**
 * First relevant photo for a content query (hero slide, category card), searching every query in
 * the manifest if the content's own query has no relevant match; otherwise a marked placeholder.
 */
export function contentImage(manifest: ImageManifest | null, query: string, keywords: string[], avoid: Set<string> = new Set()): { url: string; alt: string } {
  const own = manifest?.queries[query] ?? [];
  const everywhere = Object.values(manifest?.queries ?? {}).flat();
  const photo = [...own, ...everywhere].find((ph) => !avoid.has(ph.id) && isRelevant(ph.alt, keywords));
  if (photo) avoid.add(photo.id);
  return photo ? { url: photo.url, alt: photo.alt } : { url: `placeholder:${query}`, alt: query };
}

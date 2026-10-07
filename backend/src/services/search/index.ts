import { boundedOsa } from '../../domain/search/levenshtein.js';
import { maxTyposFor, stem, tokenize as rawTokenize } from '../../domain/search/tokenize.js';

/** Index and query words are compared in stemmed form. */
const tokenize = (text: string) => rawTokenize(text).map(stem);
import type { SnapNode, SnapProduct } from '../catalogue/snapshot.js';

/**
 * In-memory search index (plan §7.4, SRC-003/004). Built from the catalogue snapshot and rebuilt
 * with it whenever the catalogue version changes (PR-22).
 *
 * - Inverted index: word → product → best field weight.
 * - Vocabulary bucketed by word length, so typo candidates only come from words within ±1 (≤ 5
 *   characters) or ±2 (longer) of the query word, then pass a bounded Levenshtein check.
 * - Exact matches score above fuzzy ones (SRC-004).
 */

/** Field weights: what a word matched tells us about relevance. */
const W = { name: 5, brand: 5, node: 4, colour: 3, subtitle: 2, spec: 1 } as const;
const FUZZY_FACTOR = 0.4;
const PREFIX_FACTOR = 0.6;
const STOPWORDS = new Set(['for', 'and', 'the', 'of', 'with', 'in', 'a', 'an', 'to', 's', 'by', 'on']);

export interface SearchIndexSource {
  products: SnapProduct[];
  nodes: Map<string, SnapNode>;
}

export interface SearchMatch {
  ids: string[];
  relevance: Map<string, number>;
  /** Query words that matched only through typo tolerance (for diagnostics/tests). */
  fuzzyWords: string[];
}

export class SearchIndex {
  private postings = new Map<string, Map<string, number>>();
  private byLength = new Map<number, string[]>();
  private sortedVocab: string[] = [];
  private expansionCache = new Map<string, { exact: boolean; words: string[] }>();
  readonly nodes: Map<string, SnapNode>;
  readonly brandNames: Map<string, string>;
  readonly nodeTokens = new Map<string, string[]>();

  constructor(src: SearchIndexSource) {
    this.nodes = src.nodes;
    this.brandNames = new Map();
    for (const n of src.nodes.values()) this.nodeTokens.set(n.id, tokenize(n.name));
    for (const p of src.products) {
      this.brandNames.set(p.brandSlug, p.brandName);
      const add = (text: string, weight: number) => {
        // Hyphenated words are also indexed joined ("T-Shirt" → "tshirt").
        const joined = text.split(/\s+/).filter((c) => c.includes('-')).flatMap((c) => tokenize(c.replace(/-/g, '')));
        for (const w of [...tokenize(text), ...joined]) {
          if (STOPWORDS.has(w)) continue;
          let m = this.postings.get(w);
          if (!m) this.postings.set(w, (m = new Map()));
          if ((m.get(p.id) ?? 0) < weight) m.set(p.id, weight);
        }
      };
      add(p.name, W.name);
      add(p.brandName, W.brand);
      for (const id of p.nodeIds) {
        const n = src.nodes.get(id);
        if (n) add(n.name, W.node);
      }
      add(p.colour, W.colour);
      add(p.subtitle, W.subtitle);
      for (const v of p.specValues) add(v, W.spec);
    }
    for (const w of this.postings.keys()) {
      const len = [...w].length;
      const list = this.byLength.get(len);
      if (list) list.push(w);
      else this.byLength.set(len, [w]);
    }
    this.sortedVocab = [...this.postings.keys()].sort();
  }

  get vocabularySize(): number {
    return this.postings.size;
  }

  /** Normalised query words: trimmed, ≤ 100 chars (SRC-010), stopwords dropped. */
  static queryWords(q: string): string[] {
    const words = tokenize(q.trim().slice(0, 100)).filter((w) => !STOPWORDS.has(w));
    return [...new Set(words)];
  }

  /** Vocabulary words a query word matches: itself if indexed, else typo neighbours (SRC-004). */
  expand(word: string): { exact: boolean; words: string[] } {
    const cached = this.expansionCache.get(word);
    if (cached) return cached;
    let result: { exact: boolean; words: string[] };
    if (this.postings.has(word)) {
      // Exact match; near-identical forms (plural/singular) are also included as fuzzy extras.
      result = { exact: true, words: [word] };
    } else {
      const allowance = maxTyposFor(word);
      const len = [...word].length;
      // Only the closest candidates count; on a tie, words sharing the first letter win
      // ("speakr" → speaker, not sneaker; "sandles" → sandals, not candles).
      let best = allowance + 1;
      let words: string[] = [];
      if (len >= 3) {
        for (let l = len - allowance; l <= len + allowance; l++) {
          for (const cand of this.byLength.get(l) ?? []) {
            const d = boundedOsa(word, cand, allowance);
            if (d < best) {
              best = d;
              words = [cand];
            } else if (d === best && d <= allowance) words.push(cand);
          }
        }
        const sameStart = words.filter((w) => w[0] === word[0]);
        if (sameStart.length) words = sameStart;
      }
      result = { exact: false, words };
    }
    if (this.expansionCache.size > 5000) this.expansionCache.clear();
    this.expansionCache.set(word, result);
    return result;
  }

  /** Vocabulary words starting with `prefix` (suggestions while typing). */
  prefixWords(prefix: string, limit = 50): string[] {
    let lo = 0;
    let hi = this.sortedVocab.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sortedVocab[mid]! < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let i = lo; i < this.sortedVocab.length && out.length < limit; i++) {
      const w = this.sortedVocab[i]!;
      if (!w.startsWith(prefix)) break;
      if (w !== prefix) out.push(w);
    }
    return out;
  }

  /**
   * Products matching every query word (exact or within the typo allowance). If no product matches
   * all words, products matching the most words are returned instead, so long queries still work.
   * `prefixLast` treats the last word as a prefix too (typing in the suggestion box).
   */
  search(q: string, opts: { prefixLast?: boolean } = {}): SearchMatch {
    const words = SearchIndex.queryWords(q);
    if (words.length === 0) return { ids: [], relevance: new Map(), fuzzyWords: [] };
    const perWord: Map<string, number>[] = [];
    const fuzzyWords: string[] = [];
    words.forEach((word, i) => {
      const scores = new Map<string, number>();
      const bump = (w: string, factor: number) => {
        for (const [id, weight] of this.postings.get(w) ?? []) {
          const s = weight * factor;
          if ((scores.get(id) ?? 0) < s) scores.set(id, s);
        }
      };
      const e = this.expand(word);
      for (const w of e.words) bump(w, e.exact ? 1 : FUZZY_FACTOR);
      if (!e.exact && e.words.length) fuzzyWords.push(word);
      if (opts.prefixLast && i === words.length - 1 && [...word].length >= 2) for (const w of this.prefixWords(word)) bump(w, PREFIX_FACTOR);
      perWord.push(scores);
    });

    const total = new Map<string, number>();
    const hits = new Map<string, number>();
    for (const scores of perWord) {
      for (const [id, s] of scores) {
        total.set(id, (total.get(id) ?? 0) + s);
        hits.set(id, (hits.get(id) ?? 0) + 1);
      }
    }
    let need = words.length;
    while (need > 0 && ![...hits.values()].some((h) => h >= need)) need--;
    const relevance = new Map<string, number>();
    for (const [id, h] of hits) if (h >= need) relevance.set(id, total.get(id)!);
    const ids = [...relevance.keys()].sort((a, b) => relevance.get(b)! - relevance.get(a)! || (a < b ? -1 : 1));
    return { ids, relevance, fuzzyWords };
  }

  /** Catalogue nodes whose name matches every query word (prefix allowed on the last). */
  matchNodes(q: string, limit: number): SnapNode[] {
    const words = SearchIndex.queryWords(q);
    if (!words.length) return [];
    const matches = (tokens: string[], w: string, last: boolean) =>
      tokens.some((t) => t === w || (last && t.startsWith(w)) || ([...w].length >= 3 && boundedOsa(w, t, maxTyposFor(w)) <= maxTyposFor(w)));
    const out: SnapNode[] = [];
    for (const n of this.nodes.values()) {
      // Include ancestor names, so "men shirts" finds Men › Topwear › Casual Shirts.
      const tokens: string[] = [];
      for (let cur: SnapNode | undefined = n; cur; cur = cur.parentId ? this.nodes.get(cur.parentId) : undefined) tokens.push(...(this.nodeTokens.get(cur.id) ?? []));
      const own = this.nodeTokens.get(n.id) ?? [];
      if (words.every((w, i) => matches(tokens, w, i === words.length - 1)) && words.some((w, i) => matches(own, w, i === words.length - 1))) out.push(n);
    }
    // Deeper, more specific nodes first only when the query names the node itself.
    return out.sort((a, b) => a.displayOrder - b.displayOrder).slice(0, limit);
  }

  /** Brands whose name matches the query (prefix or typo tolerant). */
  matchBrands(q: string, limit: number): { slug: string; name: string }[] {
    const words = SearchIndex.queryWords(q);
    if (!words.length) return [];
    const out: { slug: string; name: string }[] = [];
    for (const [slug, name] of this.brandNames) {
      const tokens = tokenize(name);
      const ok = words.every((w, i) => tokens.some((t) => t === w || (i === words.length - 1 && t.startsWith(w)) || ([...w].length >= 3 && boundedOsa(w, t, maxTyposFor(w)) <= maxTyposFor(w))));
      if (ok) out.push({ slug, name });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
  }
}

const cache = new WeakMap<object, SearchIndex>();

/** The index for a snapshot; built once per snapshot object (so per catalogue version). */
export function indexFor(src: SearchIndexSource): SearchIndex {
  let idx = cache.get(src);
  if (!idx) cache.set(src, (idx = new SearchIndex(src)));
  return idx;
}

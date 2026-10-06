/** Lower-cases, strips accents and splits text into alphanumeric words (search index and queries). */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** SRC-004: words of ≤ 5 characters allow 1 typo; longer words allow 2. */
export function maxTyposFor(word: string): 1 | 2 {
  return [...word].length <= 5 ? 1 : 2;
}

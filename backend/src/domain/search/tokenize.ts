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

/** Light English plural stemming so singular and plural forms meet: dresses→dress, watches→watch, kurtas→kurta. */
export function stem(word: string): string {
  if (word.length <= 3 || /\d/.test(word)) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
  return word;
}

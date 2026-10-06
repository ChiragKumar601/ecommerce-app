/**
 * Levenshtein distance with an upper bound: returns the exact distance if it is ≤ `max`,
 * otherwise `max + 1`. Stops early once every cell in a row exceeds the bound (SRC-004).
 */
export function boundedLevenshtein(a: string, b: string, max: number): number {
  const s = [...a];
  const t = [...b];
  if (Math.abs(s.length - t.length) > max) return max + 1;
  if (s.length === 0) return t.length <= max ? t.length : max + 1;
  if (t.length === 0) return s.length <= max ? s.length : max + 1;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= t.length; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  const d = prev[t.length]!;
  return d <= max ? d : max + 1;
}

/** Whether `candidate` is within the SRC-004 typo allowance of `queryWord`. */
export function withinTypoAllowance(queryWord: string, candidate: string, allowance: number): boolean {
  return boundedLevenshtein(queryWord, candidate, allowance) <= allowance;
}

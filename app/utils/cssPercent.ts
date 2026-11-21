// Two decimals because browsers re-serialize inline styles at about six significant digits, which made SSR and hydrated HTML differ.
export function cssPercent(percent: number): string {
  return `${Math.round(percent * 100) / 100}%`
}

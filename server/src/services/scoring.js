export function scoreCase(correct, hintsUsed, elapsedMs) {
  const base = correct ? 1000 : 0;
  const hintPenalty = correct ? Math.min(base, hintsUsed * 150) : 0;
  const timeBonus = correct ? Math.max(0, Math.round(200 * (1 - Math.min(elapsedMs, 30 * 60_000) / (30 * 60_000)))) : 0;
  return { correct, score: Math.max(0, base - hintPenalty + timeBonus), breakdown: { base, hintPenalty, timeBonus } };
}

/** How many frame workers to run: a garbage count falls back to the default instead of emptying the pool. */
export function workerCount(want: number | undefined, fallback: number, total: number): number {
  const n = typeof want === "number" && Number.isInteger(want) && want > 0 ? want : fallback;
  return Math.max(1, Math.min(n, total));
}

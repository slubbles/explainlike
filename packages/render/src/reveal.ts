/**
 * Text appears word by word, never letter by letter: a pixel wipe froze mid-word
 * in stills and read as truncated text ("whiteboard vide"). Each word fades in
 * whole over its own slice of the reveal, earlier words first.
 * This function is also injected into the stage (see stage.ts), so keep it
 * self-contained: no closures, no helpers.
 */
export function wordOpacities(n: number, p: number): number[] {
  const f = Math.min(1, Math.max(0.35, 1.5 / Math.max(1, n)));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const s = n > 1 ? ((1 - f) * i) / (n - 1) : 0;
    out.push(Math.min(1, Math.max(0, (p - s) / f)));
  }
  return out;
}

/** Split text into whole words, keeping each word's trailing space so the line measures the same. */
export function revealWords(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

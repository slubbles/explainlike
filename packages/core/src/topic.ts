/** No imports: the web app and the API share this check without pulling in the rest of core. */
/** Is this input a topic rather than a link or a folder? */
export function looksLikeTopic(input: string): boolean {
  const s = input.trim();
  if (!s || /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^[~./]/.test(s)) return false;
  // "example.com/post" or "github.com/a/b" with no scheme is still a link
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(s)) return false;
  return /[a-z]/i.test(s);
}

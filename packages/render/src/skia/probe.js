// Runs once inside the Chrome stage page (after window.ready): reads where the browser lays out
// every word, caption, heading and the end card, so the Skia renderer draws them on the same pixels.
(() => {
  const F = window.FILM;
  const root = document.getElementById("world");
  // a zero-size inline-block sits on its line's baseline: its top is the baseline's y
  const baseline = (parent) => { const s = document.createElement("span"); s.style.cssText = "display:inline-block;width:0;height:0"; parent.appendChild(s); const y = s.getBoundingClientRect().top; s.remove(); return y; };
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  // word positions of a block of HTML text: wrap each word, read its left edge and its line's baseline
  const words = (el) => {
    const out = [], keep = el.innerHTML;
    const walk = [...el.childNodes];
    el.innerHTML = "";
    for (const n of walk) {
      if (n.nodeType !== 3) { el.appendChild(n); continue; }
      for (const w of n.textContent.match(/\S+\s*|\s+/g) ?? []) {
        const s = document.createElement("span"); s.textContent = w; el.appendChild(s);
        if (w.trim()) out.push(s);
      }
    }
    const res = out.map((s) => { const x = s.getBoundingClientRect().left; return { w: s.textContent.trimEnd(), x, y: baseline(s) }; });
    el.innerHTML = keep;
    return res;
  };

  // world: path lengths as getTotalLength sees them, and SVG text word positions and boxes
  const pathLen = [], text = [];
  const kids = [...root.children].filter((c) => c.tagName.toLowerCase() === "g");
  const tmp = document.createElementNS("http://www.w3.org/2000/svg", "path");
  root.appendChild(tmp);
  F.elements.forEach((e, i) => {
    pathLen.push(null); text.push(null);
    if (e.k === "path") { tmp.setAttribute("d", e.d); pathLen[i] = tmp.getTotalLength(); }
    else if (e.k === "text" && e.anim !== "count") {
      const g = kids[i], was = g.style.display;
      g.style.display = "";
      const tx = g.querySelector("text"), spans = [...tx.children];
      for (const s of spans) s.removeAttribute("fill-opacity");
      const xs = spans.map((s) => s.textContent.length ? s.getStartPositionOfChar(0).x : 0);
      const y = spans.length && spans[0].textContent.length ? spans[0].getStartPositionOfChar(0).y : e.y;
      const b = tx.getBBox();
      text[i] = { xs, y, bb: { x: b.x, y: b.y, w: b.width, h: b.height } };
      g.style.display = was;
    }
  });
  tmp.remove();

  // heading slot: left edge, text baseline and the accent line under it
  const head = document.getElementById("heading");
  const ht = document.getElementById("headingText"), hl = document.getElementById("headingLine");
  const saved = [head.style.opacity, head.style.transform, ht.innerHTML, hl.style.transform];
  head.style.opacity = "1"; head.style.transform = "none"; ht.textContent = "Hg"; hl.style.transform = "none";
  const lb = box(hl);
  const headOut = { x: box(ht).x, base: baseline(ht), lineTop: lb.y, lineH: lb.h };
  [head.style.opacity, head.style.transform, ht.innerHTML, hl.style.transform] = saved;

  const brandEl = document.getElementById("brand");
  const brand = { x: box(brandEl).x, base: baseline(brandEl) };

  // every caption pill and its words, as renderHud lays them out
  const cap = document.getElementById("captions");
  const caps = F.captions.map((c) => {
    if (c.hidden) return null;
    cap.innerHTML = c.words.map((w) => `<span>${w.w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join(" ");
    cap.style.display = "inline-block"; cap.style.opacity = "1"; cap.style.transform = "none";
    const r = box(cap), xs = [...cap.children].map((s) => s.getBoundingClientRect().left);
    return { ...r, xs, base: baseline(cap) };
  });
  cap.innerHTML = ""; cap.style.display = "none";

  let end = null;
  if (F.end) {
    const el = document.getElementById("end"), t = document.getElementById("endTitle"), was = [el.style.display, el.style.opacity, t.style.transform];
    el.style.display = "flex"; el.style.opacity = "1"; t.style.transform = "none";
    const credit = document.getElementById("endCredit");
    end = { title: words(t), lines: words(document.getElementById("endLines")), credit: credit.textContent.trim() ? { ...box(credit), words: words(credit) } : null };
    [el.style.display, el.style.opacity, t.style.transform] = was;
  }
  window.render(0);
  return { pathLen, text, head: headOut, brand, caps, end };
})()

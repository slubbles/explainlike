// Metual stage: draws any frame of a Film deterministically. window.render(t) seeks.
(function () {
  const F = window.FILM;
  const NS = "http://www.w3.org/2000/svg";
  const W = F.width, H = F.height;
  const root = document.getElementById("world");
  const defs = document.createElementNS(NS, "defs");
  root.appendChild(defs);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const back = (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };

  function interp(keys, t, dflt) {
    if (!keys || !keys.length) return dflt;
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t < keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return v0 + (v1 - v0) * ((t - t0) / Math.max(1e-6, t1 - t0)); }
    }
    return keys[keys.length - 1][1];
  }

  const items = [];
  for (const e of F.elements) {
    const g = document.createElementNS(NS, "g");
    g.style.display = "none";
    const it = { e, g };
    if (e.k === "path") {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", e.d);
      p.setAttribute("stroke", e.stroke);
      p.setAttribute("stroke-width", e.sw);
      p.setAttribute("fill", e.fill || "none");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      g.appendChild(p);
      it.p = p;
    } else if (e.k === "img") {
      const im = document.createElementNS(NS, "image");
      im.setAttribute("href", e.href);
      im.setAttribute("x", e.x); im.setAttribute("y", e.y); im.setAttribute("width", e.w); im.setAttribute("height", e.h);
      im.setAttribute("preserveAspectRatio", "xMidYMid meet");
      g.appendChild(im);
    } else if (e.k === "text") {
      if (e.bg) { const r = document.createElementNS(NS, "rect"); r.setAttribute("fill", e.bg); r.setAttribute("rx", 6); g.appendChild(r); it.bg = r; }
      const tx = document.createElementNS(NS, "text");
      tx.textContent = e.text;
      tx.setAttribute("x", e.x); tx.setAttribute("y", e.y);
      tx.setAttribute("font-size", e.size);
      tx.setAttribute("fill", e.color);
      tx.setAttribute("text-anchor", e.anchor || "start");
      tx.setAttribute("font-family", e.font === "sans" ? "MetualSans" : "Excalifont");
      if (e.weight) tx.setAttribute("font-weight", e.weight);
      const cp = document.createElementNS(NS, "clipPath"); cp.setAttribute("id", "c_" + e.id);
      const cr = document.createElementNS(NS, "rect"); cp.appendChild(cr); defs.appendChild(cp);
      g.appendChild(tx);
      g.setAttribute("clip-path", `url(#c_${e.id})`);
      it.tx = tx; it.cr = cr;
    } else if (e.k === "dot") {
      if (e.trail) {
        const tp = document.createElementNS(NS, "polyline");
        tp.setAttribute("points", e.pts.map((p) => p.join(",")).join(" "));
        tp.setAttribute("fill", "none"); tp.setAttribute("stroke", e.trail); tp.setAttribute("stroke-width", 7);
        tp.setAttribute("stroke-linecap", "round"); tp.setAttribute("stroke-linejoin", "round"); tp.setAttribute("opacity", 0.9);
        g.appendChild(tp); it.tp = tp;
      }
      const glow = document.createElementNS(NS, "circle"); glow.setAttribute("r", e.r * 2.2); glow.setAttribute("fill", e.color); glow.setAttribute("opacity", 0.25);
      const c = document.createElementNS(NS, "circle"); c.setAttribute("r", e.r); c.setAttribute("fill", e.color);
      g.appendChild(glow); g.appendChild(c); it.c = c; it.glow = glow;
      // cumulative lengths
      let L = 0; const acc = [0];
      for (let i = 1; i < e.pts.length; i++) { L += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); acc.push(L); }
      it.L = L; it.acc = acc;
    }
    root.appendChild(g);
    items.push(it);
  }

  function measure() {
    for (const it of items) {
      if (it.p) { it.len = it.p.getTotalLength(); it.p.setAttribute("stroke-dasharray", `${it.len} ${it.len}`); }
      if (it.tx) {
        const b = it.tx.getBBox();
        it.bb = b;
        it.cr.setAttribute("x", b.x - 4); it.cr.setAttribute("y", b.y - 8); it.cr.setAttribute("height", b.height + 16);
        if (it.bg) { it.bg.setAttribute("x", b.x - 8); it.bg.setAttribute("y", b.y - 2); it.bg.setAttribute("width", b.width + 16); it.bg.setAttribute("height", b.height + 4); }
      }
      if (it.tp) { it.tlen = it.L; it.tp.setAttribute("stroke-dasharray", `${it.L} ${it.L}`); }
    }
  }

  function pointAt(it, d) {
    const { pts, } = it.e, acc = it.acc;
    for (let i = 1; i < pts.length; i++) {
      if (d <= acc[i]) { const f = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f]; }
    }
    return pts[pts.length - 1];
  }

  function camera(t) {
    const K = F.camera;
    let cur = K[0];
    for (let i = 1; i < K.length; i++) {
      const k = K[i];
      if (t < k.t) break;
      const p = k.move > 0 ? ease(clamp((t - k.t) / k.move, 0, 1)) : 1;
      const prev = cur;
      cur = { x: prev.x + (k.x - prev.x) * p, y: prev.y + (k.y - prev.y) * p, w: prev.w + (k.w - prev.w) * p, h: prev.h + (k.h - prev.h) * p };
    }
    return cur;
  }

  // HUD
  const head = document.getElementById("heading"), headTxt = document.getElementById("headingText"), headLine = document.getElementById("headingLine");
  const cap = document.getElementById("captions"), bar = document.getElementById("bar"), fade = document.getElementById("fade"), end = document.getElementById("end");
  let lastCap = null, lastHead = null;

  function renderHud(t) {
    const h = F.headings.find((x) => t >= x.t0 && t < x.t1);
    if (h) {
      const din = clamp((t - h.t0) / 0.5, 0, 1), dout = clamp((h.t1 - t) / 0.35, 0, 1);
      if (lastHead !== h) { headTxt.textContent = h.text; lastHead = h; }
      head.style.opacity = Math.min(1, dout * 1.2);
      head.style.transform = `translateY(${(1 - dout) * -26}px)`;
      headTxt.style.clipPath = `inset(-20px ${100 - easeOut(din) * 100}% -20px -10px)`;
      headLine.style.transform = `scaleX(${easeOut(clamp((t - h.t0 - 0.25) / 0.5, 0, 1))})`;
    } else head.style.opacity = 0;

    const c = F.captions.find((x) => t >= x.t0 && t < x.t1);
    if (c) {
      if (lastCap !== c) { cap.innerHTML = c.words.map((w, i) => `<span data-i="${i}">${w.w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join(" "); lastCap = c; }
      cap.style.opacity = clamp((t - c.t0) / 0.12, 0, 1);
      const spans = cap.children;
      for (let i = 0; i < c.words.length; i++) {
        const w = c.words[i];
        spans[i].className = t >= w.s && t < (c.words[i + 1] ? c.words[i + 1].s : w.e + 0.3) ? "on" : t >= w.s ? "said" : "";
      }
      cap.style.display = "inline-block";
    } else { cap.style.display = "none"; lastCap = null; }

    bar.style.width = `${(clamp(t / F.duration, 0, 1) * 100).toFixed(3)}%`;
    let fo = 0;
    for (const f of F.fades) { const d = Math.abs(t - f.t); if (d < f.dur) fo = Math.max(fo, 1 - d / f.dur); }
    if (F.end && t >= F.end.t0) {
      const p = clamp((t - F.end.t0) / 0.6, 0, 1);
      end.style.display = "flex"; end.style.opacity = p;
      document.getElementById("endTitle").style.transform = `translateY(${(1 - easeOut(p)) * 30}px)`;
    } else end.style.display = "none";
    fade.style.opacity = fo;
  }

  window.render = function (t) {
    const cam = camera(t);
    root.setAttribute("viewBox", `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
    for (const it of items) {
      const e = it.e;
      if (t < e.t0) { it.g.style.display = "none"; continue; }
      const op = e.g ? interp(F.groups[e.g], t, 1) : 1;
      if (op <= 0.001) { it.g.style.display = "none"; continue; }
      it.g.style.display = "";
      const p = clamp((t - e.t0) / Math.max(0.001, e.dur), 0, 1);
      let o = op;
      if (e.k === "path") {
        const a = e.anim || "draw";
        if (a === "draw") it.p.setAttribute("stroke-dashoffset", it.len * (1 - easeOut(p)));
        else if (a === "pop") { const s = 0.4 + 0.6 * back(p); const [ox, oy] = e.origin || [0, 0]; it.g.setAttribute("transform", `translate(${ox} ${oy}) scale(${s}) translate(${-ox} ${-oy})`); o *= clamp(p * 3, 0, 1); it.p.setAttribute("stroke-dashoffset", 0); }
        else { o *= p; it.p.setAttribute("stroke-dashoffset", 0); }
      } else if (e.k === "img") {
        if ((e.anim || "pop") === "pop") { const s = 0.5 + 0.5 * back(p); const cx = e.x + e.w / 2, cy = e.y + e.h / 2; it.g.setAttribute("transform", `translate(${cx} ${cy}) scale(${s}) translate(${-cx} ${-cy})`); o *= clamp(p * 2.5, 0, 1); }
        else o *= p;
      } else if (e.k === "text") {
        if ((e.anim || "wipe") === "wipe") it.cr.setAttribute("width", (it.bb.width + 12) * easeOut(p));
        else { it.cr.setAttribute("width", it.bb.width + 12); o *= p; }
      } else if (e.k === "dot") {
        const d = it.L * ease(p);
        const [x, y] = pointAt(it, d);
        it.c.setAttribute("cx", x); it.c.setAttribute("cy", y); it.glow.setAttribute("cx", x); it.glow.setAttribute("cy", y);
        if (it.tp) it.tp.setAttribute("stroke-dashoffset", it.L - d);
        const hide = p >= 1 ? 0 : 1; it.c.setAttribute("opacity", hide); it.glow.setAttribute("opacity", hide * 0.25);
      }
      it.g.setAttribute("opacity", o);
    }
    renderHud(t);
  };

  window.ready = (async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); measure(); window.render(0); return true; })();
})();

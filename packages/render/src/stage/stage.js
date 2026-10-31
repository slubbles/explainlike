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
      if (e.invert) im.setAttribute("style", "filter: invert(1)");
      g.appendChild(im);
    } else if (e.k === "text") {
      if (e.bg) { const r = document.createElementNS(NS, "rect"); r.setAttribute("fill", e.bg); r.setAttribute("rx", 6); g.appendChild(r); it.bg = r; }
      const tx = document.createElementNS(NS, "text");
      // one tspan per word so the reveal shows whole words only (see reveal.ts)
      it.words = revealWords(e.text).map((w) => { const ts = document.createElementNS(NS, "tspan"); ts.textContent = w; tx.appendChild(ts); return ts; });
      tx.setAttribute("xml:space", "preserve");
      tx.setAttribute("x", e.x); tx.setAttribute("y", e.y);
      tx.setAttribute("font-size", e.size);
      tx.setAttribute("fill", e.color);
      tx.setAttribute("text-anchor", e.anchor || "start");
      tx.setAttribute("font-family", e.font === "sans" ? "MetualSans" : "Excalifont");
      if (e.weight) tx.setAttribute("font-weight", e.weight);
      g.appendChild(tx);
      it.tx = tx;
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

  // HUD. Two heading slots so one heading can slide out while the next wipes in.
  const headA = document.getElementById("heading");
  const headB = headA.cloneNode(true); headB.id = "heading2"; headA.parentNode.insertBefore(headB, headA.nextSibling);
  const slots = [headA, headB].map((el) => ({ el, txt: el.querySelector("span"), line: el.querySelector("div"), text: null }));
  const cap = document.getElementById("captions"), bar = document.getElementById("bar"), fade = document.getElementById("fade"), end = document.getElementById("end");
  let lastCap = null;
  const card = document.createElement("div"); card.id = "card";
  const cardText = document.createElement("div"); cardText.id = "cardText"; card.appendChild(cardText);
  document.getElementById("barwrap").before(card);
  const capwrap = document.getElementById("capwrap");

  // Lively captions sit next to what they talk about: under the box when it fits, else above, else the usual bottom spot.
  function placeCaption(c, t) {
    const pop = 0.88 + 0.12 * easeOut(clamp((t - c.t0) / 0.18, 0, 1));
    if (!c.at) { capwrap.className = ""; capwrap.style.left = capwrap.style.top = ""; cap.style.transform = ""; return; }
    capwrap.className = "near";
    const cam = camera(t), s = F.width / cam.w;
    const bx = (c.at.x - cam.x) * s, by = (c.at.y - cam.y) * s, bw = c.at.w * s, bh = c.at.h * s;
    const cw = cap.offsetWidth, ch = cap.offsetHeight, gap = 22, top = 170, bottom = F.height - 40;
    let y = by + bh + gap;
    if (y + ch > bottom) y = by - gap - ch;
    if (y < top) y = bottom - ch - 24;
    const x = clamp(bx + bw / 2 - cw / 2, 40, F.width - 40 - cw);
    capwrap.style.left = `${x.toFixed(1)}px`; capwrap.style.top = `${y.toFixed(1)}px`;
    cap.style.transform = `scale(${pop.toFixed(3)})`;
  }
  const HIN = 0.55, HOUT = 0.45;

  function drawHead(slot, h, inP, outP, lineP) {
    if (slot.text !== h.text) {
      slot.txt.textContent = "";
      slot.words = revealWords(h.text).map((w) => { const sp = document.createElement("span"); sp.textContent = w; sp.style.whiteSpace = "pre"; slot.txt.appendChild(sp); return sp; });
      slot.text = h.text;
    }
    slot.el.style.opacity = (1 - outP).toFixed(3);
    slot.el.style.transform = `translateY(${(-30 * easeOut(outP)).toFixed(1)}px)`;
    const ops = wordOpacities(slot.words.length, easeOut(inP));
    for (let i = 0; i < ops.length; i++) slot.words[i].style.opacity = ops[i].toFixed(3);
    slot.line.style.transform = `scaleX(${easeOut(lineP).toFixed(3)})`;
  }

  function renderHud(t) {
    const i = F.headings.findIndex((x) => t >= x.t0 && t < x.t1);
    const h = F.headings[i];
    const prev = i > 0 ? F.headings[i - 1] : null;
    const next = h && F.headings[i + 1];
    slots[0].el.style.opacity = 0; slots[1].el.style.opacity = 0;
    if (h) {
      const same = prev && prev.text === h.text && h.t0 - prev.t1 < 0.2;
      const chained = prev && h.t0 - prev.t1 < 0.2;
      const k = (t - h.t0);
      // fade out at the end only when nothing takes over
      const outP = next && next.t0 - h.t1 < 0.2 ? 0 : clamp(1 - (h.t1 - t) / HOUT, 0, 1);
      drawHead(slots[0], h, same ? 1 : clamp((k - (chained ? 0.15 : 0)) / HIN, 0, 1), outP, same ? 1 : clamp((k - 0.3) / 0.5, 0, 1));
      if (chained && !same && k < HOUT + 0.15) drawHead(slots[1], prev, 1, clamp(k / HOUT, 0, 1), 1);
    }

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
      placeCaption(c, t);
    } else { cap.style.display = "none"; lastCap = null; }

    // black section card
    const sc = (F.cards || []).find((x) => t >= x.t0 && t < x.t1);
    if (sc) {
      card.style.display = "flex";
      if (cardText.textContent !== sc.text) cardText.textContent = sc.text;
      const p = clamp((t - sc.t0) / 0.3, 0, 1);
      cardText.style.opacity = p.toFixed(3);
      cardText.style.transform = `scale(${(0.9 + 0.1 * easeOut(p)).toFixed(3)})`;
    } else card.style.display = "none";

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
        if (e.anim === "count" && e.count) {
          // a number that ticks up while it pops in, e.g. 1x -> 10x
          const n = Math.round(e.count.from + (e.count.to - e.count.from) * easeOut(p));
          it.words[0].textContent = `${n}${e.count.suffix}`;
          for (let i = 1; i < it.words.length; i++) it.words[i].textContent = "";
          const s = 0.5 + 0.5 * back(clamp(p * 1.6, 0, 1));
          it.g.setAttribute("transform", `translate(${e.x} ${e.y}) scale(${s}) translate(${-e.x} ${-e.y})`);
          if (it.bg && it.bb) { const w = it.bb.width * (String(n).length + e.count.suffix.length) / Math.max(1, e.text.length); it.bg.setAttribute("x", e.x - w / 2 - 12); it.bg.setAttribute("width", w + 24); }
          o *= clamp(p * 4, 0, 1);
        } else if ((e.anim || "wipe") === "wipe") {
          const ops = wordOpacities(it.words.length, easeOut(p));
          for (let i = 0; i < ops.length; i++) it.words[i].setAttribute("fill-opacity", ops[i].toFixed(3));
          if (it.bg) it.bg.setAttribute("opacity", clamp(p * 4, 0, 1).toFixed(3));
        } else o *= p;
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

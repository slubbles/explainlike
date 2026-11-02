// Explanimate stage: draws any frame of a Film deterministically. window.render(t) seeks.
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
      it.p = p;
      if (e.outline) {
        // marker-pen look: show the filled outline, and reveal it with the centre line as a mask while drawing
        const o = document.createElementNS(NS, "path");
        o.setAttribute("d", e.outline);
        o.setAttribute("fill", e.stroke);
        const m = document.createElementNS(NS, "mask");
        m.id = `m-${e.id}`;
        m.setAttribute("maskUnits", "userSpaceOnUse");
        m.setAttribute("x", -1e5); m.setAttribute("y", -1e5); m.setAttribute("width", 2e5); m.setAttribute("height", 2e5);
        p.setAttribute("stroke", "#fff");
        p.setAttribute("stroke-width", e.sw * 3);
        m.appendChild(p);
        defs.appendChild(m);
        if (e.fill) { const f = p.cloneNode(); f.setAttribute("stroke", "none"); f.setAttribute("fill", e.fill); g.appendChild(f); }
        g.appendChild(o);
        it.o = o;
      } else g.appendChild(p);
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
      tx.setAttribute("font-family", e.font === "sans" ? "ExplainSans" : "Excalifont");
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
        if (it.bg && it.e.bgBox) { const r = it.e.bgBox; it.bg.setAttribute("x", r.x); it.bg.setAttribute("y", r.y); it.bg.setAttribute("width", r.w); it.bg.setAttribute("height", r.h); }
        else if (it.bg) { it.bg.setAttribute("x", b.x - 8); it.bg.setAttribute("y", b.y - 2); it.bg.setAttribute("width", b.width + 16); it.bg.setAttribute("height", b.height + 4); }
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

  // HUD. Two heading slots: the old heading slides out, and only then the next one wipes in,
  // so two titles are never on screen together.
  const headA = document.getElementById("heading");
  const headB = headA.cloneNode(true); headB.id = "heading2"; headA.parentNode.insertBefore(headB, headA.nextSibling);
  const slots = [headA, headB].map((el) => ({ el, txt: el.querySelector("span"), line: el.querySelector("div"), text: null }));
  const cap = document.getElementById("captions"), bar = document.getElementById("bar"), fade = document.getElementById("fade"), end = document.getElementById("end");
  let lastCap = null;

  // Captions sit in one fixed spot, centred at the bottom, one line at a time (Netflix style). The camera
  // keeps what each shot is about out of the bottom band, so a caption covers none of it; window.captionReport records, for
  // each caption, its box and how much visible drawing it overlapped (expected 0) so the frame check can prove it.

  // the part of an image that is not plain page background (a screenshot's empty margins are free space)
  async function inkBox(e) {
    const whole = { x: e.x, y: e.y, w: e.w, h: e.h };
    try {
      const im = new Image(); im.src = e.href; await im.decode();
      const k = Math.min(e.w / im.naturalWidth, e.h / im.naturalHeight), dw = im.naturalWidth * k, dh = im.naturalHeight * k;
      const dx = e.x + (e.w - dw) / 2, dy = e.y + (e.h - dh) / 2, W = 160, H = Math.max(1, Math.round((W * dh) / dw));
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d"); g.drawImage(im, 0, 0, W, H);
      const d = g.getImageData(0, 0, W, H).data, bg = [d[0], d[1], d[2]];
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] > 20 && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      }
      if (x1 < 0) return whole;
      return { x: dx + ((x0 - 1) / W) * dw, y: dy + ((y0 - 1) / H) * dh, w: ((x1 - x0 + 3) / W) * dw, h: ((y1 - y0 + 3) / H) * dh };
    } catch { return whole; }
  }
  async function worldShapes() {
    for (const it of items) {
      const e = it.e, bx = [];
      if (it.bb) { const b = it.bb; bx.push({ x: b.x - 10, y: b.y - 4, w: b.width + 20, h: b.height + 8 }); }
      else if (e.k === "img") bx.push(await inkBox(e));
      else if (it.p && it.len > 0) {
        // stroke boxes along the line; jumps between sub-paths start a new box
        const step = 10, pad = (e.sw || 2) / 2 + 3, n = Math.max(2, Math.ceil(it.len / step));
        let run = [], last = null;
        const flush = () => { if (!run.length) return; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of run) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } bx.push({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad }); run = []; };
        for (let i = 0; i <= n; i++) {
          const q = it.p.getPointAtLength((it.len * i) / n), pt = [q.x, q.y];
          if (last && Math.hypot(pt[0] - last[0], pt[1] - last[1]) > step * 2.5) flush();
          run.push(pt); last = pt;
          if (run.length >= 6) { flush(); run.push(pt); }
        }
        flush();
      } else if (e.k === "dot" && e.trail) {
        for (let i = 1; i < e.pts.length; i++) { const [a, b] = [e.pts[i - 1], e.pts[i]]; bx.push({ x: Math.min(a[0], b[0]) - 6, y: Math.min(a[1], b[1]) - 6, w: Math.abs(a[0] - b[0]) + 12, h: Math.abs(a[1] - b[1]) + 12 }); }
      }
      it.boxes = bx;
    }
  }
  const visibleAt = (e, t) => t >= e.t0 && (e.g ? interp(F.groups[e.g], t, 1) : 1) > 0.05;
  const coverAt = (t) => (F.end && t >= F.end.t0);
  async function planCaptions() {
    await worldShapes();
    const report = [];
    cap.style.display = "inline-block";
    for (const c of F.captions) {
      if (c.hidden) continue;
      cap.innerHTML = c.words.map((w) => `<span>${w.w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join(" ");
      const r = cap.getBoundingClientRect(), rect = { x: r.left, y: r.top, w: r.width, h: r.height };
      const lines = Math.round((r.height - 32) / 60);
      let still = 0, moving = 0, n = 0;
      for (let t = c.t0 + 0.05; t < c.t1; t += 0.2) {
        if (coverAt(t)) continue;
        const cam = camera(t), s = F.width / cam.w;
        // px a second the view drifts; looking a quarter second ahead counts the eased first moments of a glide as motion
        const drift = Math.max(...[0.05, 0.25].map((dt) => { const nx = camera(t + dt), ns = F.width / nx.w; return (Math.abs(nx.x - cam.x) * s + Math.abs(nx.y - cam.y) * s + Math.abs(F.width - cam.w * ns) * 0.5) / dt; }));
        let hit = 0;
        for (const it of items) {
          if (!(t >= it.e.t0 && (it.e.g ? interp(F.groups[it.e.g], t, 1) : 1) > 0.6) || !it.boxes.length) continue;
          // only what the shot is about counts: dimmed context, or an element mostly off screen, may pass under the pill
          const x0 = Math.min(...it.boxes.map((b) => b.x)), y0 = Math.min(...it.boxes.map((b) => b.y));
          const x1 = Math.max(...it.boxes.map((b) => b.x + b.w)), y1 = Math.max(...it.boxes.map((b) => b.y + b.h));
          const vw = Math.max(0, Math.min(x1, cam.x + cam.w) - Math.max(x0, cam.x)), vh = Math.max(0, Math.min(y1, cam.y + cam.h) - Math.max(y0, cam.y));
          if (vw * vh < 0.5 * Math.max(1, (x1 - x0) * (y1 - y0))) continue;
          // a long wire taller than the space between title and captions is structure, not a subject (as in pace.ts)
          if ((y1 - y0) * s > (F.height - 170 - 150) * 0.6) continue;
          for (const b of it.boxes) {
            const q = { x: (b.x - cam.x) * s, y: (b.y - cam.y) * s, w: b.w * s, h: b.h * s };
            const ox = Math.min(rect.x + rect.w, q.x + q.w) - Math.max(rect.x, q.x), oy = Math.min(rect.y + rect.h, q.y + q.h) - Math.max(rect.y, q.y);
            if (ox > 0 && oy > 0) hit += ox * oy;
          }
        }
        n++; if (drift > 400) moving += hit; else still += hit;
      }
      report.push({ t0: c.t0, text: c.words.map((w) => w.w).join(" "), spot: "bottom", stacked: lines > 1, overlapPx: Math.round(still / Math.max(1, n)), movingPx: Math.round(moving / Math.max(1, n)), rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) } });
    }
    cap.style.display = "none"; cap.innerHTML = "";
    window.captionReport = report;
  }
  function placeCaption(c, t) {
    cap.style.transform = `translateY(${(8 * (1 - easeOut(clamp((t - c.t0) / 0.15, 0, 1)))).toFixed(2)}px)`;
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
      const wait = chained && !same ? HOUT : 0;
      drawHead(slots[0], h, same ? 1 : clamp((k - wait) / HIN, 0, 1), outP, same ? 1 : clamp((k - wait - 0.15) / 0.5, 0, 1));
      if (wait && k < HOUT) drawHead(slots[1], prev, 1, clamp(k / HOUT, 0, 1), 1);
    }

    const c = F.captions.find((x) => !x.hidden && t >= x.t0 && t < x.t1);
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
        if (it.o) { if (a === "draw" && p < 1) it.o.setAttribute("mask", `url(#m-${e.id})`); else it.o.removeAttribute("mask"); }
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
          if (it.bg && it.bb && !e.bgBox) { const w = it.bb.width * (String(n).length + e.count.suffix.length) / Math.max(1, e.text.length); it.bg.setAttribute("x", e.x - w / 2 - 12); it.bg.setAttribute("width", w + 24); }
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
      it.op = o; it.prog = p;
    }
    renderHud(t);
  };

  // what is actually on screen at t, in screen pixels: the frame self-check reads these after render
  window.frameBoxes = function (t) {
    window.render(t);
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const shown = (el) => el && getComputedStyle(el).display !== "none" && Number(getComputedStyle(el).opacity) > 0.5;
    const els = [];
    for (const it of items) {
      if (it.g.style.display === "none" || !(it.op > 0.05)) continue;
      const e = it.e;
      if (e.k !== "text" && e.k !== "img" && !e.mark) continue;
      els.push({ id: e.id, k: e.k, text: e.text, anim: e.anim, g: e.g, mark: !!e.mark, op: it.op, done: it.prog >= 1, size: e.size, rect: r(it.tx || it.g) });
    }
    const hud = [];
    if (shown(cap)) hud.push({ k: "caption", rect: r(cap) });
    for (const s of slots) if (Number(s.el.style.opacity) > 0.5) hud.push({ k: "heading", rect: r(s.el) });
    const brand = document.getElementById("brand");
    if (brand) hud.push({ k: "brand", rect: r(brand) });
    return { t, els, hud, end: !!(F.end && t >= F.end.t0) };
  };

  window.ready = (async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); measure(); await planCaptions(); window.render(0); return true; })();
})();

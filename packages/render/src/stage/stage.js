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

  // Captions never cover the drawing. Before the first frame, each caption picks one spot:
  // next to the box it talks about (below, above, right, left, a little further out),
  // else a free band at the bottom or top. A spot is free when, at every moment the caption
  // is up, it clears every visible stroke, word and image. window.captionReport lists the picks.
  const TOP = 170, BOT = F.height - 40, SIDE = 40;
  function worldShapes() {
    for (const it of items) {
      const e = it.e, bx = [];
      if (it.bb) { const b = it.bb; bx.push({ x: b.x - 10, y: b.y - 4, w: b.width + 20, h: b.height + 8 }); }
      else if (e.k === "img") bx.push({ x: e.x, y: e.y, w: e.w, h: e.h });
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
  const coverAt = (t) => (F.cards || []).some((x) => t >= x.t0 && t < x.t1) || (F.end && t >= F.end.t0);
  function spotXY(spot, c, t, cw, ch) {
    let x, y;
    if (spot.grid) return { x: spot.grid[0], y: spot.grid[1] };
    if (spot.world) { const cam = camera(t), s = F.width / cam.w; return { x: clamp((spot.world[0] - cam.x) * s, SIDE, F.width - SIDE - cw), y: clamp((spot.world[1] - cam.y) * s, TOP, BOT - ch) }; }
    if (spot.side) {
      const cam = camera(t), s = F.width / cam.w;
      const bx = (c.at.x - cam.x) * s, by = (c.at.y - cam.y) * s, bw = c.at.w * s, bh = c.at.h * s, g = spot.gap;
      if (spot.side === "below") { x = bx + bw / 2 - cw / 2; y = by + bh + g; }
      else if (spot.side === "above") { x = bx + bw / 2 - cw / 2; y = by - g - ch; }
      else if (spot.side === "right") { x = bx + bw + g; y = by + bh / 2 - ch / 2; }
      else { x = bx - g - cw; y = by + bh / 2 - ch / 2; }
    } else {
      x = spot.band[0] === "l" ? 60 : spot.band[0] === "r" ? F.width - 60 - cw : F.width / 2 - cw / 2;
      y = spot.band[1] === "t" ? TOP + 10 : BOT - 24 - ch;
    }
    return { x: clamp(x, SIDE, F.width - SIDE - cw), y: clamp(y, TOP, BOT - ch) };
  }
  const BANDS = [["cb"], ["ct"], ["lb"], ["rb"], ["lt"], ["rt"]].map(([band]) => ({ band }));
  const NEAR = [22, 60, 120].flatMap((gap) => ["below", "above", "right", "left"].map((side) => ({ side, gap })));
  function planCaptions() {
    worldShapes();
    const report = [];
    for (const c of F.captions) {
      capwrap.className = c.at ? "near placed" : "placed"; capwrap.style.left = capwrap.style.top = "0px";
      cap.innerHTML = c.words.map((w) => `<span>${w.w.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`).join(" ");
      cap.style.display = "inline-block";
      const cw = cap.offsetWidth, ch = cap.offsetHeight;
      const times = [];
      for (let t = c.t0 + 0.05; t < c.t1; t += 0.2) if (!coverAt(t)) times.push(t);
      if (c.t1 - 0.02 > c.t0 && !coverAt(c.t1 - 0.02)) times.push(c.t1 - 0.02);
      const shots = times.map((t) => {
        const cam = camera(t), s = F.width / cam.w, out = [];
        for (const it of items) {
          if (!visibleAt(it.e, t)) continue;
          for (const b of it.boxes) {
            const r = { x: (b.x - cam.x) * s, y: (b.y - cam.y) * s, w: b.w * s, h: b.h * s };
            if (r.x + r.w > 0 && r.x < F.width && r.y + r.h > 0 && r.y < F.height) out.push(r);
          }
        }
        const nx = camera(t + 0.05);
        // while the camera glides, everything is in motion; covering something then matters far less than on a still frame
        const moving = Math.abs(nx.x - cam.x) + Math.abs(nx.y - cam.y) + Math.abs(nx.w - cam.w) > 1;
        return { t, boxes: out, weight: moving ? 1 : 1000 };
      });
      let best = null;
      // last resort: any free spot on screen, nearest to the box first (or to the usual bottom spot)
      const cam0 = camera(c.t0), s0 = F.width / cam0.w;
      const ax = c.at ? (c.at.x + c.at.w / 2 - cam0.x) * s0 : F.width / 2, ay = c.at ? (c.at.y + c.at.h / 2 - cam0.y) * s0 : BOT;
      const grid = [];
      for (let y = TOP; y <= BOT - ch; y += 30) for (let x = SIDE; x <= F.width - SIDE - cw; x += 40) grid.push({ grid: [x, y], d: Math.hypot(x + cw / 2 - ax, y + ch / 2 - ay) });
      grid.sort((a, b) => a.d - b.d);
      // the same spots pinned to the drawing, so a caption rides along when the camera pushes mid-phrase
      const pinned = [];
      for (const tt of times.length ? [times[times.length - 1], times[0]] : [c.t1]) {
        const camS = camera(tt), sS = camS.w / F.width;
        for (const g of grid) pinned.push({ world: [camS.x + g.grid[0] * sS, camS.y + g.grid[1] * sS] });
      }
      for (const spot of [...(c.at ? NEAR : []), ...BANDS, ...grid, ...pinned]) {
        let hit = 0, still = 0;
        for (const sh of shots) {
          const p = spotXY(spot, c, sh.t, cw, ch), m = 10;
          for (const r of sh.boxes) {
            const ox = Math.min(p.x + cw + m, r.x + r.w) - Math.max(p.x - m, r.x), oy = Math.min(p.y + ch + m, r.y + r.h) - Math.max(p.y - m, r.y);
            if (ox > 0 && oy > 0) { hit += ox * oy * sh.weight; if (sh.weight > 1) still += ox * oy; }
          }
          if (best && hit >= best.hit) break;
        }
        if (!best || hit < best.hit) best = { spot, hit, still };
        if (hit === 0) break;
      }
      c.spot = best.spot;
      report.push({ t0: c.t0, text: c.words.map((w) => w.w).join(" "), spot: best.spot.side ? `${best.spot.side}+${best.spot.gap}` : best.spot.band ?? (best.spot.grid ? `at ${best.spot.grid.join(",")}` : "pinned"), overlapPx: Math.round(best.still / Math.max(1, shots.length)), movingPx: Math.round((best.hit - best.still * 1000) / Math.max(1, shots.length)) });
    }
    cap.style.display = "none"; cap.innerHTML = "";
    window.captionReport = report;
  }
  function placeCaption(c, t) {
    const pop = 0.88 + 0.12 * easeOut(clamp((t - c.t0) / 0.18, 0, 1));
    capwrap.className = c.at ? "near placed" : "placed";
    const p = spotXY(c.spot || BANDS[0], c, t, cap.offsetWidth, cap.offsetHeight);
    capwrap.style.left = `${p.x.toFixed(1)}px`; capwrap.style.top = `${p.y.toFixed(1)}px`;
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
    }
    renderHud(t);
  };

  window.ready = (async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); measure(); planCaptions(); window.render(0); return true; })();
})();

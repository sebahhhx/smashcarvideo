/* Smashcar · motor de animación del menú (Canvas 2D).
   Dibuja cualquier instante t (segundos) de un loop sin cortes.
   El mismo motor se usa para la vista previa y para exportar el MP4. */
(function (global) {
  'use strict';

  const W = 1920, H = 1080, PORTRAIT_W = 1080, PORTRAIT_H = 1920, FPS = 30;
  const YEL = '#F5B82E', RED = '#E82C28', WHITE = '#FFFFFF', DARK = '#120E0A';
  const ANTON = 'Anton', BEBAS = '"Bebas Neue"', ROBOTO = 'Roboto';

  // ------------------------------------------------------------ helpers
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));
  const eOut = u => 1 - (1 - u) ** 3;
  const eIn = u => u * u;
  const eInOut = u => 3 * u * u - 2 * u * u * u;
  const eBack = (u, s = 1.8) => { u -= 1; return 1 + (s + 1) * u ** 3 + s * u ** 2; };
  const eElastic = u => (u <= 0 ? 0 : u >= 1 ? 1 : 2 ** (-10 * u) * Math.sin((u - 0.075) * 2 * Math.PI / 0.3) + 1);

  function hashStr(s) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  class Rng {
    constructor(seed) { this.s = seed >>> 0; }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    u(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return a + Math.floor(this.next() * (b - a)); }
  }
  const rnd = (...k) => new Rng(hashStr(k.join('|')));

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function ctx2d(c) { const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; return x; }
  const rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  function anchorOff(anchor, w, h) {
    switch (anchor) {
      case 'l': return [0, h / 2];
      case 'r': return [w, h / 2];
      case 'tl': return [0, 0];
      case 'bc': return [w / 2, h];
      case 'tc': return [w / 2, 0];
      default: return [w / 2, h / 2];
    }
  }
  function draw(ctx, spr, x, y, o = {}) {
    if (!spr) return;
    const a = o.a === undefined ? 1 : o.a;
    if (a <= 0.003) return;
    const sx = o.sx === undefined ? 1 : o.sx, sy = o.sy === undefined ? sx : o.sy;
    if (sx <= 0.001 || sy <= 0.001) return;
    const [ax, ay] = anchorOff(o.anchor || 'c', spr.width, spr.height);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a);
    if (o.add) ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot * Math.PI / 180);
    if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
    ctx.drawImage(spr, -ax, -ay);
    ctx.restore();
  }
  function drawFit(ctx, spr, x, y, maxw, maxh, o = {}) {
    if (!spr) return;
    const s = Math.min(1, maxw / spr.width, maxh / spr.height);
    draw(ctx, spr, x, y, { ...o, sx: s * (o.sx === undefined ? 1 : o.sx), sy: s * (o.sy === undefined ? (o.sx === undefined ? 1 : o.sx) : o.sy) });
  }

  // ------------------------------------------------------------ sprites
  function radialSprite(size, stops, rgb) {
    const c = canvas(size, size), x = ctx2d(c);
    const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [p, a] of stops) g.addColorStop(p, rgba(rgb, a));
    x.fillStyle = g; x.fillRect(0, 0, size, size);
    return c;
  }
  const GAUSS = [[0, 1], [0.2, 0.9], [0.4, 0.65], [0.6, 0.37], [0.8, 0.18], [1, 0]];
  const POW18 = [[0, 1], [0.2, 0.67], [0.4, 0.4], [0.6, 0.19], [0.8, 0.055], [1, 0]];
  const POW12 = [[0, 1], [0.25, 0.7], [0.5, 0.43], [0.75, 0.19], [1, 0]];

  function makeFx() {
    const fx = {};
    // vapor: 8 variantes de nube suave
    fx.steam = [];
    for (let v = 0; v < 8; v++) {
      const r = new Rng(100 + v), S = 160;
      const raw = canvas(S, S), x = ctx2d(raw);
      const n = r.int(3, 5);
      for (let i = 0; i < n; i++) {
        const cx = S / 2 + (r.next() - 0.5) * 24, cy = S / 2 + (r.next() - 0.5) * 36;
        const sx = r.u(14, 22), sy = r.u(22, 34), a = r.u(0.55, 0.9);
        x.save(); x.translate(cx, cy); x.scale(1, sy / sx);
        const g = x.createRadialGradient(0, 0, 0, 0, 0, sx * 2.6);
        g.addColorStop(0, `rgba(248,246,242,${a})`);
        g.addColorStop(0.5, `rgba(248,246,242,${a * 0.45})`);
        g.addColorStop(1, 'rgba(248,246,242,0)');
        x.fillStyle = g; x.beginPath(); x.arc(0, 0, sx * 2.6, 0, Math.PI * 2); x.fill();
        x.restore();
      }
      const c = canvas(S, S), y = ctx2d(c);
      y.filter = 'blur(8px)'; y.drawImage(raw, 0, 0); y.filter = 'none';
      y.globalCompositeOperation = 'destination-in';
      y.drawImage(radialSprite(S, [[0, 1], [0.5, 0.75], [0.8, 0.3], [1, 0]], [0, 0, 0]), 0, 0);
      fx.steam.push(c);
    }
    // chispas en 5 tonos
    fx.ember = [110, 130, 150, 170, 190].map(g => radialSprite(41,
      [[0, 1], [0.08, 0.9], [0.2, 0.4], [0.45, 0.13], [1, 0]], [255, g, 40]));
    fx.spark = radialSprite(61, [[0, 1], [0.1, 0.95], [0.3, 0.45], [0.6, 0.12], [1, 0]], [255, 235, 160]);
    // fuego en 8 pasos de color
    fx.fire = [];
    for (let i = 0; i < 8; i++) {
      const u = i / 7;
      fx.fire.push(radialSprite(121, GAUSS, [255, Math.round(190 - 120 * u), Math.round(60 - 50 * u)]));
    }
    fx.glow = radialSprite(400, POW18, [255, 105, 28]);
    fx.shadow = radialSprite(200, POW12, [0, 0, 0]);
    // rayos de luz del intro
    {
      const S = 1150, raw = canvas(S, S), x = ctx2d(raw);
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(255,170,40,1)'); g.addColorStop(0.4, 'rgba(255,170,40,0.45)');
      g.addColorStop(0.75, 'rgba(255,170,40,0.12)'); g.addColorStop(1, 'rgba(255,170,40,0)');
      x.fillStyle = g;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2, d = 2.6 * Math.PI / 180;
        x.beginPath(); x.moveTo(S / 2, S / 2);
        x.lineTo(S / 2 + Math.cos(a - d) * S, S / 2 + Math.sin(a - d) * S);
        x.lineTo(S / 2 + Math.cos(a + d) * S, S / 2 + Math.sin(a + d) * S);
        x.closePath(); x.fill();
      }
      const c = canvas(S, S), y = ctx2d(c);
      y.filter = 'blur(3px)'; y.drawImage(raw, 0, 0);
      fx.rays = c;
    }
    return fx;
  }

  function shadowed(src, o = {}) {
    const pad = o.pad === undefined ? 20 : o.pad, off = o.off === undefined ? 5 : o.off;
    const blur = o.blur === undefined ? 7 : o.blur, op = o.op === undefined ? 0.75 : o.op;
    const c = canvas(src.width + pad * 2, src.height + pad * 2), x = ctx2d(c);
    x.shadowColor = `rgba(0,0,0,${op})`; x.shadowBlur = blur * 2; x.shadowOffsetY = off;
    x.drawImage(src, pad, pad);
    return c;
  }

  // textos con varias partes en la misma línea base
  function textSprite(parts, o = {}) {
    const gap = o.gap === undefined ? 14 : o.gap, shadow = o.shadow !== false;
    const m = ctx2d(canvas(4, 4));
    let x = 0, inkL = Infinity, inkR = -Infinity, asc = 0, desc = 0;
    const laid = parts.filter(p => p.text).map(p => {
      m.font = p.font;
      const mt = m.measureText(p.text);
      const q = { ...p, x };
      inkL = Math.min(inkL, x - mt.actualBoundingBoxLeft);
      inkR = Math.max(inkR, x + mt.actualBoundingBoxRight);
      asc = Math.max(asc, mt.actualBoundingBoxAscent);
      desc = Math.max(desc, mt.actualBoundingBoxDescent);
      x += mt.width + gap;
      return q;
    });
    if (!laid.length) return null;
    const pad = shadow ? 20 : 3;
    const c = canvas(inkR - inkL + pad * 2, asc + desc + pad * 2), ctx = ctx2d(c);
    if (shadow) { ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5; }
    ctx.textBaseline = 'alphabetic';
    for (const p of laid) { ctx.font = p.font; ctx.fillStyle = p.color; ctx.fillText(p.text, pad - inkL + p.x, pad + asc); }
    return c;
  }
  const text = (t, font, color, o) => textSprite([{ text: t, font, color }], o);

  function wrap(m, t, maxw, maxLines = Infinity) {
    const words = String(t || '').split(/\s+/).filter(Boolean), lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (m.measureText(test).width <= maxw || !cur) cur = test; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      // corta con "…" sin pasarse del ancho
      let last = lines[maxLines - 1].replace(/[,;.]$/, '');
      while (last.includes(' ') && m.measureText(last + '…').width > maxw) last = last.replace(/\s*\S+$/, '').replace(/[,;.]$/, '');
      lines.length = maxLines;
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }
  function paraSprite(t, font, color, maxw, lh, o = {}) {
    const m = ctx2d(canvas(4, 4)); m.font = font;
    const lines = wrap(m, t, maxw, o.maxLines);
    if (!lines.length) return null;
    const mt = m.measureText('ÁÉÍÓÚÑgjpqy');
    const asc = mt.actualBoundingBoxAscent, desc = mt.actualBoundingBoxDescent;
    const widest = Math.max(...lines.map(l => m.measureText(l).width));
    const pad = 20, left = o.align === 'left';
    const c = canvas(widest + pad * 2, (lines.length - 1) * lh + asc + desc + pad * 2), ctx = ctx2d(c);
    ctx.shadowColor = 'rgba(0,0,0,0.75)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = left ? 'left' : 'center'; ctx.textBaseline = 'alphabetic';
    lines.forEach((l, i) => ctx.fillText(l, left ? pad : c.width / 2, pad + asc + i * lh));
    return c;
  }

  function roundRect(w, h, r, fill, stroke, lw) {
    const c = canvas(w, h), x = ctx2d(c);
    const o = lw ? lw / 2 : 0;
    x.beginPath(); x.roundRect(o, o, w - 2 * o, h - 2 * o, r);
    if (fill) { x.fillStyle = fill; x.fill(); }
    if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); }
    return c;
  }

  function starburst() {
    const R = 175, n = 18, inner = 0.86, S = R * 2 + 10;
    const c = canvas(S, S), x = ctx2d(c);
    x.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const rr = i % 2 === 0 ? R : R * inner, a = Math.PI * i / n;
      const px = S / 2 + rr * Math.cos(a), py = S / 2 + rr * Math.sin(a);
      i ? x.lineTo(px, py) : x.moveTo(px, py);
    }
    x.closePath(); x.fillStyle = YEL; x.fill();
    x.beginPath(); x.arc(S / 2, S / 2, R * 0.81, 0, Math.PI * 2);
    x.strokeStyle = 'rgb(30,20,5)'; x.lineWidth = 3; x.stroke();
    return shadowed(c, { off: 8, blur: 12, op: 0.7 });
  }

  // ------------------------------------------------------------ layout del menú
  // Rectángulos de las tarjetas de burgers y del apartado de extras.
  function layoutHorizontal(n, m, mode) {
    const top = 215, bottom = 950, X0 = 52, X1 = 1868;
    let right = X1, cardsBottom = bottom, extras = null;
    if (m && mode === 'right') {
      extras = { x: 1452, y: top, w: X1 - 1452, h: bottom - top, mode: 'right' };
      right = 1452 - 18;
    } else if (m) {
      const eh = 240;
      extras = { x: X0, y: bottom - eh, w: X1 - X0, h: eh, mode: 'bottom' };
      cardsBottom = bottom - eh - 16;
    }
    const cols = n <= 2 ? Math.max(1, n) : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols), gx = 16, gy = 14;
    const w = (right - X0 - (cols - 1) * gx) / cols, h = (cardsBottom - top - (rows - 1) * gy) / rows;
    const cards = [];
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols), col = i % cols;
      const inRow = Math.min(cols, n - row * cols), shift = (cols - inRow) * (w + gx) / 2;
      cards.push({ x: X0 + shift + col * (w + gx), y: top + row * (h + gy), w, h });
    }
    return { cards, extras };
  }
  function layoutVertical(n, m, hasNote) {
    const top = 408, bottom = 1748, x = 54, w = 972;
    let cardsBottom = bottom, extras = null;
    if (m) {
      const rows = Math.ceil(m / 3), eh = (hasNote ? 120 : 88) + rows * (m > 3 ? 210 : 300);
      extras = { x, y: bottom - eh, w, h: eh, mode: 'vertical' };
      cardsBottom = bottom - eh - 16;
    }
    const gap = 12, h = (cardsBottom - top - (n - 1) * gap) / Math.max(1, n);
    const cards = [];
    for (let i = 0; i < n; i++) cards.push({ x, y: top + i * (h + gap), w, h });
    return { cards, extras };
  }
  // Dónde va cada cosa dentro de una tarjeta (relativo a su esquina).
  function cardGeom(w, h) {
    if (h > w * 0.8) {
      // tarjeta alta: foto arriba, textos centrados abajo
      const imgH = h * 0.5, textW = w - 80, ingFont = 30, ingLH = 40;
      const nameH = Math.min(118, h * 0.13), priceH = Math.min(96, h * 0.11), gap = 18;
      const total = nameH + gap + ingLH * 2 + gap + priceH;
      const y0 = imgH + 30 + Math.max(0, (h - imgH - 50 - total) / 2);
      return { stacked: true, img: { cx: w / 2, cy: 24 + imgH / 2, w: w - 80, h: imgH }, textX: w / 2, textW,
        nameY: y0 + nameH / 2, nameH, showIng: true, ingFont, ingLH, ingTop: y0 + nameH + gap, priceY: y0 + total - priceH / 2, priceH };
    }
    const imageW = Math.min(w * 0.36, h * 1.25), textX = imageW + 52, textW = w - textX - 28;
    const showIng = h >= 190;
    const ingFont = Math.round(clamp(Math.min(h * 0.105, textW / 15), 22, 30)), ingLH = Math.round(ingFont * 1.3);
    const nameH = Math.min(96, h * (showIng ? 0.27 : 0.4)), priceH = Math.min(84, h * (showIng ? 0.25 : 0.36));
    const gap = Math.min(14, h * 0.04), ingH = showIng ? ingLH * 2 : 0;
    const total = nameH + priceH + (showIng ? ingH + gap * 2 : gap);
    const y0 = (h - total) / 2;
    return { stacked: false, img: { cx: 26 + imageW / 2, cy: h / 2, w: imageW, h: h - 26 }, textX, textW,
      nameY: y0 + nameH / 2, nameH, showIng, ingFont, ingLH, ingTop: y0 + nameH + gap, priceY: y0 + total - priceH / 2, priceH };
  }

  // Logo de Instagram nítido a cualquier tamaño (cuadrado con degradado y glifo blanco).
  function instagramIcon(size) {
    const c = canvas(size, size), x = ctx2d(c), u = size;
    const g = x.createRadialGradient(u * 0.3, u * 1.07, 0, u * 0.3, u * 1.07, u * 1.35);
    g.addColorStop(0, '#fdf497'); g.addColorStop(0.05, '#fdf497'); g.addColorStop(0.45, '#fd5949');
    g.addColorStop(0.6, '#d6249f'); g.addColorStop(0.9, '#285aeb');
    x.fillStyle = g; x.beginPath(); x.roundRect(0, 0, u, u, u * 0.23); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = u * 0.085;
    x.beginPath(); x.roundRect(u * 0.2, u * 0.2, u * 0.6, u * 0.6, u * 0.17); x.stroke();
    x.beginPath(); x.arc(u / 2, u / 2, u * 0.145, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#fff'; x.beginPath(); x.arc(u * 0.665, u * 0.335, u * 0.045, 0, Math.PI * 2); x.fill();
    return c;
  }

  async function scaled(src, w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    try {
      const bmp = await createImageBitmap(src, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' });
      const c = canvas(w, h); c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
      return c;
    } catch (e) {
      const c = canvas(w, h), x = ctx2d(c); x.drawImage(src, 0, 0, w, h); return c;
    }
  }
  const fitH = (img, h, w) => { const s = Math.min(h / img.height, w ? w / img.width : Infinity); return scaled(img, img.width * s, img.height * s); };

  // Quita un fondo liso (negro, blanco…) que toca los bordes de la foto.
  function removeFlatBackground(img) {
    const c = canvas(img.width, img.height), x = ctx2d(c);
    x.drawImage(img, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), d = id.data, w = c.width, h = c.height;
    let transparent = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 250) transparent++;
    if (transparent > 20) return { canvas: c, changed: false };
    const corner = [0, w - 1, (h - 1) * w, h * w - 1].map(p => [d[p * 4], d[p * 4 + 1], d[p * 4 + 2]]);
    const bg = [0, 1, 2].map(k => corner.reduce((s, q) => s + q[k], 0) / 4);
    const T = 34, seen = new Uint8Array(w * h), stack = [];
    const near = p => Math.max(Math.abs(d[p * 4] - bg[0]), Math.abs(d[p * 4 + 1] - bg[1]), Math.abs(d[p * 4 + 2] - bg[2])) <= T;
    for (let i = 0; i < w; i++) { stack.push(i, (h - 1) * w + i); }
    for (let j = 0; j < h; j++) { stack.push(j * w, j * w + w - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (seen[p] || !near(p)) continue;
      seen[p] = 1;
      const px = p % w, py = (p / w) | 0;
      if (px > 0) stack.push(p - 1); if (px < w - 1) stack.push(p + 1);
      if (py > 0) stack.push(p - w); if (py < h - 1) stack.push(p + w);
    }
    // borde suave: promedio 3x3 del fondo detectado
    for (let y = 0; y < h; y++) for (let xx = 0; xx < w; xx++) {
      const p = y * w + xx;
      let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const qx = xx + dx, qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
        s += seen[qy * w + qx]; n++;
      }
      d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (1 - s / n));
    }
    x.putImageData(id, 0, 0);
    return { canvas: c, changed: true };
  }

  // Recorta la burger y la escala para que el pan mida "bun" px de ancho.
  async function burgerByBun(img, bun) {
    const { canvas: src } = removeFlatBackground(img);
    const x = ctx2d(src), id = x.getImageData(0, 0, src.width, src.height), d = id.data;
    const w = src.width, h = src.height;
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
      const p = (y * w + i) * 4 + 3;
      if (d[p] < 40) d[p] = 0;
      if (d[p] > 128) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    x.putImageData(id, 0, 0);
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(w - 1, x1 + 4); y1 = Math.min(h - 1, y1 + 4);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    let bunW = 0;
    for (let y = y0; y < y0 + Math.floor(0.3 * ch); y++) {
      let l = -1, r = -1;
      for (let i = x0; i <= x1; i++) if (d[(y * w + i) * 4 + 3] > 128) { if (l < 0) l = i; r = i; }
      if (l >= 0) bunW = Math.max(bunW, r - l);
    }
    if (bunW < 10) bunW = cw;
    const crop = canvas(cw, ch); crop.getContext('2d').drawImage(src, x0, y0, cw, ch, 0, 0, cw, ch);
    const s = bun / bunW;
    return scaled(crop, cw * s, ch * s);
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      if (!src) return res(null);
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => rej(new Error('No se pudo cargar una imagen'));
      im.src = src;
    });
  }

  function formatPrice(p) {
    const s = String(p || '').trim();
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return s;
    if (/^\$?\s*[\d.,]+$/.test(s)) return '$' + Number(digits).toLocaleString('es-CL').replace(/,/g, '.');
    return s;
  }

  // ------------------------------------------------------------ engine
  class Engine {
    constructor() {
      this.fx = makeFx();
      this.S = null;
      this.p = null;
      this.ready = false;
      this.cache = new Map();
    }
    get vertical() { return !!this.p && this.p.orientation === 'vertical'; }
    get width() { return this.vertical ? PORTRAIT_W : W; }
    get height() { return this.vertical ? PORTRAIT_H : H; }
    async cached(key, fn) {
      if (!this.cache.has(key)) this.cache.set(key, fn());
      return this.cache.get(key);
    }
    img(src) { return src ? this.cached('img:' + src, () => loadImage(src)) : Promise.resolve(null); }

    timeline() {
      const d = this.p.durations, n = Math.max(1, this.p.burgers.length);
      const I = clamp(+d.intro || 4.5, 3, 10), B = clamp(+d.burger || 12, 1, 30), G = clamp(+d.grid || 7.5, 5, 20);
      const T_SPOT = I, T_GRID = I + n * B, L = T_GRID + G;
      return { I, B, G, n, T_SPOT, T_GRID, L };
    }
    get duration() { return this.p ? this.timeline().L : 60; }
    get frames() { return Math.round(this.duration * FPS); }

    // Prepara todos los sprites de un proyecto (se llama cada vez que cambia).
    async build(project, assets) {
      const p = JSON.parse(JSON.stringify(project));
      p.burgers = p.burgers.filter(b => b && b.name !== undefined);
      const ex = p.extras || {};
      p.extras = {
        title: String(ex.title || '').toUpperCase(), note: String(ex.note || '').toUpperCase().trim(),
        layout: ex.layout === 'right' ? 'right' : 'bottom',
        items: (Array.isArray(ex.items) ? ex.items : []).filter(d => d && d.name && d.price).slice(0, 6),
      };
      const vertical = p.orientation === 'vertical';
      const layout = vertical ? layoutVertical(p.burgers.length, p.extras.items.length, !!p.extras.note)
        : layoutHorizontal(p.burgers.length, p.extras.items.length, p.extras.layout);
      const geom = layout.cards.length ? cardGeom(layout.cards[0].w, layout.cards[0].h) : null;
      const S = {};
      const img = {};
      for (const k of Object.keys(assets)) img[k] = await this.img(assets[k]);
      const brand = p.brand;
      img.logoBrand = brand.logo ? await this.img(brand.logo) : img.logo;
      img.scriptBrand = brand.script ? await this.img(brand.script) : img.script;

      S.bg = await this.cached('bg:' + (p.orientation || 'horizontal') + ':' + (brand.logo || 'default').length + ':' + (brand.logo || '').slice(-64), () => this.background(img.logoBrand, p.orientation === 'vertical'));
      S.burst = starburst();
      S.logo_big = shadowed(await fitH(img.logoBrand, 330), { off: 10, blur: 16 });
      S.logo_sm = shadowed(await fitH(img.logoBrand, 92));
      S.name_big = text(brand.name, `170px ${ANTON}`, WHITE);
      S.name_sm = text(brand.name, `66px ${ANTON}`, WHITE);
      if (S.name_big && S.name_big.width > 1500) S.name_big_sc = 1500 / S.name_big.width;
      if (S.name_sm && S.name_sm.width > 520) S.name_sm_sc = 520 / S.name_sm.width;
      S.script_big = img.scriptBrand ? shadowed(await scaled(img.scriptBrand, 1150, img.scriptBrand.height * 1150 / img.scriptBrand.width), { off: 6, blur: 8 }) : null;
      S.title = text(brand.title, `100px ${ANTON}`, WHITE);
      S.title_g = text(brand.title, `124px ${ANTON}`, WHITE);
      S.orn = await scaled(img.ornament, 380, img.ornament.height * 380 / img.ornament.width);
      S.orn_g = await scaled(img.ornament, 460, img.ornament.height * 460 / img.ornament.width);
      S.combo = textSprite([{ text: brand.note, font: `38px ${BEBAS}`, color: YEL }]);
      S.combo_g = textSprite([{ text: brand.note, font: `50px ${BEBAS}`, color: YEL }]);
      S.fries = await fitH(img.i_fries, 54); S.fries_g = await fitH(img.i_fries, 70);
      S.panel = roundRect(800, 820, 28, 'rgba(14,11,9,0.84)', 'rgba(245,184,46,0.24)', 2);
      {
        const c = roundRect(784, 136, 20, 'rgba(245,184,46,0.16)', 'rgba(245,184,46,0.78)', 3), x = ctx2d(c);
        x.fillStyle = YEL; x.beginPath(); x.roundRect(0, 14, 10, 108, 4); x.fill();
        S.hl = c;
      }
      S.bar = await this.bar(brand, img);
      S.bar_script = img.scriptBrand ? await fitH(img.scriptBrand, 84) : null;
      S.menuTitle = text(brand.title, `112px ${ANTON}`, WHITE);
      S.menuNote = paraSprite(brand.note, `48px ${BEBAS}`, YEL, 1250, 52);
      S.extraTitle = text(p.extras.title, `70px ${ANTON}`, WHITE);
      S.extraNote = p.extras.note ? text(p.extras.note, `40px ${BEBAS}`, YEL) : null;
      if (p.orientation === 'vertical') {
        S.bar_v = await this.verticalBar(brand, img);
        S.logo_v = shadowed(await fitH(img.logoBrand, 112), { off: 5, blur: 9 });
        S.name_v = text(brand.name, `74px ${ANTON}`, WHITE);
        S.title_v = text(brand.title, `110px ${ANTON}`, WHITE);
        S.combo_v = paraSprite(brand.note, `48px ${BEBAS}`, YEL, 900, 52);
        S.script_v = img.scriptBrand ? await fitH(img.scriptBrand, 132, 820) : null;
      }

      const icons = { bolt: img.i_bolt, bbq: img.i_bbq, onion: img.i_onion, mush: img.i_mush, burger: img.logoBrand };
      const n = p.burgers.length, gs = Math.min(1, 4 / Math.max(1, n));
      S.b = [];
      for (let i = 0; i < n; i++) {
        const b = p.burgers[i];
        const prices = (b.prices || []).filter(q => q && (q.label || q.price)).map(q => ({ label: String(q.label || '').toUpperCase(), price: formatPrice(q.price) }));
        const bi = clamp(b.badge === undefined ? prices.length - 1 : +b.badge, 0, Math.max(0, prices.length - 1));
        const s = { prices, big: !!b.big };
        s.emphasisPrice = bi;
        const pic = b.image ? await this.img(b.image) : (b.defaultImage ? img[b.defaultImage] : img.logoBrand);
        const picKey = b.image ? b.image.length + ':' + b.image.slice(-80) : (b.defaultImage || 'logo');
        const bs = b.big ? 480 : 400, bg = Math.round((b.big ? 280 : 234) * gs);
        s.spot = pic ? await this.cached(`bun:${picKey}:${bs}`, () => burgerByBun(pic, bs)) : null;
        s.grid = pic ? await this.cached(`bun:${picKey}:${bg}`, () => burgerByBun(pic, bg)) : null;
        let iconImg = b.iconImage ? await this.img(b.iconImage) : icons[b.icon] || icons.burger;
        s.icon = shadowed(await fitH(iconImg, b.icon === 'burger' && !b.iconImage ? 56 : 58, 62));
        s.icon_s = shadowed(await fitH(iconImg, (b.icon === 'burger' && !b.iconImage ? 44 : 46) * gs, 50 * gs));
        const name = String(b.name || '').toUpperCase();
        s.name = text(name, `120px ${ANTON}`, YEL);
        if (s.name && s.name.width > 1040) s.name = text(name, `${Math.floor(120 * 1000 / s.name.width)}px ${ANTON}`, YEL);
        s.ing = paraSprite(String(b.ingredients || '').toUpperCase(), `500 33px ${ROBOTO}`, WHITE, 940, 46);
        const badge = prices[bi];
        if (badge) {
          s.burst_lab = text(badge.label, `40px ${ANTON}`, DARK, { shadow: false });
          s.burst_pr = text(badge.price, `${badge.price.length < 7 ? 76 : badge.price.length < 9 ? 68 : 56}px ${ANTON}`, DARK, { shadow: false });
          if (s.burst_pr.width > 280) s.burst_pr_sc = 280 / s.burst_pr.width;
        }
        const other = prices.filter((_, j) => j !== bi)[0];
        const note = String(b.note || '').toUpperCase().trim();
        let pill = null;
        if (other) pill = textSprite([{ text: other.label, font: `46px ${BEBAS}`, color: WHITE }, { text: other.price, font: `54px ${ANTON}`, color: YEL }], { gap: 16, shadow: false });
        else if (note) {
          const mm = note.match(/^(\d+\s*\S+)\s+(.+)$/);
          pill = mm ? textSprite([{ text: mm[1], font: `50px ${ANTON}`, color: YEL }, { text: mm[2], font: `44px ${BEBAS}`, color: WHITE }], { gap: 14, shadow: false })
            : text(note, `46px ${BEBAS}`, WHITE, { shadow: false });
        }
        s.pill = pill;
        if (pill) {
          const pw = Math.max(400, pill.width + 56);
          s.pillbg = shadowed(roundRect(pw, 92, 46, 'rgba(12,10,8,0.92)', YEL, 4), { off: 6, blur: 10 });
        }
        const lineColor = j => (prices.length > 1 && j === 0 ? WHITE : RED);
        s.rname = text(name, `50px ${ANTON}`, YEL);
        if (s.rname && s.rname.width > 440) s.rname_sc = 440 / s.rname.width;
        s.rprices = prices.slice(0, 2).map((q, j) => textSprite([{ text: q.label, font: `34px ${BEBAS}`, color: lineColor(j) }, { text: q.price, font: `44px ${ANTON}`, color: YEL }], { gap: 10 }));
        s.gname = text(name, `${Math.round(50 * gs)}px ${ANTON}`, YEL);
        const maxGW = W / Math.max(1, n) - 30;
        if (s.gname && s.gname.width > maxGW) s.gname_sc = maxGW / s.gname.width;
        s.gprices = prices.slice(0, 2).map((q, j) => textSprite([{ text: q.label, font: `${Math.round(38 * gs)}px ${BEBAS}`, color: lineColor(j) }, { text: q.price, font: `${Math.round(52 * gs)}px ${ANTON}`, color: YEL }], { gap: 12 }));
        if (s.gprices.length === 1 && note) s.gprices.push(text(note, `${Math.round(36 * gs)}px ${BEBAS}`, WHITE));
        if (p.orientation === 'vertical') {
          s.vname = text(name, `94px ${ANTON}`, YEL);
          s.ving = paraSprite(String(b.ingredients || '').toUpperCase(), `500 40px ${ROBOTO}`, WHITE, 870, 56);
          s.vprices = prices.slice(0, 2).map(q => textSprite([
            { text: q.label, font: `42px ${BEBAS}`, color: WHITE },
            { text: q.price, font: `68px ${ANTON}`, color: YEL },
          ], { gap: 20 }));
          s.vrowname = text(name, `56px ${ANTON}`, YEL);
          s.vrowprices = prices.slice(0, 2).map(q => textSprite([
            { text: q.label, font: `32px ${BEBAS}`, color: WHITE },
            { text: q.price, font: `46px ${ANTON}`, color: YEL },
          ], { gap: 14 }));
          s.vnote = note && prices.length === 1 ? text(note, `32px ${BEBAS}`, WHITE) : null;
        }
        s.menuName = text(name, `72px ${ANTON}`, YEL);
        s.menuPrices = prices.slice(0, 2).map(q => textSprite([
          { text: q.label, font: `40px ${BEBAS}`, color: WHITE },
          { text: q.price, font: `62px ${ANTON}`, color: YEL },
        ], { gap: 14 }));
        s.menuNote = note && prices.length === 1 ? text(note, `38px ${BEBAS}`, WHITE) : null;
        s.menuIng = geom && geom.showIng ? paraSprite(String(b.ingredients || '').toUpperCase(), `500 ${geom.ingFont}px ${ROBOTO}`,
          'rgba(255,255,255,0.82)', geom.textW, geom.ingLH, { align: geom.stacked ? 'center' : 'left', maxLines: 2 }) : null;
        S.b.push(s);
      }
      S.extras = [];
      for (const d of p.extras.items) {
        const raw = d.image ? await this.img(d.image) : d.defaultImage ? img[d.defaultImage] : null;
        const key = d.image ? d.image.length + ':' + d.image.slice(-80) : 'def:' + d.defaultImage;
        S.extras.push({
          photo: raw ? await this.cached('extra:' + key, () => fitH(removeFlatBackground(raw).canvas, 360, 900)) : null,
          name: text(String(d.name).toUpperCase(), `56px ${ANTON}`, WHITE),
          price: text(formatPrice(d.price), `64px ${ANTON}`, YEL),
        });
      }
      this.S = S; this.p = p; this.layout = layout; this.geom = geom; this.ready = true;
      return this;
    }

    async background(logo, vertical = false) {
      const bw = vertical ? PORTRAIT_W : W, bh = vertical ? PORTRAIT_H : H;
      const c = canvas(bw, bh), x = ctx2d(c);
      const id = x.createImageData(bw, bh), d = id.data;
      const r = new Rng(1);
      for (let yy = 0; yy < bh; yy++) {
        for (let xx = 0; xx < bw; xx++) {
          const dd = vertical ? Math.hypot((xx - 620) / 820, (yy - 900) / 1250) : Math.hypot((xx - 1250) / 1100, (yy - 520) / 800);
          const warm = Math.max(0, 1 - dd) ** 1.5;
          const d2 = vertical ? Math.hypot((xx - 540) / 760, (yy - 960) / 1260) : Math.hypot((xx - 960) / 1250, (yy - 540) / 760);
          const v = clamp(1.15 - 0.55 * d2, 0.35, 1);
          const nz = (r.next() + r.next() + r.next() - 1.5) * 3.8;
          const p = (yy * bw + xx) * 4;
          d[p] = (9 + 46 * warm) * v + nz; d[p + 1] = (7 + 24 * warm) * v + nz; d[p + 2] = (6 + 9 * warm) * v + nz; d[p + 3] = 255;
        }
      }
      x.putImageData(id, 0, 0);
      if (logo) {
        const lh = vertical ? 850 : 760, lw = logo.width * lh / logo.height;
        x.save(); x.globalAlpha = 0.045; x.translate(vertical ? 770 : 1880, vertical ? 1050 : 1008); x.rotate(12 * Math.PI / 180);
        x.drawImage(logo, -lw / 2, -lh / 2, lw, lh); x.restore();
      }
      return c;
    }

    async bar(brand, img) {
      const c = canvas(W, 100), x = ctx2d(c);
      const g = x.createLinearGradient(0, 0, 0, 100);
      g.addColorStop(0, 'rgba(0,0,0,0.47)'); g.addColorStop(1, 'rgba(0,0,0,0.88)');
      x.fillStyle = g; x.fillRect(0, 0, W, 100);
      x.fillStyle = 'rgba(245,184,46,0.55)'; x.fillRect(0, 0, W, 2);
      const put = (s, px) => { if (s) x.drawImage(s, Math.round(px), Math.round(52 - s.height / 2)); return s ? s.width : 0; };
      let px = 60;
      if (brand.phone) {
        put(await fitH(img.i_wa, 54), px);
        px = 128 + put(text(brand.phone, `40px ${ANTON}`, WHITE, { shadow: false }), 128) + 60;
      }
      if (brand.web) {
        px = Math.max(px, 560);
        put(await fitH(img.i_tiktok, 46), px);
        put(instagramIcon(48), px + 58);
        put(text(brand.web, `40px ${ANTON}`, WHITE, { shadow: false }), px + 122);
      }
      return c;
    }

    async verticalBar(brand, img) {
      const c = canvas(PORTRAIT_W, 142), x = ctx2d(c);
      const g = x.createLinearGradient(0, 0, 0, 142);
      g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(1, 'rgba(0,0,0,0.94)');
      x.fillStyle = g; x.fillRect(0, 0, PORTRAIT_W, 142);
      x.fillStyle = 'rgba(245,184,46,0.65)'; x.fillRect(0, 0, PORTRAIT_W, 3);
      const phone = brand.phone ? text(brand.phone, `42px ${ANTON}`, WHITE, { shadow: false }) : null;
      const web = brand.web ? text(brand.web, `38px ${ANTON}`, WHITE, { shadow: false }) : null;
      if (phone) {
        const wa = await fitH(img.i_wa, 48);
        const scale = Math.min(1, 940 / (wa.width + 18 + phone.width));
        const full = (wa.width + 18 + phone.width) * scale;
        x.drawImage(wa, (PORTRAIT_W - full) / 2, 26, wa.width * scale, wa.height * scale);
        x.drawImage(phone, (PORTRAIT_W - full) / 2 + (wa.width + 18) * scale, 26 + (48 - phone.height * scale) / 2, phone.width * scale, phone.height * scale);
      }
      if (web) {
        // TikTok + Instagram + web centrados en una línea
        const tk = await fitH(img.i_tiktok, 40), ig = instagramIcon(42);
        const full = tk.width + 12 + ig.width + 18 + web.width, scale = Math.min(1, 940 / full);
        const y = phone ? 84 : 53, cy = y + web.height * scale / 2;
        let px = (PORTRAIT_W - full * scale) / 2;
        x.drawImage(tk, px, cy - tk.height * scale / 2, tk.width * scale, tk.height * scale); px += (tk.width + 12) * scale;
        x.drawImage(ig, px, cy - ig.height * scale / 2, ig.width * scale, ig.height * scale); px += (ig.width + 18) * scale;
        x.drawImage(web, px, y, web.width * scale, web.height * scale);
      }
      return c;
    }

    // ------------------------------------------------------------ efectos por frame
    periodic(t, n, life, seed, cb) {
      const L = this.duration, k = Math.max(1, Math.round(L / life)), le = L / k;
      for (let i = 0; i < n; i++) {
        const off = (i / n) * le + rnd(seed, i, 'o').next() * le / n;
        const tt = t + off;
        const cyc = ((Math.floor(tt / le) % k) + k) % k;
        const u = (tt % le) / le;
        cb(i, u, rnd(seed, i, cyc));
      }
    }
    puff(ctx, v, x, y, size, op) {
      if (op < 0.004 || size < 4) return;
      ctx.globalAlpha = Math.min(1, op);
      ctx.drawImage(this.fx.steam[v & 7], x - size / 2, y - size / 2, size, size);
    }
    steam(ctx, t, cx, top, bw, op, o = {}) {
      if (!this.p.effects.steam || op <= 0.003) return;
      const n = o.n || 44, rise = o.rise || 400, s0 = (o.size || [60, 250])[0], s1 = (o.size || [60, 250])[1];
      ctx.save();
      this.periodic(t, n, o.life || 4, o.seed || 'st', (i, u, r) => {
        const x0 = cx + r.u(-0.33, 0.33) * bw, y0 = top + r.u(0.12, 0.28) * bw * 0.7;
        const sway = r.u(15, 45), ph = r.u(0, 6.28);
        const x = x0 + Math.sin(u * 5 + ph) * sway + (x0 - cx) * 0.6 * u;
        const y = y0 - u * rise * r.u(0.75, 1.1);
        const sz = s0 + (s1 - s0) * u ** 0.8;
        const a = Math.sin(Math.PI * u) ** 1.5 * 0.32 * op;
        const v = r.int(0, 8);
        this.puff(ctx, v, x, y, sz * r.u(0.85, 1.15), a);
      });
      ctx.restore();
    }
    embers(ctx, t) {
      if (!this.p.effects.embers) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      this.periodic(t, 46, 5, 'ember', (i, u, r) => {
        const x0 = r.u(0, this.width), sway = r.u(20, 70), ph = r.u(0, 6.28);
        const y = this.height + 20 - u * r.u(this.vertical ? 1100 : 650, this.vertical ? 1900 : 1100);
        const x = x0 + Math.sin(u * 6.28 * r.u(0.6, 1.6) + ph) * sway + u * r.u(-60, 60);
        const fl = 0.6 + 0.4 * Math.sin(t * r.u(8, 16) + ph);
        const a = Math.sin(Math.PI * u) ** 0.8 * fl;
        const tone = r.int(0, 5); r.next();
        const sz = 41 * r.u(0.6, 1.25);
        if (a <= 0.003) return;
        ctx.globalAlpha = Math.min(1, a * 1.1);
        ctx.drawImage(this.fx.ember[tone], x - sz / 2, y - sz / 2, sz, sz);
      });
      ctx.restore();
    }
    fire(ctx, t) {
      if (!this.p.effects.fire) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      this.periodic(t, 70, 1.5, 'fire', (i, u, r) => {
        const x = (i + r.u(-0.5, 0.5)) / 70 * (this.width + 100) - 50;
        const y = this.height + 30 - u * r.u(90, 170);
        const s = r.u(0.7, 1.3) * (1 - 0.5 * u) * 121;
        const a = Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u) * 0.42;
        if (a <= 0.003) return;
        ctx.globalAlpha = a;
        ctx.drawImage(this.fx.fire[Math.min(7, Math.floor(u * 8))], x - s / 2, y - s / 2, s, s);
      });
      ctx.restore();
    }
    glow(ctx, x, y, w, h, gain) {
      if (!this.p.effects.glow || gain <= 0.003) return;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, gain);
      ctx.drawImage(this.fx.glow, x - w / 2, y - h / 2, w, h);
      ctx.restore();
    }
    ring(ctx, cx, cy, u, rmax, gain = 0.8) {
      if (!this.p.effects.rays || u <= 0 || u >= 1) return;
      const r = 30 + eOut(u) * rmax;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = gain * (1 - u);
      ctx.strokeStyle = 'rgb(255,200,80)'; ctx.lineWidth = Math.max(2, 14 * (1 - u));
      ctx.shadowColor = 'rgb(255,200,80)'; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    dropBurger(ctx, spr, cx, bottom, tau, t, o = {}) {
      if (!spr) return;
      const idle = o.idle === undefined ? 1 : o.idle, op = o.op === undefined ? 1 : o.op;
      const tLand = o.tLand || 0.55, t0 = 0.12, sc = o.sc || 1;
      if (tau < t0) return;
      let sx = 1, sy = 1, off = 0, air = 0;
      if (tau < tLand) { const u = prog(tau, t0, tLand); off = -(1 - eIn(u)) * 760; air = 1 - eIn(u); }
      else if (this.p.effects.shake) { const dd = tau - tLand, sq = 0.16 * Math.exp(-dd * 6.5) * Math.cos(dd * 20); sy = 1 - sq; sx = 1 + sq * 0.75; }
      const br = 1 + 0.012 * Math.sin(2 * Math.PI * t / 3) * idle;
      const ang = 0.9 * Math.sin(2 * Math.PI * t / 6) * idle;
      sx *= br * sc; sy *= br * sc;
      const w = spr.width, h = spr.height;
      ctx.save();
      ctx.globalAlpha = 0.75 * op;
      const sw = w * sc * (0.95 - 0.5 * air), shh = 60 * (1 - 0.5 * air) + 1;
      ctx.drawImage(this.fx.shadow, cx - sw / 2, bottom - 6 - shh / 2, sw, shh);
      ctx.globalAlpha = op;
      ctx.translate(cx, bottom + off);
      ctx.rotate(ang * Math.PI / 180);
      ctx.scale(sx, sy);
      ctx.drawImage(spr, -w / 2, -h);
      ctx.restore();
    }
    impactPuffs(ctx, tau, cx, bottom, bw, tLand, seed) {
      if (!this.p.effects.steam) return;
      const d = tau - tLand;
      if (d < 0 || d > 1.1) return;
      const u = d / 1.1;
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const r = rnd('imp', seed, i), side = i % 2 ? -1 : 1;
        const x = cx + side * (bw * 0.35 + eOut(u) * r.u(120, 260));
        const y = bottom - 10 - eOut(u) * r.u(10, 70);
        this.puff(ctx, i % 8, x, y, 60 + 160 * u, (1 - u) ** 1.5 * 0.35);
      }
      ctx.restore();
    }

    // ------------------------------------------------------------ escenas
    intro(ctx, t, tl) {
      const S = this.S, tau = t, out = 1 - prog(tau, tl.I - 0.5, tl.I);
      const rin = eOut(prog(tau, 0.1, 0.8)) * out;
      if (rin > 0 && this.p.effects.rays) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 * rin;
        ctx.translate(960, 420); ctx.rotate(tau * 9 * Math.PI / 180);
        ctx.drawImage(this.fx.rays, -1150, -1150, 2300, 2300); ctx.restore();
      }
      this.glow(ctx, 960, 420, 1000, 760, 0.5 * rin);
      const u = prog(tau, 0.15, 0.85);
      if (u > 0) {
        const sc = Math.max(0.01, eBack(u, 2.2)) * (1 + 0.02 * Math.sin(tau * 3.2));
        this.steam(ctx, t, 960, 270, 330, eOut(prog(tau, 0.8, 1.6)) * out, { n: 18, rise: 300, size: [60, 200], seed: 'sti' });
        draw(ctx, S.logo_big, 960, 410 + 6 * Math.sin(tau * 2.4), { a: out, sx: sc, rot: 3 * Math.sin(tau * 2) });
      }
      this.ring(ctx, 960, 420, prog(tau, 0.55, 1.35), 520);
      const un = eOut(prog(tau, 0.65, 1.15));
      draw(ctx, S.name_big, 960, 690 + (1 - un) * 80, { a: un * out, sx: S.name_big_sc || 1 });
      const uw = eOut(prog(tau, 1.25, 1.95));
      if (uw > 0 && S.script_big) {
        const sb = S.script_big, w = sb.width, cut = w * uw;
        const shake = tau > 1.95 ? Math.sin(tau * 40) * 3 * (1 - prog(tau, 1.95, 2.3)) : 0;
        ctx.save(); ctx.globalAlpha = out;
        const x0 = 960 + shake - w / 2, y0 = 868 - sb.height / 2;
        ctx.beginPath(); ctx.rect(x0, y0, cut, sb.height); ctx.clip();
        ctx.drawImage(sb, x0, y0); ctx.restore();
        if (tau > 1.25 && tau < 2.1) draw(ctx, this.fx.spark, x0 + cut, 868, { a: 1, sx: 1.4, add: true });
      }
    }

    leftPanel(ctx, ts, k, tau, tl) {
      const S = this.S, n = tl.n;
      const inn = eOut(prog(ts, 0, 0.6)), outp = eInOut(prog(ts, n * tl.B - 0.6, n * tl.B));
      if (inn <= 0 || outp >= 1) return;
      const X = 40 - (1 - inn) * 900 - outp * 900;
      draw(ctx, S.panel, X, 150, { anchor: 'tl' });
      draw(ctx, S.logo_sm, X + 60, 72);
      draw(ctx, S.name_sm, X + 112, 72, { anchor: 'l', sx: S.name_sm_sc || 1 });
      draw(ctx, S.orn, X + 400, 192);
      draw(ctx, S.title, X + 400, 262);
      draw(ctx, S.fries, X + 82, 350);
      draw(ctx, S.combo, X + 116, 350, { anchor: 'l', sx: S.combo && S.combo.width > 640 ? 640 / S.combo.width : 1 });
      const ROW0 = 400, RH = Math.min(136, 544 / n), rs = RH / 136;
      const u = eOut(prog(tau, 0, 0.45));
      const prev = k > 0 ? k - 1 : 0;
      const hy = ROW0 + (prev + (k - prev) * u) * RH;
      draw(ctx, S.hl, X + 8, hy + 2 * rs, { anchor: 'tl', a: k > 0 ? 1 : u, sx: 1, sy: rs });
      for (let i = 0; i < n; i++) {
        const b = S.b[i];
        const y = ROW0 + i * RH + RH / 2 + 4 * rs;
        const rin = eOut(prog(ts, 0.25 + 0.1 * i, 0.75 + 0.1 * i));
        const act = k === 0 && i === 0 ? u : i === k ? u : i === prev && k > 0 ? 1 - u : 0;
        const op = rin * (0.5 + 0.5 * act), sh = 14 * act;
        draw(ctx, b.icon, X + 58 + sh, y, { a: op, sx: rs });
        draw(ctx, b.rname, X + 102 + sh, y, { a: op, anchor: 'l', sx: rs * (b.rname_sc || 1), sy: rs * (b.rname_sc || 1) });
        const pl = b.rprices;
        if (pl.length === 1) draw(ctx, pl[0], X + 772, y, { a: op, anchor: 'r', sx: rs });
        else if (pl.length > 1) {
          draw(ctx, pl[0], X + 772, y - 26 * rs, { a: op, anchor: 'r', sx: rs });
          draw(ctx, pl[1], X + 772, y + 28 * rs, { a: op, anchor: 'r', sx: rs });
        }
      }
    }

    spot(ctx, t, tl) {
      const ts = t - tl.T_SPOT, B = tl.B;
      const k = Math.min(tl.n - 1, Math.floor(ts / B)), tau = ts - k * B;
      const b = this.S.b[k];
      if (!b) return;
      const out = eInOut(prog(tau, B - 0.65, B - 0.05));
      const spr = b.spot, h = spr ? spr.height : 400, w = spr ? spr.width : 500;
      const CX = 1330, bottom = 868, top = bottom - h;
      let shx = 0, shy = 0;
      const sk = tau - 0.55;
      if (this.p.effects.shake && sk > 0 && sk < 0.3) { shx = Math.sin(sk * 90) * 7 * (1 - sk / 0.3); shy = Math.cos(sk * 70) * 5 * (1 - sk / 0.3); }
      const fl = 0.62 + 0.08 * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 12.3 + 1) + 0.05 * Math.sin(t * 3.3);
      const gin = eOut(prog(tau, 0.4, 1.0)) * (1 - out);
      this.glow(ctx, CX, bottom - h / 2 + 20, 1000, 760, fl * gin);
      this.steam(ctx, t, CX, top, w, eOut(prog(tau, 0.6, 1.6)) * (1 - eOut(prog(tau, B - 1.1, B - 0.4))), { seed: 'spot' + k });
      if (out < 1) this.dropBurger(ctx, spr, CX + shx, bottom + shy + out * 40 - out * h * 0.125, tau, t, { op: 1 - out, sc: 1 - 0.25 * out });
      this.impactPuffs(ctx, tau, CX, bottom, w, 0.55, k);
      this.steam(ctx, t + 1.3, CX, top + 0.1 * h, w * 0.8, 0.45 * eOut(prog(tau, 1.0, 2.0)) * (1 - out), { n: 8, rise: 220, size: [50, 150], seed: 'front' + k, life: 3 });
      const u = eBack(prog(tau, 0.05, 0.6), 1.4);
      draw(ctx, b.name, 1390 + (1 - u) * 700 - out * 300 + shx, 128 + shy, { a: clamp(u * 1.5) * (1 - out) });
      const ui = eOut(prog(tau, 0.35, 0.95));
      draw(ctx, b.ing, 1390, 262 + (1 - ui) * 30 + (b.ing ? Math.max(0, b.ing.height - 132) / 2 : 0), { a: ui * (1 - out) });
      const ub = prog(tau, 0.85, 1.45);
      if (ub > 0 && b.burst_pr) {
        const sc = eElastic(ub) * (1 + 0.045 * Math.sin(2 * Math.PI * t * 1.1)) * (1 - 0.6 * out);
        const bx = 1690 + shx, by = 560 + shy;
        draw(ctx, this.S.burst, bx, by, { a: 1 - out, sx: sc, rot: t * 14 });
        draw(ctx, b.burst_lab, bx, by - 46 * sc, { a: 1 - out, sx: sc });
        draw(ctx, b.burst_pr, bx, by + 18 * sc, { a: 1 - out, sx: sc * (b.burst_pr_sc || 1), sy: sc * (b.burst_pr_sc || 1) });
        this.ring(ctx, bx, by, prog(tau, 0.95, 1.6), 260, 0.6);
      }
      const up = eBack(prog(tau, 1.2, 1.7), 1.6);
      if (up > 0 && b.pill) {
        const px = 1690 + (1 - up) * 400 + out * 400 - Math.max(0, b.pillbg.width - 440) / 2;
        draw(ctx, b.pillbg, px, 800, { a: clamp(up) * (1 - out) });
        draw(ctx, b.pill, px, 800, { a: clamp(up) * (1 - out) });
      }
      this.leftPanel(ctx, ts, k, tau, tl);
    }

    grid(ctx, t, tl) {
      const S = this.S, G = tl.G, n = tl.n, tau = t - tl.T_GRID;
      const out = eInOut(prog(tau, G - 0.6, G)), o = 1 - out;
      const u = eOut(prog(tau, 0, 0.5));
      draw(ctx, S.orn_g, 960, 46 - (1 - u) * 40, { a: u * o });
      draw(ctx, S.title_g, 960, 124 - (1 - u) * 40, { a: u * o });
      const uc = eOut(prog(tau, 0.3, 0.8));
      if (S.combo_g) {
        const cw = S.combo_g.width;
        draw(ctx, S.fries_g, 960 - cw / 2 - 30, 238, { a: uc * o });
        draw(ctx, S.combo_g, 960 + 14, 238, { a: uc * o });
      }
      const gs = Math.min(1, 4 / n), period = 1.3 * n;
      for (let i = 0; i < n; i++) {
        const b = S.b[i], cx = (i + 0.5) * W / n + (n === 4 ? [10, 3, -4, -10][i] : 0);
        const spr = b.grid, h = spr ? spr.height : 200, w = spr ? spr.width : 300;
        const bottom = 640, tl0 = 0.25 + 0.17 * i * Math.min(1, 4 / n);
        let pulse = 0;
        if (tau > 1.4) { const ph = ((tau - 1.4) % period) - 1.3 * i; if (ph >= 0 && ph < 1.3) pulse = Math.sin(Math.PI * ph / 1.3); }
        const fl = 0.42 + 0.05 * Math.sin(t * 7 + i) + 0.35 * pulse;
        this.glow(ctx, cx, bottom - h / 2 + 10, 520 * gs, 420 * gs, fl * eOut(prog(tau, tl0 + 0.3, tl0 + 0.8)) * o);
        this.steam(ctx, t, cx, bottom - h, w, eOut(prog(tau, tl0 + 0.4, tl0 + 1.2)) * (1 - eOut(prog(tau, G - 1.0, G - 0.3))), { n: 20, rise: 240, size: [40 * gs, 170 * gs], seed: 'grid' + i, life: 3 });
        this.dropBurger(ctx, spr, cx, bottom, tau - tl0 + 0.12, t + i, { idle: 0.7, op: o, tLand: 0.5, sc: 1 + 0.06 * pulse });
        this.impactPuffs(ctx, tau - tl0 + 0.12, cx, bottom, w * 0.7, 0.5, 10 + i);
        const ut = eOut(prog(tau, tl0 + 0.5, tl0 + 1.0)) * o;
        draw(ctx, b.icon_s, cx, 700 - (1 - ut) * 30, { a: ut });
        draw(ctx, b.gname, cx, 762 - (1 - ut) * 30, { a: ut, sx: b.gname_sc || 1 });
        const up = eOut(prog(tau, tl0 + 0.7, tl0 + 1.2)) * o;
        if (b.gprices[0]) draw(ctx, b.gprices[0], cx, 836 - (1 - up) * 30, { a: up });
        if (b.gprices[1]) draw(ctx, b.gprices[1], cx, 892 - (1 - up) * 30, { a: up });
      }
    }

    verticalHeader(ctx, alpha = 1) {
      const S = this.S;
      draw(ctx, S.logo_v, 132, 106, { a: alpha });
      drawFit(ctx, S.name_v, 222, 106, 800, 84, { anchor: 'l', a: alpha });
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(245,184,46,0.55)'; ctx.fillRect(64, 187, 952, 2);
      ctx.restore();
    }

    introVertical(ctx, t, tl) {
      const S = this.S, out = 1 - prog(t, tl.I - 0.5, tl.I);
      const u = eOut(prog(t, 0.15, 0.95));
      this.glow(ctx, 540, 730, 1000, 1040, 0.5 * u * out);
      if (this.p.effects.rays) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.15 * u * out;
        ctx.translate(540, 730); ctx.rotate(t * 8 * Math.PI / 180);
        ctx.drawImage(this.fx.rays, -830, -830, 1660, 1660); ctx.restore();
      }
      drawFit(ctx, S.logo_big, 540, 690 + (1 - u) * 80, 710, 700, { a: u * out, sx: u });
      this.ring(ctx, 540, 700, prog(t, 0.55, 1.45), 560);
      const un = eOut(prog(t, 0.6, 1.3));
      drawFit(ctx, S.name_big, 540, 1110 + (1 - un) * 60, 900, 190, { a: un * out });
      const us = eOut(prog(t, 1.1, 1.9));
      drawFit(ctx, S.script_v, 540, 1335, 850, 180, { a: us * out });
      drawFit(ctx, S.combo_v, 540, 1570, 900, 130, { a: eOut(prog(t, 1.5, 2.2)) * out });
    }

    spotVertical(ctx, t, tl) {
      const ts = t - tl.T_SPOT, k = Math.min(tl.n - 1, Math.floor(ts / tl.B));
      const tau = ts - k * tl.B, b = this.S.b[k];
      if (!b) return;
      const out = eInOut(prog(tau, tl.B - 0.65, tl.B - 0.05)), op = 1 - out;
      this.verticalHeader(ctx, op);
      const un = eOut(prog(tau, 0.1, 0.7)) * op;
      drawFit(ctx, b.vname, 540, 300 + (1 - un) * 52, 946, 128, { a: un });
      drawFit(ctx, b.ving, 540, 470 + (1 - un) * 35, 890, 220, { a: un });
      const spr = b.spot, maxw = 800, maxh = 660;
      const sc = spr ? Math.min(1.35, maxw / spr.width, maxh / spr.height) : 1;
      const bottom = 1220, top = bottom - (spr ? spr.height * sc : 530);
      this.glow(ctx, 540, 920, 1050, 880, 0.62 * eOut(prog(tau, 0.35, 1.0)) * op);
      this.steam(ctx, t, 540, top + 60, spr ? spr.width * sc : 640, eOut(prog(tau, 0.6, 1.5)) * op, { seed: 'vspot' + k, n: 34, rise: 470 });
      this.dropBurger(ctx, spr, 540, bottom, tau, t, { op, sc });
      this.impactPuffs(ctx, tau, 540, bottom, spr ? spr.width * sc : 600, 0.55, k);
      const up = eOut(prog(tau, 0.85, 1.45)) * op;
      if (up > 0) {
        ctx.save(); ctx.globalAlpha = up;
        ctx.fillStyle = 'rgba(13,10,8,0.90)'; ctx.strokeStyle = 'rgba(245,184,46,0.50)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(64, 1286, 952, 248, 24); ctx.fill(); ctx.stroke();
        ctx.restore();
        const ps = b.vprices;
        if (ps.length === 1) drawFit(ctx, ps[0], 540, 1409, 870, 115, { a: up });
        else {
          drawFit(ctx, ps[0], 540, 1352, 870, 100, { a: up });
          drawFit(ctx, ps[1], 540, 1462, 870, 100, { a: up });
        }
      }
      if (b.vnote) drawFit(ctx, b.vnote, 540, 1585, 880, 60, { a: up });
      ctx.save(); ctx.globalAlpha = op;
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `38px ${BEBAS}`;
      ctx.textAlign = 'center'; ctx.fillText(`${String(k + 1).padStart(2, '0')}  /  ${String(tl.n).padStart(2, '0')}`, 540, 1696);
      ctx.fillStyle = 'rgba(245,184,46,0.22)'; ctx.fillRect(200, 1720, 680, 4);
      ctx.fillStyle = YEL; ctx.fillRect(200, 1720, 680 * (k + clamp(tau / tl.B)) / tl.n, 4);
      ctx.restore();
    }

    gridVertical(ctx, t, tl) {
      const S = this.S, tau = t - tl.T_GRID;
      const out = 1 - eInOut(prog(tau, tl.G - 0.6, tl.G));
      this.verticalHeader(ctx, out);
      const u = eOut(prog(tau, 0, 0.6)) * out;
      drawFit(ctx, S.title_v, 540, 254 + (1 - u) * 40, 930, 132, { a: u });
      drawFit(ctx, S.combo_v, 540, 341, 920, 78, { a: eOut(prog(tau, 0.25, 0.8)) * out });
      const n = tl.n, top = 408, rowH = 1340 / n;
      if (n === 1) {
        const b = S.b[0], a = eOut(prog(tau, 0.3, 1.0)) * out;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(22,16,12,0.88)'; ctx.strokeStyle = 'rgba(245,184,46,0.42)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(54, 432, 972, 1280, 24); ctx.fill(); ctx.stroke();
        ctx.restore();
        this.glow(ctx, 540, 910, 940, 700, 0.42 * a);
        drawFit(ctx, b.spot, 540, 936, 770, 690, { a });
        drawFit(ctx, b.vname, 540, 1304, 910, 110, { a });
        if (b.vprices[0]) drawFit(ctx, b.vprices[0], 540, 1415, 850, 100, { a });
        if (b.vprices[1]) drawFit(ctx, b.vprices[1], 540, 1528, 850, 100, { a });
        else if (b.vnote) drawFit(ctx, b.vnote, 540, 1530, 850, 75, { a });
        return;
      }
      for (let i = 0; i < n; i++) {
        const b = S.b[i], y = top + i * rowH;
        const a = eOut(prog(tau, 0.2 + i * 0.12, 0.75 + i * 0.12)) * out;
        if (a <= 0) continue;
        ctx.save(); ctx.globalAlpha = a;
        ctx.fillStyle = i % 2 ? 'rgba(14,11,9,0.84)' : 'rgba(32,24,16,0.84)';
        ctx.beginPath(); ctx.roundRect(54, y + 4, 972, rowH - 12, 18); ctx.fill();
        ctx.fillStyle = 'rgba(245,184,46,0.55)'; ctx.fillRect(54, y + 24, 4, rowH - 52);
        ctx.restore();
        if (n === 2) {
          drawFit(ctx, b.spot, 540, y + 224, 600, 350, { a });
          drawFit(ctx, b.vname, 540, y + 447, 890, 90, { a });
          if (b.vprices[0]) drawFit(ctx, b.vprices[0], 540, y + 535, 850, 78, { a });
          if (b.vprices[1]) drawFit(ctx, b.vprices[1], 540, y + 611, 850, 78, { a });
          else if (b.vnote) drawFit(ctx, b.vnote, 540, y + 611, 840, 60, { a });
          continue;
        }
        const imageH = Math.min(290, rowH - 28);
        drawFit(ctx, b.spot, 198, y + rowH / 2, 276, imageH, { a });
        const textY = y + (rowH - Math.min(172, rowH - 20)) / 2;
        drawFit(ctx, b.vrowname, 352, textY + 31, 636, 70, { anchor: 'l', a });
        const ps = b.vrowprices;
        if (ps[0]) drawFit(ctx, ps[0], 352, textY + 89, 630, 57, { anchor: 'l', a });
        if (ps[1]) drawFit(ctx, ps[1], 352, textY + 141, 630, 57, { anchor: 'l', a });
        else if (b.vnote) drawFit(ctx, b.vnote, 352, textY + 141, 620, 45, { anchor: 'l', a });
      }
    }

    menuFocus(t, tl) {
      if (t < tl.T_SPOT || t >= tl.T_GRID) return { index: -1, amount: 0 };
      const ts = t - tl.T_SPOT, index = Math.min(tl.n - 1, Math.floor(ts / tl.B));
      const tau = ts - index * tl.B;
      const fade = Math.min(0.28, tl.B * 0.22);
      return { index, amount: eOut(prog(tau, 0, fade)) * (1 - eInOut(prog(tau, tl.B - fade, tl.B))) };
    }

    menuPrice(ctx, spr, x, y, maxw, maxh, anchor, emphasis = 0) {
      if (!spr) return;
      const s = Math.min(1, maxw / spr.width, maxh / spr.height);
      if (emphasis > 0) {
        const w = spr.width * s + 26, h = spr.height * s + 12;
        const left = anchor === 'l' ? x - 12 : x - w / 2;
        ctx.save();
        ctx.fillStyle = `rgba(245,184,46,${0.09 + emphasis * 0.16})`;
        ctx.strokeStyle = `rgba(245,184,46,${0.35 + emphasis * 0.6})`;
        ctx.lineWidth = 2 + emphasis * 2;
        ctx.beginPath(); ctx.roundRect(left, y - h / 2, w, h, 10); ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      drawFit(ctx, spr, x, y, maxw, maxh, { anchor });
    }

    menuCardFrame(ctx, x, y, w, h, focus, index) {
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, focus > 0 ? '#352311' : index % 2 ? '#17110d' : '#201710');
      g.addColorStop(1, '#100c0a');
      ctx.fillStyle = g;
      ctx.strokeStyle = `rgba(245,184,46,${0.16 + focus * 0.78})`;
      ctx.lineWidth = 2 + focus * 3;
      ctx.shadowColor = `rgba(245,184,46,${focus * 0.45})`;
      ctx.shadowBlur = focus * 36;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = YEL; ctx.globalAlpha = 0.45 + focus * 0.55;
      ctx.fillRect(x + 2, y + 20, 5 + focus * 5, h - 40);
      ctx.globalAlpha = 1;
    }

    // Precios lado a lado (o precio + nota) en una sola fila.
    priceRow(ctx, b, x, y, maxW, maxH, center, focus) {
      const items = b.menuPrices.filter(Boolean).map((spr, j) => ({ spr, emph: b.emphasisPrice === j ? 0.25 + 0.75 * focus : 0, h: maxH }));
      if (items.length === 1 && b.menuNote) items.push({ spr: b.menuNote, emph: 0, h: maxH * 0.78 });
      if (!items.length) return;
      const gap = 30;
      const ws = items.map(it => it.spr.width * Math.min(1, it.h / it.spr.height));
      const total = ws.reduce((a, v) => a + v, 0) + gap * (items.length - 1);
      const k = Math.min(1, maxW / total);
      let px = center ? x - total * k / 2 : x;
      items.forEach((it, j) => {
        const w = ws[j] * k;
        this.menuPrice(ctx, it.spr, px, y, w, it.h * k, 'l', it.emph);
        px += w + gap * k;
      });
    }

    menuCard(ctx, b, i, r, focus) {
      const { x, y, w, h } = r, g = this.geom;
      const scale = 1 + 0.03 * focus, cx = x + w / 2, cy = y + h / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale); ctx.translate(-cx, -cy);
      this.menuCardFrame(ctx, x, y, w, h, focus, i);
      this.glow(ctx, x + g.img.cx, y + g.img.cy, g.img.w * 1.5, g.img.h * 1.3, 0.35 * focus);
      drawFit(ctx, b.spot, x + g.img.cx, y + g.img.cy, g.img.w, g.img.h, { sx: 1 + 0.05 * focus });
      const tx = x + g.textX, anchor = g.stacked ? 'c' : 'l';
      drawFit(ctx, b.menuName, tx, y + g.nameY, g.textW + 40, g.nameH, { anchor });
      if (b.menuIng) {
        const s = Math.min(1, (g.textW + 40) / b.menuIng.width);
        draw(ctx, b.menuIng, g.stacked ? tx : tx - 20 * s + 6, y + g.ingTop - 18 * s, { anchor: g.stacked ? 'tc' : 'tl', sx: s });
      }
      this.priceRow(ctx, b, g.stacked ? tx : tx + 6, y + g.priceY, g.textW, g.priceH, g.stacked, focus);
      const ic = Math.min(64, h * 0.22);
      if (focus > 0.2) drawFit(ctx, b.icon, g.stacked ? x + w - 42 : x + 18 + ic / 2, y + 16 + ic / 2, ic, ic, { a: focus });
      ctx.restore();
    }

    menuCards(ctx, t, tl) {
      const focus = this.menuFocus(t, tl), cards = this.layout.cards;
      for (let i = 0; i < cards.length; i++) if (i !== focus.index) this.menuCard(ctx, this.S.b[i], i, cards[i], 0);
      if (focus.index >= 0 && cards[focus.index]) this.menuCard(ctx, this.S.b[focus.index], focus.index, cards[focus.index], focus.amount);
    }

    // Mismo tamaño y posición de texto para todas las celdas del apartado.
    extraStyle(items, w, h) {
      const anyPhoto = items.some(d => d.photo), maxW = w - 16, PAD = 40;
      const ink = s => s.height - PAD;
      const lineH = Math.min(58, h * (anyPhoto ? 0.25 : 0.4));
      const base = Math.min(...items.map(d => Math.min(1, lineH / ink(d.price))));
      const one = Math.min(base, ...items.map(d => (maxW + PAD) / (d.name.width + d.price.width)));
      if (one >= 0.62 * base) return { anyPhoto, twoLines: false, one, textH: Math.max(...items.map(d => ink(d.price))) * one + 8 };
      const ns = Math.min(...items.map(d => Math.min(lineH * 0.7 / ink(d.name), (maxW + PAD) / d.name.width)));
      const ps = Math.min(...items.map(d => Math.min(lineH * 0.8 / ink(d.price), (maxW + PAD) / d.price.width)));
      const nameInk = Math.max(...items.map(d => ink(d.name))) * ns, priceInk = Math.max(...items.map(d => ink(d.price))) * ps;
      return { anyPhoto, twoLines: true, ns, ps, nameInk, priceInk, textH: nameInk + 12 + priceInk + 8 };
    }

    // Una celda de extra: foto arriba y "NOMBRE  $PRECIO" abajo (o en dos líneas si no cabe).
    extraCell(ctx, d, x, y, w, h, st) {
      const cx = x + w / 2;
      const photoH = st.anyPhoto ? h - st.textH - 18 : 0;
      if (d.photo) drawFit(ctx, d.photo, cx, y + 6 + photoH / 2, w - 20, photoH);
      const ty = st.anyPhoto ? y + h - st.textH : y + (h - st.textH) / 2;
      if (!st.twoLines) {
        const tw = (d.name.width + d.price.width) * st.one, lx = cx - tw / 2, ly = ty + st.textH / 2;
        draw(ctx, d.name, lx, ly, { anchor: 'l', sx: st.one });
        draw(ctx, d.price, lx + d.name.width * st.one, ly, { anchor: 'l', sx: st.one });
      } else {
        draw(ctx, d.name, cx, ty + st.nameInk / 2, { sx: st.ns });
        draw(ctx, d.price, cx, ty + st.nameInk + 12 + st.priceInk / 2, { sx: st.ps });
      }
    }

    menuExtras(ctx, r) {
      const S = this.S, items = S.extras, m = items.length;
      if (!m) return;
      const { x, y, w, h, mode } = r;
      ctx.save();
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(30,21,13,0.94)'); g.addColorStop(1, 'rgba(12,9,7,0.94)');
      ctx.fillStyle = g; ctx.strokeStyle = 'rgba(245,184,46,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y, w, h, 22); ctx.fill(); ctx.stroke();
      ctx.restore();
      const sep = (x0, y0, x1, y1) => {
        ctx.save(); ctx.strokeStyle = 'rgba(245,184,46,0.22)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
      };
      if (mode === 'bottom') {
        // título a la izquierda, extras en una fila
        const head = 268;
        drawFit(ctx, S.extraTitle, x + 26, y + h / 2 - (S.extraNote ? 26 : 0), head - 40, 104, { anchor: 'l' });
        if (S.extraNote) drawFit(ctx, S.extraNote, x + 26, y + h / 2 + 40, head - 40, 60, { anchor: 'l' });
        ctx.save(); ctx.fillStyle = YEL; ctx.globalAlpha = 0.85; ctx.fillRect(x + head - 4, y + 26, 4, h - 52); ctx.restore();
        const x0 = x + head + 10, cw = (w - head - 22) / m, st = this.extraStyle(items, cw - 12, h - 28);
        items.forEach((d, i) => {
          if (i) sep(x0 + i * cw, y + 30, x0 + i * cw, y + h - 30);
          this.extraCell(ctx, d, x0 + i * cw + 6, y + 14, cw - 12, h - 28, st);
        });
        return;
      }
      // título arriba centrado (columna derecha o vertical)
      const headH = S.extraNote ? 120 : 88;
      drawFit(ctx, S.extraTitle, x + w / 2, y + (S.extraNote ? 44 : 50), w - 40, S.extraNote ? 86 : 98);
      if (S.extraNote) drawFit(ctx, S.extraNote, x + w / 2, y + 90, w - 40, 54);
      sep(x + 40, y + headH - 6, x + w - 40, y + headH - 6);
      const cols = mode === 'right' ? 1 : Math.min(3, m), rows = Math.ceil(m / cols);
      const cw = (w - 24) / cols, rh = (h - headH - 12) / rows, st = this.extraStyle(items, cw - 12, rh - 16);
      items.forEach((d, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const inRow = Math.min(cols, m - row * cols), shift = (cols - inRow) * cw / 2;
        const cx = x + 12 + shift + col * cw, cy = y + headH + row * rh;
        if (mode === 'right' && i) sep(x + 40, cy, x + w - 40, cy);
        if (mode !== 'right' && col) sep(cx, cy + 20, cx, cy + rh - 20);
        this.extraCell(ctx, d, cx + 6, cy + 8, cw - 12, rh - 16, st);
      });
    }

    menuVertical(ctx, t, tl) {
      const S = this.S;
      this.verticalHeader(ctx);
      drawFit(ctx, S.title_v, 540, 258, 930, 116);
      drawFit(ctx, S.combo_v, 540, 350, 920, 76);
      this.menuCards(ctx, t, tl);
      if (this.layout.extras) this.menuExtras(ctx, this.layout.extras);
    }

    menuHorizontal(ctx, t, tl) {
      const S = this.S;
      draw(ctx, S.logo_sm, 93, 73);
      drawFit(ctx, S.name_sm, 160, 73, 530, 82, { anchor: 'l' });
      drawFit(ctx, S.menuTitle, 960, 82, 650, 105);
      drawFit(ctx, S.menuNote, 960, 158, 1100, 54);
      ctx.fillStyle = 'rgba(245,184,46,0.58)'; ctx.fillRect(48, 193, 1824, 2);
      this.menuCards(ctx, t, tl);
      if (this.layout.extras) this.menuExtras(ctx, this.layout.extras);
    }

    renderVertical(ctx, t, tl) {
      ctx.drawImage(this.S.bg, 0, 0);
      this.fire(ctx, t);
      if (t < tl.T_SPOT) this.introVertical(ctx, t, tl);
      else this.menuVertical(ctx, t, tl);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.S.bar_v, 0, PORTRAIT_H - 142);
      this.embers(ctx, t);
    }

    // Zona útil de la pantalla según los márgenes (en % del cuadro) de la orientación actual.
    // Devuelve null si no hay márgenes: el video ocupa todo el cuadro.
    safeArea() {
      const all = this.p.safeArea || {}, m = all[this.vertical ? 'vertical' : 'horizontal'] || {};
      const pct = k => clamp(+m[k] || 0, 0, 45) / 100;
      let top = pct('top'), bottom = pct('bottom'), left = pct('left'), right = pct('right');
      if (top + bottom > 0.8) { const k = 0.8 / (top + bottom); top *= k; bottom *= k; }
      if (left + right > 0.8) { const k = 0.8 / (left + right); left *= k; right *= k; }
      if (!(top || bottom || left || right)) return null;
      const W0 = this.width, H0 = this.height;
      const x = left * W0, y = top * H0, w = W0 * (1 - left - right), h = H0 * (1 - top - bottom);
      const s = Math.min(w / W0, h / H0);
      return { x: x + (w - W0 * s) / 2, y: y + (h - H0 * s) / 2, s };
    }

    // Dibuja el instante t (se ajusta al loop). Con márgenes, el cuadro completo se
    // achica para caber en la zona útil y el resto queda en negro.
    render(ctx, t) {
      if (!this.ready) return;
      const area = this.safeArea();
      if (!area) return this.renderFrame(ctx, t);
      ctx.save();
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, this.width, this.height);
      ctx.translate(area.x, area.y);
      ctx.scale(area.s, area.s);
      ctx.beginPath(); ctx.rect(0, 0, this.width, this.height); ctx.clip();
      this.renderFrame(ctx, t);
      ctx.restore();
    }

    renderFrame(ctx, t) {
      const tl = this.timeline();
      t = ((t % tl.L) + tl.L) % tl.L;
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (this.vertical) {
        this.renderVertical(ctx, t, tl);
        ctx.restore();
        return;
      }
      ctx.drawImage(this.S.bg, 0, 0);
      this.fire(ctx, t);
      if (t < tl.T_SPOT) this.intro(ctx, t, tl);
      else this.menuHorizontal(ctx, t, tl);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.S.bar, 0, H - 100);
      if (this.S.bar_script) {
        const so = clamp(1 - eOut(prog(t, 0.9, 1.4)) + eOut(prog(t, tl.I - 0.5, tl.I + 0.1)));
        draw(ctx, this.S.bar_script, W - 50 - this.S.bar_script.width / 2, H - 50, { a: so });
      }
      this.embers(ctx, t);
      ctx.restore();
    }

    sceneStarts() {
      const tl = this.timeline(), s = [{ name: 'Intro', t: 0 }];
      for (let i = 0; i < tl.n; i++) s.push({ name: this.p.burgers[i].name || `Burger ${i + 1}`, t: tl.T_SPOT + i * tl.B + 0.01 });
      s.push({ name: 'Menú completo', t: tl.T_GRID + 0.01 });
      return s;
    }
  }

  global.SmashEngine = { Engine, W, H, FPS, formatPrice };
})(window);

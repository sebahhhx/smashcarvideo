/* Interfaz del generador de video menú Smashcar. */
(function () {
  'use strict';
  const { Engine, W, H, FPS, formatPrice } = window.SmashEngine;
  const ASSETS = window.SMASH_ASSETS;
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v !== null && v !== undefined) e.setAttribute(k, v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) e.append(kid.nodeType ? kid : String(kid));
    return e;
  };

  const DEFAULT = {
    version: 3,
    orientation: 'horizontal',
    durations: { intro: 4.5, burger: 12, grid: 7.5 },
    exportMinutes: 20,
    brand: { name: 'SMASHCAR', title: 'BURGERS', note: 'TODAS LAS BURGERS LLEVAN PAPAS FRITAS', phone: '+56 9 9549 9633', web: 'SMASHCAR.CL', logo: null, script: null },
    effects: { steam: true, embers: true, fire: true, glow: true, rays: true, shake: true },
    // márgenes en % del cuadro para pantallas con zonas dañadas o tapadas (por orientación)
    safeArea: { horizontal: { top: 0, bottom: 0, left: 0, right: 0 }, vertical: { top: 0, bottom: 0, left: 0, right: 0 } },
    burgers: [
      { name: 'CLÁSICA', icon: 'bolt', defaultImage: 'b_clasica', ingredients: 'SMASH ANGUS, QUESO CHEDDAR, LECHUGA, PEPINILLO, CEBOLLA PICADA, SALSA SMASHCAR', prices: [{ label: 'SIMPLE', price: '$7.990' }, { label: 'DOBLE', price: '$9.990' }], badge: 1, note: '', big: false },
      { name: 'BACON BBQ CRISPY', icon: 'bbq', defaultImage: 'b_bacon', ingredients: 'SMASH ANGUS, QUESO CHEDDAR, BACON, CEBOLLA CRISPY, SALSA BBQ', prices: [{ label: 'SIMPLE', price: '$8.790' }, { label: 'DOBLE', price: '$10.790' }], badge: 1, note: '', big: false },
      { name: 'OKLAHOMASHCAR', icon: 'onion', defaultImage: 'b_okla', ingredients: 'SMASH ANGUS, QUESO CHEDDAR, CEBOLLA CARAMELIZADA A LA PLANCHA, PEPINILLOS, SALSA SMASHCAR', prices: [{ label: 'SIMPLE', price: '$8.590' }, { label: 'DOBLE', price: '$10.590' }], badge: 1, note: '', big: false },
      { name: 'SUPER QUADSCAR', icon: 'burger', defaultImage: 'b_quad', ingredients: '400 GR SMASH ANGUS, 4 X QUESO CHEDDAR, 2 X BACON, CEBOLLA CRISPY, SALSA BBQ', prices: [{ label: 'QUADRA', price: '$15.990' }], badge: 0, note: '400 GR SMASH ANGUS', big: true },
    ],
    extras: {
      title: 'EXTRAS', note: '', layout: 'bottom',
      items: [
        { name: 'BEBIDAS', price: '$1.600', image: null, defaultImage: 'x_bebidas' },
        { name: 'PORCIÓN DE PAPAS', price: '$4.000', image: null, defaultImage: 'x_papas' },
        { name: 'AGUA', price: '$1.300', image: null, defaultImage: 'x_agua' },
      ],
    },
  };
  const ICONS = [['bolt', 'Rayo'], ['bbq', 'Parrilla'], ['onion', 'Cebolla'], ['mush', 'Champiñón'], ['burger', 'Logo burger'], ['custom', 'Subir imagen…']];

  // ------------------------------------------------------------ guardado (IndexedDB)
  const DB = {
    open() {
      return new Promise((res, rej) => {
        const r = indexedDB.open('smashcar-video', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
    },
    async get(k) { try { const db = await this.open(); return await new Promise(res => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } },
    async set(k, v) { try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { /* sin guardado local */ } },
  };

  let project = null;
  const engine = new Engine();
  let building = null, pending = false;
  let playing = true, t = 0, last = performance.now();
  const view = $('#preview'), vctx = view.getContext('2d', { alpha: false });

  const clone = o => JSON.parse(JSON.stringify(o));
  function normalizeProject(saved) {
    const p = Object.assign(clone(DEFAULT), saved || {});
    p.brand = Object.assign(clone(DEFAULT.brand), p.brand);
    p.effects = Object.assign(clone(DEFAULT.effects), p.effects);
    const sa = p.safeArea || {};
    p.safeArea = {
      horizontal: Object.assign(clone(DEFAULT.safeArea.horizontal), sa.horizontal),
      vertical: Object.assign(clone(DEFAULT.safeArea.vertical), sa.vertical),
    };
    if (saved && !saved.extras && Array.isArray(saved.drinks) && saved.drinks.length) {
      // proyectos antiguos: se usan los extras nuevos y se suman las bebidas viejas
      // que no repiten el precio de uno de ellos (ej. "LATA DE BEBIDA $1.600" = BEBIDAS)
      p.extras = clone(DEFAULT.extras);
      const prices = p.extras.items.map(d => formatPrice(d.price));
      for (const d of saved.drinks) {
        if (d && d.name && !prices.includes(formatPrice(d.price))) p.extras.items.push({ ...d, defaultImage: null });
      }
      p.extras.items = p.extras.items.slice(0, 6);
    }
    p.extras = Object.assign(clone(DEFAULT.extras), p.extras);
    p.extras.items = Array.isArray(p.extras.items) ? p.extras.items : [];
    // extras guardados antes de que existieran las fotos incluidas: se les asigna la suya
    for (const item of p.extras.items) {
      if ('defaultImage' in item) continue;
      const def = DEFAULT.extras.items.find(d => d.name === String(item.name || '').toUpperCase().trim());
      item.defaultImage = def ? def.defaultImage : null;
    }
    delete p.drinks;
    if (p.brand.note === 'TODOS LOS COMBOS LLEVAN PAPAS FRITAS') p.brand.note = DEFAULT.brand.note;
    p.version = DEFAULT.version;
    return p;
  }
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const fmtMB = b => (b / 2 ** 20).toLocaleString('es-CL', { maximumFractionDigits: 0 }) + ' MB';

  function readFile(file) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  }
  async function readExtraPhoto(file) {
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      bmp.close();
      return c.toDataURL('image/webp', 0.88);
    } catch (e) { return readFile(file); }
  }
  function pickFile(accept) {
    return new Promise(res => {
      const i = h('input', { type: 'file', accept }); i.style.display = 'none';
      i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); });
      document.body.append(i); i.click();
    });
  }

  // ------------------------------------------------------------ reconstrucción
  async function rebuild() {
    if (building) { pending = true; return building; }
    building = (async () => {
      do {
        pending = false;
        $('#status').textContent = 'Actualizando vista previa…';
        try {
          await engine.build(project, ASSETS);
          $('#status').textContent = '';
          renderTimeline();
        } catch (e) {
          console.error(e); $('#status').textContent = 'Error: ' + e.message;
          throw e;
        }
      } while (pending);
    })();
    try { await building; } finally { building = null; }
  }
  let saveTimer = null, buildTimer = null;
  function changed(rebuildNow = false) {
    clearTimeout(saveTimer); saveTimer = setTimeout(() => DB.set('project', project), 600);
    clearTimeout(buildTimer); buildTimer = setTimeout(rebuild, rebuildNow ? 0 : 350);
    updateTotals();
  }
  function syncOrientation() {
    const vertical = project.orientation === 'vertical';
    view.width = vertical ? 1080 : 1920;
    view.height = vertical ? 1920 : 1080;
    $('#screen').classList.toggle('vertical', vertical);
    $('#horizontalBtn').setAttribute('aria-pressed', String(!vertical));
    $('#verticalBtn').setAttribute('aria-pressed', String(vertical));
    const size = vertical ? '1080×1920' : '1920×1080';
    $('#previewFormat').textContent = `${vertical ? 'Vertical · 9:16' : 'Horizontal · 16:9'} · ${size}`;
    $('#formatInfo').textContent = vertical
      ? 'Para pantallas instaladas de pie. El video sale listo en 1080×1920.'
      : 'Para pantallas acostadas. El video sale listo en 1920×1080.';
    const ls = $('#extrasLayout');
    if (ls) {
      for (const b of ls.querySelectorAll('button')) b.disabled = vertical;
      $('#extrasLayoutInfo').textContent = vertical
        ? 'En vertical los extras siempre van en una franja abajo.'
        : 'Franja abajo: se leen mejor y caben fotos anchas. Columna: las burgers quedan más grandes.';
    }
    drawSafeArea();
    $('#exportSpecs').textContent = `MP4 H.264 · ${size} · 30 fps. El loop se dibuja una vez y se repite hasta la duración elegida. Para los videos largos, Chrome te pregunta dónde guardarlo.`;
  }

  // Márgenes de la orientación actual. No hace falta reconstruir: el motor los lee al dibujar.
  const SIDES = [['top', 'Arriba'], ['bottom', 'Abajo'], ['left', 'Izquierda'], ['right', 'Derecha']];
  function drawSafeArea() {
    const box = $('#safeArea');
    if (!box) return;
    const key = project.orientation === 'vertical' ? 'vertical' : 'horizontal';
    const m = project.safeArea[key];
    const apply = () => {
      if (engine.p) engine.p.safeArea = clone(project.safeArea);
      clearTimeout(saveTimer); saveTimer = setTimeout(() => DB.set('project', project), 600);
      reset.disabled = SIDES.every(([k]) => !m[k]);
    };
    const rows = SIDES.map(([k, label]) => {
      const out = h('output', { class: 'sa-val' }, `${m[k]} %`);
      const range = h('input', { type: 'range', min: 0, max: 40, step: 0.5, value: m[k], 'aria-label': `Margen ${label.toLowerCase()}` });
      range.addEventListener('input', () => { m[k] = +range.value; out.textContent = `${m[k]} %`; apply(); });
      return h('label', { class: 'sa-row' }, h('span', {}, label), range, out);
    });
    const reset = h('button', { type: 'button', class: 'link', onclick: () => { for (const [k] of SIDES) m[k] = 0; drawSafeArea(); apply(); } }, 'Quitar márgenes');
    reset.disabled = SIDES.every(([k]) => !m[k]);
    box.replaceChildren(
      h('span', {}, `Margen de seguridad · ${key === 'vertical' ? 'vertical' : 'horizontal'}`),
      ...rows,
      h('small', {}, 'Si una parte de la pantalla está rota o tapada, sube el margen de ese lado: el video se achica para caber en la zona buena y lo demás queda en negro. Usa "Pantalla completa" en la tele para ajustarlo en vivo.'),
      reset);
  }

  // ------------------------------------------------------------ vista previa
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (engine.ready) {
      if (playing) t = (t + dt) % engine.duration;
      engine.render(vctx, t);
      const sl = $('#scrub');
      if (document.activeElement !== sl) sl.value = String(t / engine.duration * 1000);
      $('#time').textContent = `${t.toFixed(1).replace('.', ',')} s / ${engine.duration.toFixed(1).replace('.', ',')} s`;
    }
    requestAnimationFrame(loop);
  }
  function renderTimeline() {
    const box = $('#scenes'); box.innerHTML = '';
    for (const s of engine.sceneStarts()) box.append(h('button', { class: 'chip', onclick: () => { t = s.t + 0.6; } }, s.name));
  }

  // ------------------------------------------------------------ formularios
  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', {}, label), input, hint ? h('small', {}, hint) : null);
  }
  function textInput(obj, key, o = {}) {
    const el = h(o.multiline ? 'textarea' : 'input', { type: o.type || 'text', value: o.multiline ? null : obj[key] ?? '', rows: o.rows || null, step: o.step || null, min: o.min ?? null, max: o.max ?? null });
    if (o.multiline) el.value = obj[key] ?? '';
    el.addEventListener('input', () => {
      let v = el.value;
      if (o.upper) { const p = el.selectionStart; el.value = v = v.toUpperCase(); try { el.setSelectionRange(p, p); } catch (e) {} }
      obj[key] = o.type === 'number' ? Number(v) : v;
      if (o.after) o.after();
      changed();
    });
    if (o.type === 'number') el.addEventListener('blur', () => {
      const value = Number(el.value);
      const bounded = Math.max(o.min ?? -Infinity, Math.min(o.max ?? Infinity, Number.isFinite(value) ? value : (o.min ?? 0)));
      if (value !== bounded || el.value === '') { el.value = String(bounded); obj[key] = bounded; changed(true); }
    });
    if (o.onblur) el.addEventListener('blur', () => o.onblur(el));
    return el;
  }
  function check(obj, key, label) {
    const el = h('input', { type: 'checkbox' }); el.checked = !!obj[key];
    el.addEventListener('change', () => { obj[key] = el.checked; changed(true); });
    return h('label', { class: 'check' }, el, label);
  }

  function updateTotals() {
    const d = project.durations, n = project.burgers.length;
    const I = Math.max(3, Math.min(10, +d.intro || 4.5));
    const B = Math.max(1, Math.min(30, +d.burger || 12));
    const G = Math.max(5, Math.min(20, +d.grid || 7.5));
    const L = I + n * B + G;
    const seconds = v => v.toFixed(1).replace('.', ',');
    $('#loopTotal').textContent = `Inicio ${seconds(I)} s + ${n} destacados × ${seconds(B)} s + cierre ${seconds(G)} s = loop ${seconds(L)} s`;
    const reps = Math.max(1, Math.round(project.exportMinutes * 60 / L));
    $('#exportInfo').textContent = project.exportMinutes > 0
      ? `${reps} vueltas del loop · ${fmtT(reps * L)} · aprox. ${fmtMB(reps * L * 4e6 / 8 * 0.9)}`
      : `Un loop de ${L.toFixed(1).replace('.', ',')} s · aprox. ${fmtMB(L * 4e6 / 8 * 0.9)}`;
  }

  function burgerCard(b, i) {
    const n = project.burgers.length;
    const thumb = h('img', { class: 'thumb', alt: '' });
    thumb.src = b.image || ASSETS[b.defaultImage] || '';
    const priceRows = h('div', { class: 'prices' });
    const badgeSel = h('select');
    function drawPrices() {
      priceRows.innerHTML = '';
      b.prices.forEach((q, j) => {
        const lab = textInput(q, 'label', { upper: true, after: syncBadge });
        lab.placeholder = 'SIMPLE';
        const pr = textInput(q, 'price', { onblur: el => { const f = formatPrice(el.value); if (f !== el.value) { el.value = f; q.price = f; changed(); } } });
        pr.placeholder = '$7.990';
        const del = h('button', { class: 'icon-btn', title: 'Quitar línea', onclick: () => { b.prices.splice(j, 1); b.badge = Math.min(b.badge, Math.max(0, b.prices.length - 1)); drawPrices(); syncBadge(); changed(); } }, '✕');
        priceRows.append(h('div', { class: 'price-row' }, lab, pr, b.prices.length > 1 ? del : h('span')));
      });
      if (b.prices.length < 2) priceRows.append(h('button', { class: 'link', onclick: () => { b.prices.push({ label: 'DOBLE', price: '' }); drawPrices(); syncBadge(); changed(); } }, '+ Agregar precio'));
    }
    function syncBadge() {
      badgeSel.innerHTML = '';
      b.prices.forEach((q, j) => { const o = h('option', { value: j }, q.label || `Precio ${j + 1}`); if (j === +b.badge) o.selected = true; badgeSel.append(o); });
    }
    badgeSel.addEventListener('change', () => { b.badge = +badgeSel.value; changed(); });
    drawPrices(); syncBadge();

    const iconSel = h('select');
    for (const [v, l] of ICONS) { const o = h('option', { value: v }, l); if ((b.iconImage ? 'custom' : b.icon) === v) o.selected = true; iconSel.append(o); }
    iconSel.addEventListener('change', async () => {
      if (iconSel.value === 'custom') {
        const f = await pickFile('image/*');
        if (f) { b.iconImage = await readFile(f); } else { iconSel.value = b.icon || 'burger'; return; }
      } else { b.icon = iconSel.value; delete b.iconImage; }
      changed(true);
    });

    const move = d => { const j = i + d; if (j < 0 || j >= n) return; const a = project.burgers; [a[i], a[j]] = [a[j], a[i]]; drawBurgers(); changed(true); };
    return h('div', { class: 'card burger' },
      h('div', { class: 'card-head' },
        h('strong', {}, `${i + 1}. ${b.name || 'Burger'}`),
        h('div', { class: 'btns' },
          h('button', { class: 'icon-btn', title: 'Subir', disabled: i === 0, onclick: () => move(-1) }, '↑'),
          h('button', { class: 'icon-btn', title: 'Bajar', disabled: i === n - 1, onclick: () => move(1) }, '↓'),
          h('button', { class: 'icon-btn danger', title: 'Eliminar', disabled: n <= 1, onclick: () => { if (confirm(`¿Eliminar ${b.name || 'esta burger'}?`)) { project.burgers.splice(i, 1); drawBurgers(); changed(true); } } }, '🗑'))),
      h('div', { class: 'photo' }, thumb,
        h('div', {},
          h('button', { class: 'btn', onclick: async () => { const f = await pickFile('image/png,image/webp,image/jpeg'); if (!f) return; b.image = await readFile(f); thumb.src = b.image; changed(true); } }, 'Cambiar foto'),
          h('small', {}, 'Ideal: PNG sin fondo. Si la foto tiene fondo liso (negro o blanco), se quita solo.'),
          b.image && b.defaultImage ? h('button', { class: 'link', onclick: () => { delete b.image; thumb.src = ASSETS[b.defaultImage]; changed(true); } }, 'Volver a la foto original') : null)),
      field('Nombre', textInput(b, 'name', { upper: true, after: () => { $('strong', thumb.closest('.card')).textContent = `${i + 1}. ${b.name}`; } })),
      field('Ingredientes', textInput(b, 'ingredients', { multiline: true, rows: 3, upper: true })),
      h('div', { class: 'field' }, h('span', {}, 'Precios'), priceRows),
      h('div', { class: 'row2' },
        field('Precio destacado', badgeSel),
        field('Ícono', iconSel)),
      b.prices.length < 2 ? field('Nota (si tiene un solo precio)', textInput(b, 'note', { upper: true }), 'Ej: 400 GR SMASH ANGUS') : null,
      check(b, 'big', 'Burger grande (se muestra más alta, como la Quadra)'));
  }
  function drawBurgers() {
    const box = $('#burgers'); box.innerHTML = '';
    box.append(sectionHead(project.brand, 'title', 'note', 'Ej: BURGERS, SMASH BURGERS', 'Ej: TODAS LLEVAN PAPAS FRITAS'));
    project.burgers.forEach((b, i) => box.append(burgerCard(b, i)));
    box.append(h('button', { class: 'btn wide', disabled: project.burgers.length >= 6, onclick: () => {
      project.burgers.push({ name: 'NUEVA BURGER', icon: 'burger', ingredients: '', prices: [{ label: 'SIMPLE', price: '' }, { label: 'DOBLE', price: '' }], badge: 1, note: '', big: false });
      drawBurgers(); changed(true);
    } }, project.burgers.length >= 6 ? 'Máximo 6 burgers' : '+ Agregar burger'));
    syncSummaries();
  }

  // Títulos de los paneles: muestran el nombre que sale en el video.
  function syncSummaries() {
    $('#burgersSum').textContent = project.brand.title || 'BURGERS';
    $('#burgersCount').textContent = `${project.burgers.length} de 6`;
    $('#extrasSum').textContent = project.extras.title || 'EXTRAS';
    const shown = project.extras.items.filter(d => d.name && d.price).length;
    $('#extrasCount').textContent = shown ? `${shown} en el menú` : 'oculto';
  }

  function sectionHead(obj, titleKey, noteKey, titleHint, noteHint) {
    return h('div', { class: 'section-head' },
      h('div', { class: 'row2' },
        field('Título de la sección', textInput(obj, titleKey, { upper: true, after: syncSummaries }), titleHint),
        field('Nota bajo el título', textInput(obj, noteKey, { upper: true }), noteHint)));
  }

  function drawExtras() {
    const ex = project.extras, box = $('#extras'); box.innerHTML = '';
    const layoutBtns = h('div', { class: 'orientation', id: 'extrasLayout', role: 'group', 'aria-label': 'Ubicación de los extras' },
      ...[['bottom', 'Franja abajo'], ['right', 'Columna derecha']].map(([v, l]) => h('button', {
        type: 'button', class: 'btn', 'aria-pressed': String(ex.layout === v),
        onclick: () => { if (ex.layout === v) return; ex.layout = v; drawExtras(); changed(true); },
      }, l)));
    box.append(
      sectionHead(ex, 'title', 'note', 'Ej: EXTRAS, BEBESTIBLES, AGREGADOS', 'Opcional'),
      h('div', { class: 'field' }, h('span', {}, 'Ubicación en horizontal'), layoutBtns, h('small', { id: 'extrasLayoutInfo' })),
      h('p', { class: 'muted' }, 'Cada extra aparece cuando tiene nombre y precio. La foto es opcional: puede ser un PNG con varias bebidas juntas.'));
    const n = ex.items.length;
    ex.items.forEach((item, i) => {
      const src = item.image || (item.defaultImage && ASSETS[item.defaultImage]);
      const photo = h('div', { class: 'photo' },
        src ? h('img', { class: 'thumb', alt: '', src }) : h('div', { class: 'thumb drink-empty' }, 'SIN FOTO'),
        h('div', {},
          h('button', { class: 'btn', onclick: async () => {
            const f = await pickFile('image/png,image/webp,image/jpeg');
            if (!f) return;
            item.image = await readExtraPhoto(f); drawExtras(); changed(true);
          } }, src ? 'Cambiar foto' : 'Subir foto'),
          item.image && item.defaultImage ? h('button', { class: 'link', onclick: () => { delete item.image; drawExtras(); changed(true); } }, 'Volver a la foto original') : null,
          src ? h('button', { class: 'link', onclick: () => { delete item.image; item.defaultImage = null; drawExtras(); changed(true); } }, 'Quitar foto') : null));
      const head = h('strong', {}, `${i + 1}. ${item.name || 'Extra'}`);
      const move = d => { const j = i + d; if (j < 0 || j >= n) return; [ex.items[i], ex.items[j]] = [ex.items[j], ex.items[i]]; drawExtras(); changed(true); };
      box.append(h('div', { class: 'card' },
        h('div', { class: 'card-head' }, head,
          h('div', { class: 'btns' },
            h('button', { class: 'icon-btn', title: 'Subir', disabled: i === 0, onclick: () => move(-1) }, '↑'),
            h('button', { class: 'icon-btn', title: 'Bajar', disabled: i === n - 1, onclick: () => move(1) }, '↓'),
            h('button', { class: 'icon-btn danger', title: 'Eliminar', onclick: () => {
              if (!confirm(`¿Eliminar ${item.name || 'este extra'}?`)) return;
              ex.items.splice(i, 1); drawExtras(); changed(true);
            } }, '🗑'))),
        photo,
        h('div', { class: 'row2' },
          field('Nombre', textInput(item, 'name', { upper: true, after: () => { head.textContent = `${i + 1}. ${item.name}`; syncSummaries(); } })),
          field('Precio', textInput(item, 'price', {
            after: syncSummaries,
            onblur: el => { const f = formatPrice(el.value); if (f !== el.value) { el.value = f; item.price = f; changed(); } },
          })))));
    });
    box.append(h('button', { class: 'btn wide', disabled: n >= 6, onclick: () => {
      ex.items.push({ name: 'NUEVO EXTRA', price: '', image: null, defaultImage: null });
      drawExtras(); changed(true);
    } }, n >= 6 ? 'Máximo 6 extras' : '+ Agregar extra'));
    syncOrientation();
    syncSummaries();
  }

  function drawForm() {
    syncOrientation();
    const d = project.durations, br = project.brand, ef = project.effects;
    $('#times').replaceChildren(
      h('div', { class: 'row3' },
        field('Intro (s)', textInput(d, 'intro', { type: 'number', step: 0.5, min: 3, max: 10 })),
        field('Cada destacado (s)', textInput(d, 'burger', { type: 'number', step: 0.5, min: 1, max: 30 })),
        field('Menú sin destacar (s)', textInput(d, 'grid', { type: 'number', step: 0.5, min: 5, max: 20 }))),
      h('p', { class: 'muted', id: 'loopTotal' }));
    const logoBtn = (key, label) => h('div', { class: 'asset' },
      h('img', { class: 'mini', src: br[key] || ASSETS[key === 'logo' ? 'logo' : 'script'] }),
      h('button', { class: 'btn', onclick: async () => { const f = await pickFile('image/png,image/webp'); if (!f) return; br[key] = await readFile(f); drawForm(); changed(true); } }, label),
      br[key] ? h('button', { class: 'link', onclick: () => { br[key] = null; drawForm(); changed(true); } }, 'Usar el original') : null);
    $('#brand').replaceChildren(
      field('Nombre de la marca', textInput(br, 'name', { upper: true })),
      h('div', { class: 'row2' }, field('Teléfono (WhatsApp)', textInput(br, 'phone')), field('Web / Instagram / TikTok', textInput(br, 'web', { upper: true }))),
      logoBtn('logo', 'Cambiar logo'), logoBtn('script', 'Cambiar frase (imagen)'));
    $('#effects').replaceChildren(
      check(ef, 'steam', 'Vapor detrás de las burgers'), check(ef, 'embers', 'Chispas que suben'),
      check(ef, 'fire', 'Fuego en la parte de abajo'), check(ef, 'glow', 'Brillo anaranjado'),
      check(ef, 'rays', 'Rayos y anillos de luz'), check(ef, 'shake', 'Rebote y temblor al caer'));
    drawBurgers();
    drawExtras();
    const sel = $('#minutes'); sel.value = String(project.exportMinutes);
    updateTotals();
  }

  // ------------------------------------------------------------ exportar
  let cancel = false;
  async function doExport() {
    clearTimeout(buildTimer);
    try { await rebuild(); }
    catch (e) { $('#pmsg').textContent = 'No se pudo preparar el video: ' + e.message; $('#progress').hidden = false; return; }
    const minutes = +$('#minutes').value;
    project.exportMinutes = minutes;
    DB.set('project', project);
    updateTotals();
    const format = project.orientation === 'vertical' ? 'Vertical' : 'Horizontal';
    const name = minutes > 0 ? `Smashcar_Menu_${format}_${minutes}min.mp4` : `Smashcar_Menu_${format}_loop.mp4`;
    const box = $('#progress'), bar = $('#bar'), msg = $('#pmsg');
    box.hidden = false; $('#exportBtn').disabled = true;
    $('#horizontalBtn').disabled = $('#verticalBtn').disabled = true;
    $('aside').inert = true;
    $('#openBtn').disabled = $('#resetBtn').disabled = true;
    cancel = false; playing = false;
    bar.style.width = '0%'; msg.textContent = 'Preparando…';
    try {
      const r = await window.SmashExporter.exportVideo(engine, {
        minutes, fileName: name, isCancelled: () => cancel,
        onProgress: p => {
          if (p.phase === 'render') {
            const f = p.done / p.total, rest = p.done > 30 ? p.elapsed / p.done * (p.total - p.done) : null;
            bar.style.width = (f * 95).toFixed(1) + '%';
            msg.textContent = `Dibujando el loop: cuadro ${p.done} de ${p.total}` + (rest ? ` · quedan ~${Math.ceil(rest)} s` : '');
          } else if (p.phase === 'mux') { bar.style.width = '97%'; msg.textContent = 'Armando el archivo MP4…'; }
        },
      });
      bar.style.width = '100%';
      msg.textContent = `Listo: ${r.savedTo} · ${fmtT(r.seconds)} · ${fmtMB(r.bytes)}. Cópialo al USB y ábrelo en la tele.`;
    } catch (e) {
      msg.textContent = e.message === 'cancelado' ? 'Exportación cancelada.' : 'No se pudo exportar: ' + e.message;
      bar.style.width = '0%';
    } finally {
      $('#exportBtn').disabled = false;
      $('#horizontalBtn').disabled = $('#verticalBtn').disabled = false;
      $('aside').inert = false;
      $('#openBtn').disabled = $('#resetBtn').disabled = false;
      playing = true;
    }
  }

  // ------------------------------------------------------------ proyecto
  async function saveJson() {
    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'smashcar-video-menu.json' }); document.body.append(a); a.click(); a.remove();
  }
  async function openJson() {
    const f = await pickFile('application/json,.json'); if (!f) return;
    try { const p = JSON.parse(await f.text()); if (!Array.isArray(p.burgers)) throw new Error(); project = normalizeProject(p); drawForm(); changed(true); }
    catch (e) { alert('Ese archivo no es un proyecto del generador.'); }
  }

  async function init() {
    $('#status').textContent = 'Cargando tipografías…';
    await Promise.all(['120px Anton', '46px "Bebas Neue"', '500 33px Roboto'].map(f => document.fonts.load(f)));
    const saved = await DB.get('project');
    project = normalizeProject(saved && saved.burgers ? saved : null);
    drawForm();
    $('#play').addEventListener('click', () => { playing = !playing; $('#play').textContent = playing ? '❚❚' : '▶'; });
    $('#scrub').addEventListener('input', e => { t = e.target.value / 1000 * engine.duration; });
    $('#minutes').addEventListener('change', e => { project.exportMinutes = +e.target.value; changed(); });
    for (const [id, orientation] of [['horizontalBtn', 'horizontal'], ['verticalBtn', 'vertical']]) {
      $('#' + id).addEventListener('click', () => {
        if (project.orientation === orientation) return;
        project.orientation = orientation;
        syncOrientation();
        t = 0;
        changed(true);
      });
    }
    $('#exportBtn').addEventListener('click', doExport);
    $('#cancelBtn').addEventListener('click', () => { cancel = true; });
    $('#saveBtn').addEventListener('click', saveJson);
    $('#openBtn').addEventListener('click', openJson);
    $('#resetBtn').addEventListener('click', () => { if (confirm('¿Volver al menú original? Se pierden los cambios no guardados.')) { project = clone(DEFAULT); drawForm(); changed(true); } });
    $('#fsBtn').addEventListener('click', () => view.requestFullscreen && view.requestFullscreen());
    if (!('VideoEncoder' in window)) $('#exportWarn').hidden = false;
    await rebuild();
    requestAnimationFrame(loop);
    window.__smash = { engine, get project() { return project; }, exportVideo: (o) => window.SmashExporter.exportVideo(engine, o) };
  }
  init();
})();

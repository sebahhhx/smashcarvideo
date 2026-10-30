/* Conexión con Restu: lee la carta pública del local (precios, fotos y promociones)
   y la cruza con las tarjetas del video para actualizar precios sin escribirlos a mano. */
(function (global) {
  'use strict';
  const { formatPrice } = global.SmashEngine;
  const API = 'https://wmzialokmozyxdfpspha.supabase.co';
  // Clave pública ("anon") de Restu: es la misma que usa la carta online y solo lee lo público.
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtemlhbG9rbW96eXhkZnBzcGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4MTAwNjMsImV4cCI6MjA5NDM4NjA2M30.abLTsTZNGRuQrWqXTyVdOIcXoR3xlywTs33Q_BeJvOo';

  async function fetchStorefront(slug) {
    let r;
    try {
      r = await fetch(`${API}/rest/v1/rpc/get_public_storefront`, {
        method: 'POST',
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ _slug: slug }),
      });
    } catch (e) { throw new Error('No hay conexión con Restu. Revisa el internet e intenta de nuevo.'); }
    if (!r.ok) throw new Error(`Restu respondió con un error (${r.status}).`);
    const d = await r.json();
    if (!d || !d.org || !Array.isArray(d.items)) throw new Error(`No se encontró el local "${slug}" en Restu.`);
    return d;
  }

  // ------------------------------------------------------------ nombres
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const VARIANT = /\s(SIMPLE|DOBLE|TRIPLE)$/;
  const NOISE = /\b(BURGER|BURGUER|HAMBURGUESA|HAMBURGER|\d+ ?(CC|ML|LT|L))\b/g;
  function splitVariant(name) {
    const n = norm(name), m = n.match(VARIANT);
    return m ? { base: n.slice(0, -m[0].length).trim(), variant: m[1] } : { base: n, variant: '' };
  }
  function bigrams(s) {
    const b = [];
    for (let i = 0; i < s.length - 1; i++) b.push(s.slice(i, i + 2));
    return b;
  }
  function dice(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = bigrams(a), B = bigrams(b);
    if (!A.length || !B.length) return 0;
    const pool = [...B];
    let hit = 0;
    for (const x of A) { const i = pool.indexOf(x); if (i >= 0) { hit++; pool.splice(i, 1); } }
    return 2 * hit / (A.length + B.length);
  }
  // Parecido entre dos nombres (0 a 1): compara el nombre entero y palabra por palabra.
  function similarity(a, b) {
    const x = norm(a).replace(NOISE, ' ').replace(/\s+/g, ' ').trim(), y = norm(b).replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
    let best = dice(x.replace(/ /g, ''), y.replace(/ /g, ''));
    for (const p of x.split(' ')) for (const q of y.split(' ')) if (p.length > 3 && q.length > 3) best = Math.max(best, dice(p, q) * 0.9);
    return best;
  }
  const pretty = name => norm(name).replace(/\b\d+ ?(CC|ML)\b/g, '').replace(/\s+/g, ' ').trim();

  // ------------------------------------------------------------ catálogo
  function effectivePrice(it, now = Date.now()) {
    const base = Number(it.price) || 0, disc = Number(it.discount_price);
    const until = it.discount_until ? Date.parse(it.discount_until) : null;
    return disc > 0 && disc < base && (until === null || until > now) ? disc : base;
  }
  // Lo justo de la carta para vincular y actualizar; se guarda en el proyecto para usarlo sin internet.
  function catalogFrom(d) {
    const cats = new Map((d.categories || []).map(c => [c.slug, c]));
    const burgerCat = (d.categories || []).find(c => /burger|hamburg/i.test(c.slug + ' ' + c.name_es));
    const items = d.items.map(it => {
      const c = cats.get(it.category);
      return {
        id: it.id, name: String(it.name_es || '').trim(), price: effectivePrice(it), regular: Number(it.price) || 0,
        category: it.category || '', categoryName: c ? c.name_es : (it.category || 'Otros'),
        burger: !!burgerCat && it.category === burgerCat.slug,
        image: it.image_url || null, description: String(it.description_es || '').trim(),
        order: c ? c.sort_order : 999,
      };
    }).sort((a, b) => a.order - b.order);
    return { slug: d.org.slug, name: d.org.name, fetchedAt: new Date().toISOString(), items };
  }
  const byId = catalog => new Map(catalog.items.map(it => [it.id, it]));

  // Variantes de una misma burger juntas: "CLASSIC BURGER SIMPLE" y "… DOBLE" → "CLASSIC BURGER".
  function burgerGroups(catalog) {
    const groups = new Map();
    for (const it of catalog.items.filter(i => i.burger)) {
      const { base, variant } = splitVariant(it.name);
      if (!groups.has(base)) groups.set(base, { base, items: [] });
      groups.get(base).items.push({ ...it, variant });
    }
    for (const g of groups.values()) g.items.sort((a, b) => a.price - b.price);
    return [...groups.values()];
  }

  // Precio a mostrar para un grupo de productos: igual para todos o "DESDE" el más barato.
  function priceFor(items) {
    const ps = items.map(i => i.price).filter(p => p > 0);
    if (!ps.length) return '';
    const min = Math.min(...ps), max = Math.max(...ps);
    return (max > min ? 'DESDE ' : '') + formatPrice(String(min));
  }

  // ------------------------------------------------------------ vínculos
  // Sugiere vínculos solo donde nunca se eligió nada (undefined); "Sin vincular" (null / []) se respeta.
  function autoLink(project, catalog) {
    const groups = burgerGroups(catalog), used = new Set();
    for (const b of project.burgers) for (const q of b.prices) if (q.restuId) used.add(q.restuId);
    for (const b of project.burgers) {
      if (!b.prices.some(q => q.restuId === undefined)) continue;
      let best = null, score = 0.45;
      // también cuenta el nombre de la línea de precio (ej. "QUADRA" ↔ "QUADRA BURGER")
      const labels = b.prices.map(q => norm(q.label)).filter(l => l && !/^(SIMPLE|DOBLE|TRIPLE)$/.test(l));
      for (const g of groups) {
        if (g.items.every(i => used.has(i.id))) continue;
        const s = Math.max(similarity(b.name, g.base), ...labels.map(l => similarity(l, g.base)));
        if (s > score) { best = g; score = s; }
      }
      b.prices.forEach((q, j) => {
        if (q.restuId !== undefined) return;
        if (!best) return;
        const free = best.items.filter(i => !used.has(i.id));
        const label = norm(q.label);
        const pick = free.find(i => i.variant && i.variant === label)
          || (b.prices.length === 1 && free.length === 1 ? free[0] : null)
          || (b.prices.length === best.items.length ? best.items[j] : null);
        if (pick && !used.has(pick.id)) { q.restuId = pick.id; used.add(pick.id); }
      });
    }
    const others = catalog.items.filter(i => !i.burger);
    for (const x of project.extras.items) {
      if (x.restuIds !== undefined) continue;
      const n = norm(x.name);
      let ids = [];
      if (/\bBEBIDA/.test(n)) {
        // "BEBIDAS" agrupa todas las bebidas menos el agua (que suele ir aparte)
        const drinks = others.filter(i => /drink|bebida/i.test(i.category + ' ' + i.categoryName) && !/\bAGUA\b/.test(norm(i.name)));
        ids = drinks.map(i => i.id);
      } else {
        let best = null, score = 0.45;
        for (const i of others) { const s = similarity(x.name, i.name); if (s > score) { best = i; score = s; } }
        if (best) ids = [best.id];
      }
      if (ids.length) x.restuIds = ids;
    }
  }

  // Pone los precios de Restu en lo vinculado. Devuelve lo que cambió y lo que ya no existe.
  function applyPrices(project, catalog) {
    const map = byId(catalog), changes = [], missing = [];
    for (const b of project.burgers) for (const q of b.prices) {
      if (!q.restuId) continue;
      const it = map.get(q.restuId);
      const where = `${b.name}${q.label ? ' ' + q.label : ''}`;
      if (!it) { missing.push(where); continue; }
      const price = formatPrice(String(it.price));
      if (price !== q.price) { changes.push({ where, from: q.price, to: price }); q.price = price; }
    }
    for (const x of project.extras.items) {
      if (!Array.isArray(x.restuIds) || !x.restuIds.length) continue;
      const found = x.restuIds.map(id => map.get(id)).filter(Boolean);
      if (!found.length) { missing.push(x.name); continue; }
      const price = priceFor(found);
      if (price && price !== x.price) { changes.push({ where: x.name, from: x.price, to: price }); x.price = price; }
    }
    return { changes, missing };
  }

  // Productos de Restu que no aparecen en ninguna tarjeta del video.
  function unlinked(project, catalog) {
    const linked = new Set();
    for (const b of project.burgers) for (const q of b.prices) if (q.restuId) linked.add(q.restuId);
    for (const x of project.extras.items) for (const id of x.restuIds || []) linked.add(id);
    const burgers = burgerGroups(catalog).filter(g => g.items.every(i => !linked.has(i.id)));
    const extras = catalog.items.filter(i => !i.burger && !linked.has(i.id));
    return { burgers, extras };
  }

  function burgerFromGroup(g) {
    const first = g.items[0];
    return {
      name: g.base,
      icon: 'burger',
      ingredients: norm(first.description).length > 0 ? first.description.toUpperCase() : '',
      prices: g.items.slice(0, 2).map(i => ({ label: i.variant, price: formatPrice(String(i.price)), restuId: i.id })),
      badge: Math.min(1, g.items.length - 1),
      note: '', big: false,
      imageUrl: first.image,
    };
  }
  function extraFromItem(i) {
    return { name: pretty(i.name), price: formatPrice(String(i.price)), image: null, defaultImage: null, restuIds: [i.id], imageUrl: i.image };
  }

  // ------------------------------------------------------------ promociones
  const DAYS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  function whenText(p) {
    const parts = [];
    const days = Array.isArray(p.days) ? [...p.days].sort() : null;
    if (days && days.length && days.length < 7) {
      const names = days.map(d => DAYS[d]);
      parts.push('SOLO ' + (names.length > 1 ? names.slice(0, -1).join(', ') + ' Y ' + names[names.length - 1] : names[0]));
    }
    if (p.time_from && p.time_to) parts.push(`DE ${p.time_from} A ${p.time_to}`);
    if (p.ends_at) {
      const d = new Date(p.ends_at);
      parts.push(`HASTA EL ${d.getDate()}/${d.getMonth() + 1}`);
    }
    return parts.join(' · ');
  }
  function priceText(p) {
    switch (p.kind) {
      case 'bundle_price': return formatPrice(String(p.bundle_price));
      case 'buy_x_pay_y': return `${p.buy_qty}x${p.pay_qty}`;
      case 'percent': return `-${p.percent}%`;
      case 'amount': return '-' + formatPrice(String(p.amount));
      default: return '';
    }
  }
  const BADGE = { bundle_price: 'COMBO', buy_x_pay_y: 'PROMO', percent: 'DESCUENTO', amount: 'DESCUENTO' };

  // Precio normal de un combo: lo que costaría por separado (para el sello "AHORRAS").
  // Igual que la caja de Restu, para una categoría se toma el producto más caro.
  function regularOf(p, catalog) {
    if (p.kind !== 'bundle_price' || !Array.isArray(p.targets) || !p.targets.length) return '';
    const map = byId(catalog);
    let sum = 0;
    for (const t of p.targets) {
      if (t.menu_item_id) { const it = map.get(t.menu_item_id); if (!it) return ''; sum += it.regular * (t.qty || 1); }
      else {
        const inCat = catalog.items.filter(i => i.category === t.category);
        if (!inCat.length) return '';
        sum += Math.max(...inCat.map(i => i.regular)) * (t.qty || 1);
      }
    }
    return sum > (Number(p.bundle_price) || 0) ? formatPrice(String(sum)) : '';
  }

  // Qué fotos del video representan lo que incluye la promo.
  function promoShows(p, project, catalog) {
    const refs = [];
    const add = uid => { if (uid && !refs.includes(uid)) refs.push(uid); };
    const map = byId(catalog);
    for (const t of p.targets || []) {
      if (t.menu_item_id) {
        const b = project.burgers.find(b => b.prices.some(q => q.restuId === t.menu_item_id));
        const x = project.extras.items.find(x => (x.restuIds || []).includes(t.menu_item_id));
        add(b ? b.uid : x ? x.uid : null);
      } else {
        const ids = catalog.items.filter(i => i.category === t.category).map(i => i.id);
        const x = project.extras.items.find(x => (x.restuIds || []).some(id => ids.includes(id)));
        const b = !x && project.burgers.find(b => b.prices.some(q => ids.includes(q.restuId)));
        add(x ? x.uid : b ? b.uid : null);
      }
    }
    // "+ papas" en la descripción: si hay una porción de papas en los extras, también se muestra
    if (/\bPAPA/.test(norm(p.description_es))) {
      const fries = project.extras.items.find(x => /\bPAPA/.test(norm(x.name)));
      if (fries) add(fries.uid);
    }
    // las burgers primero (van al centro de la foto)
    const isBurger = uid => project.burgers.some(b => b.uid === uid);
    return refs.sort((a, b) => isBurger(b) - isBurger(a));
  }

  // Trae las promos vigentes de Restu: crea las nuevas, actualiza precio/vigencia de las que ya
  // estaban (respetando lo que se haya editado a mano) y quita las que terminaron.
  function syncPromos(project, d, catalog, newId) {
    const live = Array.isArray(d.promotions) ? d.promotions : [];
    const items = project.promos.items, added = [], ended = [];
    for (const p of live) {
      const synced = { price: priceText(p), regular: regularOf(p, catalog), when: whenText(p) };
      const cur = items.find(x => x.restuId === p.id);
      if (cur) { Object.assign(cur, synced); continue; }
      items.push({
        id: newId(), source: 'restu', restuId: p.id, enabled: true, display: 'scene',
        badge: BADGE[p.kind] || 'PROMO', title: norm(p.name_es) ? String(p.name_es).toUpperCase() : 'PROMO',
        subtitle: String(p.description_es || '').toUpperCase(), shows: promoShows(p, project, catalog), image: null,
        ...synced,
      });
      added.push(String(p.name_es || 'Promo'));
    }
    const liveIds = new Set(live.map(p => p.id));
    for (let i = items.length - 1; i >= 0; i--) {
      if (items[i].source === 'restu' && !liveIds.has(items[i].restuId)) { ended.push(items[i].title); items.splice(i, 1); }
    }
    return { added, ended };
  }

  global.SmashRestu = {
    fetchStorefront, catalogFrom, autoLink, applyPrices, unlinked, burgerFromGroup, extraFromItem, syncPromos, priceFor, burgerGroups,
  };
})(window);

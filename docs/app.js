(() => {
  const PAGE = 10;
  const CATS = ['legislacion', 'sst', 'noticias'];
  const CAT_LABEL = { legislacion: 'Legislación', sst: 'SST', noticias: 'Noticias' };
  const $ = (id) => document.getElementById(id);
  const state = { items: [], meta: null, cat: '', saved: false, shown: { legislacion: PAGE, sst: PAGE, noticias: PAGE }, bookmarks: new Set() };

  // --- utilidades ---
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
  const limaDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  function ago(iso) {
    const h = (Date.now() - new Date(iso)) / 36e5;
    if (h < 1) return 'hace minutos';
    if (h < 24) return `hace ${Math.floor(h)} h`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : '';
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // Resalta las palabras buscadas sin usar innerHTML.
  function highlight(node, text, words) {
    if (!words.length) { node.textContent = text; return node; }
    const n = norm(text); const ranges = [];
    for (const w of words) { let i = n.indexOf(w); while (i !== -1) { ranges.push([i, i + w.length]); i = n.indexOf(w, i + w.length); } }
    if (!ranges.length) { node.textContent = text; return node; }
    ranges.sort((a, b) => a[0] - b[0]);
    let pos = 0;
    for (const [s, e] of ranges) {
      if (e <= pos) continue;
      const st = Math.max(s, pos);
      if (st > pos) node.append(text.slice(pos, st));
      node.append(el('mark', null, text.slice(st, e))); pos = e;
    }
    if (pos < text.length) node.append(text.slice(pos));
    return node;
  }

  // --- filtros ---
  const words = () => norm($('q').value).split(/\s+/).filter(Boolean);
  function filtered() {
    const q = words(), src = $('src').value, from = $('from').value, to = $('to').value;
    const list = state.items.filter((i) => {
      if (state.cat && i.category !== state.cat) return false;
      if (state.saved && !state.bookmarks.has(i.id)) return false;
      if (src && i.source !== src) return false;
      const d = limaDay(i.date);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q.length) {
        const hay = norm(`${i.title} ${i.summary} ${i.source} ${i.normNumber || ''}`);
        if (!q.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    if ($('sort').value === 'asc') list.reverse();
    return list;
  }

  function syncUrl() {
    const p = new URLSearchParams();
    if ($('q').value) p.set('q', $('q').value);
    if (state.cat) p.set('cat', state.cat);
    if ($('src').value) p.set('src', $('src').value);
    if ($('from').value) p.set('from', $('from').value);
    if ($('to').value) p.set('to', $('to').value);
    if ($('sort').value !== 'desc') p.set('sort', 'asc');
    if (state.saved) p.set('saved', '1');
    try { history.replaceState(null, '', p.toString() ? `?${p}` : location.pathname + location.hash); } catch { /* file:// */ }
  }
  function readUrl() {
    const p = new URLSearchParams(location.search);
    $('q').value = p.get('q') || ''; state.cat = CATS.includes(p.get('cat')) ? p.get('cat') : '';
    $('from').value = p.get('from') || ''; $('to').value = p.get('to') || '';
    if (p.get('sort') === 'asc') $('sort').value = 'asc';
    state.saved = p.get('saved') === '1';
    return p.get('src') || '';
  }

  // --- tarjetas ---
  function card(i, q) {
    const c = el('article', 'card');
    const h = el('h3'); const a = highlight(el('a'), i.title, q);
    a.href = safeUrl(i.url); a.target = '_blank'; a.rel = 'noopener noreferrer'; h.append(a);

    const save = el('button', 'save', state.bookmarks.has(i.id) ? '★' : '☆');
    save.type = 'button'; save.setAttribute('aria-pressed', state.bookmarks.has(i.id)); save.title = 'Guardar'; save.setAttribute('aria-label', 'Guardar');
    save.addEventListener('click', () => {
      state.bookmarks.has(i.id) ? state.bookmarks.delete(i.id) : state.bookmarks.add(i.id);
      store.set('bookmarks', JSON.stringify([...state.bookmarks]));
      if (state.saved) render(); else { save.textContent = state.bookmarks.has(i.id) ? '★' : '☆'; save.setAttribute('aria-pressed', state.bookmarks.has(i.id)); }
      renderStats();
    });

    const m = el('div', 'meta');
    if (Date.now() - new Date(i.firstSeen || 0) < 48 * 36e5) m.append(el('span', 'chip new', 'NUEVO'));
    m.append(el('span', null, [fmtDate(i.date), ago(i.date)].filter(Boolean).join(' · ')), el('span', 'chip', i.source));
    if (i.primary) m.append(el('span', 'chip prim', 'fuente primaria'));
    if (i.normType) m.append(el('span', 'chip', i.normNumber ? `${i.normType} ${i.normNumber}` : i.normType));
    if (i.status) m.append(el('span', 'chip', i.status));

    const p = highlight(el('p', 'clamp'), i.summary, q);
    const act = el('div', 'actions');
    const o = el('a', null, 'Ver referencia original ↗'); o.href = safeUrl(i.url); o.target = '_blank'; o.rel = 'noopener noreferrer';
    act.append(o);
    if (i.summary.length > 160) {
      const t = el('button', 'link', 'Leer más'); t.type = 'button';
      t.addEventListener('click', () => { const open = p.classList.toggle('clamp'); t.textContent = open ? 'Leer más' : 'Leer menos'; });
      act.append(t);
    }
    const share = el('button', 'link', 'Copiar enlace'); share.type = 'button';
    share.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(i.url); share.textContent = '¡Copiado!'; } catch { share.textContent = 'No se pudo copiar'; }
      setTimeout(() => (share.textContent = 'Copiar enlace'), 1500);
    });
    act.append(share);
    c.append(h, save, m, p, act);
    revealObserver.observe(c);
    return c;
  }

  const revealObserver = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); revealObserver.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });

  function render() {
    const list = filtered(), q = words();
    $('status').textContent = `${list.length} resultado(s) de ${state.items.length} registrados.${state.saved ? ' (solo guardados)' : ''}`;
    for (const cat of CATS) {
      const box = $('list-' + cat), items = list.filter((i) => i.category === cat);
      box.replaceChildren();
      $('n-' + cat).textContent = `(${items.length})`;
      document.getElementById(cat).hidden = !!state.cat && state.cat !== cat;
      if (!items.length) box.append(el('p', 'empty', 'Sin resultados con los filtros actuales.'));
      items.slice(0, state.shown[cat]).forEach((i) => box.append(card(i, q)));
      document.querySelector(`.more[data-for="${cat}"]`).hidden = items.length <= state.shown[cat];
    }
    renderChips(list); renderTrend(); syncUrl();
  }

  // --- chips de categoría ---
  function renderChips() {
    const base = state.items; const box = $('chips'); box.replaceChildren();
    const mk = (val, label, n) => {
      const b = el('button', 'chip-btn', label); b.type = 'button'; b.append(el('b', null, String(n)));
      b.setAttribute('aria-pressed', state.cat === val);
      b.addEventListener('click', () => { state.cat = val; reset(); render(); });
      box.append(b);
    };
    mk('', 'Todas', base.length);
    CATS.forEach((c) => mk(c, CAT_LABEL[c], base.filter((i) => i.category === c).length));
    const sv = el('button', 'chip-btn', '★ Guardados'); sv.type = 'button'; sv.append(el('b', null, String(state.bookmarks.size)));
    sv.setAttribute('aria-pressed', state.saved);
    sv.addEventListener('click', () => { state.saved = !state.saved; reset(); render(); });
    box.append(sv);
  }
  const reset = () => CATS.forEach((c) => (state.shown[c] = PAGE));

  // --- estadísticas con conteo animado ---
  function countUp(node, to) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || to < 2) { node.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => { const k = Math.min(1, (t - t0) / 700); node.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  let statsDone = false;
  function renderStats() {
    const weekAgo = limaDay(Date.now() - 7 * 864e5);
    const last = new Date(state.meta.lastUpdate).getTime();
    const defs = [
      ['Registros acumulados', state.items.length, () => { state.cat = ''; $('from').value = ''; }],
      ['Últimos 7 días', state.items.filter((i) => limaDay(i.date) >= weekAgo).length, () => { state.cat = ''; $('from').value = weekAgo; }],
      ['Nuevos en la última actualización', state.items.filter((i) => new Date(i.firstSeen || 0).getTime() >= last - 36e5).length, null],
      ['Normas publicadas', state.items.filter((i) => i.normType).length, () => { state.cat = 'legislacion'; }],
      ['Temas de SST', state.items.filter((i) => i.category === 'sst').length, () => { state.cat = 'sst'; }],
    ];
    const box = $('stats'); box.replaceChildren();
    for (const [label, n, fn] of defs) {
      const b = el('button', 'stat'); b.type = 'button';
      const num = el('span', 'n', statsDone ? String(n) : '0'); b.append(num, el('span', 'l', label));
      if (!statsDone) countUp(num, n);
      b.addEventListener('click', () => { if (fn) fn(); reset(); render(); $('status').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      box.append(b);
    }
    statsDone = true;
  }

  // --- gráfico de actividad ---
  function renderTrend() {
    const days = []; for (let k = 29; k >= 0; k--) days.push(limaDay(Date.now() - k * 864e5));
    const counts = Object.fromEntries(days.map((d) => [d, 0]));
    const base = state.items.filter((i) => (!state.cat || i.category === state.cat) && (!$('src').value || i.source === $('src').value));
    base.forEach((i) => { const d = limaDay(i.date); if (d in counts) counts[d]++; });
    const max = Math.max(1, ...Object.values(counts)); const box = $('trend'); box.replaceChildren();
    days.forEach((d, idx) => {
      const b = el('button', 'bar'); b.type = 'button';
      const on = $('from').value === d && $('to').value === d;
      b.setAttribute('aria-pressed', on); b.title = `${d}: ${counts[d]} publicación(es)`; b.setAttribute('aria-label', b.title);
      const i = el('i'); i.style.height = `${Math.max(3, (counts[d] / max) * 100)}%`; i.style.animationDelay = `${idx * 12}ms`; b.append(i);
      b.addEventListener('click', () => { $('from').value = on ? '' : d; $('to').value = on ? '' : d; reset(); render(); });
      box.append(b);
    });
  }

  function renderLaws(laws) {
    const tb = document.querySelector('#laws tbody');
    for (const l of laws) {
      const tr = el('tr'); const td1 = el('td'); const a = el('a', null, l.number);
      a.href = safeUrl(l.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
      td1.append(a, el('div', 'muted', l.title));
      tr.append(td1, el('td', null, l.type), el('td', null, l.published), el('td', null, l.status + (l.note ? ` — ${l.note}` : '')), el('td', null, l.topic));
      tb.append(tr);
    }
  }

  // --- tema, navegación y extras ---
  function initChrome() {
    const saved = store.get('theme'); if (saved) document.documentElement.dataset.theme = saved;
    $('theme').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; store.set('theme', next);
    });
    const links = [...document.querySelectorAll('#jump a')];
    const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((l) => l.classList.toggle('on', l.hash === '#' + e.target.id)); }), { rootMargin: '-30% 0px -60% 0px' });
    ['legislacion', 'sst', 'noticias', 'referencia'].forEach((id) => spy.observe($(id)));
    addEventListener('scroll', () => { $('top').hidden = scrollY < 600; document.querySelector('.top').classList.toggle('stuck', scrollY > 10); }, { passive: true });
    $('top').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
    addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('q').focus(); } });
    const q = debounce(() => { reset(); render(); }, 150);
    $('q').addEventListener('input', q);
    ['src', 'from', 'to', 'sort'].forEach((id) => $(id).addEventListener('input', () => { reset(); render(); }));
    $('reset').addEventListener('click', () => { $('filters').reset(); state.cat = ''; state.saved = false; reset(); render(); });
    document.querySelectorAll('.more').forEach((b) => b.addEventListener('click', () => { state.shown[b.dataset.for] += PAGE; render(); }));
  }

  function skeleton() { CATS.forEach((c) => { for (let k = 0; k < 2; k++) $('list-' + c).append(el('div', 'skel')); }); }

  async function init() {
    initChrome(); skeleton();
    try { state.bookmarks = new Set(JSON.parse(store.get('bookmarks') || '[]')); } catch { /* ignorar */ }
    try {
      const [items, meta, laws] = await Promise.all(['items', 'meta', 'laws'].map((n) => fetch(`data/${n}.json`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
      state.items = items; state.meta = meta;
      [...new Set(items.map((i) => i.source))].sort().forEach((s) => { const o = el('option', null, s); o.value = s; $('src').append(o); });
      $('src').value = readUrl();
      renderLaws(laws); renderStats();
      $('last').textContent = new Date(meta.lastUpdate).toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Lima' }) + ' (hora de Lima)';
      render();
    } catch {
      CATS.forEach((c) => $('list-' + c).replaceChildren());
      $('status').textContent = 'No se pudo cargar el contenido. Intente nuevamente más tarde.';
    }
  }
  init();
})();

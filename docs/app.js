(() => {
  const PAGE = 10;
  const $ = (id) => document.getElementById(id);
  const CATS = ['legislacion', 'sst', 'noticias'];
  const state = { items: [], shown: { legislacion: PAGE, sst: PAGE, noticias: PAGE } };
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function filtered() {
    const q = norm($('q').value).split(/\s+/).filter(Boolean);
    const cat = $('cat').value, src = $('src').value;
    const from = $('from').value, to = $('to').value;
    return state.items.filter((i) => {
      if (cat && i.category !== cat) return false;
      if (src && i.source !== src) return false;
      const d = i.date.slice(0, 10);
      if (from && d < from) return false;
      if (to && d > to) return false;
      if (q.length) {
        const hay = norm(`${i.title} ${i.summary} ${i.source} ${i.normNumber || ''}`);
        if (!q.every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }

  function card(i) {
    const c = el('article', 'card');
    const h = el('h3'); const a = el('a', null, i.title);
    a.href = safeUrl(i.url); a.target = '_blank'; a.rel = 'noopener noreferrer'; h.append(a);
    const m = el('div', 'meta');
    m.append(el('span', null, fmtDate(i.date)), el('span', 'chip', i.source));
    if (i.primary) m.append(el('span', 'chip prim', 'fuente primaria'));
    if (i.normType) m.append(el('span', 'chip', i.normNumber ? `${i.normType} ${i.normNumber}` : i.normType));
    if (i.status) m.append(el('span', 'chip', i.status));
    const p = el('p', null, i.summary);
    const o = el('a', 'orig', 'Ver referencia original ↗'); o.href = safeUrl(i.url); o.target = '_blank'; o.rel = 'noopener noreferrer';
    c.append(h, m, p, o);
    return c;
  }

  function render() {
    const list = filtered();
    $('status').textContent = `${list.length} resultado(s) de ${state.items.length} registrados.`;
    for (const cat of CATS) {
      const box = $('list-' + cat), items = list.filter((i) => i.category === cat);
      box.replaceChildren();
      if (!items.length) box.append(el('p', 'empty', 'Sin resultados con los filtros actuales.'));
      items.slice(0, state.shown[cat]).forEach((i) => box.append(card(i)));
      document.querySelector(`.more[data-for="${cat}"]`).hidden = items.length <= state.shown[cat];
    }
  }

  function renderLaws(laws) {
    const tb = document.querySelector('#laws tbody');
    for (const l of laws) {
      const tr = el('tr');
      const td1 = el('td'); const a = el('a', null, l.number); a.href = safeUrl(l.url); a.target = '_blank'; a.rel = 'noopener noreferrer';
      td1.append(a, el('div', 'muted', l.title));
      tr.append(td1, el('td', null, l.type), el('td', null, l.published), el('td', null, l.status + (l.note ? ` — ${l.note}` : '')), el('td', null, l.topic));
      tb.append(tr);
    }
  }

  async function init() {
    try {
      const [items, meta, laws] = await Promise.all(['items', 'meta', 'laws'].map((n) => fetch(`data/${n}.json`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(n); return r.json(); })));
      state.items = items;
      [...new Set(items.map((i) => i.source))].sort().forEach((s) => { const o = el('option', null, s); o.value = s; $('src').append(o); });
      renderLaws(laws);
      $('last').textContent = new Date(meta.lastUpdate).toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short', timeZone: 'America/Lima' }) + ' (hora de Lima)';
      render();
    } catch (e) {
      $('status').textContent = 'No se pudo cargar el contenido. Intente nuevamente más tarde.';
    }
  }

  ['q', 'cat', 'src', 'from', 'to'].forEach((id) => $(id).addEventListener('input', () => { CATS.forEach((c) => (state.shown[c] = PAGE)); render(); }));
  $('reset').addEventListener('click', () => { $('filters').reset(); CATS.forEach((c) => (state.shown[c] = PAGE)); render(); });
  document.querySelectorAll('.more').forEach((b) => b.addEventListener('click', () => { state.shown[b.dataset.for] += PAGE; render(); }));
  init();
})();

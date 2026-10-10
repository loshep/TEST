// Actualización diaria: recopila fuentes, deduplica, conserva historial y escribe data/*.json
// Uso: node scripts/update.mjs   (Node >= 18, sin dependencias)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { SOURCES } from './sources.mjs';

const DATA = new URL('../docs/data/', import.meta.url);
const UA = 'Mozilla/5.0 (compatible; LegislacionLaboralPeBot/1.0; +https://github.com/loshep/TEST)';

const ENT = { lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', amp: '&' };
const decode = (s) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(lt|gt|quot|apos|nbsp|amp);/g, (_, e) => ENT[e]);
const strip = (html) =>
  decode(decode(html).replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|li)>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
};

function summarize(text, max = 300) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return (end > 120 ? cut.slice(0, end + 1) : cut.replace(/\s\S*$/, '') + '…');
}

const SST = /seguridad y salud|\bsst\b|salud ocupacional|accidentes? (de trabajo|laboral)|enfermedad(es)? ocupacional|riesgos? (laboral|disergon)|ergonom|comit[eé] de seguridad|supervisor de seguridad|conasst|iperc|trabajo en altura|sctr|pol[ií]tica nacional de seguridad/i;
const NORMA = /\b(decreto (supremo|legislativo|de urgencia)|resoluci[oó]n (ministerial|suprema|de superintendencia|de superintendencia|jefatural|viceministerial)|ley\s*(n[°º.]?\s*)?\d|\bD\.?S\.?\s*\d|\bR\.?M\.?\s*\d)/i;

function parseNorma(title, text) {
  const t = `${title} ${text.slice(0, 200)}`;
  const types = [
    [/decreto legislativo/i, 'Decreto Legislativo'], [/decreto de urgencia/i, 'Decreto de Urgencia'],
    [/decreto supremo|\bD\.?S\.?\s*\d/i, 'Decreto Supremo'], [/resoluci[oó]n ministerial|\bR\.?M\.?\s*\d/i, 'Resolución Ministerial'],
    [/resoluci[oó]n de superintendencia/i, 'Resolución de Superintendencia'], [/resoluci[oó]n jefatural/i, 'Resolución Jefatural'],
    [/resoluci[oó]n viceministerial/i, 'Resolución Viceministerial'], [/resoluci[oó]n suprema/i, 'Resolución Suprema'],
    [/\bley\b/i, 'Ley'],
  ];
  const type = (types.find(([re]) => re.test(t)) || [null, 'Norma'])[1];
  const num = (t.match(/\d{1,4}-\d{4}(?:-[A-Z0-9/]+)*/) || [null])[0];
  return { normType: type, normNumber: num };
}

async function fetchText(url, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) { err = e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  throw err;
}

function parseFeed(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    let title = strip(tag(b, 'title'));
    const link = decode(tag(b, 'link')).trim() || decode(tag(b, 'guid')).trim();
    const pub = new Date(decode(tag(b, 'pubDate')));
    const text = strip(tag(b, 'description'));
    const origin = strip(tag(b, 'source'));
    if (!title || !/^https?:\/\//.test(link) || isNaN(pub)) continue;
    if (origin && title.endsWith(` - ${origin}`)) title = title.slice(0, -(origin.length + 3));
    out.push({ title, link, date: pub.toISOString(), text, origin });
  }
  return out;
}

function classify(item, src) {
  const blob = `${item.title} ${item.text.slice(0, 400)}`;
  const isNorm = src.kind === 'norma' || (src.kind === 'auto' && NORMA.test(item.title));
  if (SST.test(blob)) return { category: 'sst', isNorm };
  if (isNorm) return { category: 'legislacion', isNorm };
  return { category: 'noticias', isNorm };
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const idOf = (link, title) => createHash('sha1').update(link.replace(/[?#].*$/, '') + '|' + norm(title)).digest('hex').slice(0, 16);
const readJson = async (name, fallback) => {
  try { return JSON.parse(await readFile(new URL(name, DATA), 'utf8')); } catch { return fallback; }
};

async function main() {
  await mkdir(DATA, { recursive: true });
  const store = await readJson('items.json', []);
  const seenId = new Set(store.map((i) => i.id));
  const seenKey = new Set(store.map((i) => norm(i.title) + '|' + i.date.slice(0, 10)));
  const now = new Date().toISOString();
  const report = [];
  let added = 0;

  const add = (item) => {
    const key = norm(item.title) + '|' + item.date.slice(0, 10);
    if (seenId.has(item.id) || seenKey.has(key)) return false;
    seenId.add(item.id); seenKey.add(key); store.push(item); return true;
  };

  for (const src of SOURCES) {
    const r = { id: src.id, name: src.name, ok: false, found: 0, added: 0 };
    try {
      const entries = parseFeed(await fetchText(src.url), src);
      r.found = entries.length; r.ok = true;
      for (const e of entries) {
        if (src.filter && !src.filter.test(`${e.title} ${e.text}`)) continue;
        const { category, isNorm } = classify(e, src);
        const item = {
          id: idOf(e.link, e.title), title: e.title, date: e.date, category,
          source: e.origin || src.name, sourceId: src.id, primary: !!src.primary,
          summary: summarize(e.text) || 'Consulte la fuente original para el detalle.',
          url: e.link, firstSeen: now,
        };
        if (isNorm) Object.assign(item, parseNorma(e.title, e.text), { status: 'Vigente al publicarse' });
        if (add(item)) { r.added++; added++; }
      }
    } catch (e) { r.error = String(e.message || e); }
    report.push(r);
    console.log(`${r.ok ? 'OK ' : 'ERR'} ${src.id}: encontrados ${r.found}, nuevos ${r.added}${r.error ? ' — ' + r.error : ''}`);
  }

  // Respaldo manual: docs/data/manual.json -> [{title,date,category,source,summary,url,...}]
  for (const m of await readJson('manual.json', [])) {
    if (!m.title || !m.url || !m.date || !m.category) continue;
    const item = { source: 'Carga manual', sourceId: 'manual', primary: false, summary: '', firstSeen: now, ...m };
    item.date = new Date(m.date).toISOString();
    item.id = idOf(m.url, m.title);
    if (add(item)) { added++; }
  }

  if (report.every((r) => !r.ok)) {
    console.error('Todas las fuentes fallaron; no se modifica el historial.');
    process.exit(1);
  }

  store.sort((a, b) => b.date.localeCompare(a.date));
  await writeFile(new URL('items.json', DATA), JSON.stringify(store, null, 1));
  await writeFile(new URL('meta.json', DATA), JSON.stringify({ lastUpdate: now, added, total: store.length, sources: report }, null, 1));
  console.log(`Total ${store.length} ítems (${added} nuevos).`);
}

main();

// Fuentes de información. Prioridad: fuente primaria (gob.pe oficial) > Google Noticias restringido a El Peruano.
// kind: 'noticia' | 'norma' | 'auto' (decide por el texto)
// filter: expresión regular opcional; si está definida, el ítem debe coincidir para conservarse.

const gob = (inst, tipo) =>
  `https://www.gob.pe/busquedas.rss?institucion=${inst}&contenido%5B%5D=${tipo}`;

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=PE&ceid=PE:es-419`;

const LABORAL = /laboral|trabaj|planilla|plame|t-registro|remuner|gratificaci|cts\b|essalud|seguridad social|sindic|inspecci|sanci|multa|escala|seguridad y salud|accidente|riesgo|protocolo|directiva|despido|vacaciones|utilidades/i;

export const SOURCES = [
  { id: 'mtpe-noticias', name: 'MTPE', url: gob('mtpe', 'noticias'), kind: 'noticia', primary: true },
  { id: 'mtpe-normas', name: 'MTPE', url: gob('mtpe', 'normas'), kind: 'norma', primary: true },
  { id: 'sunafil-noticias', name: 'SUNAFIL', url: gob('sunafil', 'noticias'), kind: 'noticia', primary: true },
  { id: 'sunafil-normas', name: 'SUNAFIL', url: gob('sunafil', 'normas'), kind: 'norma', primary: true,
    filter: /inspecci|sanci|multa|escala|seguridad y salud|laboral|protocolo|directiva|lineamiento|trabajo/i },
  { id: 'sunat-noticias', name: 'SUNAT', url: gob('sunat', 'noticias'), kind: 'noticia', primary: true,
    filter: /planilla|plame|t-registro|laboral|trabajador|seguridad social|essalud|quinta categor/i },
  { id: 'elperuano-laboral', name: 'El Peruano', url: gnews('site:elperuano.pe (decreto supremo OR ley OR resolución) trabajo laboral when:30d'), kind: 'auto', filter: LABORAL },
  { id: 'elperuano-sst', name: 'El Peruano', url: gnews('site:elperuano.pe "seguridad y salud en el trabajo" when:60d'), kind: 'auto' },
  { id: 'conasst', name: 'Consejo Nacional de SST (CONASST)', url: gnews('"Consejo Nacional de Seguridad y Salud en el Trabajo" OR CONASST when:90d'), kind: 'auto' },
  { id: 'prensa-laboral', name: 'Prensa (Google Noticias)', url: gnews('legislación laboral Perú MTPE OR SUNAFIL OR "Congreso" trabajadores when:14d'), kind: 'noticia', filter: LABORAL },
];

# Observatorio Laboral Perú

Sitio informativo con legislación laboral, SST y noticias del Perú, actualizado cada día a las 06:00 a. m. (Lima).

## Arquitectura

Sitio **estático + GitHub Actions + GitHub Pages**. Sin servidor ni base de datos: es gratis, estable y el historial queda versionado en Git.

```
.github/workflows/daily-update.yml   cron 11:00 UTC (= 06:00 Lima), recolecta, guarda y despliega
scripts/sources.mjs                  lista de fuentes y filtros
scripts/update.mjs                   recolector (Node 18+, sin dependencias)
docs/index.html, styles.css, app.js  interfaz (filtros, buscador, paginación)
docs/data/items.json                 historial acumulado (nunca se borra)
docs/data/meta.json                  fecha de última actualización y estado por fuente
docs/data/laws.json                  normas de referencia (curadas a mano)
docs/data/manual.json                carga manual de respaldo
```

**Duplicados:** cada ítem tiene un id (hash de enlace + título normalizado) y además se compara título + fecha. **Historial:** `items.json` solo crece; los ítems viejos siguen visibles con los filtros de fecha.

## Fuentes

| Fuente | Cómo se obtiene |
|---|---|
| MTPE, SUNAFIL, SUNAT (noticias y normas) | RSS oficial de gob.pe (fuente primaria) |
| El Peruano (normas publicadas) | Google Noticias RSS restringido a `site:elperuano.pe` (no hay RSS abierto estable) |
| CONASST | Búsqueda en Google Noticias (no tiene canal propio) |
| Prensa | Google Noticias, solo como complemento |

Limitaciones: los enlaces de Google Noticias redirigen a la nota original; el resumen de esos ítems es el que entrega el feed. El estado de vigencia de las normas nuevas se marca «Vigente al publicarse» porque no se puede verificar automáticamente si fueron modificadas después; las normas de `laws.json` se mantienen a mano.

**Respaldo manual:** si una fuente falla o no ofrece acceso, agregue objetos a `docs/data/manual.json`:

```json
[{"title":"Decreto Supremo N.° 000-2026-TR","date":"2026-10-01","category":"legislacion","source":"El Peruano","summary":"Resumen breve.","url":"https://...","normType":"Decreto Supremo","normNumber":"000-2026-TR","status":"Vigente"}]
```
`category`: `legislacion`, `sst` o `noticias`. Se incorporan en la siguiente ejecución.

## Despliegue

1. Suba este repositorio a GitHub (rama `main`).
2. En **Settings → Pages → Source** elija **GitHub Actions**.
3. En **Actions** ejecute manualmente «Actualización diaria y despliegue» (Run workflow) la primera vez.
4. A partir de ahí corre solo cada día. GitHub puede retrasar los cron algunos minutos.

Prueba local: `node scripts/update.mjs` y luego `npx serve docs`.

# Herramientas de la presentación

Scripts usados para producir `presentacion/UTECVis-presentacion.pptx` y sus evidencias.
No forman parte de la aplicación; se ejecutan con la app corriendo en `localhost:5050`.

| Archivo | Qué hace | Requisitos |
|---|---|---|
| `capture_app.py` | Capturas C09–C25 de la app a 1440×900 (escala 2×) en `evidencias/app/`; imprime `captura-log.json` con rangos y valores de B simulada | `pip install playwright`; Google Chrome instalado |
| `capture_cris_crops.py` | Recortes legibles de CRIS (intereses, huella, cabeceras) en `evidencias/cris/` | Playwright, Pillow |
| `deck.js` | Genera el PPTX (44 láminas, notas, anexos) a partir de las evidencias | Node, `npm install pptxgenjs jszip`; `APPLY_THEME` apunta a un `apply_theme.js` que escriba los colores del tema |
| `render_pdf.swift` | Convierte el PDF exportado en imágenes por lámina para revisión | `swiftc` (macOS) |

Flujo: `python capture_app.py evidencias/app` → `python capture_cris_crops.py` →
`node deck.js` → exportar a PDF (LibreOffice: `soffice --headless --convert-to pdf`) →
`render_pdf <pdf> <carpeta> 1.2` para revisar cada lámina.

# Resultado de extracción de perfiles CRIS

Ejecutado el 25/10/2026 (America/Lima). Identificador UTC: `20261026T002944Z-5adcab54`.

## Cobertura y método

- Tres páginas del directorio: 104 URLs únicas, coincidentes con el total visible.
- 104 perfiles descargados, normalizados y exportados; cero errores de adquisición o parseo.
- 107 snapshots verificados mediante SHA-256: directorio y perfiles.
- Sin duplicados de ID, URL ni nombre; el conjunto exportado coincide con el inventario.
- Python utilizó Apple Events sobre una sesión de Safari admitida previamente por la persona.
- Tiempo de adquisición: 10.1 minutos. Se respetó el Crawl-Delay observado de cinco segundos.

## Calidad y ausencias

| Campo | Disponible | Ausente |
|---|---:|---:|
| Departamento | 95 | 9 |
| Grupo o centro de investigación | 53 | 51 |
| Intereses de investigación | 90 | 14 |
| Correo público | 104 | 0 |
| Imagen | 102 | 2 |

Se revisó el HTML de los perfiles sin departamento y sin sección de intereses:
las ausencias corresponden al contenido de la fuente. Los grupos se identifican
por afiliaciones cuyo nombre empieza por «Grupo de» o «Centro de»; institutos y
facultades no se reclasifican automáticamente como grupos o departamentos.
Las citas siguen en `null` en los 104 perfiles: no se intentó extraer esas métricas.

Enlaces externos conservados: ORCID 96,
Scopus 81,
Google Scholar 77 y
CTI Vitae 41.
Estos son enlaces publicados por CRIS; no se descargaron las páginas externas.

## Archivos locales

- `data/manifests/20261026T002944Z-5adcab54.json`: procedencia, parámetros, URLs, fechas y hashes.
- `data/raw/20261026T002944Z-5adcab54/`: documentos originales.
- `data/interim/20261026T002944Z-5adcab54/quality.json`: controles de normalización.
- `data/processed/20261026T002944Z-5adcab54/faculty_network.json`: ocho campos con la estructura del ejemplo del profesor.
- `data/processed/20261026T002944Z-5adcab54/faculty_nodes.json`: listas estructuradas y procedencia por perfil.
- `data/processed/20261026T002944Z-5adcab54/verification.json`: comprobaciones finales y cobertura.

Los datos generados se conservan localmente y están excluidos de Git. El repositorio
contiene el código, pruebas e instrucciones para repetir la extracción. El scraping
requiere acceso vigente; las transformaciones se repiten sobre el HTML sin conexión.

## Alcance pendiente

Este resultado cierra la adquisición de perfiles del directorio consultado.
Publicaciones, proyectos, aristas, métricas de red y la interfaz Flask + D3 siguen
pendientes. Una cobertura completa del directorio no implica haber extraído todos
los datos de investigación del portal.

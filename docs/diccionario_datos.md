# Diccionario y contratos

## Registro normalizado: faculty_nodes.json

Objeto raíz `{"nodes": [...]}`. Este formato se usa para análisis y trazabilidad.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | entero | Hash determinista de 52 bits de la URL canónica. Único por ejecución. |
| `name` | texto | Obligatorio y no vacío. |
| `image_url` | texto o null | Fotografía institucional cuando se identifica. |
| `department` | texto o null | Primera afiliación departamental; revisar múltiples afiliaciones. |
| `departments` | lista | Conserva todas las afiliaciones departamentales reconocidas. |
| `email` | texto o null | Solo correo publicado. |
| `research_groups` | lista de textos | Sin duplicados exactos; alias por revisar en el piloto. |
| `research_areas` | lista de textos | Campos reconocidos en la sección de intereses. |
| `biography` | texto o null | Perfil profesional. |
| `education` | lista de textos | Formación; estructura adicional pendiente del piloto. |
| `external_ids` | objeto | ORCID y enlaces explícitos de Scopus, Scholar y CTI Vitae si existen. |
| `citations` | entero >= 0 o null | Citas del panel general de la persona `cite-hallindex` publicado en CRIS. |
| `h_index` | entero >= 0 o null | Índice h del mismo panel general. |
| `citation_source` | texto o null | Scopus o PlumX según la explicación de CRIS; CRIS UTEC si no declara proveedor. |
| `citation_source_url` | URL o null | Página CRIS donde se observó el valor; no implica consulta directa al proveedor. |
| `citation_window` | texto o null | `all` identifica el panel general; no se toma h5/h10 como total. |
| `citation_basis` | texto o null | Explicación de cálculo publicada en CRIS, basada en publicaciones de Pure. |
| `citation_retrieved_at` | fecha o null | Consulta de ese valor; necesaria si hay citas. |
| `source_url` | URL | Perfil canónico CRIS en español. |
| `retrieved_at` | fecha UTC | Momento de adquisición, no de transformación. |
| `raw_snapshot` | ruta relativa | Evidencia descargada dentro de esta ejecución. |

Los ID canónicos no dependen del orden del listado y caben en un entero seguro
de JavaScript. Si cambia el slug del perfil, habrá que reconciliarlo mediante
identificadores externos; el pipeline rechaza colisiones dentro de una ejecución.

## Exportación compatible: faculty_network.json

Conserva exactamente los ocho campos del ejemplo y su objeto raíz `nodes`.
`research_groups` y `research_areas` son cadenas separadas por `;`; `id` es numérico.
Cuando falta un texto, la exportación usa cadena vacía, salvo departamento que usa
`Unknown Department`. Las citas desconocidas son `null`: esta diferencia respecto
de los ceros del ejemplo es intencional y evita inventar una observación.

Esta exportación no tiene aristas. El archivo final de la red tendrá otro nombre,
`network.json`, y contendrá nodos normalizados, aristas y metadatos.

## Futuro contrato de arista

Campos previstos: `source`, `target` (ID existentes), `relation` (tipo), `weight`
(significado documentado), `evidence` (identificadores/URLs de publicaciones,
proyectos o atributos compartidos). Sin autoenlaces ni duplicados no dirigidos.

No se etiquetará un grupo compartido como coautoría. En una relación de similitud,
guardar también método, parámetros y umbral. Estos adaptadores todavía no existen.

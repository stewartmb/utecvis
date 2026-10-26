# Datos finales de UtecVis — 25/10/2026

El conjunto final para la cohorte de **104 investigadores** está congelado y validado.
La adquisición se hizo con Python usando la sesión admitida de Safari. Los datos
se consumen sin abrir el navegador ni repetir el scraping.

| Contenido | Cantidad |
|---|---:|
| Investigadores | 104 |
| Publicaciones únicas después de unir cinco alias por DOI | 2.474 |
| Proyectos | 129 |
| Pares conectados con evidencia | 74 |
| Pares con coautoría individual identificada | 35 |
| Pares con proyecto compartido | 51 |
| Pares con publicación compartida sin afirmar coautoría individual | 1 |
| Fichas detalladas adquiridas | 219: 129 proyectos y 90 publicaciones |
| Huellas digitales completas | 80, con 4.683 conceptos |
| Perfiles con RENACYT disponible | 64 |
| Perfiles sin panel general de citas | 26 |
| Componentes de la red agregada | 61 |
| Investigadores aislados dentro de la cohorte | 55 |

Los tipos de vínculo pueden coincidir en un mismo par: sus cantidades no se suman
para obtener 74. Cada arista conserva sus registros de evidencia y sus fuentes.
Los 55 aislados pueden colaborar con personas externas a esta cohorte.

## Cobertura y límites

Se completaron las 196 tareas de listas/huellas (231 páginas) y las 219 fichas
seleccionadas de evidencia. Se comprobaron paginación, cantidades y hashes. Las
listas incluyen 2.976 asociaciones persona-publicación y 177 persona-proyecto.
La deduplicación produce 2.474 publicaciones y 129 proyectos.

Esto cubre las listas de publicaciones y proyectos de los 104 perfiles; no es una
copia de todo CRIS. Todas las fichas de proyecto están disponibles; las fichas de
publicaciones se seleccionaron para comprobar colaboraciones y resolver autores.
No se descargaron los resúmenes, todos los metadatos detallados ni los textos
completos de las 2.474 publicaciones.

Hay 605 trabajos con autor colectivo. Se conserva esa atribución. En 30 fichas
individuales tampoco se resolvió al titular de la lista entre los autores
individuales; se mantiene la asociación de la lista sin afirmar coautoría.
Los valores ausentes siguen siendo `null` o listas vacías. Las citas y el índice h
conservan proveedor y fecha; no se estimaron cifras ni se consultó masivamente Scholar.

## Archivos y uso

El snapshot es `data/processed/20261026T012402Z-a32612e7/`.
`network.json` es la entrada para Flask/D3; `publications.json` y `projects.json`
conservan los registros de respaldo. También se incluyen nodos y aristas separados,
catálogo de organizaciones, métricas, calidad, metadatos y verificación.

```bash
UTECVIS_NETWORK_FILE=data/processed/20261026T012402Z-a32612e7/network.json flask --app app run
```

La API `/api/network` devolvió **HTTP 200**, con 104 nodos y 74 aristas.
Las 30 pruebas automatizadas pasaron y Ruff no reportó problemas. Se verificaron
identidades únicas, extremos de aristas, correspondencia entre pesos y evidencias,
e integridad de las entradas de la congelación.

El ZIP `utecvis_datos_finales.zip` entrega este snapshot, esquema y documentación.
Los HTML originales y manifiestos quedan conservados localmente en el proyecto;
el ZIP no incluye sesiones, cookies ni el entorno virtual. Los hashes de los
archivos entregados están en `SHA256SUMS.txt`.

**Etapa pendiente del proyecto completo:** construir la interfaz D3 y sus cuatro
tareas interactivas, validar el mantra de visualización y preparar la exposición.
La preparación de datos queda cerrada con el alcance descrito.

Ver [método y comandos reproducibles](pipeline_red.md).

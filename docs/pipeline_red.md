# Pipeline de datos finales de UtecVis

## Alcance y criterio de cierre

La cohorte se fija en los 104 perfiles del directorio adquirido. Se recorren todas
las listas de publicaciones y proyectos que esos perfiles publican, con paginación
y comparación de cantidades; se descargan también las huellas digitales completas.
Las secciones no publicadas se documentan como ausentes. No se incorporan personas
externas a los nodos de la red; sus nombres y enlaces se conservan en los registros.

Una adquisición completa de estas listas no equivale a descargar cada página ni
cada campo existente en todo CRIS. Se conservan metadatos de lista de cada trabajo,
fichas completas de todos los proyectos y fichas de publicaciones que requieren
confirmar colaboraciones individuales o resolver identidades. Los registros con
autor colectivo conservan esa atribución. Los resúmenes y metadatos detallados de
trabajos individuales restantes pueden ampliarse posteriormente; no son necesarios
para demostrar asociaciones dentro de la cohorte ya enumeradas en las listas.

## Comandos

Desde la raíz del repositorio, con el entorno virtual activado y una sesión de
Safari admitida para CRIS:

```bash
# 1. Listas completas y huellas. Imprime el manifiesto de colección.
python -m extraccion_datos.collect_network \
  --profiles-manifest data/manifests/20261026T002944Z-5adcab54.json

# 2. Fichas de evidencia. Usar el ID impreso en el paso anterior.
python -m extraccion_datos.collect_details \
  --collection-manifest data/manifests/ID_DE_COLECCION.json \
  --nodes data/processed/20261026T002944Z-5adcab54/faculty_nodes.json

# 3. Congelar una vez que ambas adquisiciones estén completas.
python -m extraccion_datos.freeze_network \
  --collection-manifest data/manifests/ID_DE_COLECCION.json \
  --details-manifest data/manifests/ID_DE_DETALLES.json
```

Los dos primeros comandos admiten `--resume data/manifests/ID.json`, usando su
propio manifiesto. Conservan el avance y verifican los hashes de lo reutilizado.
Una sesión caducada o una diferencia de cobertura se registra como fallo parcial.
No se publica un conjunto parcial como final. La transformación y congelación usan
los HTML guardados; el tercer comando no requiere navegador.

## Identidad y deduplicación

- Personas: URL explícita de perfil, con normalización de codificación URI. ORCID
  puede resolver autores sin enlace si coincide de forma inequívoca con la cohorte.
  No se asignan identidades por similitud de nombres.
- Trabajos: URL CRIS canónica; cuando existe DOI se agrupan sus alias bajo el DOI.
  Se conservan observaciones, nombres originales y URLs de todos los registros.
- Organizaciones: identidad derivada de URL y alias preservados. Departamento,
  grupo, centro, instituto, facultad y universidad se mantienen como tipos distintos.
- Los ID originales de los 104 perfiles se conservan como enteros seguros para JS.

## Significado de las conexiones

Cada par de personas aparece una sola vez en `edges`, con contadores por tipo:

| Tipo | Evidencia | Interpretación |
|---|---|---|
| `coauthorship` | Autores individuales identificados en la ficha detallada, mediante URL u ORCID. | Coautoría individual comprobada. |
| `shared_project` | Pertenencia al mismo proyecto, con listas y participantes de la ficha detallada. | Participación común; roles conservados en el registro. |
| `shared_publication` | El mismo trabajo aparece asociado a ambas personas; incluye autor colectivo como LHCb o asociación sin autoría individual resuelta. | Publicación compartida; no afirma autoría individual que la fuente no desglosa. |

Si un par tiene varios tipos, `relation` es `academic_collaboration` y `relations`
lista sus tipos. `counts` permite filtrar o calcular pesos por tipo. `weight` suma
el número de registros distintos compartidos, deduplicados por DOI/URL. Cada unidad
de peso corresponde a una entrada de `evidence` con identificador de registro,
fuente, fechas y snapshots de respaldo. Compartir departamento o tema no crea una
arista de colaboración automáticamente.

La red puede contener investigadores aislados: su ausencia de conexiones dentro
de esta cohorte no implica ausencia de colaboración con otras instituciones.
Tampoco se interpreta un alto número de trabajos colectivos como una medida de
calidad individual. Los tipos y pesos originales permiten análisis separados.

## Atributos y métricas

Los nodos conservan los campos originales, citas e índice h con proveedor y fecha,
RENACYT, afiliaciones con roles y huellas completas con UUID, etiqueta, ponderación
y área temática. La ponderación de un concepto es la publicada por CRIS dentro de
la huella de cada investigador; no es una probabilidad.

Se calculan grado, grado ponderado, centralidad de grado, intermediación sin pesos,
componentes, comunidades, puntos de articulación y aristas puente. Las comunidades
usan modularidad con peso de registros compartidos. Los pesos no se usan como
longitudes de camino. El análisis incluye cobertura y componentes por cada capa.
Las métricas del archivo son las de la red agregada; una vista filtrada debe
recalcular las que dependan de los filtros o indicar ese alcance.

Se conserva el año y estado de trabajos aceptados o fechados en el futuro. Su
inclusión refleja lo indexado por CRIS durante la adquisición y permite filtrar
por año/estado sin inventar una fecha efectiva de publicación.

## Archivos congelados

`data/processed/ID_DE_COLECCION/` contiene:

- `network.json`: nodos, aristas y metadatos para Flask/D3.
- `faculty_nodes.json` y `faculty_edges.json`: archivos separados.
- `faculty_network.json`: exportación de ocho campos compatible con el ejemplo.
- `publications.json` y `projects.json`: registros de respaldo y participantes.
- `organisations.json`: catálogo de afiliaciones y miembros de la cohorte.
- `analysis.json`: componentes, comunidades, puentes y estadísticas por capa.
- `quality.json`: cobertura, ausencias y alcance de las fichas detalladas.
- `metadata.json`: metodología, versiones, manifiestos y hashes de código/entradas.

`data/processed/latest.json` identifica la ejecución seleccionada. Los snapshots
originales y los registros intermedios permanecen en sus carpetas de origen.

## Servir los datos con Flask

```bash
UTECVIS_NETWORK_FILE=data/processed/ID_DE_COLECCION/network.json flask --app app run
```

`/api/network` valida el contrato antes de devolver los datos. La interfaz D3 es
una etapa posterior: esta ejecución prepara y verifica sus datos. La aplicación
puede consumir el snapshot congelado sin visitar CRIS ni abrir Safari.

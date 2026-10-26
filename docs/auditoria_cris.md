# Auditoría de información adicional en CRIS para UtecVis

Revisión del 25/10/2026, America/Lima. Se examinaron los 104 HTML de perfiles y
12 páginas adicionales distintas mediante Python/Safari (14 capturas HTML): listas de publicaciones,
publicación, proyectos, huella digital, red, organizaciones y tesis. Además se
probaron dos respuestas del endpoint público usado por la red. La revisión es
una muestra por sección; no acredita extracción exhaustiva de todos los catálogos.

## Conclusión

La extracción anterior cubre los perfiles básicos y sus métricas generales. No
agota la información de CRIS. Para el proyecto de redes faltaba la información
más directamente útil: quién publicó o participó en proyectos con quién.

## Datos verificados y prioridad

| Prioridad | Información disponible | Evidencia observada | Uso en UtecVis |
|---|---|---|---|
| 1 | Publicaciones: autores, enlaces a personas, DOI, año, tipo, palabras clave, resumen y estado | El catálogo declara 2.690 resultados. Los perfiles descargados enlazan a 346 fichas distintas, principalmente vistas previas. Germain tiene 13 registros en su lista completa, frente a cinco en la portada. | Coautoría con evidencia, peso por trabajos compartidos y filtros temporales. |
| 1 | Proyectos: participantes, rol, organizaciones, descripción, estado e inicio/fin | El catálogo declara 171 resultados. Las portadas enlazan a 83 proyectos; 36 perfiles muestran una sección de proyectos. Se revisaron dos fichas completas. | Coparticipación en proyectos y equipos entre departamentos. |
| 2 | Huella digital: conceptos, UUID del concepto y ponderación | 80 perfiles tienen esta sección. Germain presenta ocho conceptos en su portada y 88 en la página completa. | Afinidad temática, búsqueda por temas y comparación con colaboración real. |
| 2 | Afiliaciones completas: departamento, grupo, centro, instituto, facultad y roles | Se identificaron 31 URLs de organizaciones en los perfiles. GINIA tiene una ficha y una lista de integrantes. | Relaciones persona-organización; no perder a quien carece de departamento pero pertenece a un instituto. |
| 2 | Calificación RENACYT | Hay sección en 64 de los 104 perfiles. No estaba en el JSON de producción. | Detalles y filtros, con categoría original y ausencia explícita. |
| 2 | Red de colaboradores internos y externos, instituciones y trabajos compartidos | La lista de colaboradores de Germain muestra 19 personas externas con recuentos de trabajos compartidos. | Revisar cobertura de coautorías y decidir si el universo incluye colaboradores externos. |
| 3 | Tesis: autor, supervisor, fecha, tipo y organización | El catálogo declara 130 resultados. Se revisó una ficha con autor y asesor identificados. | Una futura red de asesoría; su población incorpora estudiantes. |
| 3 | Métricas h5/h10 y producción por año | Se observan paneles adicionales y series de producción en los perfiles. | Contexto temporal; mantener separados proveedor y ventana. |

Los totales de los catálogos corresponden al portal, no exclusivamente a los 104
investigadores actuales. Pueden incluir publicaciones históricas, externas o con
fecha futura/en prensa. Hay que conservar estado y fecha antes de filtrar años.
La presencia de una sección no garantiza cobertura completa de todos sus registros.

## Ejemplos de relaciones comprobadas

1. Publicación con DOI `10.7712/120125.12419.24692`: Carlos Benedetty y Luis A.
   Bedriñana tienen enlaces explícitos a sus perfiles. Ambos corresponden a nodos
   del conjunto de 104. El tercer autor aparece sin enlace: no se le asigna un ID
   del directorio por coincidencia de nombre.
2. El proyecto Nature Positive Solutions identifica a Yamilet Rosario Serrano
   Llerena como investigadora principal y a Claudia Antonini Bova, Jose Larco
   Martinelli y Cristian Lopez Del Alamo como coinvestigadores. Los cuatro enlaces
   corresponden al conjunto de perfiles.
3. El proyecto de alerta temprana con aguas residuales identifica participantes,
   investigador principal, coinvestigadores, estado y fechas de ejecución.

Las tres fichas permiten producir 13 relaciones de muestra entre pares de los
104 perfiles: una de coautoría y doce de proyecto compartido. Son proyecciones de
participación común en registros específicos; no representan el grafo completo.
No se interpretan las relaciones por proyecto o grupo como si fueran coautorías.

## Hallazgo y límite del endpoint de la red

El HTML de la pestaña Red declara `graphAjaxUrl` y `edgeAjaxUrl`. El JavaScript
público usa familias de entidades, años y colaboración mínima para consultarlos.
Una prueba sin filtros devolvió HTTP 200 con nodos y aristas vacíos. Una segunda
prueba con familias de personas devolvió HTTP 500 del portal. No se obtuvo un
grafo válido por esa vía y no debe tratarse la respuesta vacía como ausencia de
colaboraciones. La lista HTML de colaboradores sí contiene datos útiles.

La alternativa comprobada para aristas auditables es extraer autores de las
publicaciones y participantes de los proyectos, conservando las fichas de evidencia.

## Resultados locales y reproducción

Se añadió `extraccion_datos/audit.py`, que verifica hashes y reconstruye la
revisión a partir de los snapshots, sin nuevas descargas. Comando desde la raíz:

```bash
python -m extraccion_datos.audit \
  --profiles-manifest data/manifests/20261026T002944Z-5adcab54.json \
  --detail-manifest data/manifests/20261026T010040Z-5a147e26.json \
  --detail-manifest data/manifests/20261026T010310Z-784446a6.json \
  --detail-manifest data/manifests/20261026T010629Z-b932fc2a.json
```

Salida: `data/interim/20261026T002944Z-5adcab54/cris_audit/`.

- `summary.json`: cobertura y límites de la revisión.
- `link_inventory.json`: enlaces a publicaciones, proyectos y organizaciones.
- `profile_additional_fields.json`: RENACYT y conceptos de la vista previa por persona.
- `detail_samples.json`: cuatro fichas estructuradas: publicación, dos proyectos y tesis.
- `relation_samples.json`: 13 relaciones de muestra con enlaces de evidencia.
- `fingerprint_samples.json`: 88 conceptos de la huella completa de Germain.

Los campos nuevos de esta revisión permanecen en `interim`; todavía no se
incorporaron al JSON de producción. Las respuestas originales y sus manifiestos
se guardan localmente y se excluyen de Git, igual que el resto de datos generados.

## Siguiente extracción recomendada

1. Completar las listas de publicaciones y proyectos de las personas objetivo;
   comprobar paginación y cantidades declaradas. No usar únicamente las portadas.
2. Descargar y deduplicar las fichas; resolver participantes por URL de persona y
   DOI/URL del trabajo, preservando los nombres sin correspondencia.
3. Construir por separado coautorías y proyectos compartidos, con evidencias y
   fechas. Medir cobertura, aislados y componentes antes de fijar la red final.
4. Añadir afiliaciones con roles, RENACYT y huellas completas a los nodos. Las
   similitudes temáticas serán otra relación explícita si el proyecto las necesita.
5. Fijar el universo: 104 perfiles o una ampliación que incluya colaboradores
   externos. No incorporar automáticamente estudiantes ni homónimos.

Esta secuencia permite sustentar las tareas de centralidad, puentes, comunidades
y caminos con relaciones observadas, en lugar de basarlas solo en métricas de citas.

## Páginas comprobadas

- Publicación y coautores:
  https://cris.utec.edu.pe/es/publications/explainable-machine-learning-models-to-assess-the-bond-behavior-a/
- Proyecto y participantes:
  https://cris.utec.edu.pe/es/projects/nature-positive-solutions-workpackage-1-bajo-init-12/
- Publicaciones de Germain:
  https://cris.utec.edu.pe/es/persons/germain-garc%C3%ADa-zanabria/publications/
- Huella de Germain:
  https://cris.utec.edu.pe/es/persons/germain-garc%C3%ADa-zanabria/fingerprints/
- Colaboradores de Germain:
  https://cris.utec.edu.pe/es/persons/germain-garc%C3%ADa-zanabria/network-persons/
- Organización GINIA:
  https://cris.utec.edu.pe/es/organisations/grupo-de-investigaci%C3%B3n-en-inteligencia-artificial-ginia/
- Catálogos:
  https://cris.utec.edu.pe/es/publications/
  https://cris.utec.edu.pe/es/projects/
  https://cris.utec.edu.pe/es/studentTheses/

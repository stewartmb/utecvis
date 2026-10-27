# Guía para explicar UTECVis

Esta guía describe la implementación actual. Distingue datos publicados, resultados calculados y decisiones visuales. Las fórmulas de radio anteriores con `7 + 12 × √k` fueron reemplazadas: la versión actual usa `7 + 44 × k / k_ref` para conexiones.

## 1. Objetivo y tareas

La aplicación explora colaboraciones registradas y afinidades entre 104 investigadores de la cohorte extraída de CRIS UTEC. Las tareas son identificar colaboradores destacados, encontrar posibles puentes entre departamentos, explorar nuevas colaboraciones y explorar grupos/comunidades. El profesor propone las primeras tres como ejemplos y exige formular al menos cuatro; la cuarta la añadimos nosotros.

El idiom principal es un diagrama nodo-enlace interactivo de una red no dirigida y ponderada, dispuesto mediante fuerzas. Los rankings y detalles apoyan comparaciones que el grafo por sí solo no permite realizar con precisión.

## 2. Qué datos tenemos y qué significan

Fuente de adquisición: CRIS UTEC. Se conservan 104 perfiles, 2.474 publicaciones distintas, 129 proyectos y 31 organizaciones. Hay listas completas de trabajos de la cohorte y fichas detalladas de todos los proyectos y 90 publicaciones seleccionadas; esto no significa haber descargado todos los abstracts, textos completos o autores individuales de las 2.474 publicaciones.

### Campos de profesor

| Campo | Significado y papel |
|---|---|
| `id` | Identificador generado por nosotros a partir de SHA-256 de la URL canónica del perfil. Es estable mientras esa URL no cambie. No es un número de orden ni una medida de importancia. |
| `name` | Nombre publicado. Se usa en búsqueda, etiquetas y detalles. |
| `image_url`, `email`, `external_ids` | Foto, correo e identificadores/enlaces externos publicados, cuando existen. Se conservan como contexto; no aumentan la afinidad. Los nodos actuales muestran iniciales. |
| `department`, `departments` | El primero es el primer departamento listado en el perfil; el segundo conserva la lista. El primero determina el color habitual y la comparación de departamentos de vecinos. No implica que UTEC haya declarado una afiliación única o principal. |
| `research_groups` | Lista de nombres de grupos/centros extraídos; para el cálculo institucional usamos las afiliaciones estructuradas con sus identificadores. |
| `affiliations` | Pertenencias: nombre, URL, tipo, rol, clases de origen e `organisation_id`. Alimentan cercanía institucional y filtros. |
| `research_areas` | Intereses de investigación declarados. Una de las dos fuentes temáticas principales. |
| `fingerprint` | Conceptos publicados en la huella temática: `concept_id`, `label`, `weight`, `subject`. Sus identificadores y pesos vienen de CRIS. |
| `biography` | Texto del perfil; respaldo temático solo si no hay intereses ni huellas utilizables. Se utiliza en cinco perfiles. |
| `education`, `renacyt` | Formación y clasificación publicadas, si existen. Se conservan, pero no se incorporan a la puntuación de sugerencias. |
| `citations`, `h_index` | Citas e índice h publicados en el panel general del perfil, con su proveedor y alcance. No se utilizan para construir aristas, recomendar parejas o dimensionar nodos. |
| `citation_source`, `citation_source_url`, `citation_retrieved_at`, `citation_window`, `citation_basis` | Procedencia, momento y alcance de esas métricas bibliométricas. |
| `source_url`, `retrieved_at`, `fingerprint_source`, `fingerprint_status` | Trazabilidad y estado de extracción. No son señales de afinidad. |
| `publication_count`, `project_count` | Conteos obtenidos de los registros distintos vinculados al perfil. No son el número de colaboradores. |
| `network_metrics` | Contenedor de las métricas calculadas de la red, explicadas más adelante. |

Un `null` significa no disponible o no reconocido; no equivale a cero. En la cohorte hay departamento en 95 perfiles, intereses en 90 y huellas en 80. Que falte uno no implica que el investigador no tenga intereses o producción.

### Publicaciones y proyectos

Se conservan identificadores, título, tipo, fechas, año, DOI, medio/publicación, participantes, nombres mostrados, enlaces de personas, autores colectivos, metadatos de autoría y fuentes. En proyectos también hay estado, descripción y palabras clave cuando están publicados. Los campos de detalle pueden faltar si esa ficha no fue enriquecida o no publica el dato.

`faculty_ids` son los miembros de nuestra cohorte vinculados al registro. `author_faculty_ids` identifica a los autores individuales reconocidos. `author_list_scope` indica el alcance de la lista de autores: colectivo, ficha detallada o listado. `observations`, `detail_sources`, `source_urls`, `detail_complete` y las URLs de origen permiten revisar de dónde salió la evidencia. Un enlace externo guardado no significa que se haya scrapeado ese proveedor externo.

## 3. Cómo construimos la red

- Nodo: un investigador de la cohorte.
- Arista registrada: pareja con coautoría individual reconocida por URL CRIS/ORCID o participación registrada en un mismo proyecto.
- Red no dirigida: A–B es la misma pareja que B–A.
- Una sola arista por pareja, sin autoenlaces.
- `source` y `target`: identificadores de los extremos, no dirección de colaboración.
- `counts`: cantidad de trabajos por tipo (`coauthorship`, `shared_project`).
- `relations` y `relation`: tipos de evidencia; `academic_collaboration` resume una pareja que tiene ambos tipos.
- `weight`: suma de publicaciones y proyectos distintos compartidos por esa pareja.
- `evidence`: registros que respaldan la conexión, con DOI/URL y fuentes.
- `is_bridge`: indica si quitar esa arista separaría una parte de la red.

Las publicaciones se deduplican por DOI y, si no hay DOI, por URL; los proyectos por URL. Si un trabajo tiene tres profesores identificados, genera las tres parejas correspondientes. Por eso un trabajo puede aportar peso a varias aristas, sin estar duplicado en el catálogo de publicaciones.

La red actual tiene 73 pares: 35 tienen coautoría y 51 comparten proyectos; 13 tienen ambos tipos. El mayor peso es 8 (6 publicaciones y 2 proyectos). La asociación colectiva de 432 publicaciones fue excluida de las aristas y de sus cálculos; los registros originales de producción se conservan.

Participar en el mismo proyecto es evidencia de pertenencia compartida a ese proyecto; no cuantifica cuánto interactuaron personalmente sus participantes. No encontrar una arista significa falta de evidencia bajo estas reglas y esta cohorte, no demostrar que dos personas nunca colaboraron.

## 4. Métricas calculadas con NetworkX

| Variable | Cálculo/interpretación |
|---|---|
| `degree` / grado `k` | Cantidad de vecinos distintos en la red registrada. Máximo actual: 9. |
| `weighted_degree` / `W` | Suma de pesos de sus aristas registradas. Máximo actual: 20. No equivale a producción individual total. |
| `degree_centrality` | `k / 103`, normalización del grado para los 104 nodos. Se guarda como métrica adicional. |
| `betweenness` / `B` | Suma de las fracciones de caminos mínimos entre otras parejas que atraviesan al profesor, dividida por 5.253. |
| `component` | Identificador de un conjunto conectado por algún camino. Existen 62 componentes, incluyendo los aislados. |
| `community` | Comunidad calculada mediante `greedy_modularity_communities`, usando los pesos de las aristas. Busca grupos con colaboración interna concentrada según modularidad. |
| `is_articulation` | Indica si retirar ese profesor incrementaría el número de componentes. Hay 9 nodos de articulación. |
| Aristas puente | Conexiones cuya retirada aumenta el número de componentes. Hay 13. Se distinguen de la intermediación de un profesor. |
| Aislados | Nodos con grado registrado cero. Hay 57; otros 47 tienen conexiones. |
| Densidad | `73 / (104 × 103 / 2) ≈ 0,01363`: aproximadamente 1,36 % de las parejas posibles tiene conexión registrada. |

Para B cada arista cuenta como un paso: `weight=None`. La frecuencia de publicaciones no se interpreta como distancia. Si hay dos caminos mínimos y solo uno pasa por X, esa pareja aporta 0,5 a X. Las parejas desconectadas aportan cero. Los extremos del camino no cuentan como intermediarios.

La intermediación más alta es aproximadamente 0,06797, de Jimmy Tarrillo Olano. No es porcentaje de probabilidades de colaboración ni una medida de calidad investigadora. Para hablar de puente entre departamentos también hay que comprobar las afiliaciones; B por sí sola no lo demuestra.

Hay 10 comunidades con más de una persona y 57 comunidades unitarias. Los números/IDs de comunidad son etiquetas, no puestos de importancia. Una comunidad es calculada; un departamento o un grupo de investigación es una pertenencia institucional publicada. Un componente puede contener varias comunidades.

Los detalles también calculan vecinos de otros departamentos, vecinos comunes de una pareja y un camino mínimo entre sus extremos. Este camino es una ruta topológica entre las conexiones registradas, no una prueba de circulación real de información.

## 5. Afinidad temática T

T usa `research_areas` y `fingerprint`. No incorpora citas, h-index, departamento, nombres, correos, fotos, títulos de publicaciones o abstracts como señales temáticas adicionales.

1. Normalizamos Unicode, espacios y puntuación de borde; eliminamos etiquetas repetidas ignorando mayúsculas. No traducimos manualmente todos los textos.
2. Para las huellas descartamos pesos no positivos y los términos genéricos `Peru` y `Numerical Example`, solo del cálculo. Los datos originales se conservan.
3. Para cada concepto calculamos su frecuencia entre los perfiles con huella. Con `N` perfiles con huella y `df` perfiles que contienen ese identificador: `IDF = ln((N+1)/(df+1)) + 1`.
4. Relevancia para seleccionar conceptos = peso publicado en CRIS × IDF. Un término frecuente discrimina menos entre profesores.
5. Si una etiqueta aparece con varios UUID, conservamos la de mayor relevancia dentro del perfil. Elegimos hasta 20 conceptos.
6. El modelo público preentrenado `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` convierte textos en vectores semánticos multilingües. No entrenamos el modelo con nuestros profesores. Su revisión está fijada en el código para repetir la preparación.
7. Promediamos los vectores de intereses. Promediamos las huellas ponderándolas por su relevancia. Normalizamos cada fuente y combinamos las fuentes disponibles con igual importancia.
8. Si faltan ambas fuentes, usamos la biografía en fragmentos según el límite de texto del modelo. Marcamos la menor cobertura de esos cinco perfiles.
9. `T` es el coseno entre los vectores finales de dos profesores; se limita al intervalo 0–1, llevando los negativos a cero.

T alta indica semejanza semántica según ese modelo, no demuestra una colaboración o que dos investigaciones sean equivalentes. Los conceptos/intereses coincidentes y hasta dos pares de términos relacionados (similitud mínima 0,45) se muestran como explicación; no se suman otra vez a la puntuación.

## 6. Cercanía institucional I

Comparamos `organisation_id` de afiliaciones estructuradas. Aplicamos únicamente el nivel compartido más específico:

- Mismo grupo de investigación: 1,00.
- Mismo centro o instituto: 0,70.
- Mismo departamento: 0,40.
- Ambos tienen pertenencias relevantes publicadas y ninguna coincide: 0.
- A uno le faltan pertenencias relevantes: no disponible, no cero.

No sumamos grupo + centro + departamento. Compartir UTEC o una facultad general no suma porque discrimina poco en la cohorte. Los valores 1 / 0,7 / 0,4 son heurísticas elegidas, no resultados aprendidos o validados como probabilidades.

## 7. Proximidad estructural R

Usamos Random Walk with Restart mediante Personalized PageRank. Desde cada investigador, el paseo sigue conexiones registradas y usa sus pesos para favorecer enlaces con más trabajos compartidos. En cada paso hay 90 % de continuación y 10 % de reinicio en el investigador de origen; para un nodo sin salidas se reinicia en el origen.

Calculamos PPR desde cada uno de los 104 nodos; promediamos ambos sentidos para cada pareja:

`R_bruto(A,B) = (PPR_A(B) + PPR_B(A)) / 2`.

Luego dividimos por el mayor valor positivo entre parejas sin arista, y limitamos a 1. En componentes desconectados R es cero. R cero sí es una señal disponible y participa en el promedio ponderado: no se confunde con información faltante.

Parámetros numéricos: máximo 1.000 iteraciones, tolerancia `1e-12`, mismo inicio personalizado. El 90/10 de RWR es distinto del 60/30/10 de importancia de las tres señales.

## 8. Puntuación de sugerencias S

Con señales disponibles: `S = αT + βI + γR`, donde los pesos suman 1. Inicialmente son 0,60 / 0,30 / 0,10. Se muestra `100 × S`, de 0 a 100.

T es afinidad temática, I cercanía institucional y R proximidad en la red. Los pesos son un escenario exploratorio elegido para priorizar afinidad temática; no fueron entrenados con colaboraciones futuras.

Si falta una señal, dividimos por la suma de los pesos de las señales disponibles. Por ejemplo, con I faltante: `S = (0,60T + 0,10R) / 0,70`. Si no hay ninguna señal con peso activo y dato disponible, no hay puntuación.

La cobertura es la fracción del peso solicitado que tiene datos disponibles. En el ejemplo anterior es 70 %; no significa que se haya extraído el 70 % del perfil. Las barras de contribución explican cuánto aporta cada señal tras la renormalización.

Los tres controles conservan una suma de 100 %: al modificar uno, los otros se redistribuyen proporcionalmente; si ambos estaban en cero, se reparte entre ellos por igual, ajustando el redondeo.

Nunca se añaden sugerencias a la red usada para recalcular B, comunidades o R. Así evitamos que una hipótesis refuerce artificialmente su propia puntuación.

## 9. Parejas candidatas, Top % y rankings

Hay `104 × 103 / 2 = 5.356` parejas posibles. Al excluir las 73 registradas quedan 5.283 candidatas. No hay autoenlaces ni duplicados A–B / B–A.

Top % selecciona una fracción del ranking de candidatas con ambos extremos visibles en los filtros: `cantidad = techo(candidatas × porcentaje / 100)`. El rango es 0–10 %, con pasos de 0,1; inicio 1 %. Sin filtros: Top 1 % pide 53 parejas y Top 10 % pide 529. Solo se dibujan parejas con puntuación positiva; puede haber menos que las pedidas.

El orden es puntuación descendente y, ante empate, identificadores estables. Un porcentaje del ranking no es probabilidad de colaboración. Seleccionar una pareja puede mostrar esa pareja aunque quede fuera del Top actual.

El ranking de Colaboradores ordena por grado o grado ponderado observado; Puentes, por B observado; Afinidades, por puntuación de pareja con los pesos actuales. Los filtros afectan a los candidatos y a qué investigadores aparecen, pero no recalculan las métricas globales sobre una subred filtrada.

## 10. Tamaño de los nodos

En Colaboradores por defecto, Afinidades y Comunidades:

`radio = 7 + 44 × k_visible / k_ref`.

`k_visible` cuenta vecinos distintos mediante las aristas que se dibujan, registradas y sugeridas. `k_ref` es el mayor grado registrado de toda la cohorte: actualmente 9. Esa referencia se mantiene al filtrar o cambiar sugerencias.

Con 0, 1, 4 y 9 conexiones: radios aproximados 7; 11,9; 26,6; 51. Las sugerencias pueden producir radios mayores que 51. Esto es una escala lineal del radio, no del área; es una decisión explícita para dar más contraste a los nodos más conectados.

En Puentes: `radio = 7 + 44 × sqrt(B / B_máx)`. En Trabajos compartidos: `radio = 7 + 44 × sqrt(W / W_máx)`. Los máximos se toman de toda la cohorte. El radio máximo en esas dos escalas es 51.

7 es el mínimo visual; 44 determina la amplitud de tamaños. No son variables académicas. El radio es una unidad del espacio SVG; el zoom de la cámara afecta al tamaño observado en pantalla. El diámetro es dos veces el radio.

Importante: el grado visible usado en el dibujo puede incluir sugerencias; el grado del ranking y del detalle es el observado. Se distinguen en etiquetas y tooltips.

## 11. Otros canales visuales e interacción

- Color de nodo por defecto: primer departamento listado. En Comunidades: comunidad calculada. Gris: departamento no disponible o aislado en la vista de comunidades. Color categórico, sin jerarquía de importancia.
- Arista registrada: continua, gris azulada. Grosor `1,5 + 4,5 × ln(peso)/ln(8)` en la red actual (pesos 1–8), con opacidad base 0,38.
- Arista sugerida: violeta discontinua, 1,4 px, opacidad base 0,30. Su grosor no representa la puntuación.
- Selección o hover: conexiones relacionadas con opacidad 0,95, otras atenuadas; para una pareja se destaca la conexión correspondiente. No cambia el peso ni el dato de origen.
- Iniciales en nodos; nombres al buscar, seleccionar, pasar el cursor o ampliar suficientemente la vista. Evita mostrar 104 etiquetas largas simultáneas.
- Zoom 0,25–5, desplazamiento, arrastre y búsqueda sin depender de tildes. La leyenda anticipa los miembros de una categoría al pasar el cursor y es el único control para seleccionar departamentos o comunidades al hacer clic; el selector institucional aparece solo en Comunidades y la opción de ver solo conexiones aparece en el perfil. Las selecciones activas se quitan con ×. No hay panel global de filtros ni selectores repetidos de tamaño o color.
- Cada tarea determina su codificación. Solo Colaboradores ofrece Personas/Trabajos. Las sugerencias aparecen automáticamente al entrar en Afinidades; Top 0 % permite ocultarlas sin un interruptor adicional. Las tres importancias se abren en Ajustar criterios. Los rankings y detalles comparten un solo panel, cerrado hasta que el usuario lo solicita.
- Rankings seleccionables, detalle de perfil, evidencia de parejas y enlaces de fuente; registros paginados de 20 en 20.
- Transiciones habituales de 300 ms; con movimiento reducido, se suprimen esas animaciones y el asentamiento temporal.
- Mantra: panorama inicial sin sugerencias → zoom/filtros → detalles al solicitarlos.

## 12. Disposición por fuerzas y arrastre

Variables físicas: `x,y` son posiciones; `vx,vy`, velocidades; `fx,fy`, posiciones fijadas temporalmente al arrastrar. No son atributos de investigación.

La disposición inicial usa aristas observadas como resortes, repulsión y colisiones. Los aislados visibles van a un anillo exterior. Si un aislado recibe una sugerencia visible, entra al interior; si se desactiva, vuelve al anillo.

Parámetros visuales actuales:

| Parámetro | Valor y finalidad |
|---|---|
| Distancia deseada de enlace | Radio A + radio B + 115; deja espacio entre círculos conectados. |
| Intensidad del enlace | 0,32, con dos iteraciones; controla el resorte. |
| Repulsión | −340 para nodos con conexiones visibles; 0 para aislados anclados. |
| Colisiones | Radio del nodo + 4,5 por extremo: separación objetivo de 9; intensidad 1 y ocho iteraciones. |
| Atracción al centro | 0,006 en cada eje; mantiene el conjunto centrado. |
| Fricción | `velocityDecay = 0,50`; amortigua el movimiento. |
| Enfriamiento | `alphaDecay = 0,035`; reduce gradualmente la actividad de la simulación. |
| Arrastre | Reactivación con alpha mínimo 0,45 y objetivo 0,35; al soltar el objetivo vuelve a 0. |
| Tracción de grupo durante arrastre | Fuerzas de posición de intensidad 0,85. Los vecinos directos reciben desplazamiento completo y cada salto adicional reduce la influencia por un factor 0,78. Incluye las sugerencias visibles solo para esta interacción. |
| Posición inicial reproducible | Generador aleatorio de D3 con semilla 0,42 y relajación inicial de 220 pasos. |
| Espacio de cálculo | Anillo base 470; se amplía según los radios y la ocupación. En vistas de hasta tres nodos se usa una base menor. No son píxeles fijos en pantalla. |

Además de `forceCollide` hay corrección geométrica con `d3.quadtree` después de integrar el movimiento. El límite circular evita que salgan los círculos; si una colisión queda atrapada en el borde, el nodo libre puede deslizarse por el contorno. Estos cálculos solo modifican coordenadas.

Las sugerencias no crean resortes en la disposición inicial. Sí transmiten tracción mientras arrastras un nodo conectado visualmente por ellas. Las métricas observadas siguen intactas.

Cambiar de tarea puede cambiar la métrica de tamaño y activar/desactivar sugerencias; D3 reacomoda los nodos para dejar espacio. La posición y la longitud de una arista en pantalla no equivalen a afinidad, kilómetros o importancia. Los cruces de aristas pueden reducirse, no se garantiza eliminarlos.

## 13. Herramientas y cinco archivos

- Python: extracción, transformación y preparación.
- BeautifulSoup: lectura estructurada del HTML.
- Safari + Apple Events: sesión admitida para adquirir CRIS cuando el acceso directo queda bloqueado. No se exportan cookies. Requiere macOS, Safari abierto con CRIS admitido y permisos de JavaScript desde eventos de Apple; no es un script HTTP universal para cualquier PC.
- NetworkX: métricas, comunidades, caminos y Personalized PageRank. Es una biblioteca Python independiente de D3.
- Sentence Transformers y el modelo multilingüe: embeddings durante la preparación. El modelo no se carga para presentar la aplicación.
- Flask: servidor local y API.
- D3 local: toda la visualización e interacción; no se usa otra biblioteca de visualización.

Archivos: `network.json` contiene nodos, aristas y métricas; `publications.json`, trabajos publicados; `projects.json`, proyectos; `organisations.json`, organizaciones y miembros; `analysis.json`, estructura global, comunidades y señales de todas las parejas. La preparación produce 5.356 parejas; la API entrega las 5.283 sin arista registrada. Un hash del archivo de red permite detectar si las recomendaciones quedaron desactualizadas.

## 14. Qué está calculado, qué es supuesto y qué no está implementado

Calculado a partir de los datos: aristas bajo las reglas de evidencia, pesos, grado, B, comunidades, componentes, articulaciones, RWR y similitudes del modelo.

Elegido como heurística o diseño: nivel institucional 1/0,7/0,4; pesos 60/30/10; hasta 20 conceptos y términos excluidos; reinicio RWR de 10 %; escalas de radio y grosor; colores, transparencia, fricción y fuerzas. Que una fórmula esté implementada correctamente no valida sus supuestos como predictor del futuro.

No incorporado actualmente: Force-in-a-Box, treemap o empaquetado de comunidades en regiones circulares. Lo conversamos como alternativa, pero Comunidades actualmente cambia color, métrica y filtros; no impone una región circular por comunidad.

No se ha entrenado ni validado un modelo de predicción con colaboraciones futuras. No hay precisión predictiva medida, ni un umbral de S que garantice éxito. El control español/inglés comprueba un ejemplo de comportamiento semántico; no valida todas las afinidades.

No se usa h-index/citas para valorar la calidad de una persona. No se considera que compartir departamento pruebe colaboración. Los datos desconocidos permanecen diferenciados de cero. Los colaboradores externos no se agregan como nodos de esta primera cohorte.

## 15. Qué debemos poder defender en la presentación

1. Qué pregunta responde cada una de las cuatro tareas y cómo se demuestra en la app.
2. De dónde sale cada nodo, cada arista y su evidencia; por qué quitamos las asociaciones sin autoría individual.
3. Diferencia entre producción, número de colaboradores, peso de una relación e intermediación.
4. Diferencia entre departamento, grupo institucional, comunidad y componente.
5. Cómo se calcula cada una de las tres señales y cómo se combinan.
6. Qué valores son decisiones nuestras y qué limitaciones tienen.
7. Por qué el Top % es una selección del ranking, no una probabilidad.
8. Qué codifica cada canal y qué significa que los nodos se muevan o crezcan.
9. Cómo se cumple el mantra y cómo ayudan los rankings y los detalles.
10. Cómo se reproduce la extracción y cómo se ejecuta la entrega sin scraping ni modelo durante la exposición.
11. Qué se verificó: métricas contra NetworkX; componentes/aislados de RWR; candidatos, señales faltantes y pesos extremos; interacción, contraste de tamaños, arrastre, colisiones, filtros y pantallas; ZIP descomprimido con dependencias de ejecución.
12. Qué no se puede concluir: ausencia universal de colaboración, calidad científica por tamaño, causalidad o certeza de colaboración futura.

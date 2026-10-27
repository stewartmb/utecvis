# Referencias y antecedentes de UTECVis

Este registro reúne casos académicos comparables, fundamentos del método y
referencias técnicas. Explica qué aporta cada fuente y qué no permite afirmar.
No se atribuye toda la aplicación a una sola universidad o investigación.

Las tres referencias del documento original
`README_UTECVis_red_colaboracion.md`, sección 16, son **CollaborationViz, Duke —
Understanding Duke Research y Harvard Catalyst Profiles**. La presencia de un proyecto en el documento no confirma cuál de sus
visualizaciones recuerda el usuario.

## Casos similares: investigadores y colaboración académica

### 1. CollaborationViz — University of Arkansas for Medical Sciences (2014)

**Antecedente documentado en el plan original compartido por el usuario.**

- [Artículo: CollaborationViz: Interactive Visual Exploration of Biomedical Research Collaboration Networks](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111928)
- [Código original](https://github.com/bianjiang/rcna)
- [Demo interactiva](https://bianjiang.github.io/rcna/) — abierta y comprobada en navegador: el grafo, los datos y los controles de predicciones cargan. Esto no verifica exhaustivamente todas sus funciones.
- [Figura 1: interfaz de la red](https://doi.org/10.1371/journal.pone.0111928.g001)
- [Figura 5: recomendaciones de colaboración](https://doi.org/10.1371/journal.pone.0111928.g005)

**Qué respalda:** red de investigadores con disposición de fuerzas, grosor de
vínculos, métricas de centralidad, interacción y sugerencias mediante Random Walk
with Restart; muestra recomendaciones como enlaces punteados.

**Diferencia:** su red utiliza grants compartidos. UTECVis usa coautoría individual
y participación compartida en proyectos; su recomendador combina tres señales.
Los resultados de evaluación del artículo no son resultados de UTECVis.

### 2. Duke — Understanding Duke Research

**Antecedente documentado en la sección 16 del Markdown original del usuario.**

- [Enlace histórico incluido en el documento](https://bigdata.duke.edu/projects/understanding-duke-research-based-on-large-scale-faculty-publication-records/) — **no disponible:** redirige a `iid.duke.edu` y muestra «Page not found» en navegador. No es una demo operativa.
- [Contexto adicional oficial accesible: Webs of Minds and Ideas Bind Duke’s Campus](https://today.duke.edu/2017/03/webs-minds-and-ideas-bind-duke%E2%80%99s-campus) — artículo sobre varias iniciativas de Scholars@Duke. No es un sustituto idéntico del proyecto anterior ni una demo en sí mismo.

El documento original y la presentación oficial del proyecto describen una red
de similitud entre investigadores, con aristas ponderadas derivadas del análisis
textual de títulos de publicaciones. También explora coautores y co-investigadores.
Es la referencia del plan para similitud académica. El contenido indexado conserva
la descripción histórica, pero la inspección en navegador confirma que la página
actual no está disponible. No debe presentarse como visualización accesible.

**Diferencia:** en UTECVis la semejanza temática alimenta las sugerencias y se
mantiene separada de las conexiones registradas. No implementamos una copia del
modelo de Duke ni atribuimos a ese proyecto nuestros pesos o embeddings.

### 3. Harvard Catalyst Profiles / Profiles Research Networking Software

**Antecedente documentado en la sección 16 del Markdown original del usuario.**

- [Descripción de perfiles, redes y explicación de conexiones](https://connects.catalyst.harvard.edu/profiles/about/default.aspx?type=About)
- [Galería de visualizaciones de redes académicas](https://profiles.catalyst.harvard.edu/?pg=visualizations) — funciona, pero es una galería, no el grafo directo.
- [Referencia exacta señalada por el usuario: red de Tagwa Ahmed Adam Idris, vista Cluster](https://connects.catalyst.harvard.edu/profiles/display/Person/182216/Network/CoAuthors/Cluster) — abierta y comprobada en navegador. Se conserva sin el parámetro de seguimiento `utm_source`.

En esta vista, rojo identifica al perfil focal; verde a sus coautores; azul a
coautores de coautores. El tamaño representa publicaciones del autor y el grosor,
publicaciones compartidas. Sirve como referencia visual de la red; UTECVis mantiene
su propia codificación de color por departamento y tamaño por la métrica elegida.

**Qué respalda:** redes de coautores, conceptos de investigación, visualizaciones
complementarias y páginas que explican por qué dos personas están relacionadas.
Es pertinente para nuestros detalles y evidencias de una pareja. No demuestra que
su algoritmo o definición de conexión sea idéntico al nuestro.

## Sugerencias: investigaciones y componentes

### 4. DRACoR — Pradhan y Pal (2020)

- [A multi-level fusion based decision support system for academic collaborator recommendation](https://doi.org/10.1016/j.knosys.2020.105784)

**Qué respalda:** estudiar candidatos académicos combinando representación de
intereses, similitud de autores y un paseo aleatorio con reinicio.

**Diferencia:** usa modelado de temas, Doc2Vec y características adicionales. No
implementamos DRACoR; es un antecedente de enfoques híbridos. No fundamenta nuestros
coeficientes institucionales ni la combinación 60/30/10.

### 5. Sentence-BERT y modelo semántico utilizado

- [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks (2019)](https://arxiv.org/abs/1908.10084)
- [Ficha oficial: paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
- [Revisión del modelo fijada para nuestra preparación](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/tree/e8f8c211226b894fcb81acc59f3b34ba3efd5f42)

**Qué respalda:** representar textos mediante vectores para comparar semejanza
semántica. La ficha del modelo identifica el componente multilingüe que ejecutamos.

**Diferencia:** semejanza textual no demuestra complementariedad científica ni
predice por sí sola una colaboración exitosa. La selección de intereses, huellas,
conceptos excluidos y biografía de respaldo es parte de nuestro diseño.

### 6. Personalized PageRank — implementación de RWR

- [Documentación oficial de NetworkX: pagerank](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html)

**Qué respalda:** API de la implementación numérica con personalización y pesos.
La motivación de uso para sugerir colaboradores se encuentra en los artículos
anteriores; una documentación de API no sustituye validación científica.

## Treemap + fuerzas: fundamento visual de la prueba

### 7. Group-in-a-Box — Chaturvedi y colaboradores (2014)

- [Group-in-a-Box Meta-Layouts for Topological Clusters and Attribute-Based Groups](https://doi.org/10.1111/cgf.12400)
- [Optimal tree reordering for group-in-a-box graph layouts (2017)](https://doi.org/10.1145/3139295.3139308)

**Qué respalda:** distribuir grupos en regiones y examinar vínculos internos y
entre grupos. El segundo trabajo estudia reorganizar las regiones para mejorar
las relaciones entre grupos. Son fundamentos del idiom, no pruebas de que nuestro
agrupamiento por departamento sea el óptimo para esta cohorte.

### 8. Force in a Box — John Alexis Guerra Gómez

- [Código y descripción del plugin D3](https://github.com/john-guerra/forceInABox)
- [Demo del autor en Observable](https://observablehq.com/@john-guerra/force-in-a-box)

**Qué respalda:** implementación práctica de fuerzas de agrupación con plantillas
basadas en treemap o fuerzas. Nuestro módulo usa D3 directamente y añade límites
rectangulares rígidos; no es una reproducción exacta de ese plugin.

## Cómo presentar la fundamentación sin exagerarla

| Parte de UTECVis | Fuente principal | Decisión propia o comprobación pendiente |
|---|---|---|
| Red académica y evidencias | CollaborationViz; casos de Harvard | Cohorte y reglas de aristas de CRIS UTEC. |
| Sugerencias estructurales R | CollaborationViz; NetworkX | Parámetros, simetrización, normalización y evaluación sobre nuestra cohorte. |
| Afinidad temática T | Duke como antecedente del caso; Sentence-BERT y modelo multilingüe como componentes | Fuentes textuales, ponderación de huellas y cobertura de perfiles. |
| Cercanía institucional I | Afiliaciones publicadas por CRIS | Categoría más específica y normalización elegidas; valores 1 / 0,3447937 / 0,2059786 calibrados con proporciones de la cohorte, no validados como predicción. Véase el README. |
| Combinación de señales | Antecedentes híbridos como DRACoR | 60/30/10 ajustable: escenario exploratorio sin validación predictiva. |
| Treemap + fuerzas | Group-in-a-Box; Force in a Box | Departamentos, paredes rígidas y evaluación de legibilidad. |

Las referencias respaldan componentes e ideas. No convierten nuestra puntuación
en una probabilidad ni justifican afirmar que Harvard, UAMS o los autores de
DRACoR validaron UTECVis. El Top % es una fracción del ranking de candidatos.

## Rankings: fundamento y decisión de interfaz

- [Tamara Munzner, Visualization Analysis & Design, tutorial oficial, sesión 2 (2014)](https://www.cs.ubc.ca/~tmm/talks/minicourse14/minicourse14-session2-4x4.pdf): la diapositiva 9 presenta barras ordenadas por valor y sus tareas de comparación y consulta. Ordenar y alinear son decisiones legítimas de codificación visual.
- [Gratzl et al., LineUp: Visual Analysis of Multi-Attribute Rankings, IEEE TVCG / InfoVis (2013)](https://vdl.sci.utah.edu/publications/2013_infovis_lineup/), DOI 10.1109/TVCG.2013.173: propone barras interactivas para analizar rankings y cambios de ponderaciones.

Estas fuentes respaldan los rankings visuales; no obligan a añadir uno a toda aplicación. En UTECVis se retiró «Ver ranking», que presentaba una lista de nombres y números. Es una decisión de simplificación de esta interfaz, no una prohibición de Munzner. El tamaño y los detalles conservan las métricas; comparar un orden exacto es menos directo. El ranking interno de parejas candidatas para Top % permanece porque forma parte del cálculo de sugerencias.

## Límite visual de sugerencias

Se fija Top 5 % como máximo, con inicio en 1 % y pasos de 0,1 %. En la cohorte completa son hasta 265 sugerencias y 338 aristas totales. La decisión se apoya en la orientación de escalabilidad E < 4N presentada por [Munzner para diagramas nodo-enlace](https://www.cs.ubc.ca/~tmm/talks/minicourse14/minicourse14-session2-4x4.pdf): 338 < 416. Esta relación no garantiza legibilidad ni convierte el porcentaje en probabilidad. El 5 % es una decisión de diseño de UTECVis; no se atribuye al artículo de CollaborationViz una justificación que no explica.

# Referencias y antecedentes de UTECVis

Este registro reúne casos académicos comparables, fundamentos del método y
referencias técnicas. Explica qué aporta cada fuente y qué no permite afirmar.
No se atribuye toda la aplicación a una sola universidad o investigación.

## Casos similares: investigadores y colaboración académica

### 1. CollaborationViz — University of Arkansas for Medical Sciences (2014)

**Antecedente documentado en el plan original compartido por el usuario.**

- [Artículo: CollaborationViz: Interactive Visual Exploration of Biomedical Research Collaboration Networks](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111928)
- [Código original](https://github.com/bianjiang/rcna)
- [Demo indicada por los autores](https://bianjiang.github.io/rcna/) — puede depender de recursos antiguos; la existencia del enlace no garantiza que toda la demo funcione hoy.
- [Figura 1: interfaz de la red](https://doi.org/10.1371/journal.pone.0111928.g001)
- [Figura 5: recomendaciones de colaboración](https://doi.org/10.1371/journal.pone.0111928.g005)

**Qué respalda:** red de investigadores con disposición de fuerzas, grosor de
vínculos, métricas de centralidad, interacción y sugerencias mediante Random Walk
with Restart; muestra recomendaciones como enlaces punteados.

**Diferencia:** su red utiliza grants compartidos. UTECVis usa coautoría individual
y participación compartida en proyectos; su recomendador combina tres señales.
Los resultados de evaluación del artículo no son resultados de UTECVis.

### 2. Harvard SEAS Faculty Explorer

**Caso comparable identificado durante esta revisión; no está confirmado que sea
el sitio que el usuario recuerda como inspiración inicial.**

- [Explorador de profesores de Harvard SEAS](https://facultyexplorer.seas.harvard.edu/)
- [Faculty Teaching & Research Connections](https://facultyexplorer.seas.harvard.edu/faculty-connections/)

**Qué respalda:** explorar profesores, intereses, áreas académicas y conexiones
institucionales mediante visualización interactiva. Es un antecedente del problema
y de la interacción, no una fuente verificada para nuestra fórmula de sugerencias.
No todas sus vistas representan exclusivamente parejas de profesores: la página
Faculty Connections incluye otras entidades del ecosistema académico.

### 3. Harvard Catalyst Profiles / Profiles Research Networking Software

- [Descripción de perfiles, redes y explicación de conexiones](https://connects.catalyst.harvard.edu/Profiles/about/default.aspx)
- [Galería de visualizaciones de redes académicas](https://profiles.catalyst.harvard.edu/?pg=visualizations)

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
| Afinidad temática T | Sentence-BERT; modelo multilingüe | Fuentes textuales, ponderación de huellas y cobertura de perfiles. |
| Cercanía institucional I | Afiliaciones publicadas por CRIS | Jerarquía y valores 1 / 0,70 / 0,40: heurística, no coeficientes aprendidos. |
| Combinación de señales | Antecedentes híbridos como DRACoR | 60/30/10 ajustable: escenario exploratorio sin validación predictiva. |
| Treemap + fuerzas | Group-in-a-Box; Force in a Box | Departamentos, paredes rígidas y evaluación de legibilidad. |

Las referencias respaldan componentes e ideas. No convierten nuestra puntuación
en una probabilidad ni justifican afirmar que Harvard, UAMS o los autores de
DRACoR validaron UTECVis. El Top % es una fracción del ranking de candidatos.

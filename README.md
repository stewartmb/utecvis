# UTECVis

Aplicación **Flask + D3** para explorar colaboración académica y afinidades entre
**104 investigadores de UTEC**. Incluye 74 conexiones registradas, sus evidencias
y sugerencias explicadas mediante temática, institución y estructura de la red.

## Abrir la aplicación

Python 3.12 o superior. Desde la raíz del proyecto:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m flask --app app run --host 127.0.0.1 --port 5050
```

Abrir **http://127.0.0.1:5050**. Los cinco JSON y D3 están incluidos. Para ejecutar
la aplicación no se necesitan Safari, scraping, claves de API, servicios externos
ni descargar el modelo. La preparación de recomendaciones ya está realizada.

## Estructura

```text
app/                 Flask, consultas, preparación analítica e interfaz D3
extraccion_datos/    Scraping, normalización y construcción de la red
data/               Una sola copia de los datos finales
  network.json         Investigadores, conexiones, evidencias y métricas
  publications.json    2.474 publicaciones y sus autores disponibles
  projects.json        129 proyectos y participantes
  organisations.json   Afiliaciones y miembros
  analysis.json        Comunidades, componentes y recomendaciones preparadas
tests/               Comprobaciones de datos, métricas e interacción
requirements.txt     Dependencias para ejecutar la aplicación
```

## Cuatro tareas y guion de demostración

1. **Identificar colaboradores destacados.** En “Colaboradores”, comparar grado
   y trabajos compartidos; seleccionar a Jimmy Tarrillo Olano, con nueve vecinos.
   El detalle distingue personas diferentes de registros compartidos.
2. **Encontrar puentes.** En “Puentes”, seleccionar el primer investigador del
   ranking de intermediación. Revisar vecinos, departamentos y sus conexiones.
   La intermediación alta por sí sola no prueba una conexión entre departamentos.
3. **Descubrir afinidades.** Activar las sugerencias, ampliar Top % y modificar
   las tres importancias. Seleccionar una pareja para revisar las señales y la
   evidencia. Buscar a Luz Adanaque para observar que un perfil sin conexiones
   internas puede tener publicaciones y candidatos por afinidad temática.
4. **Explorar grupos y comunidades.** Cambiar a “Grupos y comunidades”, comparar
   agrupaciones calculadas con pertenencias institucionales y filtrar RIC, DADS
   o un centro. Una persona puede pertenecer a varios grupos.

**Mantra:** panorama de los 104 perfiles → zoom, búsqueda y filtros → detalles al
seleccionar personas o conexiones. Las sugerencias no desplazan los nodos. El
botón Restablecer recupera la vista y los parámetros iniciales.

## Cómo interpretar la red

- **Coautoría:** autores individuales identificados mediante URL CRIS u ORCID.
- **Proyecto compartido:** participación en el mismo proyecto.
- **Publicación asociada:** el trabajo aparece en ambos perfiles; no afirma
  autoría individual cuando CRIS no la desglosa.

Cada pareja aparece una vez; el peso cuenta registros distintos por DOI/URL y
conserva los tipos por separado. La red tiene 49 investigadores con conexiones,
55 aislados y 61 componentes. Un aislado puede colaborar con personas externas.
La pareja de Física con peso 432 representa publicaciones asociadas, no 432
coautorías individuales comprobadas.

**Métricas:** grado = vecinos distintos; grado ponderado = suma de trabajos
compartidos; intermediación = caminos mínimos sin usar frecuencia como distancia;
comunidades = modularidad ponderada. Se calculan sobre la red observada completa.
Los filtros cambian la vista y los candidatos; las sugerencias no alteran métricas.

**Diseño:** color por departamento principal o comunidad; tamaño de nodo en escala
de raíz cuadrada, con un mínimo para conservar visibles los aislados; grosor de
arista logarítmico para manejar pesos entre 1 y 432. Líneas continuas para vínculos
registrados, punteadas para la asociación de publicaciones y discontinuas violetas
para sugerencias. La posición facilita explorar la topología, no mide similitud.
Los aislados se distribuyen en el perímetro para hacer visible su presencia sin
ocultar las conexiones del centro. Zoom, selección y etiquetas evitan superponer
104 nombres. La animación mantiene el contexto y respeta movimiento reducido.

## Fundamento de las sugerencias

- **T — Temática:** modelo multilingüe de intereses declarados y hasta 20 conceptos
  de huella. Se seleccionan por peso de CRIS × frecuencia inversa entre perfiles.
  Se excluyen “Peru” y “Numerical Example” del cálculo, conservándolos en los datos.
  Las etiquetas repetidas se cuentan una vez, conservando su mayor relevancia.
  Cada fuente se normaliza y ambas tienen igual importancia si están disponibles.
  Para cinco perfiles sin ambas fuentes se utiliza la biografía, dividida en
  fragmentos según el límite del modelo. La similitud es coseno, con negativos a 0.
  No volvemos a sumar títulos/abstracts, que pueden duplicar información de huella.
- **I — Institución:** mismo grupo = 1; centro/instituto = 0,7; departamento = 0,4.
  Se toma solo el nivel más específico. La jerarquía refleja especificidad, no
  coeficientes aprendidos. Compartir UTEC o facultad no aumenta la puntuación.
  Sin pertenencias relevantes suficientes, la señal se marca como no disponible.
- **R — Estructura:** Personalized PageRank ponderado, continuación 0,90 y reinicio
  0,10 en el origen. Se promedian ambos sentidos y se divide por el máximo entre
  parejas sin arista, limitando a 1. Componentes desconectados producen cero.

**Combinación:** `S = αT + βI + γR`. Inicio: 60/30/10, un escenario exploratorio.
Los controles suman 100 %; al mover uno se redistribuye proporcionalmente el resto.
Si una señal falta se renormalizan los pesos disponibles y se indica cobertura.
No se rellenan recomendaciones con puntuaciones cero ni parejas existentes.

**Top %:** porcentaje de las parejas sin vínculo dentro de los filtros actuales.
Con toda la cohorte hay 5.282 parejas candidatas; Top 1 % muestra hasta 53. El rango
0–10 % permite ampliar gradualmente sin saturar inicialmente la red. Seleccionar
una pareja puede destacarla aunque esté fuera del Top dibujado.

**Límites:** no es una probabilidad ni un modelo validado de colaboración futura.
Se comprueban las fórmulas, la sensibilidad a los pesos y un control multilingüe;
no se presenta precisión predictiva no medida. La afinidad puede ser amplia o
estar basada en información limitada: consultar términos, pertenencias y fuentes.
El desplegable “Cómo interpretar” explica estas decisiones dentro de la app.

## Regenerar los datos y el análisis

La extracción requiere macOS, una pestaña admitida del directorio CRIS en Safari,
permiso para controlar Safari y “Permitir JavaScript desde eventos de Apple”.

```bash
python -m pip install -r requirements-preparacion.txt
python -m extraccion_datos
python -m app.recommendations --prepare
```

El scraping conserva los datos anteriores hasta completar y validar la extracción;
respeta robots.txt y se detiene si Cloudflare bloquea la sesión. El último comando
usa los JSON locales, descarga un modelo público fijado y reemplaza las puntuaciones
dentro de `analysis.json`. No crea carpetas por corrida. Si se actualiza la red sin
regenerar el análisis, la app detecta el desajuste y desactiva las sugerencias.

El modelo es `paraphrase-multilingual-MiniLM-L12-v2`, revisión
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, ejecutado en CPU. No se usan APIs de pago.
La extracción conserva listas completas de la cohorte y fichas detalladas de los
129 proyectos y 90 publicaciones; no incluye todos los textos completos ni abstracts.

## Comprobaciones

```bash
python -m pytest -q
node --test tests/scoring.test.mjs
```

Las pruebas no visitan CRIS ni descargan el modelo. La prueba del preparador RWR
usa scipy, incluido en los requisitos opcionales de preparación; CI lo instala.
Para repetir la prueba visual opcional, con Playwright y Chrome instalados y la
app ejecutándose: `python tests/browser_smoke.py`.

Fundamentos: [CollaborationViz](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111928),
[modelo multilingüe](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2),
[Personalized PageRank](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html),
[D3](https://d3js.org/). CollaborationViz utiliza grants compartidos; aquí conservamos
los tipos de evidencia que publica CRIS y presentamos la afinidad por separado.

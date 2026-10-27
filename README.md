# UTECVis

Aplicación **Flask + D3** para explorar colaboración académica y afinidades entre
**104 investigadores de UTEC**. Incluye 73 conexiones registradas, sus evidencias
y sugerencias explicadas mediante temática, institución y estructura de la red.

La [guía del proyecto](GUIA_PROYECTO.md) explica los datos, todas las métricas,
las fórmulas, los parámetros visuales y los límites de las sugerencias.

## Clonar el proyecto completo

```bash
git clone https://github.com/stewartmb/utecvis.git
cd utecvis
```

El repositorio incluye el código, los cinco JSON con los datos y resultados
preparados, D3 local y las instrucciones. Puedes leer los archivos de `data/`
directamente; para abrir la app, sigue los pasos siguientes.

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

1. **Identificar colaboradores destacados.** En “Colaboradores”, elegir “Personas”
   o “Trabajos” y abrir “Ver ranking”; seleccionar a Jimmy Tarrillo Olano, con nueve vecinos.
   El detalle distingue personas diferentes de registros compartidos.
2. **Encontrar puentes.** En “Puentes”, abrir “Ver ranking” y seleccionar el primer
   investigador por intermediación. Revisar vecinos, departamentos y sus conexiones.
   La intermediación alta por sí sola no prueba una conexión entre departamentos.
3. **Descubrir afinidades.** Activar “Sugerencias” abajo a la izquierda, ampliar
   Top % y modificar las tres importancias visibles. Seleccionar una línea sugerida
   para revisar las señales. Buscar a Luz Adanaque para observar que un perfil sin
   conexiones internas puede tener publicaciones y candidatos por afinidad temática.
4. **Explorar departamentos y pertenencias.** Pasar el cursor por la leyenda para
   reconocer miembros y seleccionar un departamento. Consultar las conexiones y
   pertenencias de sus investigadores en el detalle. Esta cuarta tarea es una
   reformulación de la exploración de grupos; se retiró la vista de comunidades.

**Mantra:** el grafo ocupa toda la pantalla al abrir y los rankings aparecen
solo al solicitarlos. Hay dos vistas: Colaboradores y Puentes. La leyenda es el
único selector de departamentos; el vecindario se limita desde el perfil. Las
selecciones activas se quitan con ×. Las sugerencias son una capa independiente
que se conserva al cambiar de vista. Su interruptor, Top % y tres importancias
están siempre abajo a la izquierda; al desactivarlas, los cuatro deslizadores
quedan atenuados y bloqueados. Panorama de los 104 perfiles → zoom, búsqueda y filtros →
detalles al seleccionar personas o conexiones. D3 reacomoda los nodos cuando cambian
sus radios o las conexiones visibles, para mantener la separación. El
botón Restablecer recupera la vista y los parámetros iniciales.

## Fotos, coincidencias y respuesta de controles

Se incluyen 102 fotos públicas de CRIS en `app/static/photos/`; dos perfiles no
publican foto. Se muestran en nodos de al menos 25 px de diámetro en pantalla,
conservando el borde del departamento. En los demás aparecen iniciales. El zoom
actualiza ese umbral. Las fotos se sirven localmente, sin solicitudes a CRIS al
explorar; para reponerlas: `python -m extraccion_datos.photos` (requiere conexión).

Al abrir una pareja, las pertenencias y temas coincidentes aparecen antes de la
puntuación. Los términos relacionados por el modelo se distinguen de coincidencias
textuales. Los pesos se muestran junto al resultado. Temática, Institución y Red
incluyen ayudas breves al pasar el cursor o enfocar sus etiquetas.

Los controles de sugerencias actualizan sus valores de inmediato y agrupan los
cambios del grafo por fotograma. Los radios y el ranking se reutilizan cuando sus
entradas no cambian; durante el ajuste se evita ejecutar cientos de pasos físicos
antes de devolver el control. La simulación D3 continúa con límites y colisiones.

Al pasar sobre un nodo se muestran **Colaboradores** y **Trabajos compartidos**
de la red registrada visible. Los trabajos se suman por colaborador, como en el
grado ponderado; un mismo trabajo con varios colaboradores puede contar en varios
vínculos. Las conexiones sugeridas se muestran por separado.

## Vista: treemap + fuerzas

La vista agrupa la misma red por departamento principal. D3 treemap
asigna áreas proporcionales al número de investigadores visibles. D3 force mantiene
los círculos separados dentro del bloque; los vínculos entre departamentos siguen
visibles. Incluye a los aislados en su departamento, sin crear aristas nuevas.
Los tamaños y las métricas mantienen su significado. Los bloques no representan
comunidades calculadas ni prueban colaboración. Los departamentos son el primer
nivel de esta vista; los grupos superpuestos requerirían otra regla de pertenencia.

El lienzo crece de manera uniforme si los radios necesitan
más espacio, manteniendo la proporción de áreas. En escenarios densos puede
reducirse el tamaño aparente al ajustar toda la vista: se puede ampliar con zoom.
La agrupación institucional facilita localizar departamentos, pero puede alargar
y acumular los enlaces entre ellos. Los modos **Colaboradores** y **Puentes** están abajo, junto a los círculos de tamaño. Sus opciones y el ranking se consultan en el mismo lugar.

## Cómo interpretar la red

- **Coautoría:** autores individuales identificados mediante URL CRIS u ORCID.
- **Proyecto compartido:** participación en el mismo proyecto.
- **Sugerencia:** pareja sin conexión registrada, ordenada por afinidad.

Las publicaciones vinculadas a dos perfiles sin coautoría individual confirmada
se conservan en los registros de producción, pero no generan aristas ni aportan
peso a las métricas o al cálculo de proximidad estructural.

Cada pareja aparece una vez; el peso cuenta registros distintos por DOI/URL y
conserva los tipos por separado. La red tiene 47 investigadores con conexiones,
57 aislados y 62 componentes. Un aislado puede colaborar con personas externas.

**Métricas:** grado = vecinos distintos; grado ponderado = suma de trabajos
compartidos; intermediación = caminos mínimos sin usar frecuencia como distancia;
comunidades = modularidad ponderada. Se calculan sobre la red observada completa.
Los filtros cambian la vista y los candidatos; las sugerencias no alteran estas métricas.

**Tamaño dinámico:** por defecto cuenta vecinos por las aristas visibles, tanto
registradas como sugeridas. Radio = `7 + 44 × conexiones_visibles / grado_referencia`.
El grado de referencia es el mayor grado de la red observada completa (actualmente
9). La escala conserva esa referencia al filtrar o activar sugerencias: cada nueva
conexión hace crecer sus dos extremos, y al quitarla disminuyen. El radio es lineal
con el número de vecinos para reforzar el contraste entre pocos y muchos; el área
del círculo no es proporcional al grado. Los valores exactos están en el detalle.
Con 1, 4 y 9 conexiones, los radios son aproximadamente 11,9; 26,6 y 51. Sin
conexiones, el radio mínimo es 7. Las sugerencias pueden superar el radio 51.
Los filtros cuentan solo aristas con ambos extremos visibles. Las sugerencias se
distinguen en el tooltip y con líneas violetas discontinuas. Esta medida de la
vista es independiente del grado observado que muestran los rankings y detalles.
“Trabajos” utiliza el grado ponderado observado; “Puentes” utiliza la
intermediación observada. No hay selectores globales de tamaño o color.

**Diseño:** color por departamento principal; tamaño de nodo en escala
lineal para el grado y de raíz cuadrada para intermediación y grado ponderado,
con un mínimo para conservar visibles los aislados; grosor de
arista logarítmico para manejar pesos entre 1 y 8. Líneas continuas para vínculos
registrados y discontinuas violetas para sugerencias. La posición facilita explorar
la topología, no mide similitud.
Todos los nodos, incluidos los aislados, permanecen dentro del bloque de su departamento.
D3 combina fuerzas de enlaces observados, repulsión y colisión. Los límites
rectangulares y la corrección geométrica evitan solapamientos y salidas del bloque.
Al arrastrar un nodo, sus vecinos directos del mismo bloque acompañan parte del
movimiento. Las sugerencias no modifican las fuerzas de enlace ni las métricas.
Los escenarios densos amplían el espacio de cálculo y se encuadran
automáticamente. El ajuste usa toda la altura disponible; en pantallas amplias los
controles de sugerencias ocupan el margen izquierdo. El grosor de las aristas va de
1,5 a 6 px en escala logarítmica y permanece legible al ajustar el zoom.
La vista general usa transparencia para reducir la acumulación visual en los
cruces; al pasar el cursor o seleccionar, se resaltan solo las conexiones de esa
persona o pareja y se atenúan las demás. Los enlaces más largos y una repulsión
mayor dan más espacio a la red. Estos ajustes facilitan seguir las conexiones;
no garantizan eliminar todos los cruces del grafo.
Zoom, selección y etiquetas evitan superponer
104 nombres. La animación mantiene el contexto y respeta movimiento reducido.
La interfaz prioriza el grafo, con navegación y controles flotantes compactos;
las explicaciones extensas permanecen en el diálogo de método y en los detalles.
Referencias de interacción: [D3 ForceGraph](https://old.observablehq.com/@d3/force-directed-graph-component)
y [Gephi](https://gephi.org/quickstart/). Fuerzas y arrastre según las API oficiales de
[D3 Simulation](https://d3js.org/d3-force/simulation),
[D3 Collide](https://d3js.org/d3-force/collide) y
[D3 Link](https://d3js.org/d3-force/link).

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
Con toda la cohorte hay 5.283 parejas candidatas; Top 1 % muestra hasta 53. El rango
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
node --test tests/scoring.test.mjs tests/treemap-layout.test.mjs
```

Las pruebas no visitan CRIS ni descargan el modelo. La prueba del preparador RWR
usa scipy, incluido en los requisitos opcionales de preparación; CI lo instala.
Para repetir la prueba visual opcional, con Playwright y Chrome instalados y la
app ejecutándose: `python tests/browser_smoke.py`.

Antecedentes, artículos, demos y alcance de cada referencia: [REFERENCIAS.md](REFERENCIAS.md).

Fundamentos: [CollaborationViz](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0111928),
[modelo multilingüe](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2),
[Personalized PageRank](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.link_analysis.pagerank_alg.pagerank.html),
[D3](https://d3js.org/). CollaborationViz utiliza grants compartidos; aquí conservamos
los tipos de evidencia que publica CRIS y presentamos la afinidad por separado.

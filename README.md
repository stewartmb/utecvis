# UTECVis

Aplicación **Flask + D3** para explorar colaboración académica y afinidades entre
**104 investigadores de UTEC**. Incluye 73 conexiones registradas, sus evidencias
y sugerencias explicadas mediante temática, institución y estructura de la red.

Este README reúne las fórmulas, variables, ejemplos y decisiones necesarias para
explicar el proyecto. La [guía del proyecto](GUIA_PROYECTO.md) amplía detalles de
extracción, controles y parámetros físicos.

## Preparar la presentación

[PRESENTACIONES.md](PRESENTACIONES.md) documenta el relato, las fórmulas, las
evidencias y la cobertura de los 20 puntos de la rúbrica. La presentación ya está
generada: [PPTX](presentacion/UTECVis-presentacion.pptx) y
[PDF](presentacion/UTECVis-presentacion.pdf), con capturas de la app y de CRIS.

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

1. **Identificar colaboradores destacados.** En “Colaboradores”, localizar nodos
   grandes y consultar colaboradores y trabajos compartidos al pasar el cursor.
   Buscar a Jimmy Tarrillo Olano permite comprobar sus nueve colaboradores.
   El detalle distingue personas diferentes de registros compartidos.
2. **Encontrar puentes.** En “Puentes”, localizar nodos grandes por intermediación
   y consultar su valor exacto al seleccionarlos. Revisar vecinos, departamentos y conexiones.
   La intermediación alta por sí sola no prueba una conexión entre departamentos.
   Con Sugerencias activadas, el tamaño pasa a intermediación **simulada**;
   desactivarlas recupera la red observada.
3. **Descubrir afinidades.** Activar “Sugerencias” arriba a la izquierda, debajo de la leyenda, ampliar
   Top % y, si se desea, abrir «Ajustar criterios» para modificar las tres importancias. Seleccionar una línea sugerida
   para revisar las señales. Buscar a Luz Adanaque para observar que un perfil sin
   conexiones internas puede tener publicaciones y candidatos por afinidad temática.
4. **Explorar departamentos y pertenencias.** Pasar el cursor por la leyenda para
   reconocer miembros y seleccionar un departamento. Consultar las conexiones y
   pertenencias de sus investigadores en el detalle. Esta cuarta tarea es una
   reformulación de la exploración de grupos; se retiró la vista de comunidades.

**Mantra:** el grafo ocupa toda la pantalla al abrir y los detalles aparecen
solo al seleccionar un investigador o una conexión. Hay dos vistas: Colaboradores y Puentes. La leyenda es el
único selector de departamentos; el vecindario se limita desde el perfil. Las
selecciones activas se quitan con ×. Las sugerencias son una capa independiente
que se conserva al cambiar de vista. Su interruptor permanece arriba a la izquierda, debajo de la leyenda. Top % aparece al activarlas;
los tres pesos se despliegan en «Ajustar criterios». Al desactivarlas se ocultan
las opciones. Panorama de los 104 perfiles → zoom, búsqueda y filtros →
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
y acumular los enlaces entre ellos. Los modos **Colaboradores** y **Puentes** están arriba a la izquierda, junto a los círculos de tamaño. No hay un segundo selector de tamaño.

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

### Métricas: qué significan y cómo se calculan

La red registrada es un grafo **no dirigido** `G=(V,E)`: `V` son investigadores y
`E`, parejas con evidencia aceptada. `N=104` y `E=73`. En una arista, `source` y
`target` identifican sus extremos; no indican quién colaboró primero. El peso
`w_AB` cuenta publicaciones y proyectos distintos compartidos por esa pareja.
Un trabajo con tres investigadores genera tres parejas, por lo que sumar pesos
por persona no equivale a contar su producción única.

| Variable | Fórmula o criterio | Lectura y alcance |
|---|---|---|
| Grado `k(v)` | Número de vecinos distintos registrados | Cuántos colaboradores internos tiene; máximo actual 9. No cuenta colaboradores externos. |
| Grado ponderado `W(v)` | `Σ w_vu` sobre sus vecinos | Intensidad de trabajos compartidos por pareja; máximo 20. Un trabajo con varios vecinos puede aportar varias veces. |
| Centralidad de grado | `k(v)/(N−1) = k(v)/103` | Grado normalizado; guardado en los datos, sin selector visual adicional. |
| Intermediación `B(v)` | Fracciones de caminos mínimos entre otras parejas que pasan por v, normalizadas | Identifica posiciones de paso en la red; determina el tamaño en Puentes. |
| Intermediación simulada `B_sim(v)` | Misma fórmula de B aplicada a las 73 aristas registradas más las sugerencias mostradas, con los 104 nodos | Tamaño de Puentes con Sugerencias activadas; representa un escenario hipotético. |
| Componente | Conjunto conectado mediante algún camino | 62 componentes, incluidos 57 aislados. No es un departamento. |
| Comunidad | Modularidad ponderada con `greedy_modularity_communities` de NetworkX | Agrupación calculada por conexiones, distinta de afiliaciones publicadas. Se conserva en datos; se retiró su vista. Hay 10 comunidades de más de una persona y 57 unitarias. |
| Nodo de articulación | Retirarlo aumenta el número de componentes | 9 investigadores. No equivale a todo nodo con B alta. |
| Arista puente | Retirarla aumenta el número de componentes | 13 conexiones. Es una propiedad de la arista, distinta de B de una persona. |
| Densidad | `2E/(N(N−1)) = 73/5356 ≈ 1,36 %` | Fracción de parejas posibles con vínculo registrado. |
| Vecinos de otros departamentos | Vecinos registrados con departamento conocido diferente al propio | Ayuda a examinar conexiones institucionales; un departamento faltante no se trata como uno distinto. |
| Vecinos comunes de A y B | Intersección de sus conjuntos de vecinos | Contexto de una pareja; no es una cuarta señal añadida a S. |
| Camino mínimo entre A y B | Ruta con menor número de aristas | Evidencia de conectividad topológica; no prueba circulación real de información. |

**Intermediación paso a paso:**

```text
B(v) = [Σ sobre parejas s<t, s≠v, t≠v de σ_st(v)/σ_st] / [(N−1)(N−2)/2]
```

`σ_st` es el número de caminos mínimos entre s y t; `σ_st(v)`, cuántos pasan
por v como intermediario. Los extremos no cuentan. Si hay dos caminos mínimos
y uno pasa por v, esa pareja aporta 1/2. Una pareja desconectada aporta cero.
Con 104 nodos, el divisor es `103 × 102 / 2 = 5.253`.
NetworkX calcula B sin pesos (`weight=None`): cada conexión cuesta un paso;
no interpretamos más publicaciones como más distancia.

Jimmy Tarrillo Olano tiene la mayor B, aproximadamente **0,06797**, y grado **9**.
B alta señala una posición estructural de paso; para afirmar que une
**departamentos** se revisan además los departamentos de sus conexiones.
No es una medida de calidad académica ni una probabilidad de colaboración.

**Modularidad:** `Q = (1/(2m)) × Σ_ij [w_ij − s_i s_j/(2m)] × δ(c_i,c_j)`.
`s_i` es la suma de pesos de i; `m`, la suma de pesos de todas las aristas;
`δ` vale 1 cuando i y j pertenecen a la misma comunidad. El algoritmo fusiona
comunidades buscando mejorar Q. Es una partición algorítmica, no demuestra
la existencia de grupos oficiales ni una solución única del problema.

**Python y D3 cumplen funciones diferentes:** NetworkX prepara estas métricas y
RWR en Python; D3 dibuja y gestiona fuerzas, treemap, zoom e interacción en el
navegador. NetworkX no forma parte de D3. Las métricas guardadas corresponden a
**toda la red registrada**, aunque se filtre la vista o se activen sugerencias.
La intermediación simulada es un cálculo adicional en JavaScript, separado de
esos datos y contrastado con NetworkX; no sustituye la intermediación observada.


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
vista es independiente del grado observado que muestran los detalles.
En Puentes, `radio = 7 + 44 × sqrt(B/B_max)`:

- **Sugerencias desactivadas:** B y B_max de la red observada completa; su máximo
  actual es aproximadamente 0,06797.
- **Sugerencias activadas:** B_sim y su máximo en el escenario, calculados con
  todos los nodos, las aristas registradas y las sugerencias mostradas. La leyenda
  cambia a “Intermediación simulada”. Al cambiar Top %, pesos o filtros, el tamaño
  se actualiza si cambia el conjunto de aristas sugeridas.

El máximo se ajusta a cada escenario para mantener radios entre 7 y 51. Por eso
los tamaños expresan importancia relativa dentro del escenario: no permiten
comparar magnitudes absolutas entre escenarios sin consultar sus valores.
Una nueva conexión puede reducir B al crear caminos alternativos; más aristas
no implica necesariamente un nodo mayor en Puentes.

 El radio es una unidad
del espacio SVG y el diámetro es su doble; el zoom cambia su tamaño en pantalla.
7 conserva visibles los aislados y 44 fija el contraste: son parámetros visuales.

Los trabajos se representan mediante el grosor de las aristas y se consultan
en tooltips y detalles; «Puentes» utiliza intermediación observada o simulada según la capa de sugerencias. No hay selectores globales de tamaño o color.

**Diseño:** color por departamento principal; tamaño de nodo en escala
lineal para el grado visible y de raíz cuadrada para intermediación,
con un mínimo para conservar visibles los aislados; grosor de
arista logarítmico para manejar pesos entre 1 y 8. Líneas continuas para vínculos
registrados y discontinuas violetas para sugerencias. La posición facilita explorar
la topología, no mide similitud.
Todos los nodos, incluidos los aislados, permanecen dentro del bloque de su departamento.
D3 combina fuerzas de enlaces observados, repulsión y colisión. Los límites
rectangulares y la corrección geométrica evitan solapamientos y salidas del bloque.
Al arrastrar un nodo, sus vecinos directos del mismo bloque acompañan parte del
movimiento. Las sugerencias no modifican las fuerzas de enlace ni las métricas guardadas;
sí intervienen en el cálculo separado de intermediación simulada.
Los escenarios densos amplían el espacio de cálculo y se encuadran
automáticamente. El ajuste usa toda la altura disponible; en pantallas amplias los
controles de sugerencias ocupan el margen izquierdo. El grosor de las aristas va de
1,5 a 6 px en escala logarítmica: `1,5 + 4,5 × ln(w)/ln(8)` para los pesos
actuales 1–8. Así, pesos 1, 2 y 8 tienen grosores 1,5; 3 y 6 px. Las
sugerencias tienen grosor constante de 1,4 px: no codifica su puntuación.
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

## Método de las sugerencias: tres señales por pareja

Una sugerencia compara **dos investigadores sin conexión registrada**. Las tres
señales son T (temática), I (institución) y R (red). Cada una está en **0–1** y se
muestra multiplicada por 100. `null` significa información no disponible; **cero
es un resultado conocido**. Ninguna señal ni la puntuación final es una
probabilidad de colaboración futura. Las coincidencias concretas y sus fuentes
se consultan al seleccionar la línea sugerida.

### 1. Temática T: semejanza de lo que investigan

**Datos utilizados:** `research_areas` (intereses declarados) y `fingerprint`
(conceptos y relevancia publicados en el perfil). Las huellas son términos de
investigación, no identificadores personales ni huellas biométricas.

El modelo preentrenado
[`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)
convierte cada texto en un **embedding**, un vector numérico que permite comparar
significados, incluso entre español e inglés. MiniLM es el modelo que genera esos
vectores; no lo entrenamos con nuestros profesores. Su revisión se fija en
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42` y la preparación se ejecuta en CPU.

Preparación de cada perfil:

1. Normalizar Unicode, espacios y puntuación de borde. Deduplicar intereses
   ignorando mayúsculas; no traducir manualmente los textos.
2. En las huellas, excluir pesos no positivos y los conceptos genéricos `Peru` y
   `Numerical Example`. La exclusión afecta al cálculo, conservando el original.
3. Calcular la frecuencia inversa de cada concepto:
   `IDF(c) = ln((N_h + 1) / (df(c) + 1)) + 1`.
   `N_h` es el número de perfiles con huella; `df(c)`, los perfiles que contienen
   ese identificador de concepto. Así se reduce la importancia relativa de
   conceptos presentes en muchos perfiles.
4. Calcular `q(c) = peso_CRIS(c) × IDF(c)`. Si hay etiquetas iguales con distintos
   identificadores, conservar la de mayor q dentro del perfil. Seleccionar hasta
   **20 conceptos**, ordenados por q: una decisión para limitar ruido y coste.
5. Promediar los embeddings normalizados de los intereses y normalizar ese
   promedio: `u_A = normalizar(promedio(embeddings_intereses_A))`.
6. Promediar los embeddings de conceptos ponderados por q y normalizar:
   `f_A = normalizar(Σ q(c) × embedding(c) / Σ q(c))`.
7. Si hay ambas fuentes, `v_A = normalizar((u_A + f_A) / 2)`; si hay solo una,
   utilizarla. Dar igual importancia a las fuentes evita que una lista más larga
   de huellas anule por cantidad los intereses declarados.
8. En los **cinco perfiles sin ambas fuentes**, utilizar la biografía como
   respaldo. Dividirla en fragmentos de hasta `model.max_seq_length − 2` tokens,
   con solapamiento de 16; promediar sus embeddings y normalizar. El detalle
   señala esta cobertura temática más limitada. Si no hay texto utilizable, T
   queda no disponible.

`normalizar(v) = v / ||v||`: conserva la dirección del vector y lo lleva a longitud
1. La similitud final es el coseno entre los vectores de ambos investigadores:

```text
T(A,B) = max(0, min(1, (v_A · v_B) / (||v_A|| × ||v_B||)))
```

El punto indica producto escalar; las barras dobles, longitud del vector.
**Mayor T significa mayor semejanza semántica según el modelo.** No equivale a
identidad de temas ni demuestra que hayan trabajado juntos. No sumamos títulos
y abstracts como fuentes adicionales porque pueden repetir información ya
representada en las huellas. Fotos, nombres, citas y h-index no aportan a T.

**Control real del modelo:** “Machine learning” y “Aprendizaje automático” tienen
coseno **0,835962**; “Machine learning” y “Mecánica de suelos y cimentaciones”,
**0,146285**. Este ejemplo comprueba una equivalencia lingüística, no valida todas
las comparaciones. En el detalle se muestran coincidencias textuales y hasta dos
pares de términos relacionados con coseno ≥ 0,45; son explicaciones y **no se
suman otra vez** a T.

### 2. Institución I: coincidencia de afiliaciones

**Datos utilizados:** `affiliations`, comparando `organisation_id`, no solo textos
parecidos. En CRIS, grupos, centros e institutos aparecen en la misma lista de
organizaciones del perfil. Nuestro ETL asigna `affiliations[].type` según el
nombre: `research_group`, `research_center`, `institute`, `department`, etc., y
conserva las clases HTML originales en `source_classes`. Encontramos marcas
`researchgroup` y `center`; un instituto como ASRI también puede tener marca
`center`. Estos tipos normalizados y los identificadores internos los construye
la extracción; la URL de organización conserva el enlace original.

El campo antiguo `research_groups` reúne nombres de grupos y centros. **El cálculo
usa `affiliations`, que sí distingue los tipos.** No suponemos que todo grupo
pertenezca a un centro ni que estas categorías formen un organigrama anidado.

Para cada pareja se toma **una sola categoría**, en este orden: grupo compartido,
centro/instituto compartido, departamento compartido, ninguna coincidencia.
No se suman varias pertenencias. Universidad y facultades generales no puntúan
porque aportan poca discriminación en esta cohorte. Si a cualquiera de los dos
le faltan afiliaciones relevantes, I queda **no disponible**, no cero.

#### De dónde salen los valores institucionales

Se cuentan **todas las parejas distintas de la cohorte**, tanto conectadas como
sin conexión. Para cada categoría c:

```text
p_c = parejas con colaboración registrada de categoría c / todas las parejas de categoría c
```

Una pareja cuenta una vez, aunque comparta varios trabajos o pertenencias.
Las categorías siguientes son excluyentes; no se mezclan los conteos brutos de
coincidencias superpuestas:

| Coincidencia más específica | Parejas totales | Con colaboración registrada | Proporción p_c | I mostrado sobre 100 |
|---|---:|---:|---:|---:|
| Mismo grupo | 94 | 18 | 19,1489 % | **100** |
| Mismo centro/instituto, sin grupo compartido | 85 | 6 | 7,0588 % | **34,48** |
| Mismo departamento, sin coincidencia superior | 378 | 17 | 4,4974 % | **20,60** |
| Ninguna coincidencia publicada, con información suficiente | 4.594 | 32 | 0,6966 % | **0** |
| Información institucional insuficiente | 205 | 0 | No se estima | **N/D** |
| **Total** | **5.356** | **73** | | |

La base `p_0 = 32/4594` recoge la colaboración registrada sin coincidencia
institucional. La referencia `p_g = 18/94` corresponde al grupo compartido:

```text
I(c) = limitar_a_0_1((p_c − p_0) / (p_g − p_0))
Valor mostrado = 100 × I(c)
```

**Ejemplo con centros/institutos:**

```text
p_c = 6/85; p_0 = 32/4594; p_g = 18/94
I(centro) = ((6/85) − (32/4594)) / ((18/94) − (32/4594))
          = 0,3447936998… → 34,48/100
```

Se resta la base porque también se observan colaboraciones sin afiliaciones
compartidas. Se divide por el contraste entre grupo y base para situar grupo en
100 y ninguna coincidencia en 0. Por tanto, **34,48 expresa un contraste relativo
observado**, no 34,48 % de probabilidad de colaborar. Los valores aproximados
35 y 21 discutidos en el diseño resultaban del redondeo; la aplicación calcula
con las fracciones completas y redondea solo al mostrarlas.

**Ejemplo real de afiliación:** Deyby Huamanchahua Canchanya y Julio Ernesto
Valdivia Silva comparten el Centro de Investigación en Bioingeniería – BIO y
reciben I = 0,3447936998… por esa categoría.

**Alcance de la justificación:** reemplazamos la heurística inicial 100–70–40 por
una calibración descriptiva de esta misma red. Las proporciones sustentan el
orden observado; la normalización lineal y la selección del nivel más específico
siguen siendo decisiones del método. No prueban causalidad, significación
estadística ni precisión predictiva. Solo hay seis colaboraciones en la categoría
centro/instituto; además, las parejas comparten investigadores y no son
observaciones independientes. Una arista ausente tampoco prueba ausencia real
de colaboración. Para evaluar predicción futura se necesitarían datos de prueba
independientes, preferiblemente temporales.

**Comprobación del efecto del cambio:** con los pesos iniciales y sin filtros,
40 de las 53 sugerencias del Top 1 % se conservan respecto al esquema 100–70–40;
entran 13 parejas y salen 13. En Top 5 %, se conservan 220 de 265 y cambian 45.
T y R permanecen idénticos. Esto muestra sensibilidad a la regla institucional,
no demuestra que las nuevas parejas sean mejores predicciones.

La tabla, las fracciones, la fórmula y los valores exactos se guardan en
`analysis.json → recommendations.metadata.institutional_calibration`.
Al regenerar se recalibran sobre la cohorte completa, nunca sobre los filtros o
sugerencias visibles. Se limita el resultado a 0–1; una categoría sin ejemplos
queda no disponible. Si grupo no supera a la base o falta alguna de esas dos
referencias, el comando se detiene: esa normalización ya no sería justificable.

### 3. Red R: proximidad por caminos registrados

**Datos utilizados:** únicamente los nodos y las aristas registradas de
`network.json`. El peso de cada arista es su cantidad de trabajos compartidos.
La pregunta es si dos profesores están próximos mediante colaboradores
intermedios, aunque no tengan una conexión directa.

Aplicamos **Random Walk with Restart (RWR)** mediante Personalized PageRank de
NetworkX. Desde cada investigador A, un paseo aleatorio:

- Sigue una conexión con **90 %** de probabilidad, eligiéndola proporcionalmente
  a su peso. Si los únicos vecinos tienen pesos 2 y 6, sus probabilidades
  condicionadas a continuar son 2/8 y 6/8.
- Vuelve al investigador A con **10 %** de probabilidad. Si no hay salidas,
  también vuelve a A; no salta a otro componente.

```text
P_A = 0,90 × Mᵀ × P_A + 0,10 × e_A
R_bruto(A,B) = (P_A(B) + P_B(A)) / 2
R(A,B) = min(1, R_bruto(A,B) / máximo_R_bruto_entre_parejas_sin_arista)
```

`M` es la matriz de transición normalizada por los pesos salientes, con las
salidas inexistentes dirigidas al origen; `e_A` concentra el reinicio en A;
`P_A(B)` es la masa estacionaria que llega a B al reiniciar en A. No equivale a
probabilidad de colaboración. Promediamos ambos sentidos porque la sugerencia
es una pareja sin dirección. El máximo es global entre parejas sin vínculo,
no cambia con los filtros. Si ese máximo fuera cero, todos los R serían cero.

R está en 0–1: **cero entre componentes desconectados o desde un aislado hacia
otro nodo**. Una pareja puede compartir temas o institución y tener R = 0.
El cálculo utiliza hasta 1.000 iteraciones y tolerancia `1e-12`.
El reinicio del 10 % es un parámetro exploratorio, distinto del peso global de
Red. Las sugerencias nunca se añaden al grafo que calcula R o la intermediación
observada. Se usan únicamente en el escenario separado de intermediación
simulada; este resultado no alimenta R ni S, evitando que una hipótesis genere
nueva evidencia para su propia puntuación.

### 4. Combinación S, pesos y cobertura

Con las tres señales disponibles:

```text
S(A,B) = αT + βI + γR
α = 0,60; β = 0,30; γ = 0,10
Valor mostrado = 100 × S
```

α, β y γ son **importancias configurables**, distintas de los valores calculados
de cada señal. El inicio 60/30/10 prioriza temática; es una decisión exploratoria,
no un ajuste validado. Al mover una barra, las otras dos se redistribuyen
proporcionalmente para sumar 100 %; si ambas estaban en cero, se reparte entre
ellas por igual, ajustando el redondeo.

**Ejemplo real:** Jose Javier Cerda Hernandez y Jose De La Puente Maldonado
comparten el Departamento de Ingeniería Industrial y Gestión de la Ingeniería:

```text
T = 0,470273; I = 0,2059785624…; R = 0
S = 0,60 × 0,470273 + 0,30 × 0,2059785624… + 0,10 × 0
  = 0,3439573687… → 34,40/100
```

Temática aporta 28,22 puntos; institución, 6,18; red, 0. Tener R = 0 no significa
que falte la señal: entra al promedio con su peso. El mismo centro aportaría
`30 × 0,3447936998… = 10,34` puntos con el peso inicial de 30 %.

Si falta una señal, se divide por la suma de pesos disponibles. Por ejemplo,
con I faltante: `S = (0,60T + 0,10R) / 0,70`. La cobertura sería **70 %**, la
fracción del peso solicitado con datos, no el porcentaje extraído del perfil.
Si no hay señales disponibles con peso positivo, no se asigna puntuación.
La puntuación sigue en 0–100 y **no es una probabilidad**.

### 5. Candidatas, Top % y densidad

Hay `104 × 103 / 2 = 5.356` parejas posibles. Se excluyen los 73 vínculos
registrados: quedan **5.283 candidatas**, sin autoenlaces ni duplicados A–B/B–A.
Los filtros conservan solo parejas con ambos extremos visibles.

Se ordenan por S descendente, con desempate estable por identificadores.
Top % toma `techo(candidatas × porcentaje / 100)` posiciones, mostrando solamente
puntuaciones positivas: puede haber menos resultados si no hay suficientes.
El rango es **0–5 %**, con pasos de 0,1 e inicio 1 %.

Sin filtros, Top 1 % muestra hasta 53 sugerencias y Top 5 % hasta 265; junto con
73 conexiones registradas son 338 aristas. El porcentaje es una fracción del
ranking, no una probabilidad ni un umbral mínimo de afinidad.

El máximo 5 % controla densidad visual. La demo de CollaborationViz tiene un
control hasta 5, pero no encontramos una justificación científica de ese número
exacto. Además, su implementación aplica el porcentaje a puntuaciones guardadas
antes de excluir conexiones, mientras aquí contamos candidatas sin conexión:
los denominadores no son idénticos. La orientación de Munzner `E < 4N` para redes
nodo–enlace aporta una referencia de escala: aquí `338 < 4 × 104 = 416`, sin
asegurar legibilidad. El límite no demuestra precisión predictiva.
Véanse las fuentes y sus alcances en [REFERENCIAS.md](REFERENCIAS.md).

### Intermediación simulada al ajustar sugerencias

En Puentes con Sugerencias activadas, calculamos B para **cada uno de los 104
investigadores**, sobre una copia de la red registrada más todas las sugerencias
que se dibujan. Una pareja seleccionada que se conserve fuera del Top también
forma parte del escenario si su línea sigue visible. Cada arista cuesta un paso,
sin usar su cantidad de trabajos ni su puntuación como distancia. Se mantiene la
normalización de B para 104 nodos, con divisor 5.253.

Los filtros afectan a las sugerencias que se incorporan al escenario; **no
eliminan las aristas registradas ocultas** de este cálculo. Así se conserva la
misma cohorte y no se mezcla el efecto de añadir una hipótesis con el de retirar
investigadores. Los nodos ocultos se calculan, aunque no se dibujen.

Se aplica el algoritmo exacto de Brandes en un **Web Worker local**, fuera del
hilo de la interfaz. Tras 45 ms sin un nuevo cambio del conjunto de aristas se
solicita el cálculo; si cambian solo las puntuaciones y las parejas siguen siendo
las mismas, se reutiliza el resultado. Los resultados de solicitudes anteriores
se descartan si ya cambió el escenario o se desactivó la capa. D3 actualiza radios,
colisiones y posiciones cuando llega el resultado. Mientras espera, la leyenda
indica “calculando…”, conservando transitoriamente el tamaño anterior.

El tooltip indica el valor usado por el tamaño. El perfil conserva B observada
y añade B simulada cuando corresponde. Al desactivar Sugerencias se recuperan
inmediatamente los valores observados. Con Top 0 %, ambas redes coinciden.
El escenario no altera `network.json`, los embeddings, I, RWR ni las puntuaciones
S: **simular un puente no lo convierte en colaboración registrada**.

Código: [betweenness.mjs](app/static/betweenness.mjs) y
[betweenness-worker.mjs](app/static/betweenness-worker.mjs).
Se compara con NetworkX en la red original y en escenarios de Top 1 %, Top 5 %
y peso institucional extremo. También se comprueban caminos empatados,
componentes, aislados, duplicados y cambios rápidos en navegador.

### 6. Qué está calculado y qué hemos elegido

| Calculado a partir de los datos | Decisiones del método o de presentación |
|---|---|
| Grados, intermediación, componentes y comunidades | Usar una red sin dirección y la evidencia aceptada para crear una arista |
| Proporciones institucionales y valores I resultantes | Categoría más específica, restar la base y normalizar respecto a grupo |
| Coseno entre vectores temáticos | Modelo, fuentes, igual importancia entre fuentes, hasta 20 conceptos y exclusiones |
| RWR y su normalización global | Reinicio 10 %, pesos por trabajos y simetrización |
| S para los pesos actuales y orden de candidatas | Inicio 60/30/10 y máximo Top 5 % |
| Vecinos visibles y número de miembros por departamento | Radio, colores, grosor, distribución por departamentos y fuerzas D3 |

Corregir y verificar una fórmula no valida automáticamente sus supuestos.
La app sirve para **explorar candidatos y la red publicada**, sin presentar
causalidad ni precisión predictiva no evaluadas.

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
dentro de `analysis.json`, incluida la calibración institucional calculada de
nuevo sobre todas las parejas. No crea carpetas por corrida. Si se actualiza la red sin
regenerar el análisis, la app detecta el desajuste y desactiva las sugerencias.

El modelo es `paraphrase-multilingual-MiniLM-L12-v2`, revisión
`e8f8c211226b894fcb81acc59f3b34ba3efd5f42`, ejecutado en CPU. No se usan APIs de pago.
La extracción conserva listas completas de la cohorte y fichas detalladas de los
129 proyectos y 90 publicaciones; no incluye todos los textos completos ni abstracts.

Si solo se modifica la regla institucional y la red no cambió, se puede actualizar
I sin descargar el modelo ni recalcular T o R:

```bash
python -m app.recommendations --recalibrate-institutional
```

Este comando comprueba que la red coincide con la preparación existente y cambia
únicamente los valores institucionales y su metodología. Flask sirve los valores
guardados; el navegador calcula S y Top % al mover las barras, sin volver a ejecutar
embeddings ni PageRank. Las fórmulas de preparación están en
[app/recommendations.py](app/recommendations.py); las métricas de la red, en
[extraccion_datos/network.py](extraccion_datos/network.py); la combinación y el
ranking interactivo, en [app/static/scoring.mjs](app/static/scoring.mjs).

## Comprobaciones

```bash
python -m pytest -q
node --test tests/scoring.test.mjs tests/treemap-layout.test.mjs tests/betweenness.test.mjs
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

## Interfaz centrada en las tareas

El perfil muestra métricas, intereses, pertenencias y colaboradores registrados.
«Publicaciones y proyectos» se abre solo al solicitarlo. Se retiraron la biografía
completa, la lista adicional de candidatos y las notas de preparación del perfil.
El enlace a CRIS conserva acceso al contexto profesional. Las explicaciones del
método están en «Cómo interpretar»; las limitaciones específicas de una pareja y
los trabajos que justifican una conexión permanecen en sus detalles. Estos cambios
no eliminan datos del repositorio ni modifican los cálculos.

Al pasar sobre una arista registrada o sugerida se oscurece esa conexión y se
identifican sus dos extremos; al salir se recupera la selección anterior. Los
bloques departamentales muestran un tooltip únicamente sobre su nombre, con el
nombre completo y el número de investigadores visibles. Se sustituyó el título
nativo del bloque por una tarjeta compacta de fondo claro, texto oscuro y un
acento del color del departamento. Los tooltips de nodos, aristas y criterios
comparten ese estilo.

El tooltip de investigador es compacto: retrato de 44 px a la derecha y cifras
en una fila. La foto aparece aunque el nodo sea demasiado pequeño para mostrarla.
Si CRIS no proporciona una foto o falla la carga, se muestran iniciales. Se retiró
la nota de alcance del tooltip; el significado de los conteos permanece documentado
aquí. Cuando hay espacio, la tarjeta se coloca por encima del cursor para reducir
la oclusión de la red.

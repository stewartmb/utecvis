# UtecVis

Red académica de investigadores de UTEC. Incluye el scraping en Python, los datos
extraídos y una base Flask para la futura visualización interactiva con D3.

## Estructura

```text
utecvis/
├── app/                 Aplicación Flask y página web
├── extraccion_datos/    Scraping, procesamiento y construcción de la red
├── data/                Una sola copia de los datos finales
│   ├── network.json         Investigadores, conexiones y métricas por persona
│   ├── publications.json    Publicaciones y autores
│   ├── projects.json        Proyectos y participantes
│   ├── organisations.json   Afiliaciones y miembros
│   └── analysis.json        Componentes, comunidades y métricas de la red
├── tests/               Pruebas del scraping y la integridad de los datos
├── requirements.txt
└── README.md
```

## Ejecutar la aplicación

Python 3.12 o superior. Desde la raíz del proyecto:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m flask --app app run
```

Abrir http://127.0.0.1:5000. La API `/api/network` lee directamente
`data/network.json`; no requiere Safari ni repetir la extracción.
La interfaz interactiva D3 todavía está pendiente.

## Repetir el scraping

La extracción requiere **macOS y Safari**. Abrir
[el directorio CRIS](https://cris.utec.edu.pe/es/persons/) en Safari y comprobar que
se vea la lista de investigadores. Permitir a la terminal controlar Safari y
habilitar **Permitir JavaScript desde eventos de Apple** en Safari.

Con el entorno virtual activado:

```bash
python -m extraccion_datos
```

El programa encuentra la pestaña CRIS, crea una pestaña de trabajo y recorre
el directorio, los perfiles, las listas completas de publicaciones y proyectos,
las huellas temáticas y las fichas de evidencia seleccionadas. Después normaliza,
deduplica por DOI/URL, calcula conexiones y métricas, y reemplaza los cinco JSON de
`data/`. No crea carpetas por corrida ni guarda logs o historiales.

Respeta los permisos y tiempos de espera de robots.txt. Si la sesión caduca,
aparece Cloudflare o una lista no coincide con su cantidad declarada, se detiene
sin publicar una extracción incompleta. Hasta completar la extracción se conservan
los datos anteriores. Una ejecución nueva puede obtener cifras distintas si CRIS cambia.

## Datos incluidos

La extracción del 25/10/2026 contiene **104 investigadores, 2.474 publicaciones,
129 proyectos y 74 conexiones**. Integra afiliaciones, RENACYT en 64 perfiles y
80 huellas completas con 4.683 conceptos. Los campos no publicados permanecen
vacíos o `null`; 26 perfiles no tienen panel general de citas.

Se recorrieron todas las listas de la cohorte y se adquirieron fichas detalladas
de los 129 proyectos y de 90 publicaciones seleccionadas para comprobar autores y
colaboraciones. Los textos completos y las fichas detalladas de las demás
publicaciones quedan fuera de este alcance. Los autores externos se conservan en
los registros, sin agregarlos como investigadores de la red.

## Interpretar las conexiones

| Tipo | Significado |
|---|---|
| `coauthorship` | Autores individuales identificados mediante URL CRIS u ORCID. |
| `shared_project` | Participación en un mismo proyecto. |
| `shared_publication` | Un mismo trabajo asociado a ambos perfiles, sin afirmar autoría individual. |

Cada par aparece una vez y puede tener varios tipos. El peso cuenta trabajos o
proyectos distintos compartidos; cada conexión conserva sus fuentes y registros
de respaldo. Compartir departamento o tema no crea una conexión automáticamente.
Se preserva la autoría colectiva de 605 trabajos; no se inventan autores.

La red conserva 55 investigadores aislados y 61 componentes. Estar aislado aquí
solo significa no tener conexiones identificadas dentro de esta cohorte. Las
métricas de `analysis.json` corresponden a la red completa; una vista filtrada debe
indicar ese alcance o recalcularlas.

## Código y comprobaciones

En `extraccion_datos/`, `pipeline.py` organiza el flujo; `safari.py` y `http.py`
controlan el acceso; `cris.py` lee perfiles; `research.py` lee publicaciones,
proyectos y huellas; `network.py` construye la red; `quality.py` valida los datos.

```bash
python -m pytest -q
```

Las pruebas usan páginas ficticias y los datos incluidos; no necesitan acceso a CRIS.

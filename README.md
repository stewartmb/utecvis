# UtecVis

Extracción reproducible de perfiles públicos de UTEC, análisis de relaciones
académicas y una futura visualización de red con **Flask + D3**.

**Estado: datos finales preparados; interfaz D3 pendiente.** La cohorte extraída
del directorio contiene 104 investigadores, 2.474 publicaciones, 129 proyectos y
74 conexiones con evidencia. [Resultado, cobertura y uso](docs/resultado_datos_finales.md).
El JSON del profesor es solo una referencia de estructura y no es nuestra fuente.

## Arquitectura

```text
CRIS UTEC + fuentes de enriquecimiento verificadas
              |
     extraccion_datos/        Código ETL y adaptadores
              |
 data/raw/<run_id>/           HTML original, sin editar
              |              + data/manifests/<run_id>.json
 data/interim/<run_id>/       Perfiles normalizados y control de calidad
              |
 data/processed/<run_id>/     Archivos validados para consumo
              |
 extraccion_datos/           Congelación, aristas con evidencia y métricas
              |
            app/             Flask + una red interactiva D3 (siguiente etapa)
```

Una carpeta contiene el **código** y otra los **datos**. La aplicación nunca hará
scraping al abrir una página: leerá un conjunto validado de una ejecución concreta.
No se necesitan una base de datos, Docker ni un orquestador para empezar.

| Carpeta | Responsabilidad |
|---|---|
| `extraccion_datos/` | Cliente HTTP, adaptador CRIS, normalización, validación y exportación. |
| `data/raw/` | Snapshots originales separados por ejecución. |
| `data/interim/` | Atributos normalizados en listas y reportes de calidad. |
| `data/processed/` | Datos validados; aquí solo se publican ejecuciones completas. |
| `data/external/` | Enriquecimiento externo y correspondencias revisadas, cuando se implemente. |
| `data/manifests/` | URL, fecha UTC, hash del HTML, estado, parámetros y errores por ejecución. |
| `analisis_red/` | Espacio para análisis posteriores; el pipeline actual calcula la red y sus métricas en `extraccion_datos/freeze_network.py`. |
| `app/` | Base Flask. La interfaz D3 se implementará después del piloto. |
| `config/` | Parámetros públicos de las fuentes. |
| `schemas/` | Contratos de datos legibles fuera de Python. |
| `tests/` | Pruebas sin conexión con datos completamente ficticios. |
| `docs/` | Arquitectura, plan, diccionario y decisiones. |

## Inicio local

Se requiere Python 3.12 o superior. Desde la raíz del checkout:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .
python -m extraccion_datos.cli --help
```

`pyproject.toml` declara las dependencias y los grupos opcionales; el lock conserva
las versiones exactas usadas en esta base. Se trabaja en un entorno virtual, sin
modificar las dependencias globales del equipo.

## Flujo de extracción

```bash
# 1. Probar el acceso y registrar su resultado.
python -m extraccion_datos.cli probe

# 2. Piloto de hasta cinco perfiles; no equivale al censo.
python -m extraccion_datos.cli extract --limit 5

# 3. Usar el manifiesto generado por esa extracción.
python -m extraccion_datos.cli transform --manifest data/manifests/ID_DE_EJECUCION.json

# 4. Exportar un piloto únicamente dentro de interim.
python -m extraccion_datos.cli export --manifest data/manifests/ID_DE_EJECUCION.json --allow-pilot

# 5. Solo después de revisar el piloto y los selectores: censo completo.
python -m extraccion_datos.cli extract --all
python -m extraccion_datos.cli transform --manifest data/manifests/ID_DEL_CENSO.json
python -m extraccion_datos.cli export --manifest data/manifests/ID_DEL_CENSO.json
```

`ID_DE_EJECUCION` es un marcador: reemplazarlo por el nombre impreso por el comando.
Una descarga 403 queda como ejecución fallida y devuelve código de salida 1.
El pipeline no publica silenciosamente una muestra como si fuera el directorio
completo. La transformación puede repetirse sobre los snapshots sin acceder a la web.

**Extracción completa comprobada con Python y Safari:** el 25/10/2026 se
recorrieron las tres páginas del directorio y se descargaron, normalizaron y
exportaron **104 perfiles**, sin errores ni duplicados. Se verificaron los hashes
de los 107 documentos originales. [Resultado y calidad](docs/resultado_extraccion.md).

Safari debe tener una pestaña CRIS con acceso admitido. Python utiliza Apple Events
para crear una pestaña de trabajo en esa misma sesión, sin exportar cookies. La
navegación la realiza el programa, sin un agente.

En macOS, con Safari preparado:

```bash
python -m extraccion_datos.cli probe --transport safari
python -m extraccion_datos.cli run --transport safari --limit 5
python -m extraccion_datos.cli run --transport safari --all
```

La sesión puede caducar. Si reaparece una verificación, se registra y se detiene.
HTTP directo y los navegadores automatizados nuevos no obtuvieron acceso en las
pruebas. Los requisitos, límites y variantes están en
[Acceso y reproducción](docs/acceso_y_reproduccion.md).
Las listas de publicaciones, proyectos y huellas, las fichas de evidencia y la
congelación de la red están completas; ver [pipeline de red](docs/pipeline_red.md).
Las consultas externas a Scholar quedan como enriquecimiento opcional.
El parser ya recoge las métricas generales publicadas por CRIS: 78 perfiles con
citas e índice h, 76 de Scopus y dos de PlumX, conservando proveedor y fecha.
Los 26 perfiles sin ese panel mantienen `null`.

## Formato del profesor

`faculty_network.json` conserva `{"nodes": [...]}` y los ocho campos originales:
`image_url`, `department`, `email`, `research_groups`, `research_areas`, `citations`,
`id` y `name`. Las áreas y grupos se exportan como texto separado por `;`.

Los ID son enteros estables derivados de la URL canónica, no posiciones cambiantes
en el directorio. Las citas desconocidas se exportan como `null`, no como cero.
`faculty_nodes.json` conserva además listas estructuradas, identificadores externos
y procedencia. `network.json` contiene además 74 aristas con evidencia y tipos de
relación explícitos; ver [sus reglas](docs/pipeline_red.md).

## Verificación y aplicación

```bash
ruff check .
ruff format --check .
pytest -q
flask --app app run
```

`/health` comprueba Flask. `/api/network` responde 503 mientras no se configure un
archivo con nodos y aristas válidos. No hay una red de demostración con personas
inventadas. Para configurar datos desde Python: `create_app({"NETWORK_FILE": ruta})`.
Con el snapshot final:

```bash
UTECVIS_NETWORK_FILE=data/processed/20261026T012402Z-a32612e7/network.json flask --app app run
```

GitHub Actions ejecuta las comprobaciones sin visitar CRIS ni depender de que un
sitio externo esté disponible.

## Documentación

- [Resultado de los datos finales y cobertura](docs/resultado_datos_finales.md)

- [Pipeline de listas, evidencia y congelación de la red](docs/pipeline_red.md)

- [Auditoría de información adicional para la red](docs/auditoria_cris.md)
- [Resultado de la extracción y calidad](docs/resultado_extraccion.md)
- [Investigación de métodos y prueba de la API](docs/investigacion_acceso.md)
- [Acceso y reproducción con Python](docs/acceso_y_reproduccion.md)
- [Arquitectura y buenas prácticas](docs/arquitectura.md)
- [Plan de extracción por hitos](docs/plan_extraccion.md)
- [Diccionario y contratos](docs/diccionario_datos.md)
- [Decisiones y requisitos](docs/decisiones.md)

Los datos generados se excluyen de Git por defecto. El snapshot validado se entrega
en `utecvis_datos_finales.zip`, junto con esquema, calidad y documentación.
La futura entrega de la aplicación debe incluirlo para ejecutarse sin repetir el scraping.

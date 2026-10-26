# UtecVis

Extracción reproducible de perfiles públicos de UTEC, análisis de relaciones
académicas y una futura visualización de red con **Flask + D3**.

**Estado: base del proyecto, no entrega final.** El JSON del profesor es una
referencia de estructura: no es nuestra fuente de datos y no se incluye en el
repositorio. La población se obtendrá del directorio, sin asumir 92 personas.

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
       analisis_red/         Aristas con evidencia y métricas (siguiente etapa)
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
| `analisis_red/` | Construcción de vínculos y cálculo de métricas. |
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

**Estado de acceso:** HTTP devuelve un desafío de Cloudflare. El navegador de la
aplicación permitió inventariar 104 perfiles y capturar cinco perfiles reales;
el parser ya se comprobó con ese piloto. La adquisición autónoma en Python sigue
pendiente de validar el acceso: Chrome nuevo y la prueba con WebKit no recibieron
el directorio. Ver `docs/acceso_y_reproduccion.md`.

Existe un transporte Python con Playwright y perfil persistente dedicado. Tras
preparar y verificar su acceso, un solo comando ejecuta el ETL completo:

```bash
python -m extraccion_datos.cli access --browser-channel chrome
python -m extraccion_datos.cli run --transport browser --browser-channel chrome --headed --limit 5
```

La primera orden requiere una terminal interactiva y comprobación humana del
acceso. No se ha demostrado que el censo pueda ejecutarse sin esa preparación.
Los adaptadores de publicaciones, proyectos y Scholar siguen pendientes.

## Formato del profesor

`faculty_network.json` conserva `{"nodes": [...]}` y los ocho campos originales:
`image_url`, `department`, `email`, `research_groups`, `research_areas`, `citations`,
`id` y `name`. Las áreas y grupos se exportan como texto separado por `;`.

Los ID son enteros estables derivados de la URL canónica, no posiciones cambiantes
en el directorio. Las citas desconocidas se exportan como `null`, no como cero.
`faculty_nodes.json` conserva además listas estructuradas, identificadores externos
y procedencia. Las aristas se agregarán en un archivo de red separado después de
elegir una regla sustentada por los datos; no se fabrican en la extracción.

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

GitHub Actions ejecuta las comprobaciones sin visitar CRIS ni depender de que un
sitio externo esté disponible.

## Documentación

- [Investigación de métodos y prueba de la API](docs/investigacion_acceso.md)
- [Acceso y reproducción con Python](docs/acceso_y_reproduccion.md)
- [Arquitectura y buenas prácticas](docs/arquitectura.md)
- [Plan de extracción por hitos](docs/plan_extraccion.md)
- [Diccionario y contratos](docs/diccionario_datos.md)
- [Decisiones y requisitos](docs/decisiones.md)

Los datos generados se excluyen de Git por defecto. Al cerrar la entrega se
seleccionará un snapshot validado para incluirlo en el ZIP de Flask junto con los
archivos de nodos y aristas. El profesor debe poder ejecutar la aplicación sin
volver a hacer scraping.

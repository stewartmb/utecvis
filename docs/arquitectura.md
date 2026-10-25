# Arquitectura global y buenas prácticas

## Decisión principal

Un repositorio para extracción, análisis y aplicación. Es un proyecto académico
con decenas o centenares de perfiles: empezar con archivos JSON por ejecución
permite revisar el proceso sin introducir infraestructura innecesaria.

La estructura distingue tres responsabilidades:

1. **Adquisición y ETL:** obtener evidencia, normalizar atributos y evaluar calidad.
2. **Análisis:** definir el significado de una arista y calcular métricas coherentes.
3. **Presentación:** Flask sirve datos ya preparados y D3 representa la red.

## Capas de datos

- **Raw:** HTML original y, en futuras fuentes, respuestas JSON originales. No se
  corrigen a mano. Cada archivo conserva hash y URL en el manifiesto.
- **Interim:** datos normalizados, diagnósticos y exportaciones de pilotos. Aquí se
  revisan vacíos, conflictos y posibles errores del parser.
- **Processed:** salida de una ejecución completa que supera los controles. La
  aplicación y el análisis reciben una versión identificada, no 'lo último que haya'.
- **External:** material de enriquecimiento obtenido con correspondencias de
  identidad verificadas. No sustituye el registro original de CRIS.
- **Manifests:** trazabilidad de la ejecución: parámetros, fechas, páginas,
  cobertura esperada/observada, hashes, errores y versión del adaptador.

## Prácticas implementadas

| Práctica | Aplicación |
|---|---|
| Separar código y datos | ETL en `extraccion_datos`, resultados en `data`. |
| No confundir muestra y censo | Exportación de pilotos a interim; processed exige cobertura completa. |
| Reutilizar la evidencia | Transformación sin red a partir del HTML guardado. |
| Identidad estable | ID numérico de 52 bits derivado de URL canónica; se rechazan duplicados. |
| Datos ausentes explícitos | `null` en escalares y listas vacías; no asignar cero a citas desconocidas. |
| Procedencia bibliométrica | Ningún valor de citas sin proveedor y fecha. |
| Proteger resultados | Validación previa y escrituras JSON atómicas. |
| Fallos visibles | HTTP 403 falla y queda registrado; no se acepta una página de bloqueo como perfil. |
| Carga acotada | Solicitudes secuenciales, pausas, robots.txt, timeout y reintentos limitados. |
| Entornos reproducibles | `pyproject.toml`, lock y entorno virtual local. |
| Comprobaciones automáticas | Pruebas offline y revisión de formato/lint en GitHub Actions. |
| Secretos fuera de Git | `.env` ignorado; no se requieren secretos para CRIS. |

La URL puede cambiar con una modificación del portal. ORCID y otros identificadores
ayudarán a reconciliar cambios: un hash de URL no equivale a una identidad universal.

## Reglas para el análisis

Las futuras aristas llevarán tipo de relación y evidencia. Coautoría,
coparticipación en proyectos, grupo compartido y similitud son conceptos distintos.
El dataset preservará esas diferencias y la interfaz explicará qué red está viendo
el usuario. El grado de una red de afinidad no mide productividad científica.

No se mezclan citas de Scopus y Scholar ni se comparan ventanas temporales distintas
como si fueran una métrica homogénea. Los conflictos se conservan para revisión.

Antes del análisis se revisará cuántos perfiles quedan sin relaciones por ausencia
de datos. Falta de información no significa ausencia demostrada de colaboración.

## Evolución prevista

Primero se valida el piloto real; después se completa el censo y se añaden
adaptadores de publicaciones/proyectos. Solo entonces se cierra la regla de aristas.
La interfaz mantendrá una red principal con vista general, zoom/filtros y detalles
bajo demanda. La animación acompañará cambios de foco y selección.

La base Flask usa una factoría `create_app`, para poder probar configuraciones sin
arrancar un servidor. La documentación oficial describe este patrón:
https://flask.palletsprojects.com/en/stable/patterns/appfactories/

La declaración de dependencias sigue `pyproject.toml`:
https://packaging.python.org/en/latest/guides/writing-pyproject-toml/

## Qué se versiona

Sí: código, configuración pública, contratos, documentación, pruebas y lock.
No por defecto: HTML masivo, descargas, correos recolectados, entornos, cachés ni
archivos de ejecución. El snapshot que acompañe la entrega se elegirá expresamente.
El repositorio comienza privado; publicar su contenido es una decisión posterior.

No se ha copiado el JSON del profesor ni el PDF del enunciado al repositorio.

# Datos

Esta carpeta existe en el repositorio; las ejecuciones generadas se ignoran por
defecto. Los comandos crean subcarpetas por `run_id`.

- `raw/`: evidencia original descargada.
- `interim/`: normalización, controles y pilotos.
- `processed/`: salidas de censos validados.
- `external/`: enriquecimiento de otras fuentes cuando se implemente.
- `manifests/`: registro de cada ejecución, incluso cuando falla.

No copiar aquí el JSON del profesor como si fuera una extracción propia.
No editar archivos de raw para corregir datos. Registrar correcciones en el ETL.

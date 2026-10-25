# Análisis de la red

Aquí irán construcción de aristas, centralidades, comunidades y caminos.

Entrada: `data/processed/<run_id>/faculty_nodes.json`, más publicaciones/proyectos
normalizados cuando se implementen sus adaptadores.

Salida prevista: `data/processed/<run_id>/network.json`, con `nodes`, `edges` y
`metadata`. Cada arista tendrá `source`, `target`, `relation`, `weight` y `evidence`.

No se generan aristas por ahora. La elección de la relación depende del piloto.
Una pertenencia compartida a un grupo no acredita una coautoría. El tamaño de un
nodo y las centralidades deben interpretarse según la relación elegida.

NetworkX se reserva para análisis; toda representación visual será con D3.

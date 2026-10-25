# Registro de decisiones

Fecha de contexto: 25/10/2026, America/Lima.

| Decisión | Motivo |
|---|---|
| Repositorio `utecvis` privado inicialmente | Código y datos se preparan antes de decidir publicación. |
| Hacer nuestra propia extracción | El JSON del profesor es solo una muestra del formato. |
| `extraccion_datos/` y `data/` separados | Código revisable y datos reproducibles con diferentes ciclos de cambio. |
| Conservar datos originales por ejecución | Permite depurar y transformar sin repetir descargas. |
| JSON como almacenamiento inicial | Escala académica y salida exigida de nodos/aristas; SQL no es necesario todavía. |
| Citas ausentes como null | El cero es una observación, no un indicador de dato desconocido. |
| Google Scholar opcional | Está mencionado en el enunciado; identidad, acceso y cobertura deben evaluarse. |
| Sin regla definitiva de aristas aún | Requiere examinar las publicaciones, proyectos y atributos reales. |
| D3 para toda visualización | Requisito del enunciado; NetworkX solo se plantea para cómputo. |
| Flask como aplicación final | Requisito del ZIP de entrega. |
| Pruebas offline | Los bloqueos o cambios del portal no deben invalidar las pruebas del código. |

## Requisitos de la tarea que guían la arquitectura

- Una visualización de red que responda al menos cuatro tareas.
- Recolección propia mediante scraping.
- Interacciones y animaciones aplicando el mantra de visualización.
- Código visual con D3; otras bibliotecas de visualización no permitidas.
- ZIP con aplicación Flask y datos de nodos/aristas.
- Exposición en clase obligatoria.

Estos son requisitos del entregable académico; esta inicialización del repositorio
no implica que la visualización final ni el scraping completo estén terminados.

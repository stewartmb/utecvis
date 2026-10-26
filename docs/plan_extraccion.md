# Plan para conseguir los datos

## Cierre de datos — 25/10/2026

**Hitos 0 a 5 completados.** La cohorte de 104 perfiles tiene listas completas de
publicaciones/proyectos, huellas, afiliaciones, RENACYT, evidencia de vínculos y
métricas. El snapshot validado contiene 2.474 publicaciones, 129 proyectos y 74
aristas. Ver [resultado y límites](resultado_datos_finales.md) y
[pipeline reproducible](pipeline_red.md).

El hito 6 tiene los datos congelados y la API Flask validada; siguen pendientes la
interfaz D3, las pruebas de las tareas visuales y la exposición. El plan original
siguiente se conserva como historial de los hitos; los estados de adaptación
pendiente y las 13 relaciones de muestra corresponden a la auditoría previa y
quedan superados por el resultado final enlazado arriba.

## Hito 0. Base del proyecto

**Listo:** repositorio, arquitectura, CLI ETL, contratos iniciales, entorno aislado,
pruebas sintéticas, base Flask y comprobaciones automáticas.

La estructura está preparada. Además del piloto asistido inicial, se comprobó
un piloto de cinco perfiles adquirido, normalizado y exportado por Python mediante
la sesión admitida de Safari. El censo de 104 perfiles está descargado, normalizado
y exportado sin errores. La visualización final sigue pendiente; ver
`resultado_extraccion.md` y `acceso_y_reproduccion.md`.

## Hito 1. Resolver acceso y validar un piloto real

1. Probar `https://cris.utec.edu.pe/es/persons/` con el cliente y registrar respuesta.
2. Revisar acceso normal por navegador. La prueba HTTP del 25/10/2026 obtuvo 403;
   verificar si existe una vía de descarga/exportación admitida o una sesión normal
   utilizable. No automatizar desafíos ni inventar datos para ocultar el fallo.
3. Inspeccionar HTML real de 5 a 10 perfiles de varios departamentos, incluyendo
   perfiles con campos incompletos y múltiples afiliaciones.
4. Validar selectores, paginación, nombre, foto, departamento, grupos y áreas.
5. Comparar los campos extraídos con lo visible y guardar fixtures saneados.

**Criterio de cierre:** los campos del piloto coinciden con los perfiles y se
puede explicar cada ausencia. Los selectores se corrigieron y comprobaron contra los cinco perfiles reales:
correo visible, enlaces de Scholar regionales, Scopus específico y límites de las
secciones. Posteriormente, el mismo ETL adquirió los 104 perfiles desde Safari.

## Hito 2. Completar el directorio

**Listo:** 104/104 perfiles, tres páginas, 107 snapshots con hash verificado.

1. Recorrer todas las páginas y deduplicar por URL canónica.
2. Comparar el total descubierto con el total declarado por el directorio.
3. Descargar cada perfil, guardar HTML y registrar fecha, estado y hash.
4. Revisar fallos individuales y repetir solamente lo necesario; la reanudación
   incremental entre ejecuciones es una mejora pendiente del cliente inicial.

**Criterio de cierre:** cobertura justificada del directorio. No se toma 92 como
meta ni se excluye a alguien por no estar en el ejemplo del profesor.

## Hito 3. Normalizar y revisar calidad

1. Limpiar espacios y Unicode sin destruir nombres ni tildes.
2. Separar listas de áreas y grupos; preservar también el HTML original.
3. Resolver alias de departamentos/grupos con un catálogo revisable, sin fusionar
   automáticamente entidades distintas. Ese catálogo se añadirá tras el piloto.
4. Obtener informe de vacíos, duplicados, conflictos y cobertura por departamento.
5. Registrar cualquier corrección como transformación, no edición del raw.

**Criterio de cierre:** cada persona tiene identidad estable y procedencia; los
campos faltantes y los conflictos están cuantificados.

## Hito 4. Enriquecimiento y evidencia de relaciones

La auditoría real confirmó fichas con autores/DOI, proyectos con roles y fechas,
huellas ponderadas y RENACYT. Hay un inventario y 13 relaciones de muestra; no un
censo de aristas. Ver `auditoria_cris.md` para cobertura y orden de extracción.

Prioridad sugerida:

| Prioridad | Datos | Utilidad | Estado |
|---|---|---|---|
| 1 | Publicaciones CRIS, DOI/URL, autores y fecha | Encontrar coautorías verificables. | Adaptador pendiente. |
| 1 | Proyectos CRIS, participantes y roles | Encontrar participación conjunta. | Adaptador pendiente. |
| 2 | ORCID y enlaces de Scopus/Scholar | Resolver identidad y cruzar fuentes. | Extracción de enlaces inicial. |
| 2 | Biografía y formación | Explorar afinidades y enriquecer detalles. | Parser inicial; validar en piloto. |
| 3 | Citas e índice h por proveedor | Enriquecer perfil, sin sustituir las relaciones. | Panel general CRIS extraído en 78 perfiles; consultas externas pendientes. |

Buscar en Google Scholar no basta para afirmar que dos nombres son la misma
persona. Verificar ORCID, afiliación, áreas, publicaciones y coautores. Guardar
fuente, fecha y criterio de correspondencia. No completar cifras por estimación.

## Hito 5. Elegir y construir la red

Con los resultados anteriores, decidir entre coautoría, proyectos compartidos o
afinidad explícita. Medir cobertura, aislados, densidad y componentes antes de
elegir umbrales o interpretar centralidades. Toda arista debe tener evidencia.

Las cuatro tareas provisionales son: identificar personas centrales, encontrar
puentes, explorar comunidades y hallar caminos. Su interpretación se ajustará al
significado real de las aristas.

## Hito 6. Integración y entrega

Congelar un snapshot validado; calcular métricas; construir Flask + D3 con el
mantra; probar las cuatro tareas; preparar ZIP con aplicación, nodos, aristas e
instrucciones; ensayar la exposición obligatoria.

## Riesgos concretos y respuesta

- **HTTP 403:** detener y registrar; validar el acceso antes del censo.
- **HTML o paginación diferentes:** ajustar adaptador con una muestra real y pruebas.
- **Poca evidencia de coautoría:** evaluar otra relación y cambiar su interpretación.
- **Métricas heterogéneas:** conservar proveedor y ventana temporal; no mezclar.
- **Datos incompletos:** mostrar cobertura; no interpretar un vacío como cero.

## Fuentes de partida

- Directorio oficial: https://cris.utec.edu.pe/es/persons/
- Ejemplo explorado de perfil: https://cris.utec.edu.pe/es/persons/helard-alvarez-sanchez/
- Perfiles y métricas Scholar: https://scholar.google.com/intl/en/scholar/citations.html

El enunciado del profesor menciona Scholar e índice h como enriquecimiento
opcional. No se presupone que su extracción masiva esté disponible.

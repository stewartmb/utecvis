# Acceso real y reproducción sin agente

## Vía comprobada: Safari abierto en macOS

El 25/10/2026 se comprobó una adquisición ejecutada enteramente por Python:
`run --transport safari --limit 5` recorrió las tres páginas del directorio,
descubrió 104 perfiles y descargó, normalizó y exportó cinco perfiles sin errores.
Manifiesto del piloto: `20261026T002845Z-643d8b32` (fechas internas en UTC).

`SafariClient` usa `subprocess` y AppleScript mediante `/usr/bin/osascript` para
navegar y leer el DOM. Reutiliza la sesión del Safari que ya admite CRIS. No
transfiere cookies a requests ni inicia un navegador con un perfil distinto.
El agente no ejecuta los pasos de navegación: los ejecuta el programa Python.

### Requisitos

- macOS, Python 3.12 o superior y Safari abierto.
- Una pestaña de Safari que ya muestre el directorio o un perfil público de CRIS.
- Permisos de macOS para controlar Safari y JavaScript desde Apple Events admitido
  en Safari. En el equipo de prueba esto ya estaba disponible; el programa no
  cambia ajustes del navegador. Si faltan permisos, se detiene con el error recibido.

Referencia oficial de los ajustes de desarrollo de Safari:
https://developer.apple.com/documentation/safari-developer-tools/developer-settings

### Ejecutar

Desde la raíz del proyecto, con el entorno virtual activado:

```bash
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .

# Probar una página conservando el resultado y su manifiesto.
python -m extraccion_datos.cli probe --transport safari

# Piloto: adquisición, transformación, validación y exportación.
python -m extraccion_datos.cli run --transport safari --limit 5

# Directorio completo, una vez revisado el piloto.
python -m extraccion_datos.cli run --transport safari --all
```

El programa localiza una pestaña CRIS y crea otra pestaña de trabajo dentro de
esa misma ventana. Al finalizar cierra su pestaña si conserva la URL esperada.
La pestaña original permanece abierta. Se puede usar otra pestaña, pero no se
debe cerrar, reordenar ni navegar la pestaña de trabajo durante la ejecución.

La preparación inicial de la sesión depende de la persona. Una vez admitida,
la adquisición y el ETL se ejecutan sin agente. Si aparece otra verificación de
Cloudflare, el programa registra el fallo y se detiene; la vigencia del acceso
no está garantizada para futuras ejecuciones.

Se respeta el `Crawl-Delay: 5` observado en robots.txt. Cada documento conserva URL,
fecha UTC, SHA-256 y DOM original. El estado HTTP figura como `null`, porque Apple
Events permite leer el documento renderizado, pero no observar su respuesta HTTP.
Esto se identifica explícitamente como `content_origin: rendered_dom`.

## Diagnóstico de las otras vías

HTTP directo devuelve **403**, `Cf-Mitigated: challenge` y `Just a moment...`.
Chrome automatizado, con y sin ventana, y WebKit no confirmaron acceso. El usuario
tampoco pudo completar la verificación en el Chrome dedicado. Estos fallos no
impiden utilizar la sesión admitida de Safari.

El navegador de la aplicación también permitió capturar cinco perfiles durante
el diagnóstico inicial. Ese piloto fue asistido y es distinto del piloto Python
Safari. Ver `investigacion_acceso.md` para las pruebas y alternativas de API.

El transporte Playwright sigue disponible para entornos donde el sitio lo admita:

```bash
python -m extraccion_datos.cli access --browser-channel chrome
python -m extraccion_datos.cli run --transport browser --browser-channel chrome --headed --limit 5
```

## Repetir las transformaciones sin navegador

Con el manifiesto y sus snapshots guardados:

```bash
python -m extraccion_datos.cli transform --manifest data/manifests/ID.json
python -m extraccion_datos.cli export --manifest data/manifests/ID.json
```

Para un piloto, añadir `--allow-pilot` al exportar. Un piloto se guarda en `interim`;
solo una ejecución completa y validada llega a `processed`. Las citas no extraídas
permanecen `null`. Publicaciones, proyectos, aristas y métricas de red son etapas
posteriores a esta adquisición de perfiles.

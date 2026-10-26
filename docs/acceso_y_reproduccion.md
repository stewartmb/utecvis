# Acceso real y reproducción sin agente

## Diagnóstico del 25/10/2026

El HTTP directo devuelve **403**, con `Server: cloudflare`,
`Cf-Mitigated: challenge` y título `Just a moment...`. Esa respuesta no contiene
el directorio de profesores. Cambiar BeautifulSoup no resuelve esta etapa.

El navegador de la aplicación sí permitió recorrer las tres páginas del directorio:
**104 URLs distintas**, coincidentes con el total visible. Se capturaron cinco
perfiles reales, se normalizaron y se exportó un piloto sin errores de parseo.
Esos cinco registros proceden de captura asistida; no acreditan extracción autónoma.

Chrome automatizado, con y sin ventana, y la prueba inicial con WebKit no
confirmaron acceso al directorio. No está demostrada una descarga autónoma completa.

## Comparación con Conference

El flujo existente de Conference usa `launch_persistent_context` y un perfil
preparado mediante `login_once.py`. Luego lee tablas del DOM con Playwright.
En CRIS empezamos con HTTP directo y un contexto nuevo: faltaba preparar y
comprobar el acceso real. Un perfil persistente vacío no garantiza que Cloudflare
admita la sesión; esto aún debe validarse.

## Implementación Python disponible

Toda la lógica productiva está en Python. `BrowserClient` navega con Playwright,
conserva un perfil propio para CRIS en `local_state/` (ignorado por Git), espera
el documento y entrega su DOM al mismo ETL. No usa el perfil de Conference.

Desde la raíz del proyecto, con el entorno virtual activado:

```bash
python -m pip install -r requirements.lock
python -m pip install --no-deps -e .

# Chrome instalado: preparar el acceso en una terminal interactiva.
python -m extraccion_datos.cli access --browser-channel chrome

# Verificar acceso sin un agente; reutiliza el perfil dedicado.
python -m extraccion_datos.cli probe --transport browser --browser-channel chrome --headed

# Piloto completo: adquirir, normalizar, validar y exportar cinco perfiles.
python -m extraccion_datos.cli run --transport browser --browser-channel chrome --headed --limit 5

# Solo cuando el piloto funcione: ejecutar el censo con el mismo flujo.
python -m extraccion_datos.cli run --transport browser --browser-channel chrome --headed --all
```

`access` deja la preparación de la sesión en manos de la persona: si aparece una
verificación, el programa no la completa. Al pulsar ENTER comprueba el directorio
y conserva el perfil para posteriores ejecuciones. La sesión puede caducar.

Si no hay Chrome instalado, se puede instalar un navegador de Playwright y elegir
el motor correspondiente; esto no garantiza que el sitio lo admita:

```bash
python -m playwright install chromium
python -m extraccion_datos.cli access --browser-channel chromium
```

Si incluso el acceso normal en esa ventana falla, la alternativa es obtener una
vía de acceso/exportación admitida por UTEC. No etiquetar el pipeline como resuelto
solo porque sus pruebas offline pasan.

## Datos y estado

- Inventario: 104 enlaces de perfiles, no 104 perfiles completos descargados.
- Piloto asistido: 5 perfiles normalizados; todos con departamento, correo y áreas.
- Citas: no se han extraído; permanecen `null`.
- Automatización Python: implementada; acceso autónomo real pendiente de validar.
- Pipeline offline: transforma/exporta snapshots guardados sin agente ni navegador.

El manifiesto del piloto es `20261025T234454926Z-browser-276c9a78`.
Los archivos generados permanecen fuera de Git según la política del proyecto.

Referencia del navegador Python:
https://playwright.dev/python/docs/browsers

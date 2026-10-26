# Métodos documentados y pruebas adicionales de acceso

Fecha de contexto: 25/10/2026, America/Lima.

## Métodos existentes

1. **Sesión de navegador preparada y reutilizada.** Playwright documenta la
   reutilización de estado autenticado. El flujo anterior de Conference además
   conserva un perfil persistente. Esto no acredita que Cloudflare vaya a admitir
   un perfil nuevo en CRIS ni que sus verificaciones permanezcan válidas siempre.
2. **Clientes con características de protocolo de navegador.** `curl_cffi` ofrece
   perfiles TLS y HTTP de navegadores. Su documentación reconoce que reproducir
   esas características puede ser insuficiente frente a otras señales del cliente.
3. **Navegadores y servicios especializados.** Son otra familia documentada en el
   ecosistema de extracción. No se han contratado servicios ni completado
   verificaciones automáticas en este proyecto.
4. **API o exportación del proveedor.** Pure documenta una API REST con permisos
   configurados por la institución, que puede permitir escenarios de datos públicos.
   Esto no significa que cada instancia institucional admita acceso anónimo.

Cloudflare indica expresamente que los navegadores automatizados y frameworks
como Playwright no están soportados para resolver sus desafíos de producción.
Por tanto, instalar Playwright no garantiza acceso a un sitio con esa protección.

## Pruebas realizadas

| Método | Resultado observado |
|---|---|
| HTTP estándar | 403, desafío Cloudflare, título `Just a moment...`. |
| Chrome automatizado con/sin ventana | No se confirmó el documento del directorio. |
| WebKit automatizado | No se confirmó el documento del directorio. |
| curl_cffi 0.16.3, perfil Chrome | 403, `cf-mitigated: challenge`, cero enlaces de profesores. |
| curl_cffi 0.16.3, perfil Safari | 403, `cf-mitigated: challenge`, cero enlaces de profesores. |
| GET `https://cris.utec.edu.pe/ws/api/persons?size=1` | 401, `application/problem+json`, sin encabezado de desafío Cloudflare. |
| Navegador de la aplicación | Directorio de 104 perfiles y piloto de cinco perfiles descargados. |
| Python + Apple Events + Safari ya admitido | Piloto completo: tres páginas, 104 URLs descubiertas, cinco perfiles descargados, normalizados y exportados. |

Las pruebas curl se hicieron sin una sesión previa, sin proxies y sin servicios
de resolución de desafíos. No permiten concluir que todas las configuraciones
posibles vayan a fallar; sí descartan que esos dos perfiles por sí solos resuelvan
el bloqueo observado.

## Hallazgo de la API

El endpoint de personas devuelve una respuesta de autenticación en JSON, distinta
del bloqueo del portal HTML. Es una vía concreta por verificar con una credencial
admitida por UTEC/Pure. No se ha obtenido una clave ni descargado personas por API.
Tampoco se ha confirmado la cobertura de campos del endpoint.

El siguiente paso de esta vía es obtener la documentación/configuración de acceso
de la instancia UTEC y una credencial autorizada, si está disponible. El profesor
o la administración de CRIS podrían indicar cómo obtenerla. La API no reemplaza
automáticamente el requisito académico de scraping: habrá que conciliarlo con
las indicaciones del curso.

## Fuentes primarias

- Cloudflare, navegadores soportados:
  https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/
- Playwright, reutilización de estado:
  https://playwright.dev/python/docs/auth
- curl_cffi, implementación y uso:
  https://github.com/lexiforest/curl_cffi
- curl_cffi, límites y preguntas frecuentes:
  https://curl-cffi.readthedocs.io/en/latest/impersonate/faq.html
- Pure API, documentación del proveedor:
  https://api.elsevierpure.com/ws/api/documentation/index.html

## Estado

La adquisición Python con una sesión admitida de Safari quedó comprobada con un
piloto completo de cinco perfiles. El censo se ejecuta con el mismo programa y
`--all`. La preparación inicial de la sesión sigue siendo humana; no se garantiza
que su admisión permanezca válida indefinidamente. Ver los comandos y requisitos
en `acceso_y_reproduccion.md`.

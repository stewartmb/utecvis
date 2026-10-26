"""Transporte autónomo de navegador. No requiere un agente ni una sesión personal."""

import time
from urllib.parse import urlsplit

from extraccion_datos.http import AcquisitionError, SourceClient


class BrowserClient(SourceClient):
    def __init__(self, settings, channel="chromium", headed=False, profile_dir=None):
        super().__init__(settings)
        self.channel = channel
        self.headed = headed
        self.profile_dir = profile_dir
        self.driver = None
        self.browser = None
        self.page = None

    def _start(self):
        try:
            from playwright.sync_api import Error, sync_playwright
        except ImportError as exc:
            raise AcquisitionError(
                "Instalar el extra browser: python -m pip install -e '.[browser]'"
            ) from exc
        self.browser_error = Error
        self.driver = sync_playwright().start()
        try:
            engine = self.driver.webkit if self.channel == "webkit" else self.driver.chromium
            launch_options = {"headless": not self.headed}
            if self.channel != "webkit":
                launch_options["channel"] = self.channel
            if self.profile_dir is not None:
                self.profile_dir.mkdir(parents=True, exist_ok=True)
                context = engine.launch_persistent_context(
                    str(self.profile_dir), locale="es-PE", **launch_options
                )
                self.browser = context
            else:
                self.browser = engine.launch(**launch_options)
                context = self.browser.new_context(locale="es-PE")
            self.page = context.new_page()
        except Error as exc:
            self.close()
            raise AcquisitionError(
                "No se pudo iniciar el navegador. Instalar Chromium con "
                "'python -m playwright install chromium' o seleccionar Chrome instalado."
            ) from exc

    def _request(self, url):
        # robots.txt se consulta como texto; el contenido académico se navega y renderiza.
        if urlsplit(url).path == "/robots.txt":
            return super()._request(url)
        if self.page is None:
            self._start()
        elapsed = time.monotonic() - self.last_request
        time.sleep(max(0, self.settings["delay_seconds"] - elapsed))
        self.last_request = time.monotonic()
        response = None
        try:
            response = self.page.goto(
                url,
                wait_until="domcontentloaded",
                timeout=self.settings["timeout_seconds"] * 1000,
            )
            if response is None:
                raise AcquisitionError(f"Navegación sin respuesta: {url}")
            # Esperar la carga normal: una respuesta intermedia puede ser un desafío.
            # No se interactúa con CAPTCHAs ni se modifica la identidad del navegador.
            try:
                self.page.locator("main h1").wait_for(state="visible", timeout=20000)
            except self.browser_error as exc:
                if "just a moment" in self.page.title().casefold():
                    raise AcquisitionError(
                        f"Cloudflare mantiene un desafío de acceso; no se recibió el perfil: {url}"
                    ) from exc
                raise
            title = self.page.title().casefold()
            if any(marker in title for marker in ("just a moment", "access denied", "forbidden")):
                raise AcquisitionError(f"El navegador muestra un bloqueo: {url}")
            if urlsplit(self.page.url).hostname != "cris.utec.edu.pe":
                raise AcquisitionError("El portal redirigió fuera de CRIS.")
            return self.page.content().encode("utf-8"), {
                "status": response.status,
                "final_url": self.page.url,
                "document_verified": True,
                "content_type": "text/html",
                "content_origin": "rendered_dom",
                "browser_channel": self.channel,
            }
        except self.browser_error as exc:
            title = self.page.title() if self.page is not None else "sin documento"
            status = response.status if response else "?"
            raise AcquisitionError(
                f"No se recibió el contenido CRIS. HTTP inicial {status}; "
                f"título: {title}; URL: {url}"
            ) from exc

    def prepare_access(self, url):
        """Preparación humana de acceso; el script no resuelve verificaciones del sitio."""
        self._start()
        try:
            self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
            print("Se abrió un perfil de navegador dedicado a CRIS.")
            print(
                "Comprueba que se vea el directorio. Si el sitio solicita una verificación, "
                "complétala tú en esa ventana."
            )
            input("Cuando el directorio sea visible, vuelve a esta terminal y pulsa ENTER: ")
            self.page.locator("main h1").wait_for(state="visible", timeout=5000)
        except self.browser_error as exc:
            raise AcquisitionError(
                "El directorio aún no es visible en el perfil dedicado."
            ) from exc
        if urlsplit(self.page.url).hostname != "cris.utec.edu.pe":
            raise AcquisitionError("No se ha confirmado acceso al portal CRIS.")
        from extraccion_datos.cris import profile_links

        if not profile_links(self.page.content(), self.page.url):
            raise AcquisitionError("La ventana todavía no contiene enlaces del directorio CRIS.")
        return {"url": self.page.url, "title": self.page.title()}

    def close(self):
        if self.browser is not None:
            self.browser.close()
            self.browser = None
        if self.driver is not None:
            self.driver.stop()
            self.driver = None
        self.page = None

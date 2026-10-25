"""Cliente HTTP secuencial, con límites, robots.txt y fallos explícitos."""

import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser


class AcquisitionError(RuntimeError):
    pass


class SourceClient:
    def __init__(self, settings):
        self.settings = settings
        self.last_request = 0.0
        self.robots = {}

    def _request(self, url):
        """No reintenta 401/403 ni interpreta un bloqueo como una página válida."""
        attempts = self.settings["max_attempts"]
        for attempt in range(attempts):
            elapsed = time.monotonic() - self.last_request
            time.sleep(max(0, self.settings["delay_seconds"] - elapsed))
            request = Request(
                url,
                headers={
                    "User-Agent": self.settings["user_agent"],
                    "Accept-Language": "es",
                },
            )
            try:
                self.last_request = time.monotonic()
                with urlopen(request, timeout=self.settings["timeout_seconds"]) as response:
                    body = response.read()
                    metadata = {
                        "status": response.status,
                        "final_url": response.url,
                        "content_type": response.headers.get("Content-Type", ""),
                    }
                    return body, metadata
            except HTTPError as exc:
                retryable = exc.code in (429, 500, 502, 503, 504)
                if not retryable or attempt == attempts - 1:
                    raise AcquisitionError(f"HTTP {exc.code}: {url}") from exc
                retry_after = exc.headers.get("Retry-After", "")
                if retry_after.isdigit():
                    # No ignorar esperas largas impuestas por el servidor.
                    if int(retry_after) > 60:
                        raise AcquisitionError(
                            f"Servidor solicita esperar {retry_after}s; reanudar más tarde: {url}"
                        ) from exc
                    time.sleep(int(retry_after))
                else:
                    time.sleep(2 ** (attempt + 1))
            except (URLError, TimeoutError) as exc:
                if attempt == attempts - 1:
                    raise AcquisitionError(f"Error de conexión: {url}") from exc
                time.sleep(2 ** (attempt + 1))
        raise AcquisitionError(f"No se pudo descargar: {url}")

    def get(self, url):
        parts = urlsplit(url)
        if parts.scheme != "https" or parts.hostname != "cris.utec.edu.pe":
            raise AcquisitionError(f"El adaptador CRIS no admite esta fuente: {url}")
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self.robots:
            body, _ = self._request(origin + "/robots.txt")
            rules = RobotFileParser()
            rules.parse(body.decode("utf-8", errors="replace").splitlines())
            self.robots[origin] = rules
        rules = self.robots[origin]
        if not rules.can_fetch(self.settings["user_agent"], url):
            raise AcquisitionError(f"robots.txt no permite la ruta: {url}")
        crawl_delay = rules.crawl_delay(self.settings["user_agent"])
        if crawl_delay:
            self.settings["delay_seconds"] = max(self.settings["delay_seconds"], crawl_delay)
        return self._request(url)

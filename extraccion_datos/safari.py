"""Lee CRIS en Safari mediante Apple Events, reutilizando el perfil abierto en macOS."""

import json
import subprocess
import sys
import time
from urllib.parse import urlsplit

from extraccion_datos.http import AcquisitionError, SourceClient


class SafariClient(SourceClient):
    """Usa una pestaña de trabajo dentro de la ventana admitida; no exporta cookies."""

    def __init__(self, settings):
        super().__init__(settings)
        self.window_id = None
        self.tab_index = None
        self.last_url = "about:blank"

    def _script(self, script, *arguments):
        if sys.platform != "darwin":
            raise AcquisitionError(
                "El transporte Safari requiere macOS y Safari abierto."
            )
        try:
            result = subprocess.run(
                ["/usr/bin/osascript", "-e", script, *map(str, arguments)],
                check=False,
                capture_output=True,
                text=True,
                timeout=self.settings["timeout_seconds"] + 10,
            )
        except subprocess.TimeoutExpired as exc:
            raise AcquisitionError(
                "Safari no respondió; comprueba permisos o diálogos pendientes."
            ) from exc
        if result.returncode:
            raise AcquisitionError("Safari: " + result.stderr.strip()[:400])
        return result.stdout.strip()

    def _open_work_tab(self):
        # Busca únicamente pestañas CRIS; no lee el contenido de otros sitios.
        identity = self._script("""tell application "Safari"
            if (count of windows) is 0 then error "Abre CRIS en Safari."
            repeat with w in windows
                repeat with t in tabs of w
                    if URL of t starts with "https://cris.utec.edu.pe/es/persons/" then
                        set js to "JSON.stringify({url:document.URL,"
                        set js to js & "ready:!!document.querySelector('main h1'),"
                        set js to js & "title:document.title})"
                        set info to do JavaScript js in t
                        return (id of w as text) & linefeed & info
                    end if
                end repeat
            end repeat
            error "Abre una pestaña admitida de perfiles CRIS en Safari."
        end tell""")
        window_id, metadata = identity.split("\n", 1)
        source = json.loads(metadata)
        if not source["ready"] or "just a moment" in source["title"].casefold():
            raise AcquisitionError("La pestaña seleccionada todavía no muestra CRIS.")
        self.window_id = int(window_id)
        self.tab_index = int(
            self._script(
                """on run argv
            tell application "Safari"
                set w to window id (item 1 of argv as integer)
                make new tab at end of tabs of w with properties {URL:"about:blank"}
                return count of tabs of w
            end tell
        end run""",
                self.window_id,
            )
        )

    def _read(self, javascript):
        result = self._script(
            """on run argv
            tell application "Safari"
                set w to window id (item 1 of argv as integer)
                set t to tab (item 2 of argv as integer) of w
                return do JavaScript (item 3 of argv) in t
            end tell
        end run""",
            self.window_id,
            self.tab_index,
            javascript,
        )
        try:
            return json.loads(result)
        except json.JSONDecodeError as exc:
            raise AcquisitionError("Safari no devolvió un documento legible.") from exc

    def _request(self, url):
        if urlsplit(url).path == "/robots.txt":
            return super()._request(url)
        if self.tab_index is None:
            self._open_work_tab()
        elapsed = time.monotonic() - self.last_request
        time.sleep(max(0, self.settings["delay_seconds"] - elapsed))
        self._script(
            """on run argv
            tell application "Safari"
                set w to window id (item 1 of argv as integer)
                set t to tab (item 2 of argv as integer) of w
                set currentURL to URL of t
                if currentURL is missing value and (item 3 of argv) is "about:blank" then
                    set currentURL to "about:blank"
                end if
                if currentURL is not (item 3 of argv) then
                    error "La pestaña de trabajo cambió; se detiene para no tocar otra pestaña."
                end if
                set URL of t to item 4 of argv
            end tell
        end run""",
            self.window_id,
            self.tab_index,
            self.last_url,
            url,
        )
        self.last_request = time.monotonic()
        self.last_url = url
        deadline = time.monotonic() + self.settings["timeout_seconds"]
        while time.monotonic() < deadline:
            metadata = self._read("""JSON.stringify({
                url:document.URL,title:document.title,state:document.readyState,
                ready:!!document.querySelector('main h1')
            })""")
            if metadata["url"].split("#", 1)[0] == url:
                if "just a moment" in metadata["title"].casefold():
                    raise AcquisitionError(
                        "Safari volvió a mostrar una verificación de Cloudflare."
                    )
                if metadata["ready"] and metadata["state"] in (
                    "interactive",
                    "complete",
                ):
                    html = self._read(
                        "JSON.stringify(document.documentElement.outerHTML)"
                    )
                    return html.encode("utf-8"), {
                        # Apple Events entrega el DOM; no permite observar el status HTTP.
                        "status": None,
                        "final_url": metadata["url"],
                        "document_verified": True,
                        "content_type": "text/html",
                        "content_origin": "rendered_dom",
                        "browser_channel": "safari-existing",
                    }
            time.sleep(0.5)
        raise AcquisitionError(f"Safari no terminó de cargar el documento CRIS: {url}")

    def close(self):
        if self.tab_index is None:
            return
        try:
            # Cierra únicamente nuestra pestaña si conserva la URL esperada.
            self._script(
                """on run argv
                tell application "Safari"
                    set w to window id (item 1 of argv as integer)
                    set t to tab (item 2 of argv as integer) of w
                    if URL of t is (item 3 of argv) then close t
                end tell
            end run""",
                self.window_id,
                self.tab_index,
                self.last_url,
            )
        except AcquisitionError:
            pass
        finally:
            self.tab_index = None

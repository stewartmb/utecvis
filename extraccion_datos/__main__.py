"""Ejecutar con python -m extraccion_datos desde la raíz del proyecto."""

import argparse
from datetime import UTC, datetime
from pathlib import Path

from extraccion_datos.http import AcquisitionError
from extraccion_datos.pipeline import DATA, extract, save
from extraccion_datos.safari import SafariClient


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Extrae CRIS y genera los cinco JSON de UtecVis."
    )
    parser.add_argument(
        "--salida", type=Path, default=DATA, help="Carpeta de datos; por defecto data/."
    )
    args = parser.parse_args(argv)
    client = SafariClient(
        {
            "user_agent": "UtecVis (academic faculty network project)",
            "timeout_seconds": 30,
            "delay_seconds": 5,
            "max_attempts": 3,
        }
    )

    def fetch(url):
        raw, _metadata = client.get(url)
        return raw.decode("utf-8"), datetime.now(UTC).isoformat()

    try:
        outputs = extract(fetch)
        save(outputs, args.salida)
        summary = outputs["network"]["metadata"]
        print(
            f"Datos guardados en {args.salida}: "
            f"{summary['node_count']} perfiles, {summary['publication_count']} publicaciones, "
            f"{summary['project_count']} proyectos y {summary['edge_count']} conexiones."
        )
        return 0
    except (AcquisitionError, ValueError, OSError) as exc:
        print(f"Extracción detenida: {exc}. Los datos anteriores se conservan.")
        return 1
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())

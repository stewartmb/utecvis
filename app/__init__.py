"""Aplicación Flask que sirve el conjunto de datos incluido en data/."""

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request
from jsonschema import ValidationError


def create_app(config=None):
    app = Flask(__name__)
    default_data = Path(__file__).resolve().parents[1] / "data/network.json"
    app.config.from_mapping(
        NETWORK_FILE=os.environ.get("UTECVIS_NETWORK_FILE", default_data)
    )
    if config:
        app.config.update(config)
    cache = {"signature": None, "dataset": None}

    def dataset():
        from app.data import Dataset

        path = app.config["NETWORK_FILE"]
        if not path or not Path(path).is_file():
            raise ValueError("Todavía no se ha configurado una red validada.")
        path = Path(path)
        files = [
            path,
            *(
                path.parent / (name + ".json")
                for name in ("analysis", "publications", "projects")
            ),
        ]
        signature = tuple(
            (str(p), p.stat().st_mtime_ns if p.exists() else None) for p in files
        )
        if signature != cache["signature"]:
            cache["dataset"] = Dataset(path)
            cache["signature"] = signature
        return cache["dataset"]

    def pagination():
        offset, limit = (
            int(request.args.get("offset", 0)),
            int(request.args.get("limit", 20)),
        )
        if offset < 0 or not 1 <= limit <= 100:
            raise ValueError("Paginación fuera de rango.")
        return offset, limit

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify(status="ok", stage="interactive_app")

    @app.get("/api/network")
    def network():
        try:
            data = dataset().network
        except (ValueError, KeyError, OSError, ValidationError) as exc:
            app.logger.error("Datos de red inválidos: %s", exc)
            return jsonify(error="El archivo de red no cumple el contrato."), 503
        return jsonify(data)

    @app.get("/api/recommendations")
    def recommendations():
        try:
            return jsonify(dataset().recommendations())
        except (ValueError, OSError, ValidationError) as exc:
            return jsonify(error=str(exc)), 503

    @app.get("/api/professors/<int:id>")
    def professor(id):
        kind = request.args.get("kind", "publications")
        if kind not in ("publications", "projects"):
            return jsonify(error="Tipo de trabajo no válido."), 400
        try:
            return jsonify(dataset().person(id, kind, *pagination()))
        except KeyError:
            return jsonify(error="Investigador no encontrado."), 404
        except (ValueError, OSError) as exc:
            return jsonify(error=str(exc)), 400

    @app.get("/api/pairs/<int:a>/<int:b>")
    def pair(a, b):
        try:
            return jsonify(dataset().pair(a, b, *pagination()))
        except KeyError:
            return jsonify(error="Investigador no encontrado."), 404
        except (ValueError, OSError) as exc:
            return jsonify(error=str(exc)), 400

    return app

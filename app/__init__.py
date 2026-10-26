"""Base Flask. La visualización D3 se implementará tras validar el conjunto de datos."""

import json
import os
from pathlib import Path

from flask import Flask, jsonify, render_template
from jsonschema import ValidationError

from extraccion_datos.quality import validate_network


def create_app(config=None):
    app = Flask(__name__)
    app.config.from_mapping(NETWORK_FILE=os.environ.get("UTECVIS_NETWORK_FILE"))
    if config:
        app.config.update(config)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify(status="ok", stage="project_foundation")

    @app.get("/api/network")
    def network():
        path = app.config["NETWORK_FILE"]
        if not path or not Path(path).is_file():
            return jsonify(error="Todavía no se ha configurado una red validada."), 503
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
            validate_network(data)
        except (ValueError, KeyError, OSError, ValidationError) as exc:
            app.logger.error("Datos de red inválidos: %s", exc)
            return jsonify(error="El archivo de red no cumple el contrato."), 503
        return jsonify(data)

    return app

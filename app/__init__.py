"""Aplicación Flask que sirve el conjunto de datos incluido en data/."""

import json
import os
from pathlib import Path

from flask import Flask, jsonify, render_template
from jsonschema import ValidationError

from extraccion_datos.quality import validate_network


def create_app(config=None):
    app = Flask(__name__)
    default_data = Path(__file__).resolve().parents[1] / "data/network.json"
    app.config.from_mapping(
        NETWORK_FILE=os.environ.get("UTECVIS_NETWORK_FILE", default_data)
    )
    if config:
        app.config.update(config)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify(status="ok", stage="data_ready")

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

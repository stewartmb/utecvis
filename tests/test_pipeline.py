import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest

from app import create_app
from extraccion_datos.cli import main
from extraccion_datos.cris import next_page, parse_profile, profile_links, stable_id
from extraccion_datos.http import AcquisitionError, SourceClient
from extraccion_datos.quality import example_compatible, validate_network, validate_nodes
from extraccion_datos.storage import write_json

URL = "https://cris.utec.edu.pe/es/persons/ana-ejemplo/"
DATE = "2026-10-25T12:00:00+00:00"
HTML = (Path(__file__).parent / "fixtures/profile.html").read_text()


@pytest.fixture
def node():
    return parse_profile(HTML, URL, DATE, "data/raw/test/profile.html")


def test_identity_is_independent_of_locale_query_and_directory_order():
    assert stable_id(URL) == stable_id(URL.replace("/es/", "/en/") + "?foo=1")
    assert 0 <= stable_id(URL) < 2**52


def test_parser_preserves_absence_and_section_boundaries(node):
    assert node["name"] == "Ana Ejemplo"
    assert node["research_areas"] == ["Redes", "Visualización"]
    assert node["research_groups"] == ["Grupo de Investigación Ejemplo"]
    assert node["citations"] is None
    assert node["education"] == ["Universidad de Ejemplo"]
    assert node["raw_snapshot"] == "data/raw/test/profile.html"


def test_discovery_ignores_external_links_and_paginates():
    html = """<a href="/es/persons/ana-ejemplo/">Ana</a>
    <a href="https://otro.example/es/persons/falsa/">Fuera de CRIS</a>
    <a rel="next" href="?page=1">Siguiente</a>"""
    assert profile_links(html, URL) == [URL]
    assert next_page(html, "https://cris.utec.edu.pe/es/persons/") == (
        "https://cris.utec.edu.pe/es/persons/?page=1"
    )


def test_duplicate_nodes_are_rejected(node):
    with pytest.raises(ValueError, match="duplicado"):
        validate_nodes([node, deepcopy(node)])


def test_citation_counts_need_provenance(node):
    node["citations"] = 10
    with pytest.raises(ValueError, match="proveedor"):
        validate_nodes([node])


def test_compatible_export_preserves_eight_fields_and_missing_citations(node):
    result = example_compatible([node])["nodes"][0]
    assert set(result) == {
        "id",
        "name",
        "department",
        "research_areas",
        "research_groups",
        "image_url",
        "email",
        "citations",
    }
    assert isinstance(result["id"], int)
    assert result["research_areas"] == "Redes; Visualización"
    assert result["citations"] is None


def test_edges_require_existing_endpoints_and_evidence(node):
    network = {"nodes": [node], "edges": [{"source": node["id"], "target": -1}]}
    with pytest.raises(ValueError, match="inexistente"):
        validate_network(network)


def test_pilot_cannot_be_published_as_full_data(tmp_path, node):
    manifest = {
        "run_id": "pilot",
        "profiles": [],
        "status": "acquired",
        "errors": [],
        "selected_count": 1,
        "coverage": "pilot",
        "directory_complete": False,
    }
    path = tmp_path / "data/manifests/pilot.json"
    write_json(path, manifest)
    interim = tmp_path / "data/interim/pilot"
    write_json(interim / "faculty.normalized.json", {"nodes": [node]})
    write_json(interim / "quality.json", {"parse_errors": []})
    assert main(["--root", str(tmp_path), "export", "--manifest", str(path)]) == 1
    assert not (tmp_path / "data/processed").exists()
    assert main(["--root", str(tmp_path), "export", "--manifest", str(path), "--allow-pilot"]) == 0
    assert (interim / "export/faculty_network.json").exists()


def test_transform_verifies_snapshot_hash_and_exports_full_run(tmp_path):
    path = tmp_path / "data/raw/test/profile.html"
    path.parent.mkdir(parents=True)
    path.write_text(HTML)
    manifest = {
        "run_id": "test",
        "status": "acquired",
        "coverage": "full",
        "directory_complete": True,
        "selected_count": 1,
        "errors": [],
        "profiles": [
            {
                "url": URL,
                "snapshot": "data/raw/test/profile.html",
                "retrieved_at": DATE,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
        ],
    }
    source = tmp_path / "data/manifests/test.json"
    write_json(source, manifest)
    assert main(["--root", str(tmp_path), "transform", "--manifest", str(source)]) == 0
    assert main(["--root", str(tmp_path), "export", "--manifest", str(source)]) == 0
    data = json.loads((tmp_path / "data/processed/test/faculty_network.json").read_text())
    assert data["nodes"][0]["name"] == "Ana Ejemplo"
    path.write_text("alterado")
    assert main(["--root", str(tmp_path), "transform", "--manifest", str(source)]) == 1
    assert main(["--root", str(tmp_path), "export", "--manifest", str(source)]) == 1


def test_http_forbidden_produces_failed_manifest(tmp_path, monkeypatch):
    config = tmp_path / "config/sources.toml"
    config.parent.mkdir()
    config.write_text('[cris]\ndirectory_url = "https://cris.utec.edu.pe/es/persons/"\n')

    def blocked(self, url):
        raise AcquisitionError("HTTP 403: " + url)

    monkeypatch.setattr(SourceClient, "get", blocked)
    assert main(["--root", str(tmp_path), "probe"]) == 1
    manifests = list((tmp_path / "data/manifests").glob("*.json"))
    report = json.loads(manifests[0].read_text())
    assert report["status"] == "failed"
    assert report["profiles"] == []
    assert "403" in report["errors"][0]["error"]


def test_app_does_not_fabricate_a_network_before_data_exists(tmp_path):
    client = create_app({"TESTING": True}).test_client()
    assert client.get("/health").status_code == 200
    assert client.get("/api/network").status_code == 503
    bad = tmp_path / "bad.json"
    write_json(bad, {"nodes": [{"id": "invalid"}], "edges": []})
    bad_client = create_app({"TESTING": True, "NETWORK_FILE": bad}).test_client()
    assert bad_client.get("/api/network").status_code == 503

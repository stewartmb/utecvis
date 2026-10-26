from copy import deepcopy
from pathlib import Path

import pytest

from app import create_app
from extraccion_datos.cris import next_page, parse_profile, profile_links, stable_id
from extraccion_datos.quality import validate_network, validate_nodes

URL = "https://cris.utec.edu.pe/es/persons/ana-ejemplo/"
DATE = "2026-10-25T12:00:00+00:00"
HTML = (Path(__file__).parent / "fixtures/profile.html").read_text()


@pytest.fixture
def node():
    return parse_profile(HTML, URL, DATE)


def test_identity_is_independent_of_locale_query_and_directory_order():
    assert stable_id(URL) == stable_id(URL.replace("/es/", "/en/") + "?foo=1")
    assert 0 <= stable_id(URL) < 2**52


def test_parser_preserves_absence_and_section_boundaries(node):
    assert node["name"] == "Ana Ejemplo"
    assert node["research_areas"] == ["Redes", "Visualización"]
    assert node["research_groups"] == ["Grupo de Investigación Ejemplo"]
    assert node["citations"] is None
    assert node["education"] == ["Universidad de Ejemplo"]


def test_discovery_ignores_external_links_and_paginates():
    html = """<a href="/es/persons/ana-ejemplo/">Ana</a>
    <a href="https://otro.example/es/persons/falsa/">Fuera de CRIS</a>
    <a rel="next" href="?page=1">Siguiente</a>"""
    assert profile_links(html, URL) == [URL]
    assert next_page(html, "https://cris.utec.edu.pe/es/persons/") == (
        "https://cris.utec.edu.pe/es/persons/?page=1"
    )


def test_visible_email_and_regional_scholar_link_do_not_lose_identity():
    html = """<h1>Persona ficticia</h1>
    <a href="mailto:">Ventana de contacto vacía</a>
    <a class="email" href="#">persona<span>@</span><script>nada();</script>example.org</a>
    <a href="https://scholar.google.com.pe/citations?user=ficticio">Scholar</a>
    <a href="https://www.scopus.com/authid/detail.uri?authorId=123">Perfil</a>
    <footer><a href="http://www.scopus.com/">Scopus</a></footer>"""
    node = parse_profile(html, URL, DATE)
    assert node["email"] == "persona@example.org"
    assert node["external_ids"]["google_scholar_url"].endswith("user=ficticio")
    assert node["external_ids"]["scopus_url"].endswith("authorId=123")


def test_last_research_section_does_not_absorb_scripts_or_footer():
    html = """<h1>Persona ficticia</h1><section>
    <div class="keyword-group"><h3>Temas de Interés de Investigación</h3>
    <ul><li>Redes</li><li>Datos</li></ul></div></section>
    <script>tracking();</script><footer>Copyright y navegación</footer>"""
    assert parse_profile(html, URL, DATE)["research_areas"] == ["Redes", "Datos"]


def test_duplicate_nodes_are_rejected(node):
    with pytest.raises(ValueError, match="duplicado"):
        validate_nodes([node, deepcopy(node)])


def test_citation_counts_need_provenance(node):
    node["citations"] = 10
    with pytest.raises(ValueError, match="proveedor"):
        validate_nodes([node])


def test_edges_require_existing_endpoints_and_evidence(node):
    network = {"nodes": [node], "edges": [{"source": node["id"], "target": -1}]}
    with pytest.raises(ValueError, match="inexistente"):
        validate_network(network)


def test_flask_reads_included_data_by_default():
    client = create_app({"TESTING": True}).test_client()
    assert client.get("/health").status_code == 200
    response = client.get("/api/network")
    assert response.status_code == 200
    assert len(response.json["nodes"]) == response.json["metadata"]["node_count"]
    assert len(response.json["edges"]) == response.json["metadata"]["edge_count"]


def test_flask_rejects_missing_or_invalid_data(tmp_path):
    client = create_app(
        {"TESTING": True, "NETWORK_FILE": tmp_path / "missing.json"}
    ).test_client()
    assert client.get("/api/network").status_code == 503
    bad = tmp_path / "bad.json"
    bad.write_text('{"nodes": [], "edges": []}')
    client = create_app({"TESTING": True, "NETWORK_FILE": bad}).test_client()
    assert client.get("/api/network").status_code == 503

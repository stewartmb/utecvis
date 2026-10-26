"""El mismo flujo completo se prueba con una fuente ficticia y con fallos de acceso."""

import json
from pathlib import Path

from extraccion_datos import __main__ as command
from extraccion_datos.http import AcquisitionError
from extraccion_datos.pipeline import DIRECTORY, extract, save
from extraccion_datos.quality import validate_network

DATE = "2026-10-25T12:00:00+00:00"
A, B = DIRECTORY + "ana/", DIRECTORY + "bea/"
PUB = "https://cris.utec.edu.pe/es/publications/individual/"
COLLECTIVE = "https://cris.utec.edu.pe/es/publications/colectivo/"
PROJECT = "https://cris.utec.edu.pe/es/projects/ejemplo/"


def source():
    pages = {
        DIRECTORY: f'<main>1 - 1 de 2 resultados<a href="{A}">Ana</a></main>'
        '<a rel="next" href="?page=1">Más</a>',
        DIRECTORY
        + "?page=1": f'<main>2 - 2 de 2 resultados<a href="{B}">Bea</a></main>',
    }
    people = f'<a rel="Person" href="{A}">Ana</a><a rel="Person" href="{B}">Bea</a>'
    for url, name in ((A, "Ana"), (B, "Bea")):
        pages[url] = f'''<main><h1>{name}</h1><div class="header person-details">
        <a rel="Organisation" href="/es/organisations/departamento-ejemplo/">Departamento de Ciencias</a>
        </div><nav><a href="{url}publications/">Publicaciones (2)</a>
        <a href="{url}projects/">Proyectos (1)</a>
        <a href="{url}fingerprints/">Huella</a></nav>
        <section><h3>Calificación Renacyt</h3><p>Nivel de ejemplo</p></section></main>'''
        pages[url + "publications/"] = f'''<main>1 - 2 de 2 resultados
        <ul class="list-results"><li><div class="rendering_researchoutput">
        <h3 class="title"><a href="{PUB}">Trabajo individual</a></h3>{people}
        <span class="date">2026</span></div></li><li><div class="rendering_researchoutput">
        <h3 class="title"><a href="{COLLECTIVE}">Trabajo colectivo</a></h3>
        <a rel="AuthorCollaboration">Equipo colectivo</a><span class="date">2026</span>
        </div></li></ul></main>'''
        pages[
            url + "projects/"
        ] = f'''<main>1 - 1 de 1 resultados<ul class="list-results">
        <li><div class="rendering_upmproject"><h3 class="title">
        <a href="{PROJECT}">Proyecto</a></h3><p>{people}</p></div></li></ul></main>'''
        pages[url + "fingerprints/"] = """<main><div class="person-fingerprints">
        <div class="person-fingerprint-thesauri"><h3>Ciencias</h3>
        <button data-concept-uuid="concepto-1" data-rank-value="0.8">
        <span class="concept">Redes</span></button></div></div></main>"""
    for url in (PUB, PROJECT):
        pages[url] = f'''<main><h1>Ficha de ejemplo</h1><div class="introduction">
        <ul class="relations persons"><li><a rel="Person" href="{A}">Ana</a></li>
        <li><a rel="Person" href="{B}">Bea</a></li></ul></div></main>'''
    return pages


def test_complete_extraction_keeps_all_layers_and_writes_only_five_files(tmp_path):
    pages, visited = source(), []

    def fetch(url):
        visited.append(url)
        return pages[url], DATE

    outputs = extract(fetch, progress=lambda message: None)
    network = outputs["network"]
    assert validate_network(network)["node_count"] == 2
    assert len(outputs["publications"]["records"]) == 2
    assert len(outputs["projects"]["records"]) == 1
    edge = network["edges"][0]
    assert edge["counts"] == {
        "coauthorship": 1,
        "shared_project": 1,
        "shared_publication": 1,
    }
    assert edge["weight"] == 3
    assert COLLECTIVE not in visited
    assert visited.count(PUB) == visited.count(PROJECT) == 1
    assert all(n["fingerprint"][0]["weight"] == 0.8 for n in network["nodes"])
    assert all(n["renacyt"] == ["Nivel de ejemplo"] for n in network["nodes"])
    assert len(outputs["organisations"]["organisations"]) == 1
    save(outputs, tmp_path / "data")
    save(outputs, tmp_path / "data")
    assert sorted(p.name for p in (tmp_path / "data").iterdir()) == [
        "analysis.json",
        "network.json",
        "organisations.json",
        "projects.json",
        "publications.json",
    ]


def test_access_failure_preserves_previous_data_and_closes_work_tab(
    tmp_path, monkeypatch
):
    existing = tmp_path / "network.json"
    existing.write_text("previous data")

    class BlockedSafari:
        closed = False

        def __init__(self, settings):
            pass

        def get(self, url):
            raise AcquisitionError("Cloudflare")

        def close(self):
            BlockedSafari.closed = True

    monkeypatch.setattr(command, "SafariClient", BlockedSafari)
    assert command.main(["--salida", str(tmp_path)]) == 1
    assert existing.read_text() == "previous data"
    assert BlockedSafari.closed
    assert list(tmp_path.iterdir()) == [existing]


def test_included_evidence_links_to_real_records_and_affiliations():
    folder = Path(__file__).resolve().parents[1] / "data"
    network = json.loads((folder / "network.json").read_text())
    records = {}
    for name in ("publications", "projects"):
        for record in json.loads((folder / (name + ".json")).read_text())["records"]:
            assert record["id"] not in records
            records[record["id"]] = record
    for edge in network["edges"]:
        for evidence in edge["evidence"]:
            record = records[evidence["record_id"]]
            assert {edge["source"], edge["target"]} <= set(record["faculty_ids"])
            if evidence["relation"] == "coauthorship":
                assert {edge["source"], edge["target"]} <= set(
                    record["author_faculty_ids"]
                )
                assert not record["author_collaborations"]
    organisations = {
        o["id"]: o
        for o in json.loads((folder / "organisations.json").read_text())[
            "organisations"
        ]
    }
    for node in network["nodes"]:
        for affiliation in node["affiliations"]:
            assert (
                node["id"]
                in organisations[affiliation["organisation_id"]]["faculty_ids"]
            )

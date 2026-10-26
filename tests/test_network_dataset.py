import json

import pytest

from extraccion_datos.freeze_network import build_network, deduplicate_records, freeze
from extraccion_datos.quality import validate_network


def node(id):
    return {
        "id": id,
        "name": f"Persona {id}",
        "image_url": None,
        "department": None,
        "email": None,
        "research_groups": [],
        "research_areas": [],
        "citations": None,
        "source_url": f"https://cris.utec.edu.pe/es/persons/persona-{id}/",
        "retrieved_at": "2026-10-25T12:00:00+00:00",
    }


def record(id, kind="publications", doi=None, collective=False):
    return {
        "id": id,
        "kind": kind,
        "doi": doi,
        "source_url": f"https://example.org/{id}",
        "observations": [{"faculty_id": 1}, {"faculty_id": 2}],
        "linked_people": [],
        "people": [{"faculty_id": 1}, {"faculty_id": 2}],
        "author_collaborations": ["Colaboración colectiva"] if collective else [],
        "title": "Ficticio",
    }


def test_types_are_separate_and_duplicate_doi_does_not_inflate_an_edge():
    records = deduplicate_records(
        [
            record("alias-1", doi="10.1234/shared"),
            record("alias-2", doi="10.1234/shared"),
            record("project", kind="projects"),
            record("collective", collective=True),
        ]
    )
    network, analysis = build_network([node(1), node(2), node(3)], records)
    assert validate_network(network)["edge_count"] == 1
    edge = network["edges"][0]
    assert edge["weight"] == 3
    assert edge["counts"] == {"coauthorship": 1, "shared_project": 1, "shared_publication": 1}
    assert len(edge["evidence"]) == 3
    assert analysis["isolates"] == [3]
    assert len(analysis["components"]) == 2
    assert network["nodes"][2]["network_metrics"]["degree"] == 0


def test_partial_acquisition_cannot_be_frozen_as_final(tmp_path):
    collection, details = tmp_path / "collection.json", tmp_path / "details.json"
    collection.write_text(json.dumps({"status": "partial"}))
    details.write_text(json.dumps({"status": "acquired"}))
    with pytest.raises(ValueError, match="incompleta"):
        freeze(tmp_path, collection, details)
    assert not (tmp_path / "data/processed").exists()

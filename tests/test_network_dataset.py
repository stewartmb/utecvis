from extraccion_datos.network import build_network, deduplicate_records
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
    assert edge["weight"] == 2
    assert edge["counts"] == {
        "coauthorship": 1,
        "shared_project": 1,
    }
    assert len(edge["evidence"]) == 2
    assert analysis["isolates"] == [3]
    assert len(analysis["components"]) == 2
    assert network["nodes"][2]["network_metrics"]["degree"] == 0


def test_collective_or_unconfirmed_authorship_does_not_create_edges():
    collective = record("collective", collective=True)
    unconfirmed = record("unconfirmed")
    unconfirmed["people"] = []
    records = deduplicate_records([collective, unconfirmed])
    network, analysis = build_network([node(1), node(2)], records)
    assert validate_network(network)["edge_count"] == 0
    assert analysis["isolates"] == [1, 2]
    assert all(n["publication_count"] == 2 for n in network["nodes"])
    assert all(n["network_metrics"]["weighted_degree"] == 0 for n in network["nodes"])

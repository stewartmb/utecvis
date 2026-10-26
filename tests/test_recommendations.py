"""Reglas y consultas analíticas de la app, sin descargar el modelo de embeddings."""

import hashlib
import json
import math
from itertools import combinations
from pathlib import Path

import networkx as nx
import pytest

from app import create_app
from app.recommendations import graph_from, institutional, rwr_scores, selected_inputs

DATA = Path(__file__).resolve().parents[1] / "data"


def affiliation(id, kind):
    return {"organisation_id": id, "type": kind, "name": id}


def test_institutional_specificity_does_not_add_nested_memberships():
    a = {
        "affiliations": [
            affiliation("g", "research_group"),
            affiliation("d", "department"),
        ]
    }
    b = {
        "affiliations": [
            affiliation("g", "research_group"),
            affiliation("d", "department"),
        ]
    }
    assert institutional(a, b)["score"] == 1
    assert institutional(a, b)["level"] == "research_group"
    assert len(institutional(a, b)["shared"]) == 1
    assert (
        institutional(a, {"affiliations": [affiliation("d", "department")]})["score"]
        == 0.4
    )
    assert (
        institutional(a, {"affiliations": [affiliation("other", "department")]})[
            "score"
        ]
        == 0
    )
    assert (
        institutional(a, {"affiliations": [affiliation("UTEC", "university")]})["score"]
        is None
    )
    center = {
        "affiliations": [
            affiliation("c", "research_center"),
            affiliation("d", "department"),
        ]
    }
    assert institutional(center, center)["score"] == 0.7


def test_rwr_respects_paths_components_and_isolated_nodes():
    pytest.importorskip(
        "scipy", reason="La comprobación del preparador RWR requiere scipy opcional."
    )
    graph = nx.Graph([(1, 2), (2, 3), (3, 4), (5, 6)])
    nx.set_edge_attributes(graph, 1, "weight")
    graph.add_node(7)
    before = list(graph.edges(data=True))
    scores = rwr_scores(graph)
    assert scores[1, 3] > 0
    assert scores[1, 5] == scores[1, 7] == 0
    assert (
        max(value for (a, b), value in scores.items() if not graph.has_edge(a, b)) == 1
    )
    assert all(math.isfinite(value) and 0 <= value <= 1 for value in scores.values())
    assert list(graph.edges(data=True)) == before


@pytest.fixture(scope="module")
def bundle():
    network = json.loads((DATA / "network.json").read_text())
    analysis = json.loads((DATA / "analysis.json").read_text())
    return network, analysis


def test_prepared_model_coverage_and_multilingual_control(bundle):
    network, analysis = bundle
    prepared = analysis["recommendations"]
    assert (
        prepared["metadata"]["network_sha256"]
        == hashlib.sha256((DATA / "network.json").read_bytes()).hexdigest()
    )
    assert len(prepared["profiles"]) == len(network["nodes"]) == 104
    assert sum(p["biography_fallback"] for p in prepared["profiles"].values()) == 5
    assert all(
        len(p["selected_concept_ids"]) <= 20 for p in prepared["profiles"].values()
    )
    control = prepared["metadata"]["semantic_check"]
    assert control["equivalent_languages"] > control["different_topics"] + 0.3
    inputs = selected_inputs(network["nodes"])
    assert not any(
        c["label"].casefold() in {"peru", "numerical example"}
        for p in inputs.values()
        for c in p["concepts"]
    )
    assert all(
        len({c["label"].casefold().strip() for c in p["concepts"]})
        == len(p["concepts"])
        for p in inputs.values()
    )


def test_duplicate_labels_do_not_amplify_thematic_evidence():
    node = {
        "id": 1,
        "research_areas": ["Machine learning", "  MACHINE learning  "],
        "fingerprint": [
            {"concept_id": "a", "label": "Robotics", "weight": 0.2},
            {"concept_id": "b", "label": "robotics", "weight": 0.9},
            {"concept_id": "c", "label": "Peru", "weight": 1},
            {"concept_id": "d", "label": "Unused", "weight": 0},
        ],
    }
    result = selected_inputs([node])[1]
    assert len(result["interests"]) == 1
    assert [c["concept_id"] for c in result["concepts"]] == ["b"]


def test_all_pairs_are_unique_bounded_and_rwr_has_no_cross_component_leakage(bundle):
    network, analysis = bundle
    graph = graph_from(network)
    components = {
        id: i for i, group in enumerate(nx.connected_components(graph)) for id in group
    }
    pairs = analysis["recommendations"]["pairs"]
    expected = set(combinations(sorted(graph), 2))
    assert {(p["source"], p["target"]) for p in pairs} == expected
    assert len(pairs) == len(expected) == 5356
    for pair in pairs:
        a, b = pair["source"], pair["target"]
        assert a < b
        assert all(
            value is None or (math.isfinite(value) and 0 <= value <= 1)
            for value in (pair[k] for k in ["thematic", "institutional", "structural"])
        )
        if components[a] != components[b] or not graph.degree(a) or not graph.degree(b):
            assert pair["structural"] == 0


def test_observed_metrics_match_networkx_and_stay_independent_of_predictions(bundle):
    network, analysis = bundle
    graph = graph_from(network)
    between = nx.betweenness_centrality(graph, weight=None)
    assert graph.number_of_nodes() == 104 and graph.number_of_edges() == 74
    assert len(list(nx.isolates(graph))) == 55
    for node in network["nodes"]:
        metrics, id = node["network_metrics"], node["id"]
        assert metrics["degree"] == graph.degree(id)
        assert metrics["weighted_degree"] == graph.degree(id, weight="weight")
        assert metrics["betweenness"] == pytest.approx(between[id])
    actual = {
        frozenset(c)
        for c in nx.community.greedy_modularity_communities(graph, weight="weight")
    }
    assert actual == {frozenset(c) for c in analysis["communities"]}


def test_api_excludes_observed_pairs_and_provides_evidence(bundle):
    network, _analysis = bundle
    client = create_app({"TESTING": True}).test_client()
    response = client.get("/api/recommendations")
    assert response.status_code == 200
    observed = {tuple(sorted((e["source"], e["target"]))) for e in network["edges"]}
    assert len(response.json["pairs"]) == 5282
    assert not any(
        (p["source"], p["target"]) in observed for p in response.json["pairs"]
    )
    luz = next(
        n for n in network["nodes"] if n["name"] == "Luz Antuanet Adanaque Infante"
    )
    profile = client.get(f"/api/professors/{luz['id']}")
    assert profile.status_code == 200
    assert profile.json["total"] == 5
    assert profile.json["neighbors"] == []
    assert profile.json["preparation"]["sources"] == ["research_areas", "fingerprint"]
    association = next(
        e for e in network["edges"] if e["counts"].get("shared_publication") == 432
    )
    a, b = association["source"], association["target"]
    first = client.get(f"/api/pairs/{a}/{b}").json
    second = client.get(f"/api/pairs/{b}/{a}?offset=20").json
    assert first["observed"]["weight"] == first["total"] == 432
    assert len(first["works"]) == 20 and first["has_more"]
    assert first["signals"] == second["signals"]
    assert not {w["id"] for w in first["works"]} & {w["id"] for w in second["works"]}
    assert all(w["relation"] == "shared_publication" for w in first["works"])
    assert client.get(f"/api/pairs/{a}/{a}").status_code == 400
    assert client.get("/api/professors/0").status_code == 404
    assert client.get(f"/api/professors/{a}?offset=-1").status_code == 400
    assert client.get(f"/api/professors/{a}?limit=900").status_code == 400
    assert client.get(f"/api/professors/{a}?kind=invalid").status_code == 400

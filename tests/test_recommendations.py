"""Reglas y consultas analíticas de la app, sin descargar el modelo de embeddings."""

import hashlib
import json
import math
from itertools import combinations
from pathlib import Path

import networkx as nx
import pytest

from app import create_app
from app.recommendations import (
    calibrate_institutional, graph_from, institutional,
    recalibrate_institutional, rwr_scores, selected_inputs,
)

DATA = Path(__file__).resolve().parents[1] / "data"


def affiliation(id, kind):
    return {"organisation_id": id, "type": kind, "name": id}


def test_institutional_specificity_does_not_add_nested_memberships():
    scores = calibrate_institutional(json.loads((DATA / "network.json").read_text()))["scores"]
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
    assert institutional(a, b, scores)["score"] == 1
    assert institutional(a, b, scores)["level"] == "research_group"
    assert len(institutional(a, b, scores)["shared"]) == 1
    assert (
        institutional(a, {"affiliations": [affiliation("d", "department")]}, scores)["score"]
        == scores["department"]
    )
    assert (
        institutional(a, {"affiliations": [affiliation("other", "department")]}, scores)[
            "score"
        ]
        == 0
    )
    assert (
        institutional(a, {"affiliations": [affiliation("UTEC", "university")]}, scores)["score"]
        is None
    )
    center = {
        "affiliations": [
            affiliation("c", "research_center"),
            affiliation("d", "department"),
        ]
    }
    assert institutional(center, center, scores)["score"] == scores["research_center_or_institute"]


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
    assert graph.number_of_nodes() == 104 and graph.number_of_edges() == 73
    assert len(list(nx.isolates(graph))) == 57
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
    assert len(response.json["pairs"]) == 5283
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
    strongest = max(network["edges"], key=lambda edge: edge["weight"])
    a, b = strongest["source"], strongest["target"]
    first = client.get(f"/api/pairs/{a}/{b}?limit=4").json
    second = client.get(f"/api/pairs/{b}/{a}?offset=4&limit=4").json
    assert first["observed"]["weight"] == first["total"] == 8
    assert len(first["works"]) == 4 and first["has_more"]
    assert first["signals"] == second["signals"]
    assert not {w["id"] for w in first["works"]} & {w["id"] for w in second["works"]}
    assert {w["relation"] for w in first["works"] + second["works"]} == {
        "coauthorship",
        "shared_project",
    }
    removed = client.get("/api/pairs/2503740915078290/2642458664668561").json
    assert removed["observed"] is None and removed["total"] == 0
    assert removed["signals"]["structural"] == 0
    assert removed["path"] == []
    assert any(
        (p["source"], p["target"]) == (2503740915078290, 2642458664668561)
        for p in response.json["pairs"]
    )
    assert client.get(f"/api/pairs/{a}/{a}").status_code == 400
    assert client.get("/api/professors/0").status_code == 404
    assert client.get(f"/api/professors/{a}?offset=-1").status_code == 400
    assert client.get(f"/api/professors/{a}?limit=900").status_code == 400
    assert client.get(f"/api/professors/{a}?kind=invalid").status_code == 400


def test_institutional_calibration_matches_counts_formula_prepared_pairs_and_api(bundle):
    network, analysis = bundle
    calibrated = calibrate_institutional(network)
    assert calibrated["counts"] == {
        "research_group": {"pairs": 94, "observed": 18},
        "research_center_or_institute": {"pairs": 85, "observed": 6},
        "department": {"pairs": 378, "observed": 17},
        "none": {"pairs": 4594, "observed": 32},
        "unavailable": {"pairs": 205, "observed": 0},
    }
    assert sum(c["pairs"] for c in calibrated["counts"].values()) == 5356
    assert sum(c["observed"] for c in calibrated["counts"].values()) == 73
    base, group = 32 / 4594, 18 / 94
    assert calibrated["scores"]["research_group"] == 1
    assert calibrated["scores"]["research_center_or_institute"] == pytest.approx((6 / 85 - base) / (group - base))
    assert calibrated["scores"]["department"] == pytest.approx((17 / 378 - base) / (group - base))
    assert calibrated["rates"]["unavailable"] is None
    metadata = analysis["recommendations"]["metadata"]
    assert metadata["institutional_calibration"] == calibrated
    assert metadata["institutional_levels"] == calibrated["scores"]
    nodes = {n["id"]: n for n in network["nodes"]}
    client = create_app({"TESTING": True}).test_client()
    checked = set()
    for pair in analysis["recommendations"]["pairs"]:
        a, b = pair["source"], pair["target"]
        match = institutional(nodes[a], nodes[b], calibrated["scores"])
        assert pair["institutional"] == match["score"]
        reverse = institutional(nodes[b], nodes[a], calibrated["scores"])
        assert (match["score"], match["level"]) == (reverse["score"], reverse["level"])
        assert [o["organisation_id"] for o in match["shared"]] == [o["organisation_id"] for o in reverse["shared"]]
        if match["level"] not in checked:
            response = client.get(f"/api/pairs/{a}/{b}").json
            assert response["institution"]["score"] == response["signals"]["institutional"] == match["score"]
            checked.add(match["level"])


def test_institutional_recalibration_preserves_other_signals_and_rejects_stale_network(bundle, tmp_path):
    network, analysis = bundle
    for name in ("network", "analysis"):
        (tmp_path / f"{name}.json").write_bytes((DATA / f"{name}.json").read_bytes())
    recalibrate_institutional(tmp_path)
    result = json.loads((tmp_path / "analysis.json").read_text())
    assert result == analysis  # Repeatable; neither T nor R nor the catalog changes.
    network["nodes"][0]["name"] += " changed"
    (tmp_path / "network.json").write_text(json.dumps(network))
    before = (tmp_path / "analysis.json").read_bytes()
    with pytest.raises(ValueError, match="La red cambió"):
        recalibrate_institutional(tmp_path)
    assert (tmp_path / "analysis.json").read_bytes() == before


def test_calibration_handles_absent_categories_and_rejects_missing_contrast():
    network = {
        "nodes": [
            {"id": 1, "affiliations": [affiliation("g", "research_group")]},
            {"id": 2, "affiliations": [affiliation("g", "research_group")]},
            {"id": 3, "affiliations": [affiliation("d1", "department")]},
            {"id": 4, "affiliations": [affiliation("d2", "department")]},
        ],
        "edges": [{"source": 1, "target": 2}],
    }
    calibrated = calibrate_institutional(network)
    assert calibrated["scores"] == {
        "research_group": 1,
        "research_center_or_institute": None,
        "department": None,
    }
    assert calibrated["counts"]["none"] == {"pairs": 5, "observed": 0}
    network["edges"] = []
    with pytest.raises(ValueError, match="contraste suficiente"):
        calibrate_institutional(network)

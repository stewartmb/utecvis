"""Compara el algoritmo del worker con NetworkX sobre escenarios reales."""

import json
import shutil
import subprocess
from pathlib import Path

import networkx as nx
import pytest

ROOT = Path(__file__).resolve().parents[1]


def test_browser_brandes_matches_networkx_for_observed_and_augmented_scenarios():
    node = shutil.which("node")
    if not node:
        pytest.skip("La comprobación cruzada del worker requiere Node.js.")
    network = json.loads((ROOT / "data/network.json").read_text())
    prepared = json.loads((ROOT / "data/analysis.json").read_text())["recommendations"]
    ids = [n["id"] for n in network["nodes"]]
    observed = {tuple(sorted((e["source"], e["target"]))) for e in network["edges"]}
    candidates = [
        p for p in prepared["pairs"] if (p["source"], p["target"]) not in observed
    ]

    def ranking(weights):
        def score(p):
            denominator = sum(w for k, w in weights.items() if p[k] is not None)
            return (
                sum(w * p[k] for k, w in weights.items() if p[k] is not None)
                / denominator
                if denominator
                else 0
            )

        return sorted(candidates, key=lambda p: (-score(p), p["source"], p["target"]))

    default = ranking({"thematic": 60, "institutional": 30, "structural": 10})
    institutional = ranking({"institutional": 100})
    suggestions = [[], default[:53], default[:265], institutional[:76]]
    scenarios = [
        {"ids": ids, "edges": network["edges"] + extra} for extra in suggestions
    ]
    script = """
      import { readFileSync } from 'node:fs';
      import { betweenness } from './app/static/betweenness.mjs';
      const scenarios = JSON.parse(readFileSync(0, 'utf8'));
      console.log(JSON.stringify(scenarios.map(({ids, edges}) => betweenness(ids, edges))));
    """
    output = subprocess.run(
        [node, "--input-type=module", "-e", script],
        cwd=ROOT,
        input=json.dumps(scenarios),
        capture_output=True,
        text=True,
        check=True,
    )
    results = json.loads(output.stdout)
    for scenario, result in zip(scenarios, results):
        graph = nx.Graph()
        graph.add_nodes_from(ids)
        graph.add_edges_from((e["source"], e["target"]) for e in scenario["edges"])
        expected = nx.betweenness_centrality(graph, normalized=True, weight=None)
        assert dict(result) == pytest.approx(expected, abs=1e-12)
    assert any(abs(dict(results[0])[id] - dict(results[1])[id]) > 1e-8 for id in ids)

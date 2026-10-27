"""Preparación reproducible de afinidad temática, institución y RWR.

Ejecutar una vez: python -m app.recommendations --prepare
La aplicación utiliza los resultados en analysis.json sin cargar el modelo.
"""

import argparse
import hashlib
import json
import math
import os
import re
import unicodedata
from collections import Counter
from itertools import combinations
from pathlib import Path

import networkx as nx

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
MODEL_REVISION = "e8f8c211226b894fcb81acc59f3b34ba3efd5f42"
GENERIC_CONCEPTS = {"peru", "numerical example"}
DEFAULT_WEIGHTS = {"thematic": 60, "institutional": 30, "structural": 10}
ROOT = Path(__file__).resolve().parents[1]


def clean(value):
    text = unicodedata.normalize("NFKC", value)
    return re.sub(r"\s+", " ", text).strip(" \t\n,;:•.-")


def institutional(a, b, scores):
    """Una sola coincidencia jerárquica; no acumula grupo + centro + departamento."""
    levels = [
        ({"research_group"}, scores.get("research_group")),
        ({"research_center", "institute"}, scores.get("research_center_or_institute")),
        ({"department"}, scores.get("department")),
    ]
    relevant = {kind for kinds, _score in levels for kind in kinds}
    aa = {
        x["organisation_id"]: x
        for x in a.get("affiliations", [])
        if x["type"] in relevant
    }
    bb = {
        x["organisation_id"]: x
        for x in b.get("affiliations", [])
        if x["type"] in relevant
    }
    if not aa or not bb:
        return {"score": None, "level": None, "shared": []}
    shared = sorted(aa.keys() & bb.keys())
    for kinds, score in levels:
        matches = [aa[key] for key in shared if aa[key]["type"] in kinds]
        if matches:
            return {"score": score, "level": matches[0]["type"], "shared": matches}
    return {"score": 0.0, "level": None, "shared": []}


def calibrate_institutional(network):
    """Calibración descriptiva sobre todas las parejas, no solo candidatas."""
    levels = ("research_group", "research_center_or_institute", "department", "none")
    counts = {level: {"pairs": 0, "observed": 0} for level in (*levels, "unavailable")}
    observed = {tuple(sorted((e["source"], e["target"]))) for e in network["edges"]}
    for a, b in combinations(sorted(network["nodes"], key=lambda n: n["id"]), 2):
        match = institutional(a, b, {level: 1 for level in levels})
        level = match["level"]
        if level in {"research_center", "institute"}:
            level = "research_center_or_institute"
        if level is None:
            level = "unavailable" if match["score"] is None else "none"
        counts[level]["pairs"] += 1
        counts[level]["observed"] += int((a["id"], b["id"]) in observed)
    rates = {
        k: v["observed"] / v["pairs"] if v["pairs"] else None for k, v in counts.items()
    }
    rates["unavailable"] = None
    baseline, maximum = rates["none"], rates["research_group"]
    if baseline is None or maximum is None or maximum <= baseline:
        raise ValueError(
            "No hay contraste suficiente entre grupo y ninguna coincidencia para calibrar I."
        )
    scores = {
        k: min(1.0, max(0.0, (rates[k] - baseline) / (maximum - baseline)))
        if rates[k] is not None
        else None
        for k in levels[:-1]
    }
    return {
        "method": "Observed collaboration rate above baseline, normalized to shared group",
        "formula": "I(c) = clip((p_c - p_none) / (p_group - p_none), 0, 1)",
        "scope": "All unordered pairs in the complete observed cohort; mutually exclusive categories",
        "interpretation": "Descriptive in-sample calibration; not a validated prediction or causal effect",
        "counts": counts,
        "rates": rates,
        "scores": scores,
    }


def recalibrate_institutional(folder):
    """Actualiza solo I y su método; conserva T, R y los embeddings preparados."""
    network_path, analysis_path = folder / "network.json", folder / "analysis.json"
    network = json.loads(network_path.read_text())
    analysis = json.loads(analysis_path.read_text())
    prepared = analysis["recommendations"]
    if (
        prepared["metadata"]["network_sha256"]
        != hashlib.sha256(network_path.read_bytes()).hexdigest()
    ):
        raise ValueError(
            "La red cambió: ejecuta --prepare para regenerar todas las señales."
        )
    calibration = calibrate_institutional(network)
    nodes = {n["id"]: n for n in network["nodes"]}
    for pair in prepared["pairs"]:
        pair["institutional"] = institutional(
            nodes[pair["source"]], nodes[pair["target"]], calibration["scores"]
        )["score"]
    prepared["metadata"]["institutional_levels"] = calibration["scores"]
    prepared["metadata"]["institutional_calibration"] = calibration
    temporary = analysis_path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    )
    temporary.replace(analysis_path)
    print(json.dumps(calibration, ensure_ascii=False, indent=2))


def graph_from(network):
    graph = nx.Graph()
    graph.add_nodes_from(sorted(n["id"] for n in network["nodes"]))
    graph.add_weighted_edges_from(
        (e["source"], e["target"], e["weight"]) for e in network["edges"]
    )
    return graph


def rwr_scores(graph):
    """RWR ponderado con reinicio en el origen, también en nodos sin salidas."""
    ids = sorted(graph)
    stationary = {}
    for seed in ids:
        reset = {id: float(id == seed) for id in ids}
        stationary[seed] = nx.pagerank(
            graph,
            alpha=0.9,
            personalization=reset,
            dangling=reset,
            nstart=reset,
            max_iter=1000,
            tol=1e-12,
            weight="weight",
        )
    components = {
        id: i for i, group in enumerate(nx.connected_components(graph)) for id in group
    }
    raw = {
        (a, b): (stationary[a][b] + stationary[b][a]) / 2
        if components[a] == components[b]
        else 0.0
        for a, b in combinations(ids, 2)
    }
    maximum = max(
        (score for (a, b), score in raw.items() if not graph.has_edge(a, b)),
        default=0.0,
    )
    return {
        pair: min(1.0, score / maximum) if maximum > 0 else 0.0
        for pair, score in raw.items()
    }


def selected_inputs(nodes):
    profiles_with_fp = sum(bool(n.get("fingerprint")) for n in nodes)
    frequencies = Counter(
        c for n in nodes for c in {x["concept_id"] for x in n.get("fingerprint", [])}
    )
    result = {}
    for node in nodes:
        interests = list(
            {
                clean(t).casefold(): clean(t)
                for t in node["research_areas"]
                if clean(t)
            }.values()
        )
        concepts = []
        for concept in node["fingerprint"]:
            if (
                clean(concept["label"]).casefold() in GENERIC_CONCEPTS
                or concept["weight"] <= 0
            ):
                continue
            idf = (
                math.log(
                    (profiles_with_fp + 1) / (frequencies[concept["concept_id"]] + 1)
                )
                + 1
            )
            concepts.append({**concept, "salience": concept["weight"] * idf})
        concepts.sort(key=lambda c: (-c["salience"], c["label"], c["concept_id"]))
        # La misma etiqueta puede tener UUID distintos en varios tesauros.
        # Para el embedding es el mismo texto: conservar solo su mayor peso.
        distinct = {}
        for concept in concepts:
            distinct.setdefault(clean(concept["label"]).casefold(), concept)
        concepts = list(distinct.values())
        result[node["id"]] = {"interests": interests, "concepts": concepts[:20]}
    return result


def prepare(folder):
    """Imports de IA solo aquí: ejecutar Flask no requiere torch ni transformers."""
    import numpy as np
    import torch
    from sentence_transformers import SentenceTransformer

    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.manual_seed(0)
    network_path = folder / "network.json"
    network = json.loads(network_path.read_text())
    nodes = sorted(network["nodes"], key=lambda n: n["id"])
    print("Cargando modelo multilingüe fijado…", flush=True)
    model = SentenceTransformer(MODEL_NAME, revision=MODEL_REVISION, device="cpu")
    model.eval()
    inputs = selected_inputs(nodes)
    all_texts, text_indices = [], {}

    def register(text):
        if text not in text_indices:
            text_indices[text] = len(all_texts)
            all_texts.append(text)
        return text_indices[text]

    for node in nodes:
        info = inputs[node["id"]]
        info["interest_indices"] = [register(t) for t in info["interests"]]
        info["concept_indices"] = [
            register(clean(c["label"])) for c in info["concepts"]
        ]
        info["bio_indices"] = []
        if not info["interests"] and not info["concepts"] and node.get("biography"):
            text = clean(node["biography"])
            tokens = model.tokenizer.encode(
                text, add_special_tokens=False, verbose=False
            )
            chunk_size = max(8, model.max_seq_length - 2)
            for offset in range(0, len(tokens), max(1, chunk_size - 16)):
                part = model.tokenizer.decode(
                    tokens[offset : offset + chunk_size], skip_special_tokens=True
                )
                info["bio_indices"].append(register(part))

    print(
        f"Preparando {len(all_texts)} textos de {len(nodes)} investigadores…",
        flush=True,
    )
    embeddings = model.encode(
        all_texts,
        batch_size=64,
        normalize_embeddings=True,
        show_progress_bar=True,
        convert_to_numpy=True,
    )

    def unit(vector):
        norm = np.linalg.norm(vector)
        return vector / norm if norm > 1e-12 else None

    vectors, profiles = {}, {}
    for node in nodes:
        info = inputs[node["id"]]
        sources, parts = [], []
        if info["interest_indices"]:
            parts.append(unit(embeddings[info["interest_indices"]].mean(axis=0)))
            sources.append("research_areas")
        if info["concept_indices"]:
            weights = [c["salience"] for c in info["concepts"]]
            parts.append(
                unit(
                    np.average(
                        embeddings[info["concept_indices"]], weights=weights, axis=0
                    )
                )
            )
            sources.append("fingerprint")
        if not parts and info["bio_indices"]:
            parts.append(unit(embeddings[info["bio_indices"]].mean(axis=0)))
            sources.append("biography")
        parts = [part for part in parts if part is not None]
        vectors[node["id"]] = unit(np.mean(parts, axis=0)) if parts else None
        profiles[str(node["id"])] = {
            "sources": sources,
            "biography_fallback": sources == ["biography"],
            "selected_concept_ids": [c["concept_id"] for c in info["concepts"]],
        }

    print("Calculando RWR, institución y evidencia de las parejas…", flush=True)
    graph = graph_from(network)
    rwr = rwr_scores(graph)
    calibration = calibrate_institutional(network)
    phrase_similarities = embeddings @ embeddings.T
    pairs = []
    for a, b in combinations(nodes, 2):
        ai, bi = inputs[a["id"]], inputs[b["id"]]
        va, vb = vectors[a["id"]], vectors[b["id"]]
        thematic = (
            float(np.clip(va @ vb, 0, 1)) if va is not None and vb is not None else None
        )
        institution = institutional(a, b, calibration["scores"])
        a_indices = list(
            dict.fromkeys(
                ai["interest_indices"] + ai["concept_indices"] + ai["bio_indices"]
            )
        )
        b_indices = list(
            dict.fromkeys(
                bi["interest_indices"] + bi["concept_indices"] + bi["bio_indices"]
            )
        )
        related = []
        if a_indices and b_indices:
            similarities = phrase_similarities[np.ix_(a_indices, b_indices)]
            used_a, used_b = set(), set()
            for flat in np.argsort(similarities, axis=None)[::-1]:
                i, j = np.unravel_index(int(flat), similarities.shape)
                ia, ib = a_indices[i], b_indices[j]
                if ia in used_a or ib in used_b or float(similarities[i, j]) < 0.45:
                    continue
                related.append(
                    {
                        "a": all_texts[ia],
                        "b": all_texts[ib],
                        "similarity": round(float(similarities[i, j]), 6),
                    }
                )
                used_a.add(ia)
                used_b.add(ib)
                if len(related) == 2:
                    break
        a_concepts = {c["concept_id"]: c["label"] for c in ai["concepts"]}
        b_concepts = {c["concept_id"] for c in bi["concepts"]}
        pairs.append(
            {
                "source": a["id"],
                "target": b["id"],
                "thematic": round(thematic, 6) if thematic is not None else None,
                "institutional": institution["score"],
                "structural": round(rwr[a["id"], b["id"]], 6),
                "shared_concepts": [
                    a_concepts[id] for id in sorted(a_concepts.keys() & b_concepts)
                ],
                "shared_interests": sorted(
                    {t.casefold() for t in ai["interests"]}
                    & {t.casefold() for t in bi["interests"]}
                ),
                "related_terms": related,
            }
        )

    probes = model.encode(
        [
            "Machine learning",
            "Aprendizaje automático",
            "Mecánica de suelos y cimentaciones",
        ],
        normalize_embeddings=True,
        convert_to_numpy=True,
    )
    checks = {
        "equivalent_languages": round(float(probes[0] @ probes[1]), 6),
        "different_topics": round(float(probes[0] @ probes[2]), 6),
    }
    if checks["equivalent_languages"] <= checks["different_topics"]:
        raise ValueError(
            "El control multilingüe no distingue los ejemplos de referencia."
        )
    analysis_path = folder / "analysis.json"
    analysis = json.loads(analysis_path.read_text())
    analysis["recommendations"] = {
        "metadata": {
            "model": MODEL_NAME,
            "model_revision": MODEL_REVISION,
            "network_sha256": hashlib.sha256(network_path.read_bytes()).hexdigest(),
            "interpretation": "Exploratory ranking; not a probability of future collaboration",
            "thematic_sources": ["research_areas", "fingerprint"],
            "biography": "Fallback only when neither primary source is available",
            "max_concepts": 20,
            "duplicate_concept_labels": "Keep the highest salience per casefolded label within a profile",
            "generic_concepts_excluded": sorted(GENERIC_CONCEPTS),
            "institutional_levels": calibration["scores"],
            "institutional_calibration": calibration,
            "rwr_alpha": 0.9,
            "rwr_symmetry": "Mean of both personalized directions",
            "defaults": {
                "weights": DEFAULT_WEIGHTS,
                "top_percent": 1,
                "max_top_percent": 5,
            },
            "semantic_check": checks,
        },
        "profiles": profiles,
        "pairs": pairs,
    }
    temporary = analysis_path.with_suffix(".tmp")
    temporary.write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    )
    temporary.replace(analysis_path)
    print(
        f"Listo: {len(pairs)} parejas, {sum(not graph.has_edge(p['source'], p['target']) for p in pairs)} candidatas. {checks}",
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--prepare", action="store_true")
    mode.add_argument("--recalibrate-institutional", action="store_true")
    parser.add_argument("--data", type=Path, default=ROOT / "data")
    args = parser.parse_args()
    if args.recalibrate_institutional:
        recalibrate_institutional(args.data.resolve())
    else:
        prepare(args.data.resolve())

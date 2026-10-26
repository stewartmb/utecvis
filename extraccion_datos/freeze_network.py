"""Valida y congela datos de la cohorte, relaciones y métricas para Flask/D3."""

import argparse
import hashlib
import json
import math
from collections import Counter
from copy import deepcopy
from itertools import combinations
from pathlib import Path

import networkx as nx
from bs4 import BeautifulSoup
from jsonschema import Draft202012Validator

from extraccion_datos.audit import documents, fingerprint_concepts
from extraccion_datos.collect_network import profile_tasks
from extraccion_datos.cris import parse_profile
from extraccion_datos.quality import example_compatible, validate_network
from extraccion_datos.research import person_lookup, profile_extras, url_key
from extraccion_datos.storage import ROOT, utc_now, write_json

VERSION = "0.4.0-cohort-network"


def unique(values):
    seen, result = set(), []
    for value in values:
        key = json.dumps(value, sort_keys=True, ensure_ascii=False)
        if key not in seen:
            result.append(value)
            seen.add(key)
    return result


def deduplicate_records(records):
    groups = {}
    for record in records:
        key = (
            (record["kind"], "doi", record["doi"])
            if record.get("doi")
            else (record["kind"], "url", url_key(record["source_url"]))
        )
        groups.setdefault(key, []).append(record)
    result = []
    for group in groups.values():
        group.sort(key=lambda r: r["source_url"])
        out = deepcopy(group[0])
        out["source_urls"] = sorted({r["source_url"] for r in group})
        if out.get("doi"):
            out["id"] = "publication:doi:" + out["doi"]
        for field in (
            "people",
            "linked_people",
            "observations",
            "authors_metadata",
            "concepts_preview",
            "author_collaborations",
            "publication_metrics",
        ):
            out[field] = unique([value for r in group for value in r.get(field, [])])
        out["detail_sources"] = [r["detail"] for r in group if r.get("detail")]
        out["detail_complete"] = bool(out["detail_sources"])
        out["faculty_ids"] = sorted(
            {o["faculty_id"] for o in out["observations"]}
            | {
                p["faculty_id"]
                for p in out["linked_people"] + out["people"]
                if p["faculty_id"] is not None
            }
        )
        out["author_faculty_ids"] = sorted(
            {
                p["faculty_id"]
                for p in out["people"]
                if p["faculty_id"] is not None
                and not any(
                    x in (p.get("role") or "").casefold()
                    for x in ("editor", "traductor", "compilador")
                )
            }
        )
        out["author_list_scope"] = (
            "collective_author"
            if out["author_collaborations"]
            else "detail"
            if out["detail_complete"]
            else "listing"
        )
        result.append(out)
    return sorted(result, key=lambda r: r["id"])


def build_network(nodes, records):
    nodes = deepcopy(nodes)
    ids = {n["id"] for n in nodes}
    edges = {}
    node_counts = {id: Counter() for id in ids}
    for record in records:
        members = record["faculty_ids"]
        if not set(members) <= ids:
            raise ValueError("Un registro referencia una persona fuera de la cohorte.")
        for id in members:
            node_counts[id][record["kind"]] += 1
        authors = set(record["author_faculty_ids"])
        for a, b in combinations(members, 2):
            if record["kind"] == "projects":
                relation = "shared_project"
            elif {a, b} <= authors and not record.get("author_collaborations"):
                relation = "coauthorship"
            else:
                relation = "shared_publication"
            edge = edges.setdefault(
                (a, b), {"source": a, "target": b, "counts": Counter(), "evidence": []}
            )
            edge["counts"][relation] += 1
            edge["evidence"].append(
                {
                    "record_id": record["id"],
                    "relation": relation,
                    "source_url": record["source_url"],
                    "doi": record.get("doi"),
                    "year": record.get("year"),
                    "start_date": record.get("start_date"),
                    "end_date": record.get("end_date"),
                    "basis": "explicit_authors"
                    if relation == "coauthorship"
                    else "project_participation"
                    if relation == "shared_project"
                    else "profile_publication_association",
                    "listing_sources": unique(
                        [o for o in record["observations"] if o["faculty_id"] in (a, b)]
                    ),
                    "detail_sources": [
                        {k: d[k] for k in ("source_url", "retrieved_at", "raw_snapshot")}
                        for d in record["detail_sources"]
                    ],
                }
            )
    edge_list = []
    for pair in sorted(edges):
        edge = edges[pair]
        edge["relations"] = sorted(edge["counts"])
        edge["counts"] = dict(edge["counts"])
        edge["relation"] = (
            edge["relations"][0] if len(edge["relations"]) == 1 else "academic_collaboration"
        )
        edge["weight"] = sum(edge["counts"].values())
        edge_list.append(edge)
    graph = nx.Graph()
    graph.add_nodes_from(sorted(ids))
    graph.add_weighted_edges_from((e["source"], e["target"], e["weight"]) for e in edge_list)
    components = sorted(nx.connected_components(graph), key=lambda s: (-len(s), min(s)))
    communities = (
        list(nx.community.greedy_modularity_communities(graph, weight="weight"))
        if edge_list
        else [{id} for id in sorted(ids)]
    )
    communities.sort(key=lambda s: (-len(s), min(s)))
    component_id = {n: i for i, group in enumerate(components) for n in group}
    community_id = {n: i for i, group in enumerate(communities) for n in group}
    centrality, between = nx.degree_centrality(graph), nx.betweenness_centrality(graph, weight=None)
    articulations = set(nx.articulation_points(graph))
    bridges = {tuple(sorted(pair)) for pair in nx.bridges(graph)}
    for node in nodes:
        id = node["id"]
        node["publication_count"] = node_counts[id]["publications"]
        node["project_count"] = node_counts[id]["projects"]
        node["network_metrics"] = {
            "degree": graph.degree(id),
            "weighted_degree": graph.degree(id, weight="weight"),
            "degree_centrality": centrality[id],
            "betweenness": between[id],
            "component": component_id[id],
            "community": community_id[id],
            "is_articulation": id in articulations,
        }
    for e in edge_list:
        e["is_bridge"] = (e["source"], e["target"]) in bridges
    analysis = {
        "node_count": len(nodes),
        "edge_count": len(edge_list),
        "components": [sorted(c) for c in components],
        "communities": [sorted(c) for c in communities],
        "isolates": sorted(nx.isolates(graph)),
        "density": nx.density(graph),
        "articulation_ids": sorted(articulations),
        "bridges": sorted(bridges),
        "relation_evidence_counts": dict(
            Counter(ev["relation"] for e in edge_list for ev in e["evidence"])
        ),
    }
    analysis["layers"] = {}
    for relation in ("coauthorship", "shared_project", "shared_publication"):
        layer = nx.Graph()
        layer.add_nodes_from(sorted(ids))
        layer.add_edges_from(
            (e["source"], e["target"]) for e in edge_list if e["counts"].get(relation, 0)
        )
        analysis["layers"][relation] = {
            "edge_count": layer.number_of_edges(),
            "component_count": nx.number_connected_components(layer),
            "isolates": sorted(nx.isolates(layer)),
            "largest_component_size": max(map(len, nx.connected_components(layer)), default=0),
        }
    return {"nodes": sorted(nodes, key=lambda n: n["id"]), "edges": edge_list}, analysis


def freeze(root, collection_path, details_path):
    collection_path = collection_path if collection_path.is_absolute() else root / collection_path
    details_path = details_path if details_path.is_absolute() else root / details_path
    collection, details = [json.loads(p.read_text()) for p in (collection_path, details_path)]
    if collection["status"] != "acquired" or details["status"] != "acquired":
        raise ValueError("Adquisición incompleta; no se congela una muestra como datos finales.")
    if details["source_collection_run"] != collection["run_id"]:
        raise ValueError("Los detalles no pertenecen a esta colección.")
    if len(collection["completed_tasks"]) != len(collection["tasks"]):
        raise ValueError("Faltan secciones de personas.")
    source_path = root / "data/manifests" / (collection["source_profile_run"] + ".json")
    source = json.loads(source_path.read_text())

    def task_key(task):
        return task["owner_url"], task["kind"], task["url"]

    expected_tasks = {task_key(t) for t in profile_tasks(root, source)}
    if expected_tasks != {task_key(t) for t in collection["completed_tasks"]}:
        raise ValueError(
            "Las secciones adquiridas no coinciden con las declaradas por los perfiles."
        )
    if {url_key(p["url"]) for p in details["pages"]} != {
        url_key(u) for u in details["planned_urls"]
    }:
        raise ValueError("Faltan fichas de evidencia planificadas.")
    base = root / "data/processed" / source["run_id"] / "faculty_nodes.json"
    nodes = json.loads(base.read_text())["nodes"]
    lookup = person_lookup(nodes)
    if len(nodes) != source["selected_count"] or not source["directory_complete"]:
        raise ValueError("La cohorte de perfiles está incompleta.")
    by_id = {n["id"]: n for n in nodes}
    organisations = {}
    for entry, raw in documents(root, source, "profiles"):
        node = by_id[lookup[url_key(entry["url"])]]
        parsed = parse_profile(raw.decode(), entry["url"], entry["retrieved_at"], entry["snapshot"])
        if parsed["id"] != node["id"]:
            raise ValueError("El ID del perfil base no coincide con su URL canónica.")
        node.update(parsed)
        node.update(profile_extras(raw.decode()))
        node["fingerprint"] = []
        node["fingerprint_status"] = "not_published"
        for aff in node["affiliations"]:
            key = url_key(aff["source_url"])
            organisation_id = "organisation:" + hashlib.sha256(str(key).encode()).hexdigest()[:20]
            aff["organisation_id"] = organisation_id
            obj = organisations.setdefault(
                organisation_id,
                {
                    "id": organisation_id,
                    "name": aff["name"],
                    "type": aff["type"],
                    "source_url": aff["source_url"],
                    "aliases": [],
                    "faculty_ids": [],
                },
            )
            obj["aliases"] = sorted(set(obj["aliases"]) | {aff["name"]})
            obj["faculty_ids"] = sorted(set(obj["faculty_ids"]) | {node["id"]})
    for entry, raw in documents(root, collection, "pages"):
        if entry["kind"] == "fingerprints":
            node = by_id[lookup[url_key(entry["owner_url"])]]
            soup = BeautifulSoup(raw, "html.parser")
            node["fingerprint"] = fingerprint_concepts(soup.select_one(".person-fingerprints"))
            if any(
                not c["label"] or not math.isfinite(c["weight"]) or not 0 <= c["weight"] <= 1
                for c in node["fingerprint"]
            ):
                raise ValueError("Concepto o ponderación no válida: " + entry["url"])
            node["fingerprint_status"] = "complete" if node["fingerprint"] else "published_empty"
            node["fingerprint_source"] = {k: entry[k] for k in ("url", "snapshot", "retrieved_at")}
    # Verifica que todos los detalles originales siguen coincidiendo con sus hashes.
    for _entry, _body in documents(root, details, "pages"):
        pass
    records_path = root / "data/interim" / collection["run_id"] / "research_records.json"
    if hashlib.sha256(records_path.read_bytes()).hexdigest() != details["records_sha256"]:
        raise ValueError("Los registros transformados no coinciden con su hash registrado.")
    record_data = json.loads(records_path.read_text())
    records = deduplicate_records(record_data["records"])
    network, analysis = build_network(nodes, records)
    quality = validate_network(network)
    records_by_id = {r["id"]: r for r in records}
    for edge in network["edges"]:
        if edge["weight"] != len(edge["evidence"]):
            raise ValueError("Peso sin evidencia correspondiente.")
        for evidence in edge["evidence"]:
            record = records_by_id[evidence["record_id"]]
            if not {edge["source"], edge["target"]} <= set(record["faculty_ids"]):
                raise ValueError("Arista no sustentada por participantes del registro.")
    metadata = {
        "dataset_version": VERSION,
        "created_at": utc_now(),
        "cohort": (
            f"{len(nodes)} profiles from the recorded CRIS directory; no external people added"
        ),
        "coverage": "complete_cohort_lists",
        "source_profile_run": source["run_id"],
        "collection_run": collection["run_id"],
        "details_run": details["run_id"],
        "record_counts": dict(Counter(r["kind"] for r in records)),
        "listing_memberships": {
            kind: sum(
                len(t["record_urls"]) for t in collection["completed_tasks"] if t["kind"] == kind
            )
            for kind in ("publications", "projects")
        },
        "detailed_records": sum(r["detail_complete"] for r in records),
        "collective_author_records": sum(bool(r["author_collaborations"]) for r in records),
        "graph": {
            k: analysis[k]
            for k in ("node_count", "edge_count", "density", "relation_evidence_counts")
        },
        "components": len(analysis["components"]),
        "isolates": len(analysis["isolates"]),
        "edge_weight": "number of distinct shared records; counts remain separated by relation",
        "authorship_rule": (
            "coauthorship requires identified individual authors; "
            "collective author associations are shared_publication"
        ),
        "metrics": (
            "unweighted degree and betweenness; communities weighted by shared-record counts"
        ),
        "missing_values": "null/empty means unavailable, never estimated",
        "temporal_scope": "CRIS records at acquisition; preserve future-dated and in-press records",
        "pipeline_source_hashes": {
            p.name: hashlib.sha256(p.read_bytes()).hexdigest()
            for p in sorted((root / "extraccion_datos").glob("*.py"))
        },
        "input_hashes": {
            str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (source_path, collection_path, details_path, records_path)
        },
    }
    quality.update(
        {
            "listing_tasks": len(collection["completed_tasks"]),
            "fingerprints_complete": sum(n["fingerprint_status"] == "complete" for n in nodes),
            "renacyt_available": sum(bool(n["renacyt"]) for n in nodes),
            "record_aliases_merged": len(record_data["records"]) - len(records),
            "unlinked_person_entries": sum(
                p["faculty_id"] is None for r in records for p in r["people"]
            ),
            "detail_scope": record_data["coverage"],
        }
    )
    network["metadata"] = metadata
    Draft202012Validator(json.loads((root / "schemas/network.schema.json").read_text())).validate(
        network
    )
    out = root / "data/processed" / collection["run_id"]
    for filename, data in (
        ("network", network),
        ("faculty_nodes", {"nodes": network["nodes"]}),
        ("faculty_edges", {"edges": network["edges"]}),
        ("faculty_network", example_compatible(network["nodes"])),
        ("publications", {"records": [r for r in records if r["kind"] == "publications"]}),
        ("projects", {"records": [r for r in records if r["kind"] == "projects"]}),
        ("organisations", {"organisations": sorted(organisations.values(), key=lambda o: o["id"])}),
        ("analysis", analysis),
        ("quality", quality),
        ("metadata", metadata),
    ):
        write_json(out / f"{filename}.json", data)
    write_json(
        root / "data/processed/latest.json",
        {
            "run_id": collection["run_id"],
            "network_file": str((out / "network.json").relative_to(root)),
        },
    )
    return out, metadata, quality


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--collection-manifest", type=Path, required=True)
    parser.add_argument("--details-manifest", type=Path, required=True)
    args = parser.parse_args()
    out, metadata, quality = freeze(
        args.root.resolve(), args.collection_manifest, args.details_manifest
    )
    print(
        json.dumps(
            {"output": str(out), "metadata": metadata, "quality": quality}, ensure_ascii=False
        )
    )

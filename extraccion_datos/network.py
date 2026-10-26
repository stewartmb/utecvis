"""Deduplicación de trabajos, conexiones con evidencia y métricas de la red."""

import hashlib
import json
from collections import Counter
from copy import deepcopy
from itertools import combinations

import networkx as nx

from extraccion_datos.quality import validate_network
from extraccion_datos.research import url_key


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
                # Una asociación de perfiles sin autores individuales confirmados
                # se conserva en publicaciones, pero no crea una arista.
                continue
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
                    else "project_participation",
                    "listing_sources": unique(
                        [o for o in record["observations"] if o["faculty_id"] in (a, b)]
                    ),
                    "detail_sources": [
                        {k: d[k] for k in ("source_url", "retrieved_at")}
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
            edge["relations"][0]
            if len(edge["relations"]) == 1
            else "academic_collaboration"
        )
        edge["weight"] = sum(edge["counts"].values())
        edge_list.append(edge)
    graph = nx.Graph()
    graph.add_nodes_from(sorted(ids))
    graph.add_weighted_edges_from(
        (e["source"], e["target"], e["weight"]) for e in edge_list
    )
    components = sorted(nx.connected_components(graph), key=lambda s: (-len(s), min(s)))
    communities = (
        list(nx.community.greedy_modularity_communities(graph, weight="weight"))
        if edge_list
        else [{id} for id in sorted(ids)]
    )
    communities.sort(key=lambda s: (-len(s), min(s)))
    component_id = {n: i for i, group in enumerate(components) for n in group}
    community_id = {n: i for i, group in enumerate(communities) for n in group}
    centrality, between = (
        nx.degree_centrality(graph),
        nx.betweenness_centrality(graph, weight=None),
    )
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
    for relation in ("coauthorship", "shared_project"):
        layer = nx.Graph()
        layer.add_nodes_from(sorted(ids))
        layer.add_edges_from(
            (e["source"], e["target"])
            for e in edge_list
            if e["counts"].get(relation, 0)
        )
        analysis["layers"][relation] = {
            "edge_count": layer.number_of_edges(),
            "component_count": nx.number_connected_components(layer),
            "isolates": sorted(nx.isolates(layer)),
            "largest_component_size": max(
                map(len, nx.connected_components(layer)), default=0
            ),
        }
    return {"nodes": sorted(nodes, key=lambda n: n["id"]), "edges": edge_list}, analysis


def organisation_catalog(nodes):
    """Agrupa afiliaciones por URL y conserva sus nombres, tipos y miembros."""
    organisations = {}
    for node in nodes:
        for aff in node["affiliations"]:
            key = url_key(aff["source_url"])
            organisation_id = (
                "organisation:" + hashlib.sha256(str(key).encode()).hexdigest()[:20]
            )
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
    return {"organisations": sorted(organisations.values(), key=lambda o: o["id"])}


def dataset(nodes, records):
    """Construye los cinco archivos finales a partir de los datos extraídos."""
    organisations = organisation_catalog(nodes)
    records = deduplicate_records(records)
    network, analysis = build_network(nodes, records)
    validate_network(network)
    records_by_id = {r["id"]: r for r in records}
    for edge in network["edges"]:
        for evidence in edge["evidence"]:
            record = records_by_id[evidence["record_id"]]
            if not {edge["source"], edge["target"]} <= set(record["faculty_ids"]):
                raise ValueError("Conexión sin participantes de respaldo.")
    network["metadata"] = {
        "source": "https://cris.utec.edu.pe/es/persons/",
        "coverage": "complete_cohort_lists",
        "node_count": len(nodes),
        "edge_count": len(network["edges"]),
        "publication_count": sum(r["kind"] == "publications" for r in records),
        "project_count": sum(r["kind"] == "projects" for r in records),
        "detail_scope": "All projects; selected publications to verify authors and shared works",
        "edge_weight": "Number of distinct coauthored publications and shared projects; relation counts remain separate",
        "edge_policy": "Only individually identified coauthors or shared project participants; profile publication associations are excluded",
    }
    return {
        "network": network,
        "publications": {
            "records": [r for r in records if r["kind"] == "publications"]
        },
        "projects": {"records": [r for r in records if r["kind"] == "projects"]},
        "organisations": organisations,
        "analysis": analysis,
    }

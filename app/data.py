"""Lectura de los cinco JSON y consultas ligeras para la interfaz."""

import hashlib
import json
from pathlib import Path

import networkx as nx

from app.recommendations import graph_from, institutional
from extraccion_datos.quality import validate_network


class Dataset:
    def __init__(self, path):
        self.path = Path(path)
        self.folder = self.path.parent
        self.network = json.loads(self.path.read_text(encoding="utf-8"))
        validate_network(self.network)
        self.nodes = {n["id"]: n for n in self.network["nodes"]}
        self.graph = graph_from(self.network)
        self.edges = {
            tuple(sorted((e["source"], e["target"]))): e for e in self.network["edges"]
        }
        self.analysis = self.read("analysis", {})
        self.prepared = self.analysis.get("recommendations", {})
        self.pairs = {
            tuple(sorted((p["source"], p["target"]))): p
            for p in self.prepared.get("pairs", [])
        }
        self.records = {}
        self.records_by_person = {id: [] for id in self.nodes}
        for kind in ("publications", "projects"):
            for record in self.read(kind, {}).get("records", []):
                self.records[record["id"]] = record
                for id in record["faculty_ids"]:
                    if id in self.records_by_person:
                        self.records_by_person[id].append(record)

    def read(self, name, fallback):
        path = self.folder / (name + ".json")
        return (
            json.loads(path.read_text(encoding="utf-8")) if path.is_file() else fallback
        )

    @property
    def recommendations_ready(self):
        return (
            self.prepared.get("metadata", {}).get("network_sha256")
            == hashlib.sha256(self.path.read_bytes()).hexdigest()
        )

    def recommendations(self):
        if not self.recommendations_ready:
            raise ValueError(
                "Recomendaciones sin preparar o datos actualizados. Ejecuta python -m app.recommendations --prepare."
            )
        return {
            "metadata": self.prepared["metadata"],
            "profiles": self.prepared["profiles"],
            "pairs": [
                {
                    k: p[k]
                    for k in (
                        "source",
                        "target",
                        "thematic",
                        "institutional",
                        "structural",
                    )
                }
                for key, p in self.pairs.items()
                if key not in self.edges
            ],
        }

    @staticmethod
    def work(record):
        return {
            k: record.get(k)
            for k in (
                "id",
                "title",
                "kind",
                "year",
                "doi",
                "source_url",
                "start_date",
                "end_date",
                "status",
                "people_display",
                "author_collaborations",
                "author_list_scope",
                "description",
            )
        }

    def person(self, id, kind, offset, limit):
        if id not in self.nodes:
            raise KeyError(id)
        node = self.nodes[id]
        records = [r for r in self.records_by_person[id] if r["kind"] == kind]
        records.sort(
            key=lambda r: (
                -(r.get("year") or int((r.get("start_date") or "0000")[:4])),
                r["title"],
            )
        )
        neighbors = []
        for other in self.graph.neighbors(id):
            peer = self.nodes[other]
            edge = self.edges[tuple(sorted((id, other)))]
            neighbors.append(
                {
                    "id": other,
                    "name": peer["name"],
                    "department": peer["department"],
                    "weight": edge["weight"],
                    "relations": edge["relations"],
                }
            )
        neighbors.sort(key=lambda p: (-p["weight"], p["name"]))
        cross = [
            p
            for p in neighbors
            if node["department"]
            and p["department"]
            and node["department"] != p["department"]
        ]
        return {
            "node": node,
            "neighbors": neighbors,
            "cross_department_neighbors": len(cross),
            "preparation": self.prepared.get("profiles", {}).get(str(id)),
            "works": [self.work(r) for r in records[offset : offset + limit]],
            "kind": kind,
            "offset": offset,
            "total": len(records),
            "has_more": offset + limit < len(records),
        }

    def pair(self, a, b, offset, limit):
        if a not in self.nodes or b not in self.nodes:
            raise KeyError((a, b))
        if a == b:
            raise ValueError("Selecciona dos investigadores diferentes.")
        a, b = sorted((a, b))
        key = a, b
        edge = self.edges.get(key)
        signals = self.pairs.get(key) if self.recommendations_ready else None
        shared = sorted(set(self.graph.neighbors(a)) & set(self.graph.neighbors(b)))
        path = (
            nx.shortest_path(self.graph, a, b) if nx.has_path(self.graph, a, b) else []
        )
        evidence = edge["evidence"] if edge else []
        works = []
        for item in evidence[offset : offset + limit]:
            record = self.records.get(item["record_id"])
            works.append(
                {
                    **(self.work(record) if record else item),
                    "relation": item["relation"],
                }
            )
        return {
            "source": a,
            "target": b,
            "observed": {k: v for k, v in edge.items() if k != "evidence"}
            if edge
            else None,
            "signals": signals,
            "institution": institutional(self.nodes[a], self.nodes[b]),
            "common_neighbors": shared,
            "path": path,
            "works": works,
            "offset": offset,
            "total": len(evidence),
            "has_more": offset + limit < len(evidence),
            "profiles": {
                str(id): self.prepared.get("profiles", {}).get(str(id)) for id in (a, b)
            },
        }

"""Reúne registros, deduplica DOI y adquiere evidencia detallada de las conexiones."""

import argparse
import hashlib
import json
import tomllib
from pathlib import Path

from extraccion_datos.audit import documents
from extraccion_datos.cli import new_run, snapshot
from extraccion_datos.http import AcquisitionError
from extraccion_datos.research import detail_enrichment, parse_listing, person_lookup, url_key
from extraccion_datos.safari import SafariClient
from extraccion_datos.storage import ROOT, utc_now, write_json


def listings(root, collection, nodes):
    lookup = person_lookup(nodes)
    records = {}
    for entry, raw in documents(root, collection, "pages"):
        if entry["kind"] not in ("publications", "projects"):
            continue
        for record in parse_listing(raw.decode(), entry, entry["kind"], lookup):
            key = url_key(record["source_url"])
            if key not in records:
                records[key] = record
            else:
                existing = records[key]
                for observation in record["observations"]:
                    if observation not in existing["observations"]:
                        existing["observations"].append(observation)
                for person in record["linked_people"]:
                    if person not in existing["linked_people"]:
                        existing["linked_people"].append(person)
                for metric in record["publication_metrics"]:
                    if metric not in existing["publication_metrics"]:
                        existing["publication_metrics"].append(metric)
                if record["doi"] and not existing["doi"]:
                    existing["doi"] = record["doi"]
    return sorted(records.values(), key=lambda r: r["source_url"])


def candidate_ids(record):
    return {o["faculty_id"] for o in record["observations"]} | {
        p["faculty_id"] for p in record["linked_people"] if p["faculty_id"] is not None
    }


def detail_plan(records):
    doi_members = {}
    for r in records:
        if r["doi"]:
            doi_members.setdefault(r["doi"], set()).update(candidate_ids(r))
    return [
        r
        for r in records
        if r["kind"] == "projects"
        or (
            not r.get("author_collaborations")
            and (
                len(doi_members.get(r["doi"], set()) | candidate_ids(r)) > 1
                or not {o["faculty_id"] for o in r["observations"]}
                <= {p["faculty_id"] for p in r["linked_people"]}
            )
        )
    ]


def collect(root, collection_path, nodes_path, resume=None):
    collection_path = collection_path if collection_path.is_absolute() else root / collection_path
    nodes_path = nodes_path if nodes_path.is_absolute() else root / nodes_path
    resume = resume if resume is None or resume.is_absolute() else root / resume
    collection = json.loads(collection_path.read_text())
    if collection["status"] != "acquired":
        raise ValueError("Completar primero la adquisición de listas y huellas.")
    nodes = json.loads(nodes_path.read_text())["nodes"]
    records = listings(root, collection, nodes)
    planned = detail_plan(records)
    if resume:
        path, manifest = resume, json.loads(resume.read_text())
        if manifest["source_collection_run"] != collection["run_id"]:
            raise ValueError("La reanudación pertenece a otra colección.")
        manifest["status"], manifest["errors"] = "running", []
    else:
        manifest, path = new_run(root, "research_details")
        manifest.update(
            source_collection_run=collection["run_id"],
            source_profile_run=collection["source_profile_run"],
            coverage="cohort_relations",
            transport="safari",
            planned_urls=[r["source_url"] for r in planned],
        )
    cache = {url_key(p["url"]): p for p in manifest["pages"]}
    for previous in sorted((root / "data/manifests").glob("*.json")):
        old = json.loads(previous.read_text())
        if old.get("source_profile_run") != collection["source_profile_run"]:
            continue
        for p in old.get("pages", []):
            if p.get("kind") in (
                "publication",
                "project",
                "publications_detail",
                "projects_detail",
            ):
                if p.get("document_verified"):
                    cache.setdefault(url_key(p["url"]), {**p, "reused_from_run": old["run_id"]})
    client = SafariClient(tomllib.loads((root / "config/sources.toml").read_text())["cris"])
    write_json(path, manifest)
    print(
        json.dumps(
            {"manifest": str(path), "unique_records": len(records), "detail_pages": len(planned)}
        ),
        flush=True,
    )
    try:
        for i, record in enumerate(planned):
            url = record["source_url"]
            if url_key(url) in cache:
                entry = cache[url_key(url)]
                raw = (root / entry["snapshot"]).read_bytes()
                if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                    raise AcquisitionError("Hash de detalle incorrecto: " + url)
            else:
                raw, response = client.get(url)
                entry = {
                    "url": url,
                    "snapshot": snapshot(root, manifest["run_id"], url, raw),
                    "kind": record["kind"] + "_detail",
                    "retrieved_at": utc_now(),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    **response,
                }
                cache[url_key(url)] = entry
            detail_enrichment(raw.decode(), entry, record, nodes)
            if not record["detail"]["people"]:
                raise AcquisitionError("Detalle sin participantes reconocibles: " + url)
            if not any(url_key(p["url"]) == url_key(url) for p in manifest["pages"]):
                manifest["pages"].append(entry)
            write_json(path, manifest)
            print(
                json.dumps({"completed": i + 1, "total": len(planned), "kind": record["kind"]}),
                flush=True,
            )
        manifest["status"] = "acquired"
        out = root / "data/interim" / collection["run_id"] / "research_records.json"
        write_json(
            out,
            {
                "records": records,
                "details_manifest": str(path.relative_to(root)),
                "coverage": {
                    "listing_records": len(records),
                    "detailed_records": len(planned),
                    "detail_rule": (
                        "all projects; shared individual-author outputs and unresolved owners; "
                        "collective authors remain collective"
                    ),
                },
            },
        )
        manifest["records_file"] = str(out.relative_to(root))
        manifest["records_sha256"] = hashlib.sha256(out.read_bytes()).hexdigest()
        return path, out
    except (AcquisitionError, ValueError) as exc:
        manifest["status"] = "partial"
        manifest["errors"].append({"error": str(exc), "url": url})
        raise
    finally:
        client.close()
        manifest["finished_at"] = utc_now()
        write_json(path, manifest)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--collection-manifest", type=Path, required=True)
    parser.add_argument("--nodes", type=Path, required=True)
    parser.add_argument("--resume", type=Path)
    args = parser.parse_args()
    collect(args.root.resolve(), args.collection_manifest, args.nodes, args.resume)

"""Audita snapshots CRIS guardados; no descarga ni publica una red completa."""

import argparse
import hashlib
import json
import re
from collections import Counter
from itertools import combinations
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from extraccion_datos.cris import canonical_profile_url, clean_text, section_text, stable_id
from extraccion_datos.storage import ROOT, utc_now, write_json


def documents(root, manifest, key):
    for item in manifest[key]:
        body = (root / item["snapshot"]).read_bytes()
        if hashlib.sha256(body).hexdigest() != item["sha256"]:
            raise ValueError(f"Hash incorrecto: {item['snapshot']}")
        yield item, body


def fingerprint_concepts(scope):
    result = []
    if scope is None:
        return result
    for button in scope.select("[data-concept-uuid][data-rank-value]"):
        label = button.select_one(".concept")
        if label:
            group = button.find_parent("div", class_="person-fingerprint-thesauri")
            subject = group.find(["h2", "h3", "h4"]) if group else None
            result.append(
                {
                    "concept_id": button["data-concept-uuid"],
                    "label": clean_text(label.get_text()),
                    "weight": float(button["data-rank-value"]),
                    "subject": clean_text(subject.get_text()) if subject else None,
                }
            )
    return result


def linked_people(soup, known):
    people = []
    for item in soup.select(".introduction .relations.persons > li"):
        link, role = item.select_one('a[rel="Person"]'), item.select_one(".dimmed")
        role_text = clean_text(role.get_text()).strip(" ()") if role else None
        name = clean_text(link.get_text()) if link else clean_text(item.get_text())
        if not link and role:
            name = name.removesuffix(clean_text(role.get_text())).strip()
        url = urljoin("https://cris.utec.edu.pe/", link["href"]) if link else None
        try:
            faculty_id = known.get(canonical_profile_url(url)) if url else None
        except ValueError:
            faculty_id = None
        people.append(
            {
                "name": name.lstrip(", "),
                "role": role_text,
                "person_url": url,
                "faculty_id": faculty_id,
            }
        )
    return people


def detail_record(item, soup, known):
    metadata = {}
    for tag in soup.select('meta[name^="citation_"][content]'):
        metadata.setdefault(tag["name"], []).append(tag["content"])
    facts = {}
    for row in soup.select("main tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) == 2:
            facts[clean_text(cells[0].get_text())] = clean_text(cells[1].get_text(" "))
    return {
        "kind": item["kind"],
        "title": clean_text(soup.find("h1").get_text(" ")),
        "people": linked_people(soup, known),
        "publication_metadata": metadata,
        "facts": facts,
        "source_url": item["url"],
        "retrieved_at": item["retrieved_at"],
        "raw_snapshot": item["snapshot"],
    }


def run_audit(root, profile_path, detail_paths):
    manifest = json.loads(profile_path.read_text())
    known = {canonical_profile_url(p["url"]): stable_id(p["url"]) for p in manifest["profiles"]}
    inventory = {"publications": {}, "projects": {}, "organisations": {}}
    profiles, headings = [], Counter()
    for item, body in documents(root, manifest, "profiles"):
        soup = BeautifulSoup(body, "html.parser")
        headings.update(h.get_text(" ", strip=True) for h in soup.select("main h2,main h3"))
        for a in soup.select("a[href]"):
            url = urljoin(item["url"], a["href"])
            parts = urlsplit(url)
            match = re.fullmatch(r"/es/(publications|projects|organisations)/[^/]+/", parts.path)
            if parts.hostname == "cris.utec.edu.pe" and match:
                entry = inventory[match[1]].setdefault(
                    url, {"title": clean_text(a.get_text(" ")), "seen_on_profiles": []}
                )
                if item["url"] not in entry["seen_on_profiles"]:
                    entry["seen_on_profiles"].append(item["url"])
        fingerprint = soup.select_one("section.person-fingerprint")
        profiles.append(
            {
                "id": known[item["url"]],
                "name": clean_text(soup.find("h1").get_text()),
                "renacyt": section_text(soup, "Calificación Renacyt"),
                "fingerprint_preview": fingerprint_concepts(fingerprint),
                "source_url": item["url"],
                "retrieved_at": item["retrieved_at"],
                "raw_snapshot": item["snapshot"],
            }
        )
    details, relations, fingerprints, catalogs, networks = [], [], [], {}, []
    for path in detail_paths:
        detail_manifest = json.loads(path.read_text())
        for item, body in documents(root, detail_manifest, "pages"):
            kind = item.get("kind")
            if kind == "network_json":
                if item.get("status") != 200:
                    networks.append(
                        {
                            "source_url": item["url"],
                            "http_status": item["status"],
                            "raw_snapshot": item["snapshot"],
                            "error": "La respuesta no acredita un grafo utilizable.",
                        }
                    )
                    continue
                graph = json.loads(body)
                networks.append(
                    {
                        "source_url": item["url"],
                        "raw_snapshot": item["snapshot"],
                        "node_count": len(graph["nodes"]),
                        "edge_count": len(graph["edges"]),
                    }
                )
                continue
            soup = BeautifulSoup(body, "html.parser")
            if kind in ("publication", "project", "thesis"):
                record = detail_record(item, soup, known)
                details.append(record)
                if kind in ("publication", "project"):
                    matched = sorted(
                        {p["faculty_id"] for p in record["people"] if p["faculty_id"] is not None}
                    )
                    for a, b in combinations(matched, 2):
                        relations.append(
                            {
                                "source": a,
                                "target": b,
                                "relation": "coauthorship"
                                if kind == "publication"
                                else "shared_project",
                                "evidence": [item["url"]],
                                "coverage": "sample",
                            }
                        )
            if kind == "fingerprints":
                fingerprints.append(
                    {
                        "source_url": item["url"],
                        "concepts": fingerprint_concepts(soup.select_one(".person-fingerprints")),
                    }
                )
            if kind and kind.endswith("_directory"):
                text = soup.select_one("main").get_text(" ", strip=True)
                match = re.search(r"\d+\s*-\s*\d+\s+de\s+([\d,]+)\s+resultados", text)
                if match:
                    catalogs[kind] = {
                        "declared_count": int(match[1].replace(",", "")),
                        "source_url": item["url"],
                        "retrieved_at": item["retrieved_at"],
                    }
    out = root / "data/interim" / manifest["run_id"] / "cris_audit"
    summary = {
        "audited_at": utc_now(),
        "profile_count": len(profiles),
        "additional_section_coverage": {
            k: headings[k] for k in ("Calificación Renacyt", "Huella digital", "Proyectos")
        },
        "preview_link_inventory": {k: len(v) for k, v in inventory.items()},
        "catalogs": catalogs,
        "sample_records": len(details),
        "sample_relations": len(relations),
        "network_probes": networks,
        "note": "Inventario y muestras; no es un censo de publicaciones, proyectos o aristas.",
    }
    for filename, data in (
        ("summary", summary),
        ("link_inventory", inventory),
        ("profile_additional_fields", profiles),
        ("detail_samples", details),
        ("relation_samples", relations),
        ("fingerprint_samples", fingerprints),
    ):
        write_json(out / f"{filename}.json", data)
    return out, summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--profiles-manifest", type=Path, required=True)
    parser.add_argument("--detail-manifest", type=Path, action="append", default=[])
    args = parser.parse_args()
    output, summary = run_audit(args.root.resolve(), args.profiles_manifest, args.detail_manifest)
    print(json.dumps({"output": str(output), **summary}, ensure_ascii=False))

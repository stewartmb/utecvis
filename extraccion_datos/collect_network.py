"""Adquisición reanudable de listas completas y huellas para una cohorte CRIS."""

import argparse
import hashlib
import json
import re
import tomllib
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from extraccion_datos.cli import new_run, snapshot
from extraccion_datos.http import AcquisitionError
from extraccion_datos.safari import SafariClient
from extraccion_datos.storage import ROOT, utc_now, write_json


def canonical_record(url, kind):
    p = urlsplit(url)
    if p.scheme != "https" or p.hostname != "cris.utec.edu.pe":
        return None
    if not re.fullmatch(rf"/es/{kind}/[^/]+/?", p.path):
        return None
    return "https://cris.utec.edu.pe" + p.path.rstrip("/") + "/"


def listing_links(soup, url, kind):
    return sorted(
        {
            u
            for a in soup.select("main .list-results h3.title a[href]")
            if (u := canonical_record(urljoin(url, a["href"]), kind))
        }
    )


def listing_count(soup):
    main = soup.select_one("main")
    text = main.get_text(" ", strip=True) if main else ""
    found = re.search(r"(?:\d+\s*-\s*\d+\s+de\s+)?([\d,]+)\s+resultados\b", text)
    return int(found[1].replace(",", "")) if found else None


def following_page(soup, url):
    for a in soup.select('a[rel~="next"],a.nextLink,li.next a'):
        candidate = urljoin(url, a.get("href", ""))
        parts, current = urlsplit(candidate), urlsplit(url)
        if parts.hostname == "cris.utec.edu.pe" and parts.path == current.path:
            return candidate
    return None


def profile_tasks(root, source):
    tasks = []
    for item in source["profiles"]:
        raw = (root / item["snapshot"]).read_bytes()
        if hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise ValueError("Hash del perfil incorrecto: " + item["url"])
        soup = BeautifulSoup(raw, "html.parser")
        for kind in ("publications", "projects", "fingerprints"):
            links = [
                a
                for a in soup.select("nav a[href]")
                if urljoin(item["url"], a["href"]).split("?", 1)[0] == item["url"] + kind + "/"
            ]
            if links:
                text = links[0].get_text(" ", strip=True)
                count = re.search(r"\(([\d,]+)\)", text)
                tasks.append(
                    {
                        "owner_url": item["url"],
                        "kind": kind,
                        "url": urljoin(item["url"], links[0]["href"]),
                        "profile_declared_count": int(count[1].replace(",", "")) if count else None,
                    }
                )
    return tasks


def acquisition(root, source_path, resume=None):
    source_path = source_path if source_path.is_absolute() else root / source_path
    resume = resume if resume is None or resume.is_absolute() else root / resume
    source = json.loads(source_path.read_text())
    if resume:
        path = resume
        manifest = json.loads(path.read_text())
        if manifest["source_profile_run"] != source["run_id"]:
            raise ValueError("La reanudación pertenece a otra cohorte.")
        manifest["status"], manifest["errors"] = "running", []
    else:
        manifest, path = new_run(root, "network_collection")
        manifest.update(
            source_profile_run=source["run_id"],
            transport="safari",
            coverage="cohort",
            tasks=profile_tasks(root, source),
            completed_tasks=[],
        )
    cache = {p["url"]: p for p in manifest["pages"]}
    # Reutiliza únicamente documentos previos de esta misma cohorte, con hash verificado.
    for previous in sorted((root / "data/manifests").glob("*.json")):
        old = json.loads(previous.read_text())
        if old.get("source_profile_run") != source["run_id"]:
            continue
        for p in old.get("pages", []):
            if p.get("content_type", "").startswith("text/html") and p.get("document_verified"):
                cache.setdefault(p["url"], {**p, "reused_from_run": old["run_id"]})
    client = SafariClient(tomllib.loads((root / "config/sources.toml").read_text())["cris"])
    write_json(path, manifest)
    print(json.dumps({"manifest": str(path), "tasks": len(manifest["tasks"])}), flush=True)
    try:
        done = {(t["owner_url"], t["kind"]) for t in manifest["completed_tasks"]}
        for task in manifest["tasks"]:
            key = task["owner_url"], task["kind"]
            if key in done:
                continue
            url, seen, records, pages, expected = task["url"], set(), set(), [], None
            for _ in range(100):
                if url in seen:
                    raise AcquisitionError("Ciclo de paginación: " + url)
                seen.add(url)
                if url in cache:
                    entry = cache[url]
                    raw = (root / entry["snapshot"]).read_bytes()
                    if hashlib.sha256(raw).hexdigest() != entry["sha256"]:
                        raise AcquisitionError("Hash de caché incorrecto: " + url)
                else:
                    raw, response = client.get(url)
                    entry = {
                        "url": url,
                        "snapshot": snapshot(root, manifest["run_id"], url, raw),
                        "sha256": hashlib.sha256(raw).hexdigest(),
                        "retrieved_at": utc_now(),
                        **response,
                    }
                    cache[url] = entry
                if not any(p["url"] == url for p in manifest["pages"]):
                    manifest["pages"].append(
                        {**entry, "kind": task["kind"], "owner_url": task["owner_url"]}
                    )
                write_json(path, manifest)
                soup = BeautifulSoup(raw, "html.parser")
                pages.append(url)
                if task["kind"] == "fingerprints":
                    if soup.select_one(".person-fingerprints") is None:
                        raise AcquisitionError("Huella completa no reconocida: " + url)
                    break
                count = listing_count(soup)
                if expected is None:
                    expected = count
                links = listing_links(soup, url, task["kind"])
                records.update(links)
                following = following_page(soup, url)
                if not following:
                    if expected is None or len(records) != expected:
                        raise AcquisitionError(
                            f"Cobertura no demostrada: {url}: {len(records)} de {expected}"
                        )
                    break
                url = following
            else:
                raise AcquisitionError("Demasiadas páginas: " + task["url"])
            manifest["completed_tasks"].append(
                {
                    **task,
                    "pages": pages,
                    "record_urls": sorted(records),
                    "listing_declared_count": expected,
                }
            )
            write_json(path, manifest)
            print(
                json.dumps(
                    {
                        "completed": len(manifest["completed_tasks"]),
                        "total": len(manifest["tasks"]),
                        "kind": task["kind"],
                        "records": len(records),
                        "owner": task["owner_url"],
                    }
                ),
                flush=True,
            )
        manifest["status"] = "acquired"
        return path
    except AcquisitionError as exc:
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
    parser.add_argument("--profiles-manifest", type=Path, required=True)
    parser.add_argument("--resume", type=Path)
    args = parser.parse_args()
    acquisition(args.root.resolve(), args.profiles_manifest, args.resume)

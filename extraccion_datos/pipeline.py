"""Flujo completo: directorio → perfiles → trabajos y huellas → red → cinco JSON."""

import json
import math
import os
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from extraccion_datos.cris import next_page, parse_profile, profile_links
from extraccion_datos.http import AcquisitionError
from extraccion_datos.network import dataset
from extraccion_datos.quality import validate_nodes
from extraccion_datos.research import (
    detail_enrichment,
    fingerprint_concepts,
    parse_listing,
    person_lookup,
    profile_extras,
    url_key,
)

DIRECTORY = "https://cris.utec.edu.pe/es/persons/"
DATA = Path(__file__).resolve().parents[1] / "data"


def listing_count(soup):
    main = soup.select_one("main")
    text = main.get_text(" ", strip=True) if main else ""
    found = re.search(r"(?:\d+\s*-\s*\d+\s+de\s+)?([\d,]+)\s+resultados\b", text)
    return int(found[1].replace(",", "")) if found else None


def following_page(soup, url):
    for link in soup.select('a[rel~="next"],a.nextLink,li.next a'):
        candidate = urljoin(url, link.get("href", ""))
        parts, current = urlsplit(candidate), urlsplit(url)
        if parts.hostname == "cris.utec.edu.pe" and parts.path == current.path:
            return candidate
    return None


def directory_profiles(fetch):
    """Descubre la cohorte sin fijar manualmente el número de profesores."""
    url, visited, profiles, expected = DIRECTORY, set(), set(), None
    while url:
        if url in visited or len(visited) >= 100:
            raise AcquisitionError("Paginación del directorio no válida.")
        visited.add(url)
        html, _date = fetch(url)
        profiles.update(profile_links(html, url))
        text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
        count = re.search(r"\bde\s+([\d.,]+)\s+resultados\b", text, re.IGNORECASE)
        if count:
            expected = int(re.sub(r"[.,]", "", count[1]))
        url = next_page(html, url)
    if not profiles or expected != len(profiles):
        raise AcquisitionError(
            f"Directorio incompleto: {len(profiles)} de {expected} perfiles."
        )
    return sorted(profiles)


def profile_sections(html, owner_url):
    soup = BeautifulSoup(html, "html.parser")
    sections = []
    for kind in ("publications", "projects", "fingerprints"):
        expected_url = owner_url + kind + "/"
        link = next(
            (
                a
                for a in soup.select("nav a[href]")
                if urljoin(owner_url, a["href"]).split("?", 1)[0] == expected_url
            ),
            None,
        )
        if link:
            sections.append((kind, urljoin(owner_url, link["href"])))
    return sections


def merge_listing(records, record):
    """Un trabajo puede aparecer en las listas de varias personas."""
    key = url_key(record["source_url"])
    if key not in records:
        records[key] = record
        return
    existing = records[key]
    for field in ("observations", "linked_people", "publication_metrics"):
        for value in record[field]:
            if value not in existing[field]:
                existing[field].append(value)
    if record["doi"] and not existing["doi"]:
        existing["doi"] = record["doi"]


def read_listing(fetch, owner, kind, url, records, lookup):
    visited, record_urls, expected = set(), set(), None
    while url:
        if url in visited or len(visited) >= 100:
            raise AcquisitionError("Paginación de trabajos no válida: " + url)
        visited.add(url)
        html, date = fetch(url)
        soup = BeautifulSoup(html, "html.parser")
        count = listing_count(soup)
        if expected is None:
            expected = count
        elif count != expected:
            raise AcquisitionError("La lista cambió durante la descarga: " + url)
        entry = {"url": url, "owner_url": owner, "retrieved_at": date}
        for record in parse_listing(html, entry, kind, lookup):
            record_urls.add(record["source_url"])
            merge_listing(records, record)
        url = following_page(soup, url)
    if expected is None or len(record_urls) != expected:
        raise AcquisitionError(
            f"Lista incompleta de {owner}: {len(record_urls)} de {expected}."
        )


def detail_plan(records):
    """Todos los proyectos y las publicaciones que necesitan verificar autores."""

    def candidates(record):
        return {o["faculty_id"] for o in record["observations"]} | {
            p["faculty_id"]
            for p in record["linked_people"]
            if p["faculty_id"] is not None
        }

    doi_members = {}
    for record in records:
        if record["doi"]:
            doi_members.setdefault(record["doi"], set()).update(candidates(record))
    return [
        r
        for r in records
        if r["kind"] == "projects"
        or (
            not r.get("author_collaborations")
            and (
                len(doi_members.get(r["doi"], set()) | candidates(r)) > 1
                or not {o["faculty_id"] for o in r["observations"]}
                <= {p["faculty_id"] for p in r["linked_people"]}
            )
        )
    ]


def extract(fetch, progress=print):
    """fetch(url) devuelve (HTML, fecha UTC); Safari y las pruebas usan el mismo flujo."""
    urls = directory_profiles(fetch)
    nodes, sections = [], []
    for i, url in enumerate(urls, 1):
        progress(f"Perfiles: {i}/{len(urls)}")
        html, date = fetch(url)
        node = parse_profile(html, url, date)
        node.update(profile_extras(html))
        node.update(fingerprint=[], fingerprint_status="not_published")
        nodes.append(node)
        sections.extend(
            (node, kind, link) for kind, link in profile_sections(html, url)
        )
    validate_nodes(nodes)
    lookup, records = person_lookup(nodes), {}
    for i, (node, kind, url) in enumerate(sections, 1):
        progress(f"Listas y huellas: {i}/{len(sections)}")
        if kind != "fingerprints":
            read_listing(fetch, node["source_url"], kind, url, records, lookup)
            continue
        html, date = fetch(url)
        scope = BeautifulSoup(html, "html.parser").select_one(".person-fingerprints")
        if scope is None:
            raise AcquisitionError("Huella no reconocida: " + url)
        concepts = fingerprint_concepts(scope)
        if any(
            not c["label"]
            or not math.isfinite(c["weight"])
            or not 0 <= c["weight"] <= 1
            for c in concepts
        ):
            raise ValueError("Huella con conceptos o ponderaciones no válidos: " + url)
        node.update(
            fingerprint=concepts,
            fingerprint_status="complete" if concepts else "published_empty",
            fingerprint_source={"url": url, "retrieved_at": date},
        )
    records = sorted(records.values(), key=lambda r: r["source_url"])
    planned = detail_plan(records)
    for i, record in enumerate(planned, 1):
        progress(f"Fichas de autores y participantes: {i}/{len(planned)}")
        html, date = fetch(record["source_url"])
        detail_enrichment(
            html, {"url": record["source_url"], "retrieved_at": date}, record, nodes
        )
        if not record["detail"]["people"]:
            raise AcquisitionError(
                "Ficha sin participantes reconocibles: " + record["source_url"]
            )
    return dataset(nodes, records)


def save(outputs, folder=DATA):
    """Escribe solamente el resultado completo; no crea carpetas por ejecución."""
    folder = Path(folder)
    folder.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="utecvis-", dir=folder.parent) as staging:
        for name, content in outputs.items():
            path = Path(staging) / (name + ".json")
            path.write_text(
                json.dumps(content, ensure_ascii=False, indent=2, allow_nan=False)
                + "\n",
                encoding="utf-8",
            )
        folder.mkdir(exist_ok=True)
        for path in Path(staging).iterdir():
            os.replace(path, folder / path.name)

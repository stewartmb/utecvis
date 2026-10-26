"""Registros de investigación y correspondencias mediante URL explícita."""

import hashlib
import re
import unicodedata
from datetime import datetime
from urllib.parse import parse_qs, unquote, urljoin, urlsplit

from bs4 import BeautifulSoup

from extraccion_datos.audit import detail_record, fingerprint_concepts
from extraccion_datos.collect_network import canonical_record
from extraccion_datos.cris import clean_text, section_text


def url_key(url):
    p = urlsplit(url)
    return p.hostname, unicodedata.normalize("NFC", unquote(p.path)).rstrip("/").casefold()


def person_lookup(nodes):
    result = {}
    for node in nodes:
        key = url_key(node["source_url"])
        if key in result:
            raise ValueError("Identidad canónica duplicada: " + node["source_url"])
        result[key] = node["id"]
    return result


def content_text(element):
    return clean_text(element.get_text(" ", strip=True)) if element else None


def iso_date(text):
    if not text:
        return None
    for fmt in ("%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(text.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    return None


def doi_from_links(scope):
    for a in scope.select("a[href]"):
        parts = urlsplit(a["href"])
        value = (
            parts.path.lstrip("/")
            if parts.hostname in ("doi.org", "dx.doi.org")
            else parse_qs(parts.query).get("doi", [None])[0]
        )
        if value and re.fullmatch(r"10\.\d{4,9}/\S+", value.strip(), re.I):
            return value.strip().lower()
    return None


def parse_listing(html, entry, kind, lookup):
    soup = BeautifulSoup(html, "html.parser")
    result = []
    for card in soup.select("main .list-results > li"):
        title_link = card.select_one("h3.title a[href]")
        url = (
            canonical_record(urljoin(entry["url"], title_link["href"]), kind)
            if title_link
            else None
        )
        if not url:
            continue
        short = card.select_one(".rendering_researchoutput,.rendering_upmproject")
        if short is None:
            raise ValueError("Resumen de registro no reconocido: " + url)
        title, date = content_text(title_link), content_text(short.select_one(".date"))
        prefix = content_text(short).removeprefix(title).strip()
        people_text = prefix.split(date, 1)[0].strip(" ,") if date else prefix
        if kind == "projects":
            people_text = content_text(short.select_one("p:not(.period):not(.type)"))
        people = []
        for a in short.select('a[rel="Person"]'):
            person_url = urljoin(entry["url"], a["href"])
            people.append(
                {
                    "name": content_text(a),
                    "person_url": person_url,
                    "faculty_id": lookup.get(url_key(person_url)),
                }
            )
        period = content_text(short.select_one(".period"))
        dates = re.findall(r"\b\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})\b", period or "")
        years = re.findall(r"\b(?:19|20)\d{2}\b", date or "")
        citation_count = card.select_one(".metric.scopus-citations .count")
        citation_text = content_text(citation_count)
        publication_metrics = []
        if citation_text and re.fullmatch(r"\d+|\d{1,3}(?:[., ]\d{3})+", citation_text):
            publication_metrics.append(
                {
                    "provider": "Scopus",
                    "citations": int(re.sub(r"[., ]", "", citation_text)),
                    "retrieved_at": entry["retrieved_at"],
                    "source_url": entry["url"],
                }
            )
        result.append(
            {
                "source_url": url,
                "kind": kind,
                "id": kind + ":" + hashlib.sha256(url.encode()).hexdigest()[:20],
                "title": title,
                "date_text": date,
                "year": int(years[-1]) if years else None,
                "type": content_text(short.select_one(".type")),
                "doi": doi_from_links(card),
                "venue": content_text(short.select_one(".journal")),
                "publication_metrics": publication_metrics,
                "people_display": people_text,
                "linked_people": people,
                "author_collaborations": [
                    content_text(a) for a in short.select('a[rel="AuthorCollaboration"]')
                ],
                "concepts_preview": fingerprint_concepts(card),
                "start_date": iso_date(dates[0]) if dates else None,
                "end_date": iso_date(dates[1]) if len(dates) > 1 else None,
                "observations": [
                    {
                        "listing_url": entry["url"],
                        "owner_url": entry["owner_url"],
                        "faculty_id": lookup[url_key(entry["owner_url"])],
                        "retrieved_at": entry["retrieved_at"],
                        "raw_snapshot": entry["snapshot"],
                    }
                ],
            }
        )
    return result


def detail_enrichment(html, entry, record, nodes):
    soup = BeautifulSoup(html, "html.parser")
    known = {n["source_url"]: n["id"] for n in nodes}
    detail = detail_record({**entry, "kind": record["kind"]}, soup, known)
    lookup = person_lookup(nodes)
    for p, li in zip(detail["people"], soup.select(".introduction .relations.persons > li")):
        role_match = re.search(r"\(([^()]+)\)\s*$", content_text(li))
        if role_match and any(
            w in role_match[1].casefold()
            for w in ("autor", "author", "editor", "traductor", "investigador", "compilador")
        ):
            p["role"] = role_match[1]
    for p in detail["people"]:
        p["faculty_id"] = lookup.get(url_key(p["person_url"])) if p["person_url"] else None
        p["identity_method"] = "explicit_cris_url" if p["faculty_id"] is not None else None
    author_metadata, current = [], None
    for tag in soup.select('meta[name^="citation_author"][content]'):
        if tag["name"] == "citation_author":
            current = {"name": tag["content"], "orcids": [], "institutions": []}
            author_metadata.append(current)
        elif current is not None and tag["name"] == "citation_author_orcid":
            current["orcids"].append(tag["content"].rstrip("/").rsplit("/", 1)[-1])
        elif current is not None and tag["name"] == "citation_author_institution":
            current["institutions"].append(tag["content"])
    orcids = {
        n["external_ids"]["orcid"]: n["id"] for n in nodes if n.get("external_ids", {}).get("orcid")
    }
    if len(orcids) != sum(bool(n.get("external_ids", {}).get("orcid")) for n in nodes):
        raise ValueError(
            "ORCID repetido en la cohorte; revisar identidad antes de resolver autores."
        )
    for author in author_metadata:
        matched = {orcids[o] for o in author["orcids"] if o in orcids}
        if len(matched) > 1:
            raise ValueError("ORCID contradictorio en autor: " + author["name"])
        if matched and not any(p["faculty_id"] in matched for p in detail["people"]):
            detail["people"].append(
                {
                    "name": author["name"],
                    "person_url": None,
                    "faculty_id": next(iter(matched)),
                    "role": None,
                    "identity_method": "orcid",
                }
            )
    meta = detail["publication_metadata"]
    publication_date = meta.get("citation_publication_date", [""])[0]
    publication_year = re.search(r"\b(?:19|20)\d{2}\b", publication_date)
    if publication_year:
        record["year"] = int(publication_year[0])
    doi = meta.get("citation_doi", [None])[0]
    if doi:
        record["doi"] = doi.lower()
    record["detail"] = detail
    record["detail_complete"] = True
    record["people"] = detail["people"]
    record["authors_metadata"] = author_metadata
    for label in ("Resumen", "Descripción"):
        h = soup.find(lambda t: t.name in ("h2", "h3") and content_text(t) == label)
        if h:
            block = h.parent.select_one(".textblock")
            if block:
                record["description"] = content_text(block)
    record["keywords"] = [
        clean_text(x) for x in meta.get("citation_keywords", [""])[0].split(";") if clean_text(x)
    ]
    period = detail["facts"].get("Fecha de inicio/Fecha fin", "")
    dates = re.findall(r"\b\d{1,2}/\d{1,2}/(?:\d{4}|\d{2})\b", period)
    if dates:
        record["start_date"] = iso_date(dates[0])
        record["end_date"] = iso_date(dates[1]) if len(dates) > 1 else None
    record["status"] = detail["facts"].get("Estado")
    return record


def profile_extras(html):
    soup = BeautifulSoup(html, "html.parser")
    affiliations = []
    scope = soup.select_one(".header.person-details")
    for link in scope.select('a[rel="Organisation"]') if scope else []:
        name, url = content_text(link), link["href"]
        li = link.find_parent("li")
        role = content_text(li.select_one(".job-title")) if li else None
        classes = link.get("class", [])
        kind = next(
            (
                t
                for prefix, t in (
                    ("departamento", "department"),
                    ("grupo de", "research_group"),
                    ("centro de", "research_center"),
                    ("instituto", "institute"),
                    ("facultad", "faculty"),
                    ("universidad", "university"),
                )
                if name.casefold().startswith(prefix)
            ),
            "unit",
        )
        affiliations.append(
            {"name": name, "source_url": url, "type": kind, "role": role, "source_classes": classes}
        )
    return {"renacyt": section_text(soup, "Calificación Renacyt"), "affiliations": affiliations}

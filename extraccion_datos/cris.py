"""Extracción de identidad, afiliación básica y métricas de cada perfil CRIS."""

import hashlib
import re
import unicodedata
from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup, NavigableString


def clean_text(value):
    return " ".join(unicodedata.normalize("NFC", value).split())


def canonical_profile_url(url):
    parts = urlsplit(url)
    match = re.fullmatch(r"/(?:es|en)/persons/([^/]+)/?", parts.path)
    if parts.scheme != "https" or parts.hostname != "cris.utec.edu.pe" or not match:
        raise ValueError(f"URL de perfil no admitida: {url}")
    return urlunsplit(("https", "cris.utec.edu.pe", f"/es/persons/{match[1]}/", "", ""))


def stable_id(url):
    # El orden del directorio no determina la identidad.
    # 52 bits: entero representable exactamente en JavaScript.
    return int(hashlib.sha256(canonical_profile_url(url).encode()).hexdigest()[:13], 16)


def profile_links(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    result = set()
    for link in soup.select("a[href]"):
        try:
            result.add(canonical_profile_url(urljoin(page_url, link["href"])))
        except ValueError:
            pass
    return sorted(result)


def next_page(html, page_url):
    soup = BeautifulSoup(html, "html.parser")
    for link in soup.select('a[rel~="next"], a.next, a.nextLink, li.next a'):
        if link.get("href"):
            candidate = urljoin(page_url, link["href"])
            parts = urlsplit(candidate)
            if parts.hostname == "cris.utec.edu.pe" and parts.path == "/es/persons/":
                return candidate
    return None


def section_text(soup, title):
    heading = soup.find(
        lambda tag: (
            tag.name in ("h2", "h3", "h4")
            and clean_text(tag.get_text(" ", strip=True)).casefold() == title.casefold()
        )
    )
    if heading is None:
        return []
    scope = (
        heading.find_parent(class_="keyword-group")
        or heading.find_parent("section")
        or soup
    )
    values = []
    for element in heading.next_elements:
        if element is heading or element in heading.descendants:
            continue
        if scope not in element.parents:
            break
        if getattr(element, "name", None) in (
            "h1",
            "h2",
            "h3",
            "h4",
            "footer",
            "nav",
            "form",
        ):
            break
        if type(element) is NavigableString:
            value = clean_text(str(element))
            if value:
                values.append(value)
    return list(dict.fromkeys(values))


def profile_metrics(soup, url, retrieved_at):
    """Solo el panel general de la persona, sin sumar citas de publicaciones."""
    result = {
        "citations": None,
        "h_index": None,
        "citation_source": None,
        "citation_source_url": None,
        "citation_retrieved_at": None,
        "citation_window": None,
        "citation_basis": None,
    }
    panel = soup.select_one('#cite-hallindex[role="tabpanel"]')
    if panel is None:
        return result
    for item in panel.select(".metrics-list > li"):
        label, value = item.select_one(".source"), item.select_one(".value")
        if label is None or value is None:
            continue
        field = {"citas": "citations", "índice h": "h_index"}.get(
            clean_text(label.get_text()).casefold()
        )
        text = clean_text(value.get_text())
        if field and re.fullmatch(r"\d+|\d{1,3}(?:[., ]\d{3})+", text):
            result[field] = int(re.sub(r"[., ]", "", text))
    if result["citations"] is not None or result["h_index"] is not None:
        explanation = panel.parent.select_one("#search_index_metric_explanation")
        basis = (
            clean_text(explanation.get_text(" ", strip=True)) if explanation else None
        )
        source = "CRIS UTEC"
        if basis:
            for provider in ("Scopus", "PlumX"):
                if provider.casefold() in basis.casefold():
                    source = provider
                    break
        result.update(
            citation_source=source,
            citation_source_url=canonical_profile_url(url),
            citation_retrieved_at=retrieved_at,
            citation_window="all",
            citation_basis=basis,
        )
    return result


def parse_profile(html, url, retrieved_at):
    soup = BeautifulSoup(html, "html.parser")
    heading = soup.find("h1")
    if heading is None or not clean_text(heading.get_text(" ", strip=True)):
        raise ValueError(f"Perfil sin nombre reconocible: {url}")
    name = clean_text(heading.get_text(" ", strip=True))
    if any(
        marker in name.casefold()
        for marker in ("access denied", "just a moment", "forbidden")
    ):
        raise ValueError(f"La página parece ser un bloqueo: {url}")
    affiliation_scope = soup.select_one(".header.person-details") or soup
    organisations = list(
        dict.fromkeys(
            clean_text(link.get_text(" ", strip=True))
            for link in affiliation_scope.select('a[href*="/organisations/"]')
            if clean_text(link.get_text(" ", strip=True))
        )
    )
    departments = [x for x in organisations if x.casefold().startswith("departamento")]
    groups = [
        x for x in organisations if x.casefold().startswith(("grupo de", "centro de"))
    ]
    email = None
    for mail in soup.select('a[href^="mailto:"], a.email'):
        candidate = (
            mail["href"][7:].split("?", 1)[0].strip()
            if mail.get("href", "").startswith("mailto:")
            else clean_text(mail.get_text("", strip=True))
        )
        if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", candidate):
            email = candidate
            break
    image = soup.select_one('img[src*="/files-asset/"]')
    identifiers = {}
    for link in soup.select("a[href]"):
        href = link["href"]
        if re.match(r"https?://orcid\.org/\d{4}-\d{4}-\d{4}-[\dX]{4}/?$", href):
            identifiers["orcid"] = href.rstrip("/").rsplit("/", 1)[-1]
        parts = urlsplit(href)
        if (
            parts.hostname in ("www.scopus.com", "scopus.com")
            and parts.path == "/authid/detail.uri"
            and "authorId" in parse_qs(parts.query)
        ):
            identifiers["scopus_url"] = href
        if (
            parts.hostname in ("scholar.google.com", "scholar.google.com.pe")
            and parts.path == "/citations"
            and "user" in parse_qs(parts.query)
        ):
            identifiers["google_scholar_url"] = href
        if parts.hostname == "ctivitae.concytec.gob.pe" and parts.path.endswith(
            "/VerDatosInvestigador.do"
        ):
            identifiers["ctivitae_url"] = href
    return {
        "id": stable_id(url),
        "name": name,
        "image_url": urljoin(url, image["src"]) if image else None,
        "department": departments[0] if departments else None,
        "departments": departments,
        "email": email,
        "research_groups": groups,
        "research_areas": section_text(soup, "Temas de Interés de Investigación"),
        "biography": " ".join(section_text(soup, "Perfil profesional")) or None,
        "education": section_text(soup, "Educación"),
        "external_ids": identifiers,
        **profile_metrics(soup, url, retrieved_at),
        "source_url": canonical_profile_url(url),
        "retrieved_at": retrieved_at,
    }

from bs4 import BeautifulSoup

from extraccion_datos.pipeline import detail_plan, following_page, listing_count
from extraccion_datos.research import (
    detail_enrichment,
    iso_date,
    linked_people,
    parse_listing,
    person_lookup,
)

OWNER = "https://cris.utec.edu.pe/es/persons/persona-ejemplo/"
OTHER = "https://cris.utec.edu.pe/es/persons/otra-persona/"
URL = "https://cris.utec.edu.pe/es/publications/trabajo-ejemplo/"
NODES = [
    {"id": 1, "source_url": OWNER, "external_ids": {}},
    {"id": 2, "source_url": OTHER, "external_ids": {"orcid": "0000-0000-0000-0001"}},
]
ENTRY = {
    "url": OWNER + "publications/",
    "owner_url": OWNER,
    "retrieved_at": "2026-10-25T12:00:00+00:00",
}


def test_listing_preserves_year_doi_people_and_source_membership():
    html = f"""<main><ul class="list-results"><li>
    <div class="rendering_researchoutput"><h3 class="title"><a href="{URL}">Ejemplo</a></h3>
    <a rel="Person" href="{OWNER}">Persona, E.</a>, Autor sin enlace,
    <span class="date">feb. 2026</span><p class="type">Artículo</p></div>
    <a href="https://plu.mx/plum/a/?doi=10.1234/TEST">Métrica</a>
    </li></ul></main>"""
    record = parse_listing(html, ENTRY, "publications", person_lookup(NODES))[0]
    assert record["year"] == 2026
    assert record["doi"] == "10.1234/test"
    assert "Autor sin enlace" in record["people_display"]
    assert record["linked_people"][0]["faculty_id"] == 1
    assert record["observations"][0]["faculty_id"] == 1


def test_pagination_and_counts_are_scoped_to_the_same_listing():
    html = "<main><li>1 - 50 de 1,234 resultados</li></main>"
    soup = BeautifulSoup(html, "html.parser")
    assert listing_count(soup) == 1234
    soup = BeautifulSoup('<a class="nextLink" href="?page=1">Next</a>', "html.parser")
    assert following_page(soup, ENTRY["url"]) == ENTRY["url"] + "?page=1"
    soup = BeautifulSoup(
        '<a class="nextLink" href="https://other.example/">Next</a>', "html.parser"
    )
    assert following_page(soup, ENTRY["url"]) is None


def test_doi_aliases_collect_evidence_even_when_the_cohort_appears_on_separate_records():
    def record(id):
        return {
            "kind": "publications",
            "doi": "10.1234/example",
            "observations": [{"faculty_id": id}],
            "linked_people": [],
        }

    assert len(detail_plan([record(1), record(2)])) == 2


def test_author_orcid_can_resolve_an_unlinked_author_without_name_guessing():
    html = f"""<main><h1>Ejemplo</h1><div class="introduction"><ul class="relations persons">
    <li><a rel="Person" href="{OWNER}">Persona, E.</a></li><li>Nombre completamente diferente</li>
    </ul></div></main><meta name="citation_author" content="Nombre completamente diferente">
    <meta name="citation_author_orcid" content="0000-0000-0000-0001">"""
    record = detail_enrichment(
        html, {**ENTRY, "url": URL}, {"kind": "publications"}, NODES
    )
    resolved = next(p for p in record["people"] if p["faculty_id"] == 2)
    assert resolved["identity_method"] == "orcid"
    assert iso_date("1/09/22") == "2022-09-01"
    assert iso_date("…") is None


def test_people_resolve_only_explicit_profile_links_and_ignore_footer_people():
    url = "https://cris.utec.edu.pe/es/persons/persona-ficticia/"
    html = """<div class="introduction"><ul class="relations persons">
    <li><a rel="Person" href="/es/persons/persona-ficticia/">Nombre abreviado</a>
        <span class="dimmed">(Investigador principal)</span></li>
    <li>Persona ficticia<span class="dimmed">(Coinvestigador)</span></li>
    </ul></div><footer><a rel="Person" href="/es/persons/otra/">Otra</a></footer>"""
    people = linked_people(BeautifulSoup(html, "html.parser"), {url: 123})
    assert len(people) == 2
    assert people[0]["faculty_id"] == 123
    assert people[0]["role"] == "Investigador principal"
    assert people[1]["faculty_id"] is None
    assert people[1]["name"] == "Persona ficticia"

"""Regresiones de alcance y proveedor de las métricas públicas de la persona."""

import pytest

from extraccion_datos.cris import parse_profile

URL = "https://cris.utec.edu.pe/es/persons/persona-ficticia/"
DATE = "2026-10-25T12:00:00+00:00"


@pytest.mark.parametrize("provider", ["Scopus", "PlumX"])
def test_person_total_excludes_other_windows_and_publication_counts(provider):
    html = f"""<h1>Persona ficticia</h1>
    <div class="metric scopus-citations"><span class="count">9999</span></div>
    <div class="tab-container">
      <div id="cite-h5index" role="tabpanel"><ul class="metrics-list"><li>
        <div class="value">35</div><div class="source">Citas</div></li></ul></div>
      <div id="cite-hallindex" role="tabpanel"><ul class="metrics-list">
        <li><div class="value">1.234</div><div class="source">Citas</div></li>
        <li><div class="value">12</div><div class="source">Índice h</div></li>
      </ul></div>
      <span id="search_index_metric_explanation">Publicaciones de Pure y citas de {provider}</span>
    </div>"""
    node = parse_profile(html, URL, DATE, "ficticio.html")
    assert node["citations"] == 1234
    assert node["h_index"] == 12
    assert node["citation_source"] == provider
    assert node["citation_source_url"] == URL
    assert node["citation_window"] == "all"
    assert node["citation_retrieved_at"] == DATE


@pytest.mark.parametrize("value,expected", [("0", 0), ("—", None), ("1,23", None)])
def test_observed_zero_is_distinct_from_unavailable_or_ambiguous_counts(value, expected):
    html = f"""<h1>Persona ficticia</h1><div id="cite-hallindex" role="tabpanel">
    <ul class="metrics-list"><li><div class="value">{value}</div>
    <div class="source">Citas</div></li></ul></div>"""
    node = parse_profile(html, URL, DATE, "ficticio.html")
    assert node["citations"] == expected
    assert node["citation_source"] == ("CRIS UTEC" if expected is not None else None)


def test_publication_citations_do_not_substitute_a_missing_person_total():
    html = """<h1>Persona ficticia</h1><article><div class="metric scopus-citations">
    <span class="count">99</span><span class="label">Citas (Scopus)</span></div></article>"""
    node = parse_profile(html, URL, DATE, "ficticio.html")
    assert node["citations"] is None
    assert node["citation_source"] is None

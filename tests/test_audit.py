import hashlib

import pytest
from bs4 import BeautifulSoup

from extraccion_datos.audit import documents, linked_people


def test_audit_resolves_only_explicit_profile_links_and_ignores_footer_people():
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


def test_audit_rejects_modified_snapshot_instead_of_reporting_it_as_evidence(tmp_path):
    path = tmp_path / "source.html"
    original = b"original"
    manifest = {"pages": [{"snapshot": path.name, "sha256": hashlib.sha256(original).hexdigest()}]}
    path.write_bytes(b"modified")
    with pytest.raises(ValueError, match="Hash incorrecto"):
        list(documents(tmp_path, manifest, "pages"))

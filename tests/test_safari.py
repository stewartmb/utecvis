"""Contratos de adquisición sin depender de Safari en CI."""

import pytest

from extraccion_datos.http import AcquisitionError
from extraccion_datos.safari import SafariClient

URL = "https://cris.utec.edu.pe/es/persons/"


def client(monkeypatch, metadata):
    adapter = SafariClient({"timeout_seconds": 1, "delay_seconds": 0})
    adapter.window_id, adapter.tab_index = 1, 2
    monkeypatch.setattr(adapter, "_script", lambda *args: "")
    values = iter([metadata, "<main><h1>Encontrar perfiles</h1></main>"])
    monkeypatch.setattr(adapter, "_read", lambda javascript: next(values))
    return adapter


def test_challenge_is_rejected_even_if_it_has_a_heading(monkeypatch):
    adapter = client(
        monkeypatch,
        {"url": URL, "title": "Just a moment...", "state": "complete", "ready": True},
    )
    with pytest.raises(AcquisitionError, match="Cloudflare"):
        adapter._request(URL)


def test_rendered_document_does_not_claim_an_unobserved_http_status(monkeypatch):
    adapter = client(
        monkeypatch,
        {"url": URL, "title": "Encontrar perfiles", "state": "complete", "ready": True},
    )
    body, metadata = adapter._request(URL)
    assert b"Encontrar perfiles" in body
    assert metadata["status"] is None
    assert metadata["content_origin"] == "rendered_dom"
    assert metadata["document_verified"] is True

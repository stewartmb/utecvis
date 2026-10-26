"""Prueba visual opcional con Playwright y Chrome: python tests/browser_smoke.py.

Requiere la app ejecutándose en localhost:5050. No descarga modelos ni visita CRIS.
"""

import argparse
import json

from playwright.sync_api import sync_playwright


def run(url, channel):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=channel, headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        external_requests = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on(
            "request",
            lambda request: (
                external_requests.append(request.url)
                if not request.url.startswith(url.rstrip("/"))
                else None
            ),
        )
        page.goto(url, wait_until="networkidle")
        page.wait_for_function("window.utecvis && window.utecvis.top.eligible === 5282")
        assert page.locator("g.node").count() == 104
        assert page.locator(".observed-edge").count() == 74
        assert page.locator(".predicted-edge").count() == 0
        assert page.evaluate("document.documentElement.scrollWidth") == 1440
        page.locator("g.node").first.hover()
        assert page.locator("#tooltip").is_visible()
        page.locator("#search").fill("Luz Antuanet")
        page.locator("#search").press("Enter")
        page.wait_for_selector(".avatar")
        assert "Luz Antuanet" in page.locator("#inspector").inner_text()
        page.locator("#reset").click()
        page.wait_for_timeout(450)
        positions = page.evaluate("window.utecvis.nodes.map(n => [n.id,n.x,n.y])")

        page.locator('[data-task="affinities"]').click()
        page.wait_for_function(
            "document.querySelectorAll('.predicted-edge').length === 53"
        )
        assert positions == page.evaluate(
            "window.utecvis.nodes.map(n => [n.id,n.x,n.y])"
        )
        page.locator("#top-percent").evaluate(
            "el => { el.value = 2; el.dispatchEvent(new Event('input')); }"
        )
        assert page.locator(".predicted-edge").count() == 106
        page.locator("#top-percent").evaluate(
            "el => { el.value = 0; el.dispatchEvent(new Event('input')); }"
        )
        assert page.locator(".predicted-edge").count() == 0
        page.locator("#top-percent").evaluate(
            "el => { el.value = 1; el.dispatchEvent(new Event('input')); }"
        )
        first_thematic = page.evaluate(
            "window.utecvis.top.ranked[0].source + ':' + window.utecvis.top.ranked[0].target"
        )
        page.locator("#weight-structural").evaluate(
            "el => { el.value = 100; el.dispatchEvent(new Event('input')); }"
        )
        assert (
            page.evaluate(
                "Object.values(window.utecvis.state.weights).reduce((a,b)=>a+b)"
            )
            == 100
        )
        first_structural = page.evaluate(
            "window.utecvis.top.ranked[0].source + ':' + window.utecvis.top.ranked[0].target"
        )
        assert first_thematic != first_structural
        assert page.evaluate(
            "window.utecvis.nodes.length === 104 && window.utecvis.observed.length === 74"
        )
        page.locator("#weight-thematic").evaluate(
            "el => { el.value = 60; el.dispatchEvent(new Event('input')); }"
        )
        page.locator("[data-pair]").first.click()
        page.wait_for_selector(".signal-row")
        assert page.locator(".signal-row").count() == 3
        assert "No es una probabilidad" in page.locator("#inspector").inner_text()

        page.locator("#search").fill("Luz Antuanet")
        page.locator("[data-search-id]").first.click()
        page.wait_for_selector(".avatar")
        assert (
            "Luz Antuanet Adanaque Infante" in page.locator("#inspector").inner_text()
        )
        assert page.locator(".metric-grid strong").first.inner_text() == "0"
        assert "Publicaciones (5)" in page.locator("#inspector").inner_text()
        assert (
            "no equivale a investigar en solitario"
            in page.locator("#inspector").inner_text()
        )
        page.locator("#neighbors-only").click()
        assert page.locator("g.node").count() == 1
        page.locator("#neighbors-only").click()
        assert page.locator("g.node").count() == 104

        page.locator("#reset").click()
        page.locator('[data-task="bridges"]').click()
        expected = page.evaluate(
            "window.utecvis.nodes.reduce((a,b)=>a.network_metrics.betweenness > b.network_metrics.betweenness ? a:b).id"
        )
        assert (
            int(page.locator(".rank-row").first.get_attribute("data-person"))
            == expected
        )
        assert page.locator("#metric").input_value() == "betweenness"

        page.locator('[data-task="communities"]').click()
        assert page.locator("#color").input_value() == "community"
        assert page.locator(".group-card").count() > 0
        options = page.locator("#organisation option").evaluate_all(
            "els => els.map(el=>({value:el.value,text:el.textContent}))"
        )
        ric = next(o for o in options if "(RIC)" in o["text"])
        page.locator("#organisation").select_option(ric["value"])
        assert page.locator("g.node").count() == 8
        page.locator("#department").select_option("Departamento de Negocios Digitales")
        assert page.locator("g.node").count() == 0
        assert "No hay investigadores" in page.locator("#graph-message").inner_text()

        page.locator("#reset").click()
        assert page.locator("g.node").count() == 104
        assert page.locator(".observed-edge").count() == 74
        assert page.locator(".predicted-edge").count() == 0
        assert page.evaluate("window.utecvis.state.weights") == {
            "thematic": 60,
            "institutional": 30,
            "structural": 10,
        }
        page.locator("#method-open").click()
        assert page.locator("#method-dialog").evaluate("el => el.open")
        page.locator("#method-close").click()

        # Una arista observada y su evidencia colectiva se consultan sin confundirse con predicción.
        page.evaluate("""() => {
            const edge=window.utecvis.observed.find(e=>e.counts.shared_publication===432);
            const hit=[...document.querySelectorAll('.observed-hit')].find(el=>el.__data__.source===edge.source && el.__data__.target===edge.target);
            hit.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        }""")
        page.wait_for_selector("#pair-work-list .work")
        assert "432" in page.locator("#inspector").inner_text()
        assert "autoría individual" in page.locator("#inspector").inner_text()
        assert page.locator("#pair-work-list .work").count() == 20
        page.locator("#load-pair-works").click()
        page.wait_for_function(
            "document.querySelectorAll('#pair-work-list .work').length === 40"
        )

        page.locator("#reset").click()
        page.wait_for_timeout(400)
        page.screenshot(path="/tmp/utecvis-desktop.png", full_page=True)
        page.locator('[data-task="affinities"]').click()
        page.wait_for_timeout(400)
        page.screenshot(path="/tmp/utecvis-predictions.png", full_page=True)
        first = page.locator("[data-pair]").first
        first.click()
        page.wait_for_selector(".signal-row")
        page.wait_for_timeout(350)
        page.screenshot(path="/tmp/utecvis-detail.png", full_page=True)

        for viewport in [{"width": 1280, "height": 800}, {"width": 390, "height": 844}]:
            page.set_viewport_size(viewport)
            page.wait_for_timeout(450)
            assert (
                page.evaluate("document.documentElement.scrollWidth")
                <= viewport["width"]
            )
            assert page.locator("g.node").count() == 104
            assert page.locator("#weight-structural").is_visible()
            assert page.locator("#network-svg").evaluate(
                "el => el.clientHeight === el.parentElement.clientHeight"
            )
            assert page.evaluate("""() => {
                const svg=document.querySelector('#network-svg').getBoundingClientRect();
                return [...document.querySelectorAll('g.node circle')].every(el => {
                    const r=el.getBoundingClientRect();
                    return r.left >= svg.left && r.right <= svg.right && r.top >= svg.top && r.bottom <= svg.bottom;
                });
            }""")
            page.screenshot(
                path=f"/tmp/utecvis-{viewport['width']}.png", full_page=True
            )
        assert not errors, errors
        assert not external_requests, external_requests
        print(
            json.dumps(
                {
                    "browser": "PASS",
                    "tasks": 4,
                    "nodes": 104,
                    "observed_edges": 74,
                    "candidate_pairs": 5282,
                    "top_1_percent": 53,
                    "viewports": [1440, 1280, 390],
                    "errors": errors,
                },
                ensure_ascii=False,
            )
        )
        browser.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:5050/")
    parser.add_argument("--channel", default="chrome")
    args = parser.parse_args()
    run(args.url, args.channel)

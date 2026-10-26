"""Prueba visual opcional: app en localhost:5050, Playwright y Chrome instalados."""

import argparse
import json
import math

from playwright.sync_api import sync_playwright


def snapshot(page):
    return page.locator("g.node").evaluate_all("""els => Object.fromEntries(els.map(el => [el.dataset.id, {
        degree: Number(el.dataset.visibleDegree),
        radius: Number(el.querySelector('.node-core').getAttribute('r'))
    }]))""")


def run(url, channel):
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel=channel, headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        errors, external_requests = [], []
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
        page.wait_for_timeout(400)
        assert page.locator("g.node").count() == 104
        assert page.locator(".observed-edge").count() == 74
        assert page.locator(".predicted-edge").count() == 0
        assert page.locator("#filters-panel").is_hidden()
        assert page.locator("#inspector-panel").is_hidden()
        assert page.locator("#graph-container").bounding_box()["height"] > 800
        assert page.evaluate("document.documentElement.scrollWidth") == 1440
        baseline = snapshot(page)
        assert sum(n["degree"] for n in baseline.values()) == 148
        assert all(
            math.isclose(n["radius"], 5.5 + 5.8 * math.sqrt(n["degree"]))
            for n in baseline.values()
        )
        positions = page.evaluate("window.utecvis.nodes.map(n => [n.id,n.x,n.y])")
        metrics = page.evaluate("window.utecvis.nodes.map(n => n.network_metrics)")
        page.screenshot(path="/tmp/utecvis-desktop.png")
        page.locator("g.node").first.hover()
        assert page.locator("#tooltip").is_visible()

        page.locator('[data-task="affinities"]').click()
        page.wait_for_timeout(400)
        assert page.locator(".predicted-edge").count() == 53
        assert page.locator("#inspector-panel").is_hidden()
        assert positions == page.evaluate(
            "window.utecvis.nodes.map(n => [n.id,n.x,n.y])"
        )
        first = snapshot(page)
        assert sum(n["degree"] for n in first.values()) == 2 * (74 + 53)
        assert all(n["radius"] >= baseline[id]["radius"] for id, n in first.items())
        assert any(n["radius"] > baseline[id]["radius"] for id, n in first.items())
        page.locator("#top-percent").evaluate(
            "el => {el.value=2;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        second = snapshot(page)
        assert page.locator(".predicted-edge").count() == 106
        assert sum(n["degree"] for n in second.values()) == 2 * (74 + 106)
        assert all(n["radius"] >= first[id]["radius"] for id, n in second.items())
        page.locator("#prediction-toggle").click()
        page.wait_for_timeout(400)
        assert snapshot(page) == baseline
        assert metrics == page.evaluate(
            "window.utecvis.nodes.map(n => n.network_metrics)"
        )
        page.locator("#prediction-toggle").click()
        page.locator("#top-percent").evaluate(
            "el => {el.value=0;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        assert page.locator(".predicted-edge").count() == 0
        assert snapshot(page) == baseline
        page.locator("#top-percent").evaluate(
            "el => {el.value=1;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        page.screenshot(path="/tmp/utecvis-predictions.png")

        first_thematic = page.evaluate(
            'window.utecvis.top.ranked[0].source + ":" + window.utecvis.top.ranked[0].target'
        )
        page.locator("#weight-structural").evaluate(
            "el => {el.value=100;el.dispatchEvent(new Event('input'));}"
        )
        assert (
            page.evaluate(
                "Object.values(window.utecvis.state.weights).reduce((a,b)=>a+b)"
            )
            == 100
        )
        first_structural = page.evaluate(
            'window.utecvis.top.ranked[0].source + ":" + window.utecvis.top.ranked[0].target'
        )
        assert first_thematic != first_structural
        page.locator("#weight-thematic").evaluate(
            "el => {el.value=60;el.dispatchEvent(new Event('input'));}"
        )
        page.locator("#rankings-toggle").click()
        page.locator("[data-pair]").first.click()
        page.wait_for_selector(".signal-row")
        assert page.locator(".signal-row").count() == 3
        assert "No es una probabilidad" in page.locator("#inspector").inner_text()
        page.wait_for_timeout(350)
        page.screenshot(path="/tmp/utecvis-detail.png")
        page.locator("#inspector-close").click()
        assert page.locator("#inspector-panel").is_hidden()

        page.locator("#search").fill("Luz Antuanet")
        page.locator("#search").press("Enter")
        page.wait_for_selector(".avatar")
        assert (
            "Luz Antuanet Adanaque Infante" in page.locator("#inspector").inner_text()
        )
        assert page.locator(".metric-grid strong").first.inner_text() == "0"
        assert "Publicaciones (5)" in page.locator("#inspector").inner_text()
        page.locator("#filters-toggle").click()
        assert page.locator("#filters-panel").is_visible()
        page.locator("#neighbors-only").click()
        assert page.locator("g.node").count() == 1
        page.locator("#neighbors-only").click()
        assert page.locator("g.node").count() == 104
        page.locator("#filters-close").click()

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
        page.locator("#filters-toggle").click()
        options = page.locator("#organisation option").evaluate_all(
            "els => els.map(el=>({value:el.value,text:el.textContent}))"
        )
        ric = next(o for o in options if "(RIC)" in o["text"])
        page.locator("#organisation").select_option(ric["value"])
        assert page.locator("g.node").count() == 8
        assert (
            sum(n["degree"] for n in snapshot(page).values())
            == 2 * page.locator(".observed-edge").count()
        )
        page.locator("#department").select_option("Departamento de Negocios Digitales")
        assert page.locator("g.node").count() == 0
        assert "No hay investigadores" in page.locator("#graph-message").inner_text()
        page.locator("#clear-filters").click()
        assert page.locator("g.node").count() == 104

        page.locator("#reset").click()
        assert page.locator("#filters-panel").is_hidden()
        assert page.locator("#inspector-panel").is_hidden()
        assert page.locator(".predicted-edge").count() == 0
        assert page.evaluate("window.utecvis.state.weights") == {
            "thematic": 60,
            "institutional": 30,
            "structural": 10,
        }
        page.locator("#method-open").click()
        assert page.locator("#method-dialog").evaluate("el => el.open")
        assert "conexiones visibles" in page.locator("#method-dialog").inner_text()
        page.locator("#method-close").click()
        page.evaluate("""() => {
            const edge=window.utecvis.observed.find(e=>e.counts.shared_publication===432);
            const hit=[...document.querySelectorAll('.observed-hit')].find(el=>el.__data__.source===edge.source && el.__data__.target===edge.target);
            hit.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        }""")
        page.wait_for_selector("#pair-work-list .work")
        assert "autoría individual" in page.locator("#inspector").inner_text()
        assert page.locator("#pair-work-list .work").count() == 20
        page.locator("#load-pair-works").click()
        page.wait_for_function(
            "document.querySelectorAll('#pair-work-list .work').length===40"
        )
        page.locator("#reset").click()
        page.locator('[data-task="affinities"]').click()
        for viewport in [{"width": 1280, "height": 800}, {"width": 390, "height": 844}]:
            page.set_viewport_size(viewport)
            page.wait_for_timeout(450)
            assert (
                page.evaluate("document.documentElement.scrollWidth")
                <= viewport["width"]
            )
            assert (
                page.evaluate("document.documentElement.scrollHeight")
                <= viewport["height"]
            )
            assert page.locator("g.node").count() == 104
            assert page.locator("#weight-structural").is_visible()
            assert page.locator("#network-svg").evaluate(
                "el => el.clientHeight===el.parentElement.clientHeight"
            )
            assert page.evaluate("""() => {
                const svg=document.querySelector('#network-svg').getBoundingClientRect();
                return [...document.querySelectorAll('g.node .node-core')].every(el=>{
                    const r=el.getBoundingClientRect();
                    return r.left>=svg.left && r.right<=svg.right && r.top>=svg.top && r.bottom<=svg.bottom;
                });
            }""")
            page.screenshot(path=f"/tmp/utecvis-{viewport['width']}.png")
        assert not errors, errors
        assert not external_requests, external_requests
        reduced = browser.new_page(reduced_motion="reduce")
        reduced.goto(url, wait_until="networkidle")
        reduced.wait_for_function(
            "window.utecvis && window.utecvis.top.eligible === 5282"
        )
        assert (
            reduced.locator(".switch span").evaluate(
                "el => getComputedStyle(el).transitionDuration"
            )
            == "0s"
        )
        reduced.locator("#prediction-toggle").click()
        reduced.wait_for_function(
            "document.querySelectorAll('.predicted-edge').length === 53"
        )
        assert reduced.locator("g.node").count() == 104
        reduced.close()
        print(
            json.dumps(
                {
                    "browser": "PASS",
                    "tasks": 4,
                    "nodes": 104,
                    "observed_edges": 74,
                    "candidate_pairs": 5282,
                    "top_1_percent": 53,
                    "dynamic_node_sizes": "PASS",
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

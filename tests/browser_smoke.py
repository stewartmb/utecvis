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


def screen_radii(page):
    return page.locator("g.node").evaluate_all(
        "els=>Object.fromEntries(els.map(el=>[el.dataset.id,el.querySelector('.node-core').getBoundingClientRect().width/2]))"
    )


def verify_layout(page):
    assert page.evaluate("""() => {
      const layout=window.utecvis.layout;
      if(layout.maxOverlap>0.06) return false;
      const dots=[...document.querySelectorAll('g.node .node-core')].map(el=>el.getBoundingClientRect());
      for(let i=0;i<dots.length;i++)for(let j=i+1;j<dots.length;j++){
        const a=dots[i],b=dots[j];
        if(Math.hypot(a.x+a.width/2-b.x-b.width/2,a.y+a.height/2-b.y-b.height/2)<(a.width+b.width)/2-0.2)return false;
      }
      for(const n of layout.nodes){
        const r=document.querySelector(`g.node[data-id="${n.id}"] .node-core`).r.baseVal.value;
        if(layout.isIsolated(n)){
          if(Math.abs(Math.hypot(n.x,n.y)-layout.ringRadius)>0.001)return false;
        }else if(Math.hypot(n.x,n.y)+r>layout.coreRadius+0.01)return false;
      }
      return true;
    }""")


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
        page.wait_for_function("window.utecvis && window.utecvis.top.eligible === 5283")
        page.wait_for_timeout(400)
        assert page.locator("g.node").count() == 104
        assert page.locator(".observed-edge").count() == 73
        assert page.locator(".predicted-edge").count() == 0
        assert page.locator("#filters-panel").is_hidden()
        assert page.locator("#inspector-panel").is_hidden()
        assert page.locator("#graph-container").bounding_box()["height"] > 800
        assert page.evaluate("document.documentElement.scrollWidth") == 1440
        baseline = snapshot(page)
        baseline_screen = screen_radii(page)
        assert sum(n["degree"] for n in baseline.values()) == 146
        assert all(
            math.isclose(n["radius"], 7 + 12 * math.sqrt(n["degree"]))
            for n in baseline.values()
        )
        metrics = page.evaluate("window.utecvis.nodes.map(n => n.network_metrics)")
        verify_layout(page)
        widths = page.locator(".observed-edge").evaluate_all(
            'els=>els.map(el=>Number(el.getAttribute("stroke-width")))'
        )
        assert min(widths) >= 2.2 and max(widths) >= 12.9
        page.screenshot(path="/tmp/utecvis-desktop.png")
        dragged_id = page.locator("g.node").evaluate_all(
            "els=>els.find(el=>Number(el.dataset.visibleDegree)>1).dataset.id"
        )
        circle = page.locator(
            f'g.node[data-id="{dragged_id}"] .node-core'
        ).bounding_box()
        viewport = page.locator("#network-svg").bounding_box()
        page.mouse.move(
            circle["x"] + circle["width"] / 2, circle["y"] + circle["height"] / 2
        )
        page.mouse.down()
        drag_neighbors = page.evaluate(
            """id => {
            const peers=window.utecvis.observed.flatMap(e => e.source===Number(id)?[e.target]:e.target===Number(id)?[e.source]:[]);
            return Object.fromEntries(window.utecvis.nodes.filter(n=>peers.includes(n.id)).map(n=>[n.id,[n.x,n.y]]));
        }""",
            dragged_id,
        )
        page.mouse.move(
            viewport["x"] + viewport["width"] - 3,
            viewport["y"] + viewport["height"] - 3,
            steps=8,
        )
        # Keep holding: the spring forces must move linked neighbours now,
        # rather than waiting for mouseup to recompute the entire layout.
        live_drag = page.evaluate(
            """async before => {
            let worstOverlap=0, moved=0;
            for(let frame=0;frame<24;frame++) {
                await new Promise(requestAnimationFrame);
                worstOverlap=Math.max(worstOverlap,window.utecvis.layout.maxOverlap);
                for(const n of window.utecvis.nodes) {
                    const p=before[n.id];
                    if(p)moved=Math.max(moved,Math.hypot(n.x-p[0],n.y-p[1]));
                }
            }
            return {worstOverlap,moved,holding:window.utecvis.layout.dragging};
        }""",
            drag_neighbors,
        )
        assert live_drag["holding"] and live_drag["moved"] > 5
        assert live_drag["worstOverlap"] < 0.06
        verify_layout(page)
        page.mouse.up()
        page.wait_for_timeout(100)
        verify_layout(page)
        assert not page.evaluate("window.utecvis.layout.dragging")
        assert page.locator("#inspector-panel").is_hidden()
        page.locator("g.node").first.hover()
        assert page.locator("#tooltip").is_visible()

        page.locator('[data-task="affinities"]').click()
        page.wait_for_timeout(400)
        assert page.locator(".predicted-edge").count() == 53
        assert page.locator("#inspector-panel").is_hidden()
        verify_layout(page)
        first = snapshot(page)
        first_screen = screen_radii(page)
        assert all(
            first_screen[id] > baseline_screen[id]
            for id, n in first.items()
            if n["degree"] > baseline[id]["degree"]
        )
        assert sum(n["degree"] for n in first.values()) == 2 * (73 + 53)
        assert all(n["radius"] >= baseline[id]["radius"] for id, n in first.items())
        assert any(n["radius"] > baseline[id]["radius"] for id, n in first.items())
        page.locator("#top-percent").evaluate(
            "el => {el.value=2;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        second = snapshot(page)
        second_screen = screen_radii(page)
        assert all(
            second_screen[id] > first_screen[id]
            for id, n in second.items()
            if n["degree"] > first[id]["degree"]
        )
        assert page.locator(".predicted-edge").count() == 106
        assert sum(n["degree"] for n in second.values()) == 2 * (73 + 106)
        assert all(n["radius"] >= first[id]["radius"] for id, n in second.items())
        page.locator("#prediction-toggle").click()
        page.wait_for_timeout(400)
        assert snapshot(page) == baseline
        verify_layout(page)
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
        verify_layout(page)
        page.locator("#top-percent").evaluate(
            "el => {el.value=1;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        verify_layout(page)
        page.locator("#top-percent").evaluate(
            "el=>{el.value=10;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        verify_layout(page)
        page.locator("#top-percent").evaluate(
            "el=>{el.value=1;el.dispatchEvent(new Event('input'));}"
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
            const edge=window.utecvis.observed.find(e=>e.weight===8);
            const hit=[...document.querySelectorAll('.observed-hit')].find(el=>el.__data__.source===edge.source && el.__data__.target===edge.target);
            hit.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        }""")
        page.wait_for_selector("#pair-work-list .work")
        assert "CONEXIÓN REGISTRADA" in page.locator("#inspector").inner_text()
        assert page.locator("#pair-work-list .work").count() == 8
        assert page.locator("#load-pair-works").count() == 0
        assert "Asociada" not in page.locator(".graph-key").inner_text()
        assert page.locator(".observed-edge.association").count() == 0
        page.locator("#reset").click()
        page.locator('[data-task="affinities"]').click()
        for viewport in [
            {"width": 1920, "height": 1080},
            {"width": 1280, "height": 800},
            {"width": 390, "height": 844},
        ]:
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
            verify_layout(page)
            page.screenshot(path=f"/tmp/utecvis-{viewport['width']}.png")
        assert not errors, errors
        assert not external_requests, external_requests
        reduced = browser.new_page(reduced_motion="reduce")
        reduced.goto(url, wait_until="networkidle")
        reduced.wait_for_function(
            "window.utecvis && window.utecvis.top.eligible === 5283"
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
                    "observed_edges": 73,
                    "candidate_pairs": 5283,
                    "top_1_percent": 53,
                    "dynamic_node_sizes": "PASS",
                    "live_drag_and_neighbors": "PASS",
                    "viewports": [1920, 1440, 1280, 390],
                    "collision_and_boundary": "PASS",
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

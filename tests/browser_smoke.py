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


def verify_layout(page):
    assert page.evaluate("""() => {
      const layout=window.utecvis.layout;
      if(layout.maxOverlap>0.06) return false;
      return layout.nodes.every(n => {
        const b=layout.boxFor(n), el=document.querySelector(`g.node[data-id="${n.id}"] .node-core`);
        const r=el.r.baseVal.value;
        return n.x-r>=b.x0+15.99 && n.x+r<=b.x1-15.99 && n.y-r>=b.y0+43.99 && n.y+r<=b.y1-15.99;
      });
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
        assert page.locator("#filters-panel").count() == 0
        assert page.locator("#inspector-panel").is_hidden()
        assert page.locator(".prediction-controls").is_visible()
        assert page.locator("[data-task]").count() == 2
        assert (
            page.locator(
                '[data-task="affinities"], [data-task="communities"], #organisation'
            ).count()
            == 0
        )
        assert (
            page.locator("#prediction-toggle").get_attribute("aria-checked") == "false"
        )
        assert page.locator("#prediction-options input:disabled").count() == 4
        assert page.locator("#prediction-options").evaluate(
            "el => Number(getComputedStyle(el).opacity) < 0.5"
        )
        assert page.locator("[data-weight]").count() == 3
        assert all(
            page.locator(f"#weight-{key}").is_visible()
            for key in ["thematic", "institutional", "structural"]
        )
        assert page.locator(".prediction-controls").evaluate(
            "el => {const r=el.getBoundingClientRect();return r.left<40 && r.bottom>window.innerHeight-40}"
        )
        assert page.locator("#metric, #color, #department").count() == 0
        assert page.locator("[data-rank]").count() == 2
        assert page.locator("#graph-container").bounding_box()["height"] > 800
        assert page.evaluate("document.documentElement.scrollWidth") == 1440
        baseline = snapshot(page)
        assert sum(n["degree"] for n in baseline.values()) == 146
        reference_degree = page.evaluate(
            "Math.max(...window.utecvis.nodes.map(n=>n.network_metrics.degree))"
        )
        assert all(
            math.isclose(n["radius"], 7 + 44 * n["degree"] / reference_degree)
            for n in baseline.values()
        )
        connected_radii = [n["radius"] for n in baseline.values() if n["degree"] > 0]
        assert max(connected_radii) / min(connected_radii) > 4
        assert math.isclose(max(connected_radii), 51)
        page.locator('[data-rank="weighted_degree"]').click()
        page.wait_for_timeout(350)
        assert page.evaluate("window.utecvis.state.metric") == "weighted_degree"
        assert page.locator('[data-rank][aria-pressed="true"]').count() == 1
        assert page.locator("#inspector-panel").is_hidden()
        verify_layout(page)
        page.locator('[data-rank="degree"]').click()
        page.wait_for_timeout(350)
        assert snapshot(page) == baseline
        metrics = page.evaluate("window.utecvis.nodes.map(n => n.network_metrics)")
        verify_layout(page)
        widths = page.locator(".observed-edge").evaluate_all(
            'els=>els.map(el=>Number(el.getAttribute("stroke-width")))'
        )
        assert math.isclose(min(widths), 1.5) and math.isclose(max(widths), 6)
        assert (
            page.locator(".observed-edge").first.evaluate(
                "el=>Number(getComputedStyle(el).strokeOpacity)"
            )
            == 0.38
        )
        hover_id = page.locator("g.node").evaluate_all(
            "els=>els.find(el=>Number(el.dataset.visibleDegree)>1).dataset.id"
        )
        page.locator(f'g.node[data-id="{hover_id}"] .node-core').hover()
        assert page.locator(".observed-edge.edge-focused").count() > 0
        assert page.locator(".observed-edge.edge-dimmed").count() > 0
        assert (
            page.locator(".observed-edge.edge-focused").first.evaluate(
                "el=>Number(getComputedStyle(el).strokeOpacity)"
            )
            == 0.95
        )
        page.mouse.move(10, 10)
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
        assert live_drag["worstOverlap"] < 0.06, live_drag
        verify_layout(page)
        page.mouse.up()
        page.wait_for_timeout(100)
        verify_layout(page)
        assert not page.evaluate("window.utecvis.layout.dragging")
        assert page.locator("#inspector-panel").is_hidden()
        page.locator("g.node").first.hover()
        assert page.locator("#tooltip").is_visible()

        page.locator("#prediction-toggle").click()
        page.wait_for_timeout(400)
        assert page.locator(".predicted-edge").count() == 53
        assert page.locator("#inspector-panel").is_hidden()
        verify_layout(page)
        first = snapshot(page)
        assert sum(n["degree"] for n in first.values()) == 2 * (73 + 53)
        assert all(n["radius"] >= baseline[id]["radius"] for id, n in first.items())
        assert any(n["radius"] > baseline[id]["radius"] for id, n in first.items())
        page.locator("#top-percent").evaluate(
            "el => {el.value=2;el.dispatchEvent(new Event('input'));}"
        )
        page.wait_for_timeout(400)
        second = snapshot(page)
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
        assert page.locator("#weight-structural").is_visible()
        assert page.locator("#prediction-options input:disabled").count() == 0
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

        assert page.locator("#weight-structural").is_visible()
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
        page.evaluate("() => new Promise(requestAnimationFrame)")
        first_structural = page.evaluate(
            'window.utecvis.top.ranked[0].source + ":" + window.utecvis.top.ranked[0].target'
        )
        assert first_thematic != first_structural
        page.locator("#weight-thematic").evaluate(
            "el => {el.value=60;el.dispatchEvent(new Event('input'));}"
        )
        page.evaluate(
            """() => document.querySelector('.prediction-hit').dispatchEvent(new MouseEvent('click', {bubbles:true}))"""
        )
        page.wait_for_selector(".signal-row")
        assert page.locator(".signal-row").count() == 3
        assert "No es una probabilidad" in page.locator("#inspector").inner_text()
        page.mouse.move(10, 10)
        assert page.locator(".predicted-edge.edge-focused").count() == 1
        assert page.locator(".observed-edge.edge-focused").count() == 0
        assert page.locator(".observed-edge.edge-dimmed").count() == 73
        page.wait_for_timeout(350)
        page.screenshot(path="/tmp/utecvis-detail.png")
        page.locator("#prediction-toggle").click()
        assert page.locator(".predicted-edge").count() == 0
        assert page.locator("#inspector-panel").is_hidden()
        assert page.locator("#prediction-options input:disabled").count() == 4
        page.locator("#prediction-toggle").click()
        assert page.locator(".predicted-edge").count() > 0
        page.locator('[data-task="bridges"]').click()
        assert page.evaluate("window.utecvis.state.predictions")
        assert page.locator(".predicted-edge").count() > 0
        page.locator('[data-task="collaborators"]').click()

        page.locator("#search").fill("Luz Antuanet")
        page.locator("#search").press("Enter")
        page.wait_for_selector(".avatar")
        assert (
            "Luz Antuanet Adanaque Infante" in page.locator("#inspector").inner_text()
        )
        assert page.locator(".metric-grid strong").first.inner_text() == "0"
        assert "Publicaciones (5)" in page.locator("#inspector").inner_text()
        assert page.locator("#neighbors-only").is_visible()
        page.locator("#neighbors-only").click()
        assert page.locator("g.node").count() == 1
        assert page.locator('[data-clear-filter="neighborsOnly"]').is_visible()
        page.locator("#neighbors-only").click()
        assert page.locator("g.node").count() == 104

        page.locator("#reset").click()
        page.locator('[data-task="bridges"]').click()
        assert page.locator("#inspector-panel").is_hidden()
        assert page.locator("#rankings-toggle, .ranking-list").count() == 0
        assert page.evaluate("window.utecvis.state.metric") == "betweenness"
        page.wait_for_timeout(350)
        assert math.isclose(max(n["radius"] for n in snapshot(page).values()), 51)
        verify_layout(page)
        page.locator('[data-task="collaborators"]').click()
        page.wait_for_timeout(350)
        assert snapshot(page) == baseline
        verify_layout(page)
        page.locator(".color-legend summary").click()
        department_button = page.locator(
            '.legend-item[data-category="Departamento de Ciencia de Computación y de Datos"]'
        )
        department_size = int(department_button.locator("strong").inner_text())
        department_button.hover()
        assert page.locator("g.node.category-dimmed").count() == 104 - department_size
        assert page.locator("g.node").count() == 104
        department_button.click()
        assert page.locator("g.node").count() == department_size
        assert page.locator('.legend-item[aria-pressed="true"]').count() == 1
        # Search restores visibility when a person was outside the chosen category.
        page.locator("#search").fill("Luz Antuanet")
        page.locator("#search").press("Enter")
        page.wait_for_selector(".avatar")
        assert "Luz Antuanet" in page.locator("#inspector").inner_text()
        assert (
            page.locator(
                f'g.node[data-id="{page.evaluate("window.utecvis.state.selected")}"]'
            ).count()
            == 1
        )

        page.locator("#reset").click()
        assert page.locator("#filters-panel").count() == 0
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
        page.locator("#prediction-toggle").click()
        for viewport in [
            {"width": 1920, "height": 1080},
            {"width": 1280, "height": 800},
            {"width": 740, "height": 1034},
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
            assert page.locator("#network-stats").evaluate(
                "el=>el.getBoundingClientRect().right<=window.innerWidth"
            )
            assert page.evaluate("""() => {
                const panel=document.querySelector('.prediction-controls').getBoundingClientRect();
                const legend=document.querySelector('.map-legend').getBoundingClientRect();
                return panel.bottom<=legend.top || panel.top>=legend.bottom || panel.right<=legend.left || panel.left>=legend.right;
            }""")
            assert page.locator("#top-percent").is_visible()
            assert page.locator("#weight-structural").is_visible()
            assert page.locator("#prediction-options input:disabled").count() == 0
            page.locator("#prediction-toggle").click()
            assert page.locator("#weight-structural").is_visible()
            assert page.locator("#prediction-options input:disabled").count() == 4
            assert page.locator(".predicted-edge").count() == 0
            page.locator("#prediction-toggle").click()
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
        # The single department layout preserves the observed network and metrics.
        page.set_viewport_size({"width": 1440, "height": 900})
        page.locator("#reset").click()
        observed_before = page.evaluate("JSON.stringify(window.utecvis.observed)")
        metrics_before = page.evaluate(
            "JSON.stringify(window.utecvis.nodes.map(n=>n.network_metrics))"
        )
        assert page.evaluate("window.utecvis.state.layout") == "treemap"
        assert page.locator("#layout-toggle").count() == 0
        assert page.locator(".size-mode [data-task]").count() == 2
        assert page.locator("#rankings-toggle").count() == 0
        assert page.locator("g.node").count() == 104
        assert page.locator(".observed-edge").count() == 73
        assert page.locator(".department-box").count() > 1
        assert page.locator(".isolate-ring").count() == 0
        verify_layout(page)
        page.locator("#prediction-toggle").click()
        assert page.locator(".predicted-edge").count() == 53
        page.wait_for_timeout(350)
        verify_layout(page)
        page.locator('[data-task="bridges"]').click()
        page.wait_for_timeout(350)
        verify_layout(page)
        page.locator('[data-task="collaborators"]').click()
        for viewport in [
            {"width": 1440, "height": 900},
            {"width": 740, "height": 1034},
            {"width": 390, "height": 844},
        ]:
            page.set_viewport_size(viewport)
            page.wait_for_timeout(350)
            verify_layout(page)
            assert page.locator(".size-mode").evaluate(
                "el => el.getBoundingClientRect().top > window.innerHeight/2"
            )
            assert page.locator(".prediction-controls").evaluate(
                "el => {const a=el.getBoundingClientRect(),b=document.querySelector('.map-legend').getBoundingClientRect();return a.bottom<=b.top || a.top>=b.bottom || a.right<=b.left || a.left>=b.right;}"
            )
            assert (
                page.evaluate("document.documentElement.scrollWidth")
                <= viewport["width"]
            )
            assert page.evaluate("""() => {
                const svg=document.querySelector('#network-svg').getBoundingClientRect();
                return [...document.querySelectorAll('.department-box rect')].every(el=>{
                    const r=el.getBoundingClientRect();
                    return r.left>=svg.left && r.right<=svg.right && r.top>=svg.top && r.bottom<=svg.bottom;
                });
            }""")
            page.screenshot(path=f"/tmp/utecvis-treemap-{viewport['width']}.png")
        assert (
            page.evaluate("JSON.stringify(window.utecvis.observed)") == observed_before
        )
        assert (
            page.evaluate(
                "JSON.stringify(window.utecvis.nodes.map(n=>n.network_metrics))"
            )
            == metrics_before
        )
        page.wait_for_timeout(350)
        assert page.evaluate("window.utecvis.state.layout") == "treemap"
        assert page.locator(".department-box").count() > 1
        verify_layout(page)
        page.set_viewport_size({"width": 1440, "height": 900})
        page.locator("#reset").click()
        page.wait_for_timeout(400)
        page.wait_for_function(
            "[...document.querySelectorAll('.node-photo')].some(el=>el.__data__.photoLoaded && getComputedStyle(el).display !== 'none')"
        )
        assert (
            page.evaluate("window.utecvis.nodes.filter(n=>n.photo_url).length") == 102
        )
        assert page.evaluate("""() => [...document.querySelectorAll('.node-photo')].every(el=>{
          if(getComputedStyle(el).display==='none') return true;
          const core=el.parentElement.querySelector('.node-core').getBoundingClientRect();
          return core.width>=24.9 && el.getAttribute('href').startsWith('/static/photos/');
        })""")
        for key, text in [
            ("thematic", "Intereses"),
            ("institutional", "Grupo compartido"),
            ("structural", "RWR"),
        ]:
            page.locator(f'label [data-criterion="{key}"]').hover()
            assert page.locator("#criterion-tooltip").is_visible()
            assert text in page.locator("#criterion-tooltip").inner_text()
        page.mouse.move(10, 10)
        page.locator("#prediction-toggle").click()
        timing = page.evaluate("""async () => {
          const layout=window.utecvis.layout, original=layout.configure;
          let calls=0;
          layout.configure=(...args)=>{calls++;return original(...args)};
          const el=document.querySelector('#weight-institutional'), start=performance.now();
          for(let i=0;i<30;i++) {el.value=i;el.dispatchEvent(new Event('input'));}
          const input=performance.now()-start;
          await new Promise(requestAnimationFrame);
          layout.configure=original;
          return {input,calls,frame:performance.now()-start};
        }""")
        assert timing["calls"] == 1, timing
        assert timing["input"] < 100, timing
        assert timing["frame"] < 1000, timing
        page.wait_for_timeout(350)
        verify_layout(page)
        page.locator("#weight-institutional").evaluate(
            "el=>{el.value=100;el.dispatchEvent(new Event('input'));}"
        )
        page.evaluate("() => new Promise(requestAnimationFrame)")
        # The screenshot's exact pair shares DADS; put that evidence before the score.
        page.evaluate("""() => {
          const a=1417230581705628,b=2497184571018067;
          const hit=[...document.querySelectorAll('.prediction-hit')].find(el=>[el.__data__.source,el.__data__.target].includes(a)&&[el.__data__.source,el.__data__.target].includes(b));
          if(!hit)throw new Error('DADS pair absent from institutional Top');
          hit.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        }""")
        page.wait_for_selector(".pair-coincidences")
        assert "DADS" in page.locator(".pair-coincidences").inner_text()
        assert (
            page.locator(".pair-coincidences").bounding_box()["y"]
            < page.locator(".score-total").bounding_box()["y"]
        )
        assert page.locator(".score-total strong").inner_text().startswith("100")
        assert "100 %" in page.locator(".score-weights").inner_text()
        page.locator('.signal-label [data-criterion="institutional"]').hover()
        assert "Departamento: 40" in page.locator("#criterion-tooltip").inner_text()
        page.mouse.move(10, 10)
        page.screenshot(path="/tmp/utecvis-evidence-and-photos.png")
        assert not errors, errors
        assert not external_requests, external_requests
        reduced = browser.new_page(reduced_motion="reduce")
        reduced.goto(url, wait_until="networkidle")
        reduced.wait_for_function(
            "window.utecvis && window.utecvis.top.eligible === 5283"
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
                    "views": 2,
                    "analytical_tasks": 4,
                    "nodes": 104,
                    "observed_edges": 73,
                    "candidate_pairs": 5283,
                    "top_1_percent": 53,
                    "dynamic_node_sizes": "PASS",
                    "live_drag_and_neighbors": "PASS",
                    "viewports": [1920, 1440, 1280, 740, 390],
                    "collision_and_boundary": "PASS",
                    "persistent_suggestion_controls_and_legend": "PASS",
                    "treemap_only_and_size_modes": "PASS",
                    "slider_coalescing": timing,
                    "portraits_offline": "PASS",
                    "pair_coincidences_and_help": "PASS",
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

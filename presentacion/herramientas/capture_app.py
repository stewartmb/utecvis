"""Capturas de la app UTECVis para la presentación (1440x900, escala 2x)."""

import json
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
URL = "http://127.0.0.1:5050/"
JIMMY, CARMEN, SAMUEL, MONICA = 1820964964584464, 1745516346752422, 1973806351557672, 659152200893066
LUZ, LUCIANO = 3444168654859275, 3020371856951898
DEYBY, JULIOV = 316425594635431, 655650791895479
FLORES_LUYO, GUTIERREZ = 1417230581705628, 2497184571018067
BIO = "Departamento de Bioingeniería e Ingeniería Química"
HUM = "Departamento de Humanidades, Artes y Ciencias Sociales"
FIS = "Departamento de Física"
NEG = "Departamento de Negocios Digitales"
log = {}


def settle(page, ms=900):
    page.wait_for_function("!window.d3.active(document.querySelector('#network-svg'))")
    page.wait_for_timeout(ms)


def shot(page, name, clip=None, full=True):
    path = OUT / f"{name}.png"
    page.screenshot(path=str(path), clip=clip)
    print("saved", path.name)


def panel(page, name):
    page.locator("#inspector-panel").screenshot(path=str(OUT / f"{name}.png"))
    # Versión completa: el panel se expande temporalmente para que no corte el contenido.
    page.evaluate("""() => { const p=document.querySelector('#inspector-panel'); p.dataset.h=p.style.height; p.dataset.mh=p.style.maxHeight;
        p.style.height='auto'; p.style.bottom='auto'; p.style.maxHeight='none'; p.style.overflow='visible'; const i=document.querySelector('#inspector'); i.style.height='auto'; i.style.overflow='visible'; }""")
    page.wait_for_timeout(150)
    page.locator("#inspector-panel").screenshot(path=str(OUT / f"{name}-completo.png"))
    page.evaluate("""() => { const p=document.querySelector('#inspector-panel'); p.style.height=p.dataset.h; p.style.bottom=''; p.style.maxHeight=p.dataset.mh; p.style.overflow=''; const i=document.querySelector('#inspector'); i.style.height=''; i.style.overflow=''; }""")
    print("saved", name)


def node_box(page, id):
    return page.locator(f'g.node[data-id="{id}"] .node-core').bounding_box()


def region(page, name, id, pad=260):
    b = node_box(page, id)
    cx, cy = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    x0, y0 = max(0, cx - pad), max(0, cy - pad * 0.62)
    w, h = min(1440 - x0, pad * 2.2), min(900 - y0, pad * 1.35)
    shot(page, name, clip={"x": x0, "y": y0, "width": w, "height": h})


def set_range(page, sel, value):
    page.locator(sel).evaluate(f"el => {{el.value={value}; el.dispatchEvent(new Event('input'));}}")


def hover_node(page, id):
    page.locator(f'g.node[data-id="{id}"] .node-core').hover()
    page.wait_for_timeout(250)


def unhover(page):
    page.mouse.move(700, 60)
    page.wait_for_timeout(200)


def search_select(page, text):
    page.locator("#search").fill(text)
    page.wait_for_timeout(300)
    page.locator("#search").press("Enter")
    page.wait_for_selector(".avatar")
    page.wait_for_timeout(500)
    settle(page, 500)


def click_pair(page, a, b, kind="observed"):
    ok = page.evaluate(
        """([a,b,kind]) => {
        const el=[...document.querySelectorAll('.'+kind+'-hit')].find(e=>{const d=e.__data__;return (d.source===a&&d.target===b)||(d.source===b&&d.target===a);});
        if(!el) return false; el.dispatchEvent(new MouseEvent('click',{bubbles:true})); return true;}""",
        [a, b, kind],
    )
    assert ok, (a, b, kind)
    page.wait_for_function("document.querySelector('#inspector .loading-placeholder')===null")
    page.wait_for_timeout(400)


def legend_open(page):
    page.locator(".color-legend").evaluate("el => { el.open = true; }")
    page.wait_for_timeout(150)


def legend_close(page):
    page.locator(".color-legend").evaluate("el => { el.open = false; }")
    page.wait_for_timeout(100)


def task(page, name):
    page.locator(f'[data-task="{name}"]').evaluate("el => el.click()")


def department(page, name):
    legend_open(page)
    page.locator(f'.legend-item[data-category="{name}"]').evaluate("el => el.click()")
    settle(page, 700)


def reset(page):
    page.keyboard.press("Escape")
    page.locator("#reset").click()
    task(page, "collaborators")
    settle(page, 700)
    legend_close(page)


def rank_of(page, a, b):
    return page.evaluate(
        "([a,b]) => window.utecvis.top.ranked.findIndex(p=>(p.source===a&&p.target===b)||(p.source===b&&p.target===a))+1",
        [a, b],
    )


def suggestions(page, on):
    current = page.locator("#prediction-toggle").get_attribute("aria-checked") == "true"
    if current != on:
        page.locator("#prediction-toggle").click()
        page.wait_for_timeout(500)
        settle(page, 500)
    if on:
        page.locator("#criteria-options").evaluate("el => { el.open = true; }")


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, locale="es-PE")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(URL, wait_until="networkidle")
    page.wait_for_function("window.utecvis && window.utecvis.top.eligible === 5283")
    settle(page, 1200)
    legend_open(page)

    # C09 panorama
    shot(page, "C09-panorama-colaboradores")
    legend_open(page)
    region(page, "C09b-zoom-bloques", JIMMY, pad=420)

    # C24 hover nodo (tooltip) y foco
    hover_node(page, JIMMY)
    shot(page, "C24a-hover-jimmy-tooltip")
    region(page, "C24b-hover-jimmy-recorte", JIMMY, pad=330)
    unhover(page)

    # Búsqueda
    page.locator("#search").fill("Tarrillo")
    page.wait_for_timeout(400)
    shot(page, "C18x-busqueda-desplegable", clip={"x": 0, "y": 0, "width": 760, "height": 260})
    page.locator("#search").press("Enter")
    page.wait_for_selector(".avatar")
    page.wait_for_timeout(500)
    settle(page, 500)
    # C11 Jimmy
    shot(page, "C11-jimmy-colaboradores")
    panel(page, "C11b-jimmy-detalle")
    region(page, "C11c-jimmy-recorte", JIMMY, pad=330)
    # C12 Carmen
    search_select(page, "Flores Barreda")
    shot(page, "C12-carmen-colaboradores")
    panel(page, "C12b-carmen-detalle")
    # C10 pareja Carmen–Samuel
    click_pair(page, CARMEN, SAMUEL, "observed")
    shot(page, "C10-pareja-carmen-samuel")
    panel(page, "C10b-pareja-carmen-samuel-detalle")
    # hover arista observada (C24)
    page.keyboard.press("Escape")
    settle(page, 300)
    pt = page.evaluate(
        """([a,b]) => { const el=[...document.querySelectorAll('.observed-hit')].find(e=>{const d=e.__data__;return (d.source===a&&d.target===b)||(d.source===b&&d.target===a);});
        const p=el.getPointAtLength(el.getTotalLength()*0.5).matrixTransform(el.getScreenCTM()); return {x:p.x,y:p.y}; }""",
        [CARMEN, SAMUEL],
    )
    page.mouse.move(pt["x"], pt["y"])
    page.wait_for_timeout(300)
    shot(page, "C24c-hover-arista-carmen-samuel")
    shot(page, "C24d-hover-arista-recorte", clip={"x": max(0, pt["x"] - 330), "y": max(0, pt["y"] - 200), "width": 700, "height": 420})
    unhover(page)

    # Enter sobre un nodo (teclado)
    page.locator(f'g.node[data-id="{MONICA}"]').focus()
    page.keyboard.press("Enter")
    page.wait_for_selector(".avatar")
    page.wait_for_timeout(600)
    shot(page, "C24e-enter-monica")
    page.keyboard.press("Escape")

    # C13 Puentes
    reset(page)
    task(page, "bridges")
    settle(page, 900)
    legend_open(page)
    shot(page, "C13-puentes-observada")
    hover_node(page, JIMMY)
    shot(page, "C14a-puentes-jimmy-foco")
    region(page, "C14b-puentes-jimmy-recorte", JIMMY, pad=360)
    unhover(page)
    search_select(page, "Tarrillo")
    panel(page, "C14c-jimmy-detalle-puentes")
    shot(page, "C14d-puentes-jimmy-seleccionado")
    search_select(page, "Santa-Maria")
    shot(page, "C14e-puentes-monica-seleccionada")
    panel(page, "C14f-monica-detalle")
    page.keyboard.press("Escape")

    # C15 filtro departamento + zoom
    reset(page)
    department(page, BIO)
    shot(page, "C15a-filtro-bioingenieria")
    page.locator("#zoom-in").evaluate("el => el.click()")
    settle(page, 500)
    shot(page, "C15b-filtro-bioingenieria-zoom")
    search_select(page, "Flores Barreda")
    page.locator("#neighbors-only").click()
    settle(page, 700)
    shot(page, "C15c-solo-conexiones-carmen")
    page.keyboard.press("Escape")

    # C21 departamentos desconectados e integrado
    for key, name in [(HUM, "humanidades"), (FIS, "fisica"), (NEG, "negocios-digitales"), (BIO, "bioingenieria")]:
        reset(page)
        department(page, key)
        shot(page, f"C21-{name}")
    reset(page)
    legend_open(page)
    page.locator(f'.legend-item[data-category="{HUM}"]').hover()
    page.wait_for_timeout(300)
    shot(page, "C21-hover-leyenda-humanidades")
    unhover(page)

    # C19 Top 0/1/5 en Colaboradores
    reset(page)
    suggestions(page, True)
    for pct in (0, 1, 5):
        set_range(page, "#top-percent", pct)
        settle(page, 900)
        shot(page, f"C19-top{pct}-colaboradores")
    set_range(page, "#top-percent", 1)
    settle(page, 500)
    shot(page, "C19-controles", clip={"x": 0, "y": 60, "width": 420, "height": 520})

    # C17 pareja con camino (R>0) y C16 pareja BIO / DADS
    with_path = page.evaluate(
        "() => window.utecvis.top.display.find(p => p.structural > 0) || null"
    )
    log["with_path"] = with_path
    if with_path:
        click_pair(page, with_path["source"], with_path["target"], "prediction")
        shot(page, "C17a-pareja-con-camino")
        panel(page, "C17b-pareja-con-camino-detalle")
        page.keyboard.press("Escape")
    log["rank_deyby_juliov"] = rank_of(page, DEYBY, JULIOV)
    log["rank_dads"] = rank_of(page, FLORES_LUYO, GUTIERREZ)
    log["rank_luz"] = rank_of(page, LUZ, LUCIANO)
    log["rank_cerda"] = rank_of(page, 204309335274068, 349372305644751)
    for a, b, name, rank in [
        (DEYBY, JULIOV, "C16-pareja-bio-deyby-juliov", log["rank_deyby_juliov"]),
        (FLORES_LUYO, GUTIERREZ, "C16-pareja-dads", log["rank_dads"]),
    ]:
        pct = (rank / 5283) * 100 + 0.1
        print("rank", name, rank, round(pct, 2))
        if rank and pct <= 5:
            set_range(page, "#top-percent", round(pct, 1))
            settle(page, 800)
            click_pair(page, a, b, "prediction")
            shot(page, name)
            panel(page, name + "-detalle")
            page.keyboard.press("Escape")

    # C22 Luz–Luciano en Top 2 %
    set_range(page, "#top-percent", 2)
    settle(page, 900)
    search_select(page, "Adanaque")
    shot(page, "C22a-luz-top2-perfil")
    panel(page, "C22b-luz-detalle")
    click_pair(page, LUZ, LUCIANO, "prediction")
    shot(page, "C22c-luz-luciano-top2")
    panel(page, "C22d-luz-luciano-detalle")
    region(page, "C22e-luz-luciano-recorte", LUZ, pad=330)
    # C23 misma pareja con otros pesos
    set_range(page, "#weight-thematic", 100)
    page.wait_for_timeout(600)
    settle(page, 500)
    panel(page, "C23a-luz-luciano-tematica100")
    shot(page, "C23a-luz-luciano-tematica100-pantalla")
    set_range(page, "#weight-thematic", 60)
    page.wait_for_timeout(300)
    set_range(page, "#weight-institutional", 100)
    page.wait_for_timeout(600)
    settle(page, 500)
    panel(page, "C23b-luz-luciano-institucion100")
    shot(page, "C23b-luz-luciano-institucion100-pantalla")
    page.keyboard.press("Escape")

    # C20 Top 0/1/5 en Puentes con sugerencias (B simulada)
    reset(page)
    task(page, "bridges")
    settle(page, 900)
    suggestions(page, True)
    for pct in (0, 1, 5):
        set_range(page, "#top-percent", pct)
        page.wait_for_function("!window.utecvis.simulatedBridges.pending")
        settle(page, 900)
        hover_node(page, JIMMY)
        shot(page, f"C20-top{pct}-puentes-jimmy")
        unhover(page)
        sb = page.evaluate("() => ({max: window.utecvis.simulatedBridges.maximum, jimmy: window.utecvis.simulatedBridges.values && new Map(window.utecvis.simulatedBridges.values).get(%d), radius: document.querySelector('g.node[data-id=\"%d\"] .node-core').getAttribute('r'), edges: document.querySelectorAll('.predicted-edge').length})" % (JIMMY, JIMMY))
        log[f"bridges_top{pct}"] = sb
    search_select(page, "Tarrillo")
    panel(page, "C20-jimmy-detalle-simulada")
    page.keyboard.press("Escape")

    # Diálogo de método
    reset(page)
    page.locator("#method-open").click()
    page.wait_for_timeout(500)
    shot(page, "C25-dialogo-como-interpretar")
    page.locator("#method-close").click()

    # Arrastre a mitad de camino
    reset(page)
    b = node_box(page, JIMMY)
    cx, cy = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx + 120, cy + 60, steps=10)
    page.wait_for_timeout(250)
    shot(page, "C24f-arrastre-jimmy")
    page.mouse.up()
    settle(page, 500)

    log["errors"] = errors
    (OUT / "captura-log.json").write_text(json.dumps(log, ensure_ascii=False, indent=2))
    print(json.dumps(log, ensure_ascii=False, indent=1))
    browser.close()

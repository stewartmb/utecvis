"""Recortes legibles de secciones de CRIS: intereses, huella y cabeceras de fichas."""
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright

OUT = Path("/Users/renzoa/Desktop/Tarea_Viz/utecvis/presentacion/evidencias/cris")

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2, locale="es-PE")
    pg = ctx.new_page()

    def section(url, needle, name, height):
        r = pg.goto(url, wait_until="domcontentloaded", timeout=45000)
        if r.status != 200:
            print("BLOCKED", name); return
        pg.wait_for_timeout(1200)
        box = pg.evaluate("""(needle) => {
            const els=[...document.querySelectorAll('h2,h3,h4,.title,.rendering_person_heading,strong,span')];
            const el=els.find(e=>e.textContent.trim().toLowerCase().startsWith(needle));
            if(!el) return null; el.scrollIntoView({block:'start'}); window.scrollBy(0,-20);
            const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};}""", needle)
        print(name, box)
        pg.wait_for_timeout(500)
        y = max(0, (box["y"] if box else 0) - 10)
        pg.screenshot(path=str(OUT / f"{name}.png"), clip={"x": 200, "y": y, "width": 1050, "height": height})

    section("https://cris.utec.edu.pe/es/persons/jimmy-tarrillo-olano/", "temas de inter", "C03-intereses-jimmy", 330)
    section("https://cris.utec.edu.pe/es/persons/jimmy-tarrillo-olano/fingerprints/", "huella digital", "C04-huella-jimmy-conceptos", 620)
    b.close()

# recortes de cabecera a partir de capturas ya tomadas (css px 200..1300 x 400..880 → x2)
for src, name in [("C06-publicacion-stipa-obtusa", "C06-cabecera"), ("C07-proyecto-fibrocemento", "C07-cabecera"),
                  ("C08-publicacion-guillain-barre", "C08-cabecera"), ("C18-publicacion-lhcb", "C18-cabecera"),
                  ("C02-perfil-jimmy", "C02-cabecera"), ("C05-perfil-deyby", "C05-deyby-cabecera"),
                  ("C05-perfil-julio-valdivia", "C05-julio-cabecera"), ("C05-perfil-flores-luyo", "C05-flores-luyo-cabecera"),
                  ("C05-perfil-gutierrez-alva", "C05-gutierrez-cabecera")]:
    im = Image.open(OUT / f"{src}.png")
    im.crop((400, 780, 2640, 1760)).save(OUT / f"{name}.png")
    print("crop", name)

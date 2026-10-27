// Generador del PPTX de UTECVis a partir de PRESENTACIONES.md
const pptxgen = require("pptxgenjs");
const fs = require("fs");
const path = require("path");
// apply_theme.js: módulo que escribe los colores del tema en el PPTX (variable APPLY_THEME con su ruta).
const { applyTheme } = require(process.env.APPLY_THEME);

const REPO = "/Users/renzoa/Desktop/Tarea_Viz/utecvis";
const EV = path.join(REPO, "presentacion/evidencias");
const APP = (n) => path.join(EV, "app", n);
const CRIS = (n) => path.join(EV, "cris", n);
const HIST = (n) => path.join(EV, n);
const OUT = path.join(REPO, "presentacion/UTECVis-presentacion.pptx");
const IMG = path.join(__dirname, "img");
const jpg = (f) => f.replace(EV, IMG).replace(/\.png$/, ".jpg");

const THEME = {
  name: "UTECVis",
  headFontFace: "Arial",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "173D43", // tinta: verde azulado profundo de la app
    lt1: "FFFFFF",
    dk2: "4A5E62", // texto secundario
    lt2: "EEF4F2", // fondo de tarjetas
    accent1: "1F7A6D", // registrado / primario
    accent2: "7A4FBF", // sugerido (violeta)
    accent3: "C08A3E", // institución (ámbar)
    accent4: "9AD9BD", // menta del logotipo
    accent5: "C0564D", // alerta / límites
    accent6: "8A9A9D", // gris neutro
    hlink: "1F7A6D",
    folHlink: "7A4FBF",
  },
};

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "UTECVis: colaboración académica y afinidades";
pres.author = "Equipo UTECVis";
pres.subject = "DS5343 Visualización de Datos";
const C = pres.SchemeColor;
const W = 13.333, H = 7.5, M = 0.6;

// ---------- layouts ----------
pres.defineSlideMaster({
  title: "DARK",
  background: { color: THEME.colors.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 2.2, w: 7.2, h: 2.0, fontSize: 40, bold: true, color: C.background1, align: "left", valign: "bottom", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 4.4, w: W - 2 * M, h: 1.2, fontSize: 20, color: C.accent4, align: "left", valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "DARK_TOP",
  background: { color: THEME.colors.dk1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.4, w: W - 2 * M, h: 0.9, fontSize: 34, bold: true, color: C.background1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { placeholder: { options: { name: "body", type: "body", x: M, y: 1.3, w: W - 2 * M, h: 0.5, fontSize: 18, color: C.accent4, align: "left", valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({
  title: "CONTENT",
  background: { color: THEME.colors.lt1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.35, w: W - 2 * M - 0.5, h: 0.8, fontSize: 30, bold: true, color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "UTECVis · DS5343 Visualización de Datos · UTEC", options: { x: M, y: H - 0.42, w: 7, h: 0.3, fontSize: 9, color: C.accent6, margin: 0, isTextBox: true } } },
  ],
  slideNumber: { x: W - M - 0.8, y: H - 0.42, w: 0.8, h: 0.3, fontSize: 9, color: THEME.colors.accent6, align: "right" },
});
pres.defineSlideMaster({
  title: "ANNEX",
  background: { color: THEME.colors.lt2 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.35, w: W - 2 * M - 0.5, h: 0.8, fontSize: 28, bold: true, color: C.text1, align: "left", valign: "middle", margin: 0 }, text: "" } },
    { text: { text: "ANEXO · UTECVis · DS5343", options: { x: M, y: H - 0.42, w: 7, h: 0.3, fontSize: 9, color: C.accent6, margin: 0, isTextBox: true } } },
  ],
  slideNumber: { x: W - M - 0.8, y: H - 0.42, w: 0.8, h: 0.3, fontSize: 9, color: THEME.colors.accent6, align: "right" },
});

// ---------- helpers ----------
function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  // JPEG: buscar el marcador SOF
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error("Imagen no reconocida: " + file);
}
let n = 0;
function slide(layout, section, title) {
  const s = pres.addSlide({ masterName: layout, sectionTitle: section });
  n += 1;
  if (title) s.addText(title, { placeholder: "title" });
  s._k = 0;
  return s;
}
function name(s, what) { s._k += 1; return `${what} ${n}.${s._k}`; }
function text(s, t, o = {}) {
  s.addText(t, { isTextBox: true, margin: 0, fontSize: 15, color: C.text1, valign: "top", objectName: name(s, "Texto"), ...o });
}
function bullets(s, items, o = {}) {
  const runs = items.map((t, i) => (typeof t === "string" ? { text: t, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6 } } : { text: t.text, options: { bullet: true, breakLine: i < items.length - 1, paraSpaceAfter: 6, ...t.options } }));
  s.addText(runs, { isTextBox: true, margin: 0, fontSize: 15, color: C.text1, valign: "top", objectName: name(s, "Lista"), ...o });
}
// imagen ajustada dentro de una caja, centrada, con sombra suave y pie opcional
function image(s, file, x, y, w, h, caption, o = {}) {
  const { w: pw, h: ph } = pngSize(file);
  const capH = caption ? 0.5 : 0;
  const boxH = h - capH;
  const r = Math.min(w / pw, boxH / ph);
  const iw = pw * r, ih = ph * r;
  const ix = x + (w - iw) / 2, iy = y + (o.top ? 0 : (boxH - ih) / 2);
  s.addImage({ path: jpg(file), x: ix, y: iy, w: iw, h: ih, objectName: name(s, "Captura"), shadow: { type: "outer", blur: 6, offset: 2, angle: 90, color: THEME.colors.dk1, opacity: 0.18 } });
  if (caption) text(s, caption, { x, y: y + boxH + 0.08, w, h: capH - 0.08, fontSize: 11, italic: true, color: C.text2, align: o.capAlign || "center" });
  return { x: ix, y: iy, w: iw, h: ih };
}
function card(s, x, y, w, h, opts = {}) {
  s.addShape(pres.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.12, fill: { color: opts.fill || C.background2 }, line: { color: opts.line || C.background2, width: 0.75 }, objectName: name(s, "Tarjeta") });
}
function formula(s, x, y, w, h, lines, o = {}) {
  card(s, x, y, w, h, { fill: C.background1, line: C.accent4 });
  const runs = lines.map((t, i) => ({ text: t, options: { breakLine: i < lines.length - 1, paraSpaceAfter: 4 } }));
  s.addText(runs, { x: x + 0.2, y: y + 0.12, w: w - 0.4, h: h - 0.24, fontSize: o.fontSize || 16, fontFace: "Courier New", color: C.text1, valign: "middle", isTextBox: true, margin: 0, objectName: name(s, "Fórmula") });
}
function stat(s, x, y, w, value, label, color, fontSize) {
  s.addText(value, { x, y, w, h: 0.9, fontSize: fontSize || 40, bold: true, color: color || C.accent1, align: "left", isTextBox: true, margin: 0, objectName: name(s, "Cifra") });
  s.addText(label, { x, y: y + 0.9, w, h: 0.6, fontSize: 12, color: C.text2, align: "left", isTextBox: true, margin: 0, valign: "top", objectName: name(s, "Etiqueta") });
}
function table(s, rows, x, y, w, colW, o = {}) {
  const head = rows[0].map((t) => ({ text: t, options: { bold: true, color: THEME.colors.lt1, fill: { color: THEME.colors.dk1 } } }));
  const body = rows.slice(1).map((r, i) => r.map((t) => ({ text: String(t), options: { fill: { color: i % 2 ? THEME.colors.lt2 : THEME.colors.lt1 } } })));
  s.addTable([head, ...body], { x, y, w, colW, fontSize: o.fontSize || 12, color: THEME.colors.dk1, border: { type: "solid", color: "D5DFDD", pt: 0.5 }, valign: "middle", margin: 0.06, objectName: name(s, "Tabla"), ...(o.extra || {}) });
}
function tag(s, x, y, w, t, color) {
  s.addText(t, { x, y, w, h: 0.32, fontSize: 10, bold: true, color: C.background1, fill: { color: color || C.accent1 }, align: "center", valign: "middle", isTextBox: true, margin: 0.03, objectName: name(s, "Rótulo") });
}
function notes(s, t) { s.addNotes(t.trim().replace(/\n\s+/g, "\n")); }
function circle(s, x, y, d, label, fill) {
  s.addShape(pres.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: fill || C.accent1 }, line: { color: C.background1, width: 1.5 }, objectName: name(s, "Nodo") });
  s.addText(label, { x, y, w: d, h: d, fontSize: 12, bold: true, color: C.background1, align: "center", valign: "middle", isTextBox: true, margin: 0, objectName: name(s, "Letra") });
}
function line(s, x1, y1, x2, y2, color, dash, width) {
  s.addShape(pres.ShapeType.line, { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1) || 0.01, h: Math.abs(y2 - y1) || 0.01, flipH: (x2 < x1) !== (y2 < y1), line: { color: color || C.accent6, width: width || 2, dashType: dash || "solid" }, objectName: name(s, "Línea") });
}

// =====================================================================
pres.addSection({ title: "Apertura" });
// 01 Portada
{
  const s = slide("DARK", "Apertura", "UTECVis: colaboración académica y afinidades");
  s.addText("Red de 104 investigadores de UTEC, 73 vínculos registrados y sugerencias explicadas", { placeholder: "body" });
  text(s, "DS5343 · Visualización de Datos · Prof. Germain García-Zanabria · 2026-2\nIntegrantes: [completar nombres]  ·  Fecha de exposición: [completar]", { x: M, y: 6.3, w: 8, h: 0.8, fontSize: 13, color: C.accent6 });
  image(s, APP("C09b-zoom-bloques.png"), 8.1, 0.6, 4.6, 3.2, null);
  notes(s, `
    Abrimos con la vista final de la aplicación (captura C09b, recorte de la app actual, no un prototipo).
    UTECVis permite explorar colaboraciones registradas y afinidades entre 104 investigadores de la cohorte extraída de CRIS UTEC.
    Límite de la cohorte: la red representa solo las conexiones identificadas dentro de estos 104 perfiles; no es toda la actividad de UTEC ni su colaboración mundial.
    No explicamos arquitectura aquí. Completar integrantes y fecha antes de exponer.`);
}
// 02 Problema, audiencia y cohorte
{
  const s = slide("CONTENT", "Apertura", "El problema, la audiencia y la cohorte");
  stat(s, M, 1.4, 2.6, "104", "investigadores: una persona de la cohorte por nodo");
  stat(s, M, 3.0, 2.6, "73", "vínculos registrados: parejas únicas, no 73 publicaciones");
  stat(s, M, 4.6, 2.6, "2.474", "publicaciones del catálogo; no todas crean aristas internas", C.text2);
  text(s, "Problema", { x: 3.5, y: 1.3, w: 4.2, h: 0.35, fontSize: 12, bold: true, color: C.accent1 });
  bullets(s, [
    "Las colaboraciones están dispersas en perfiles individuales de CRIS: nadie las ve juntas.",
    "La red representa la evidencia publicada dentro de la cohorte, no toda la actividad de UTEC.",
  ], { x: 3.5, y: 1.65, w: 4.2, h: 1.9, fontSize: 13 });
  text(s, "Audiencia", { x: 3.5, y: 3.6, w: 4.2, h: 0.35, fontSize: 12, bold: true, color: C.accent1 });
  bullets(s, [
    "Investigadores de UTEC que buscan coautores o quieren ubicar su posición en la red.",
    "Responsables de departamentos y de gestión de la investigación que evalúan la integración entre áreas.",
    "No requiere conocer teoría de redes: cada métrica se lee con su leyenda y su detalle.",
  ], { x: 3.5, y: 3.95, w: 4.2, h: 2.5, fontSize: 13 });
  image(s, APP("C09-panorama-colaboradores.png"), 7.9, 1.3, 4.9, 5.3, "C09 · Panorama de colaboraciones registradas: 104 personas, 73 registradas, sin sugerencias");
  notes(s, `
    Diferenciar 73 parejas de 2.474 publicaciones: una publicación con tres profesores internos genera tres parejas; muchas publicaciones solo tienen un autor de la cohorte y no generan aristas.
    57 de los 104 perfiles no tienen conexiones registradas dentro de la cohorte; eso no significa que no colaboren fuera.
    Audiencia: la herramienta está pensada para quien quiere encontrar colaboradores o evaluar la integración entre departamentos; el público de la exposición es el curso, y la demo no presupone teoría de redes.
    Fuente: directorio de personas de CRIS UTEC, instantánea local incluida en el repositorio.`);
}
// 03 Cuatro tareas
{
  const s = slide("CONTENT", "Apertura", "Cuatro tareas analíticas: qué queremos descubrir");
  const tasks = [
    ["T1", "¿Qué investigadores tienen más colaboradores?", "El tamaño en Colaboradores localiza a los más conectados; el detalle confirma cuántas personas y trabajos comparten.", "Grado k, trabajos compartidos W; foco y detalle", APP("C11c-jimmy-recorte.png")],
    ["T2", "¿Qué investigadores actúan como puentes y cuáles conectan distintos departamentos?", "Puentes dimensiona por intermediación; el resaltado de vecinos comprueba si además enlazan departamentos.", "Intermediación B; vecinos y afiliaciones", APP("C14b-puentes-jimmy-recorte.png")],
    ["T3", "¿Cómo se distribuyen las colaboraciones dentro y entre departamentos, y cuáles no presentan conexiones registradas?", "El treemap identifica cada departamento; el filtro de la leyenda sigue sus conexiones internas y externas.", "Treemap, color y filtro; tamaño del departamento", APP("C21-bioingenieria.png")],
    ["T4", "¿Qué parejas sin colaboración registrada destacan como posibles colaboradoras según los criterios seleccionados?", "Las sugerencias muestran candidatas y permiten compararlas por sus señales.", "Top %, pesos T/I/R, coincidencias; B simulada como análisis complementario", APP("C22e-luz-luciano-recorte.png")],
  ];
  tasks.forEach((t, i) => {
    const x = M + i * 3.07, y = 1.3, w = 2.9;
    card(s, x, y, w, 5.5);
    tag(s, x + 0.15, y + 0.15, 0.6, t[0], i % 2 ? C.accent2 : C.accent1);
    text(s, t[1], { x: x + 0.15, y: y + 0.5, w: w - 0.3, h: 1.3, fontSize: 12.5, bold: true, valign: "top" });
    text(s, t[2], { x: x + 0.15, y: y + 1.8, w: w - 0.3, h: 0.85, fontSize: 10, color: C.text2, valign: "top" });
    text(s, "Recursos: " + t[3], { x: x + 0.15, y: y + 2.65, w: w - 0.3, h: 0.55, fontSize: 9.5, italic: true, color: C.accent1, valign: "top" });
    image(s, t[4], x + 0.15, y + 3.2, w - 0.3, 2.15, null);
  });
  notes(s, `
    Las tareas expresan qué queremos descubrir; debajo va cómo la vista ayuda y qué recursos (Top %, pesos, B simulada) sirven para resolverlas. Un control no es una tarea.
    Seguimos la separación de Brehmer y Munzner: propósito analítico, datos y acciones, representación e interacción.
    T2: mantener ambas evidencias; una intermediación alta no garantiza que la persona conecte departamentos distintos.
    T3: no concluir que un departamento colabora "mejor" solo por tener más aristas; influye cuántos investigadores contiene.
    T4: el cambio de intermediación al añadir sugerencias es un análisis complementario, no parte del enunciado.
    Las subpreguntas sobre un departamento, un aislado o un puente particular pertenecen a estas cuatro tareas.
    Los cuatro recortes son de la app actual: C11c, C14b, C21 y C22e.`);
}

// =====================================================================
pres.addSection({ title: "Datos y transformación" });
// 04 Fuente pública: CRIS
{
  const s = slide("CONTENT", "Datos y transformación", "Fuente pública: CRIS UTEC");
  image(s, CRIS("C02-perfil-jimmy.png"), M, 1.3, 7.4, 5.3, "C02 · cris.utec.edu.pe/es/persons/jimmy-tarrillo-olano/ · capturado el 27-10-2026 · identidad y pertenencias publicadas");
  bullets(s, [
    "Directorio de personas, perfiles, listados de publicaciones y proyectos, huellas temáticas.",
    "Scraping propio de HTML público; sesión admitida de Safari cuando el acceso directo quedó bloqueado.",
    "Instantánea local: las cifras describen los datos incluidos, no una consulta en tiempo real.",
    "Rutas del perfil: Información general → Huella digital → Proyectos → Publicaciones.",
    { text: "No usamos el JSON reducido del profesor como sustituto de nuestra extracción; lo cruzamos y documentamos.", options: { color: C.accent5 } },
  ], { x: 8.3, y: 1.3, w: 4.5, h: 5.3, fontSize: 13 });
  notes(s, `
    Fuente: https://cris.utec.edu.pe/es/persons/. Explicar el acceso solo como contexto de adquisición.
    Pendiente: la captura C01 del directorio no pudo tomarse en modo automatizado porque el directorio exige una verificación de navegador (Cloudflare); se muestra en vivo o se añade la captura manual antes de exponer.
    La extracción completa necesita el entorno descrito en el README (macOS, Safari); la app entregada funciona con datos locales sin scraping ni modelo durante la exposición.
    No afirmar que el scraper funciona en cualquier PC con solo abrir un navegador.`);
}
// 05 Identidad, departamento y pertenencias
{
  const s = slide("CONTENT", "Datos y transformación", "Identidad, departamento y pertenencias");
  image(s, CRIS("C02-cabecera.png"), M, 1.3, 6.2, 3.1, "Publicado en CRIS: nombre, foto, SERMIC (coordinador), departamento, ORCID");
  table(s, [
    ["Campo nuestro", "Dónde se encontró", "Ejemplo (Jimmy)"],
    ["name, source_url, foto", "Cabecera del perfil", "Jimmy Tarrillo Olano"],
    ["id (interno)", "SHA-256 de la URL canónica", "1820964964584464"],
    ["department", "Afiliaciones de la cabecera", "Ing. Electrónica y Mecatrónica"],
    ["affiliations[].type", "Clasificación interna por nombre", "SERMIC → research_group"],
    ["organisation_id", "Derivado de la URL de la organización", "Comparación por identidad, no por texto"],
  ], M, 4.6, 6.2, [1.7, 2.3, 2.2], { fontSize: 10 });
  bullets(s, [
    "El id es nuestro, estable mientras la URL no cambie; no es un ProfessorID oficial de CRIS ni un orden de importancia.",
    "Primer departamento reconocido → color y bloque del treemap. Las demás pertenencias se conservan.",
    "Grupo, centro/instituto y departamento son tipos de organización clasificados por nosotros; CRIS los muestra en una misma lista.",
    "Las URLs de origen se conservan en cada registro para poder verificar.",
  ], { x: 7.1, y: 1.3, w: 5.7, h: 5.3, fontSize: 13 });
  notes(s, `
    Leyendas: “publicado en CRIS” frente a “clasificación interna”.
    source_classes conserva las marcas del HTML (researchgroup, center); ASRI puede tener clase center y nombre de instituto.
    No unimos personas por nombres parecidos: la identidad es la URL normalizada.`);
}
// 06 Intereses y huellas
{
  const s = slide("CONTENT", "Datos y transformación", "Intereses declarados y huellas temáticas");
  image(s, CRIS("C03-intereses-jimmy.png"), M, 1.3, 5.9, 4.2, "C03 · Perfil de Jimmy, sección “Temas de Interés de Investigación”: líneas declaradas por el investigador", { top: true });
  image(s, CRIS("C04-huella-jimmy-conceptos.png"), 6.85, 1.3, 5.9, 4.2, "C04 · Huella digital de Jimmy: conceptos ordenados por ponderación; el peso es relevancia, no número de publicaciones", { top: true });
  card(s, M, 5.85, 12.1, 0.95);
  text(s, [
    { text: "Intereses (research_areas): ", options: { bold: true } },
    { text: "“Tolerancia a fallos en FPGAs”, “sistemas reconfigurables”, “sistemas embebidos”…   ", options: {} },
    { text: "Huella (fingerprint): ", options: { bold: true, color: C.accent1 } },
    { text: "Field Programmable Gate Array (1,00), Soft Error (0,47), Embedded System (0,43). Dos fuentes complementarias que preparan la señal temática T; no crean coautorías ni prueban colaboración.", options: {} },
  ], { x: M + 0.2, y: 5.95, w: 11.7, h: 0.8, fontSize: 12 });
  notes(s, `
    Una fuente declara líneas de interés; la otra resume conceptos de investigación calculados por CRIS a partir de la producción.
    Cobertura: 90 perfiles con intereses, 80 con huella; cinco usan biografía como respaldo.
    Los pesos de huella vienen de CRIS (data-rank-value); nosotros solo seleccionamos hasta 20 conceptos por relevancia.
    Capturas tomadas el 27-10-2026 desde las URL del perfil y de /fingerprints/.`);
}
// 07 Publicaciones, proyectos y autores fuera de cohorte
{
  const s = slide("CONTENT", "Datos y transformación", "Publicaciones, proyectos y autores fuera de la cohorte");
  image(s, CRIS("C06-cabecera.png"), M, 1.3, 4.0, 3.0, "C06 · Publicación con DOI 10.1016/j.compositesa.2020.105950: Carmen Elena Flores y Samuel Charca como autores individuales (también José Luis Mantari, interno)", { top: true });
  image(s, CRIS("C07-cabecera.png"), 4.75, 1.3, 4.0, 3.0, "C07 · Proyecto FONDECYT de paneles de fibrocemento: Carmen (investigadora principal) y Samuel (coinvestigador)", { top: true });
  image(s, CRIS("C08-cabecera.png"), 8.9, 1.3, 3.9, 3.0, "C08 · Guillain–Barré (DOI 10.1002/mgg3.960): Julio Valdivia-Silva y Heinner Guio son nodos; Jaramillo-Valverde, Levano y otros quedan como contexto", { top: true });
  bullets(s, [
    "Arista = coautoría individual reconocida por URL CRIS/ORCID o participación publicada en un mismo proyecto.",
    "Una publicación puede tener muchos autores, pero solo los internos identificados crean nodos y parejas.",
    "faculty_id nulo = fuera de la cohorte o no identificado; no demuestra afiliación externa.",
    "Los externos se conservan en el registro: no se eliminan de la publicación, pero no aumentan grado, B ni R.",
  ], { x: M, y: 5.0, w: 12.1, h: 1.9, fontSize: 13 });
  notes(s, `
    Evidencia de arista (C06), de participación en proyecto (C07) y límite de cohorte (C08).
    Verificado en data/publications.json: la publicación de Stipa obtusa lista a Sergio Candiotti (externo), José Luis Mantari, Carmen Elena Flores y Samuel Charca; los tres últimos tienen faculty_id.
    La red de coautores del propio portal CRIS puede incluir otras personas y reglas; no esperar que su número coincida con nuestro grado.`);
}
// 08 Transformación con trazabilidad
{
  const s = slide("CONTENT", "Datos y transformación", "Transformación con trazabilidad, sin código");
  const steps = ["Páginas públicas", "Identidad y campos", "Trabajos deduplicados", "Parejas con evidencia", "Métricas y afinidades", "Visualización"];
  steps.forEach((t, i) => {
    const x = M + i * 2.05;
    s.addShape(pres.ShapeType.chevron, { x, y: 1.35, w: 1.95, h: 0.9, fill: { color: i % 2 ? C.accent2 : C.accent1 }, line: { color: C.background1, width: 0.5 }, objectName: name(s, "Paso") });
    text(s, t, { x: x + 0.5, y: 1.35, w: 1.15, h: 0.9, fontSize: 10, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  bullets(s, [
    "Normalizar enlaces; una identidad estable por persona (URL), nunca por nombres parecidos.",
    "Normalizar Unicode y espacios; distinguir ausencia (null) de cero.",
    "Clasificar afiliaciones sin sumar varias veces coincidencias relacionadas.",
    "Unificar publicaciones por DOI y, si falta, por URL; proyectos por URL.",
    "Reconocer participantes internos por enlaces explícitos u ORCID; excluir roles de editor, traductor o compilador.",
    "Un trabajo con A, B y C produce A–B, A–C y B–C: tres parejas, no tres trabajos.",
    "Métricas solo sobre las 73 aristas registradas; T/I/R preparadas por pareja; B simulada aparte.",
  ], { x: M, y: 2.5, w: 6.3, h: 4.3, fontSize: 13 });
  table(s, [
    ["Archivo", "Qué contiene"],
    ["network.json", "Nodos, aristas, pesos, evidencia y métricas observadas"],
    ["publications.json", "2.474 trabajos con autores internos y externos, DOI y origen"],
    ["projects.json", "129 proyectos con participantes y fuente"],
    ["organisations.json", "31 organizaciones, tipo y miembros"],
    ["analysis.json", "Componentes, comunidades y señales T/I/R con metodología"],
  ], 7.2, 2.5, 5.6, [1.7, 3.9], { fontSize: 11 });
  card(s, 7.2, 5.3, 5.6, 1.5);
  text(s, [
    { text: "Ejemplo de deduplicación: ", options: { bold: true } },
    { text: "la publicación de Stipa obtusa aparece en los listados de Carmen, Samuel y Mantari; por su DOI se guarda una sola vez (publication:doi:10.1016/j.compositesa.2020.105950) y genera las parejas Carmen–Samuel, Carmen–Mantari y Samuel–Mantari.", options: {} },
  ], { x: 7.4, y: 5.4, w: 5.2, h: 1.3, fontSize: 11 });
  notes(s, `
    Flujo conceptual: páginas públicas → identidad y campos → trabajos deduplicados → parejas con evidencia → métricas y afinidades → visualización.
    Cinco JSON finales, sin carpetas por ejecución. Publicaciones y proyectos contienen contexto que no necesariamente aparece como arista.
    Un hash SHA-256 de network.json guardado en analysis.json permite detectar recomendaciones desactualizadas.`);
}
// 09 Qué cuenta como una conexión
{
  const s = slide("CONTENT", "Datos y transformación", "Qué cuenta como una conexión (F01)");
  formula(s, M, 1.3, 6.3, 1.5, ["w_AB = publicaciones individuales compartidas", "       + proyectos compartidos", "Carmen–Samuel: 6 + 2 = 8"], { fontSize: 15 });
  bullets(s, [
    "A y B son profesores; w cuenta trabajos distintos por pareja, no personas. Hay arista si w > 0 bajo las reglas de evidencia.",
    "35 parejas tienen coautoría, 51 comparten proyecto, 13 tienen ambas: 35 + 51 − 13 = 73 (no son conjuntos disjuntos).",
    "Compartir departamento o grupo no crea arista: alimenta la señal institucional I.",
    { text: "Autoría colectiva excluida: “The LHCb collaboration” (DOI 10.1007/jhep01(2022)036) asociaba 432 registros a perfiles sin autoría individual confirmada; se retiró del grafo, los registros se conservan.", options: { color: C.accent5 } },
  ], { x: M, y: 3.0, w: 6.3, h: 3.9, fontSize: 13 });
  image(s, APP("C10b-pareja-carmen-samuel-detalle.png"), 7.2, 1.3, 2.7, 5.5, "C10 · Pareja Carmen–Samuel: 8 trabajos, 6 coautorías + 2 proyectos");
  image(s, CRIS("C18-cabecera.png"), 10.1, 1.3, 2.7, 5.5, "C18 · Ficha con autor colectivo “The LHCb collaboration”: no es coautoría individual");
  notes(s, `
    F01 diferencia existencia y repetición del vínculo. El peso máximo actual es 8 (Carmen Flores Barreda – Samuel Charca Mamani: 6 publicaciones y 2 proyectos).
    Verificación: data/network.json, edge counts {coauthorship: 6, shared_project: 2}.
    Por qué retiramos la asociación de 432 registros: un trabajo asociado a un perfil no equivale a una relación individual comprobada; presentarla como colaboraciones personales sería falso.`);
}
// 10 Cobertura y datos ausentes
{
  const s = slide("CONTENT", "Datos y transformación", "Cobertura y datos ausentes: null ≠ 0");
  table(s, [
    ["Elemento", "Cantidad", "Precisión necesaria"],
    ["Investigadores / nodos", "104", "Una persona de la cohorte por nodo"],
    ["Conexiones registradas", "73", "Parejas únicas"],
    ["Publicaciones / proyectos", "2.474 / 129", "Registros deduplicados"],
    ["Fotos locales", "102", "Dos perfiles no publican foto"],
    ["Departamento publicado", "95", "Nueve sin departamento reconocido"],
    ["Intereses declarados", "90", "Ausencia de campo ≠ ausencia de intereses"],
    ["Huella temática", "80", "Distinta de los intereses"],
    ["Afiliaciones relevantes para I", "102", "No confundir con los 95 departamentos"],
    ["Biografía como respaldo", "5", "Solo si faltan intereses y huellas"],
    ["Conectados / aislados", "47 / 57", "Aislados dentro de esta cohorte y definición"],
    ["Componentes observados", "62", "Incluyen los 57 aislados"],
    ["Parejas posibles / candidatas", "5.356 / 5.283", "Candidatas excluye las 73 registradas"],
  ], M, 1.3, 7.3, [2.5, 1.3, 3.5], { fontSize: 11 });
  image(s, CRIS("C05-deyby-cabecera.png"), 8.3, 1.3, 4.5, 3.4, "Deyby Huamanchahua: sin intereses declarados en los datos, pero con huella y afiliaciones (BIO, RIC, INECOD)", { top: true });
  card(s, 8.3, 5.2, 4.5, 1.6);
  text(s, "Un null significa “no disponible o no reconocido”, no cero. La cobertura de las señales se declara en cada detalle de pareja (por ejemplo, 70 % si falta Institución). Que un campo falte no implica que el investigador no tenga intereses o producción.", { x: 8.5, y: 5.3, w: 4.1, h: 1.4, fontSize: 12 });
  notes(s, `
    Cantidades verificadas en data/network.json y data/analysis.json (27-10-2026).
    102 afiliaciones relevantes para I no equivale a 95 departamentos: I usa grupos, centros/institutos y departamentos estructurados.
    La biografía de respaldo (cinco perfiles) implica menor cobertura temática y se marca en los detalles.`);
}

// =====================================================================
pres.addSection({ title: "Métricas de red" });
// 11 Colaboradores y trabajos compartidos
{
  const s = slide("CONTENT", "Métricas de red", "Colaboradores y trabajos compartidos (F02)");
  formula(s, M, 1.3, 5.6, 1.7, ["k(v) = |vecinos registrados de v|", "W(v) = Σ_u w_vu", "centralidad(v) = k(v) / (N−1) = 9/103 = 0,0874"], { fontSize: 14 });
  card(s, M, 3.2, 5.6, 1.7);
  stat(s, M + 0.25, 3.3, 2.5, "k = 9 · W = 11", "Jimmy Tarrillo Olano: más colaboradores", C.accent1, 26);
  stat(s, M + 3.0, 3.3, 2.5, "k = 7 · W = 20", "Carmen Flores Barreda: más trabajos por pareja", C.accent3, 26);
  bullets(s, [
    "k responde “¿con cuántas personas?”; W responde la intensidad por parejas. Son preguntas distintas.",
    "W no es la producción total: 20 cuenta trabajos compartidos con vecinos internos, con repetición por pareja.",
    "Máximos actuales: k = 9 y W = 20. La centralidad de grado se guarda, pero no es otra vista.",
  ], { x: M, y: 5.1, w: 5.6, h: 1.8, fontSize: 12 });
  image(s, APP("C11c-jimmy-recorte.png"), 6.5, 1.3, 3.1, 5.5, "C11 · Jimmy en Colaboradores: k = 9, W = 11");
  image(s, APP("C12b-carmen-detalle.png"), 9.8, 1.3, 3.0, 5.5, "C12 · Carmen: k = 7, W = 20");
  notes(s, `
    v es un profesor; u recorre sus vecinos registrados; las barras indican cantidad de elementos.
    Consultar el dato exacto en el tooltip o el detalle; no medir círculos a ojo.
    Jimmy: grado 9, grado ponderado 11, intermediación 0,0680, nodo de articulación. Carmen: grado 7, ponderado 20, B 0,0217.`);
}
// 12 Intermediación
{
  const s = slide("CONTENT", "Métricas de red", "Intermediación: una posición de paso (F03)");
  // ejemplo didáctico
  card(s, M, 1.3, 5.2, 2.75);
  tag(s, M + 0.15, 1.4, 1.6, "EJEMPLO DIDÁCTICO", C.accent6);
  line(s, 1.25, 2.6, 2.75, 2.05, C.accent6, "solid", 2); line(s, 2.75, 2.05, 4.25, 2.6, C.accent6, "solid", 2); line(s, 1.25, 2.6, 2.75, 3.15, C.accent6, "solid", 2); line(s, 2.75, 3.15, 4.25, 2.6, C.accent6, "solid", 2);
  circle(s, 1.0, 2.35, 0.5, "s", C.accent6); circle(s, 2.5, 1.8, 0.5, "v", C.accent1); circle(s, 4.0, 2.35, 0.5, "t", C.accent6); circle(s, 2.5, 2.9, 0.5, "x", C.accent6);
  text(s, "Dos caminos mínimos entre s y t; uno pasa por v → la pareja (s,t) aporta 1/2 a B(v). Los extremos no cuentan.", { x: M + 0.15, y: 3.5, w: 4.9, h: 0.5, fontSize: 10, color: C.text2 });
  formula(s, M, 4.2, 5.2, 1.3, ["B(v) = [ Σ_{s<t; s,t≠v} σ_st(v)/σ_st ] / [(N−1)(N−2)/2]", "divisor = 103 × 102 / 2 = 5.253"], { fontSize: 13 });
  bullets(s, [
    "σ_st: caminos con menos pasos entre s y t; σ_st(v): cuántos atraviesan v. Cada arista vale un paso: no usamos frecuencia de trabajos como distancia.",
    "Parejas desconectadas aportan cero. N = 104 incluye los aislados. Rango teórico 0–1.",
    "Máximo observado: Jimmy, B = 0,0680. No significa 6,8 % de probabilidad de nada.",
  ], { x: M, y: 5.6, w: 5.2, h: 1.35, fontSize: 10 });
  image(s, APP("C13-puentes-observada.png"), 6.0, 1.3, 6.8, 3.6, "C13 · Vista Puentes, sugerencias OFF: tamaño por intermediación observada (radio = 7 + 44·√(B/B_max))", { top: true });
  image(s, APP("C14b-puentes-jimmy-recorte.png"), 6.0, 5.05, 6.8, 1.9, null);
  text(s, "C14 · Foco sobre Jimmy: vecinos en Bioingeniería, Civil, Mecánica, Electrónica y un perfil sin departamento", { x: 6.0, y: 6.95, w: 6.8, h: 0.3, fontSize: 10, italic: true, color: C.text2, align: "center" });
  notes(s, `
    Separar tres conceptos: arista puente (su retirada aumenta componentes: hay 13), nodo de articulación (hay 9) e intermediación B (posición de paso).
    B alta por sí sola no demuestra una conexión entre departamentos: hay que inspeccionar los vecinos y sus afiliaciones. Jimmy tiene 6 vecinos de otros departamentos.
    Los números del ejemplo didáctico no son datos de UTEC. Cálculo con NetworkX, weight=None.`);
}

// =====================================================================
pres.addSection({ title: "Diseño visual" });
// 13 Primera representación
{
  const s = slide("CONTENT", "Diseño visual", "Primera representación: fuerzas con contorno circular");
  image(s, HIST("01-circular-73-aristas.png"), M, 1.3, 5.2, 5.6, "E01 · Versión histórica: red depurada de 73 aristas; aislados en el contorno, conectados en el interior");
  bullets(s, [
    "Ventaja: seguir relaciones entre los 47 conectados era directo; el contorno mantenía visibles los 57 aislados.",
    "Problema: comparar pertenencias entre colores era costoso; un departamento quedaba disperso por toda la figura.",
    "Las pestañas Afinidades y Grupos y el panel de filtros de esta versión fueron retirados después.",
    { text: "El círculo no representaba comunidades ni una circunferencia estadística: era solo una regla de colocación.", options: { color: C.accent5 } },
  ], { x: 6.2, y: 1.3, w: 6.6, h: 5.5, fontSize: 14 });
  notes(s, `
    Rotular siempre como “versión histórica”. Commit de referencia: 14c8d86 (exclusión de asociaciones colectivas).
    La evolución cuenta decisiones, no una colección de interfaces viejas.`);
}
// 14 Ajustes y prueba del treemap
{
  const s = slide("CONTENT", "Diseño visual", "Ajustes de contraste y prueba del treemap");
  image(s, HIST("02-circular-contraste-tamanos.png"), M, 1.3, 4.3, 5.6, "E02 · Histórico: contraste de radios y grosores, colisiones; menús ya retirados");
  image(s, HIST("03-prueba-treemap.png"), 5.1, 1.3, 4.3, 5.6, "E03 · Histórico: primera prueba de treemap; aún con “Vista circular”, ranking y Top 10 %");
  bullets(s, [
    "Contraste insuficiente entre nodos pequeños y grandes → radio lineal con mínimo 7 y amplitud 44.",
    "Saturación de enlaces → opacidad base 0,38 y foco al pasar el cursor.",
    "Controles repetidos → un solo lugar para tamaño (junto a Colaboradores/Puentes) y la leyenda como único selector de departamento.",
    "Treemap: los bloques institucionales hacen legible la pertenencia sin perder las aristas.",
    { text: "Los menús visibles en E03 (vista circular, ranking, Top 10 %) son históricos, no la metodología vigente.", options: { color: C.accent5 } },
  ], { x: 9.7, y: 1.3, w: 3.1, h: 5.6, fontSize: 11 });
  notes(s, `
    Commits: 896ba92 (contraste y colisiones), e5ebb92 (prueba treemap), fde6afd (retirada de la vista circular), a7ecc3a (retirada del ranking global).
    Git no guarda capturas: por eso E01–E08 están en presentacion/evidencias/.`);
}
// 15 Vista final
{
  const s = slide("CONTENT", "Diseño visual", "Vista final: treemap + red de fuerzas (F06)");
  image(s, APP("C09-panorama-colaboradores.png"), M, 1.3, 8.2, 5.6, "C09 · Bloques por departamento principal; las aristas entre bloques atraviesan la figura");
  formula(s, 9.1, 1.3, 3.7, 1.5, ["área_d / área_total ≈ n_d / N_visible", "Computación: 14/104 ≈ 13,46 %"], { fontSize: 12 });
  bullets(s, [
    "Área = investigadores visibles; no mide trabajos, grado ni productividad.",
    "Idiom híbrido nodo–enlace con disposición por grupos (Group-in-a-Box, Force in a Box).",
    "Los rectángulos no son comunidades descubiertas ni aristas agregadas entre departamentos.",
    "“Sin departamento” es un bloque de información desconocida (9 perfiles).",
    "Bordes, márgenes y cabeceras consumen superficie: la proporción es aproximada.",
  ], { x: 9.1, y: 3.0, w: 3.7, h: 3.9, fontSize: 12 });
  notes(s, `
    Por qué no otra visualización: la red facilita seguir caminos y vecinos; el treemap explicita pertenencias y tamaños de departamentos; una matriz ayudaría a comparar adyacencias, pero no se implementó.
    No decir que el idiom es óptimo universalmente.`);
}
// 16 Marcas y canales
{
  const s = slide("CONTENT", "Diseño visual", "Marcas y canales visuales");
  image(s, APP("C24b-hover-jimmy-recorte.png"), M, 1.3, 6.2, 3.9, "C24 · Foco sobre un nodo: conexiones relacionadas al 0,95 de opacidad, el resto atenuado; tooltip con k y W", { top: true });
  table(s, [
    ["Marca / canal", "Dato", "Límite"],
    ["Círculo", "Investigador", "No representa institución"],
    ["Radio", "k visible o B / B_sim", "No mide calidad ni producción"],
    ["Color / borde", "Departamento principal (gris = desconocido)", "No es comunidad ni importancia"],
    ["Foto / iniciales", "Reconocimiento (fotos desde 25 px)", "No es dato del recomendador"],
    ["Línea continua + grosor", "Arista registrada; trabajos compartidos", "No indica dirección"],
    ["Violeta discontinua", "Pareja sugerida", "Grosor fijo, no ranking de S"],
    ["Rectángulo", "Departamento (área = personas)", "No mide colaboración"],
    ["Posición por fuerzas", "Explorar dentro de contenedores", "Distancia ≠ similitud"],
    ["Transparencia / foco", "Seguir una selección", "No cambia datos"],
    ["Tooltip / detalle", "Lectura bajo demanda", "No 104 nombres a la vez"],
  ], 7.0, 1.3, 5.8, [1.7, 2.3, 1.8], { fontSize: 10 });
  bullets(s, [
    "La posición facilita explorar; no mide afinidad ni distancia institucional.",
    "Cuando aparece la foto, el borde conserva el color del departamento.",
    "Transiciones de 300 ms con propósito; se suprimen con movimiento reducido.",
  ], { x: M, y: 5.4, w: 6.2, h: 1.5, fontSize: 12 });
  notes(s, `
    Mapa completo en la sección 9 de PRESENTACIONES.md. Respetamos las convenciones de la app: color categórico por departamento, línea continua registrada, violeta discontinua sugerida.`);
}
// 17 Tamaños y grosores
{
  const s = slide("CONTENT", "Diseño visual", "Tamaños y grosores con significado (F07, F08)");
  formula(s, M, 1.3, 6.0, 1.3, ["Colaboradores:  radio = 7 + 44 × k_visible / 9", "k = 0, 1, 4, 9  →  7; 11,9; 26,6; 51"], { fontSize: 13 });
  formula(s, M, 2.75, 6.0, 1.3, ["Puentes:  radio = 7 + 44 × √(B_usada / B_max_usada)", "máximo 51; si todas las B son 0, todos 7"], { fontSize: 13 });
  formula(s, M, 4.2, 6.0, 1.3, ["grosor(w) = 1,5 + 4,5 × ln(w) / ln(8)", "w = 1, 2, 8 → 1,5; 3; 6 px · sugeridas: 1,4 px fijo"], { fontSize: 12 });
  bullets(s, [
    "9 = mayor grado registrado; no cambia al filtrar ni al sugerir. 7 y 44 son constantes visuales, no datos académicos.",
    "Lineal en radio, no en área: elegido para reforzar contraste; reconocemos la distorsión perceptual.",
    "En Puentes la raíz acerca el área a la magnitud; el radio mínimo introduce una base.",
    "Escala logarítmica de grosor: un vínculo de peso 8 no oculta los de peso 1. El conteo exacto está en el detalle.",
  ], { x: M, y: 5.6, w: 6.0, h: 1.4, fontSize: 11 });
  image(s, APP("C11-jimmy-colaboradores.png"), 6.9, 1.3, 5.9, 2.75, "C11 · Colaboradores: Jimmy (k = 9) al radio máximo 51", { top: true });
  image(s, APP("C13-puentes-observada.png"), 6.9, 4.15, 5.9, 2.75, "C13 · Puentes: mismo nodo, tamaño por √(B/B_max)", { top: true });
  notes(s, `
    Radio y diámetro no son lo mismo; son unidades SVG y el zoom modifica sus píxeles en pantalla. Las fotos aparecen desde 25 px de diámetro en pantalla.
    Con sugerencias, k_visible puede superar 9 y el radio superar 51; B puede subir o bajar.`);
}
// 18 Mantra
{
  const s = slide("CONTENT", "Diseño visual", "El mantra en una interacción real");
  const steps = [
    ["1 · Panorama", APP("C09-panorama-colaboradores.png"), "Toda la cohorte, sin sugerencias"],
    ["2 · Filtrar / buscar / zoom", APP("C15b-filtro-bioingenieria-zoom.png"), "Bioingeniería desde la leyenda, con zoom"],
    ["3 · Detalle bajo demanda", APP("C10-pareja-carmen-samuel.png"), "Selección de la pareja Carmen–Samuel"],
  ];
  steps.forEach((t, i) => {
    const x = M + i * 4.1;
    tag(s, x, 1.3, 2.4, t[0], i === 2 ? C.accent2 : C.accent1);
    image(s, t[1], x, 1.75, 3.9, 2.9, t[2], { top: true });
  });
  bullets(s, [
    "Hover sobre nodo o arista: foco y tooltip (mouseenter). Click o Enter: detalle. Escape o ×: volver al panorama.",
    "Arrastre: los enlaces registrados tiran de los vecinos; colisiones y límites del bloque se mantienen (C24f).",
    "Zoom 0,25–5 y Ajustar red; la búsqueda ignora tildes y restaura la visibilidad si la persona estaba filtrada.",
    "Cada paso responde una pregunta distinta: ¿cómo se ve el conjunto? → ¿qué pasa en este departamento? → ¿qué evidencia tiene esta pareja?",
  ], { x: M, y: 5.2, w: 12.1, h: 1.7, fontSize: 12 });
  notes(s, `
    Overview → zoom/filter → details on demand (Shneiderman). Las tres capturas son del mismo caso a la misma escala de lectura.
    Capturas de respaldo de interacción: C24a (tooltip), C24c (hover de arista), C24e (Enter sobre Monica), C24f (arrastre a mitad de camino).
    No mostrar botones sin propósito.`);
}

// =====================================================================
pres.addSection({ title: "Sugerencias" });
// 19 Temática
{
  const s = slide("CONTENT", "Sugerencias", "Temática T: comparar significados (F09, F10)");
  const flow = ["Intereses + huellas", "Embeddings MiniLM", "Vector por investigador", "Coseno → T"];
  flow.forEach((t, i) => {
    const x = M + i * 1.6;
    s.addShape(pres.ShapeType.chevron, { x, y: 1.3, w: 1.55, h: 0.75, fill: { color: C.accent1 }, line: { color: C.background1, width: 0.5 }, objectName: name(s, "Paso") });
    text(s, t, { x: x + 0.42, y: 1.3, w: 0.9, h: 0.75, fontSize: 9, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  formula(s, M, 2.2, 6.3, 1.5, ["T(A,B) = limitar_0_1[ (v_A · v_B) / (‖v_A‖ ‖v_B‖) ]", "v_A = normalizar( promedio(u_A, f_A) )"], { fontSize: 13 });
  bullets(s, [
    "u_A: promedio de los embeddings de intereses; f_A: promedio de huellas ponderado por relevancia q(c) = peso_CRIS × IDF.",
    "Igual importancia por fuente: más etiquetas no anulan los intereses. Biografía solo si faltan ambas (5 perfiles).",
    "Modelo público preentrenado paraphrase-multilingual-MiniLM-L12-v2, revisión fijada; no lo entrenamos con nuestros perfiles.",
    "Control: “Machine learning” ↔ “Aprendizaje automático” = 0,836; ↔ “Mecánica de suelos y cimentaciones” = 0,146.",
    { text: "Similitud semántica ≠ complementariedad científica ni colaboración demostrada.", options: { color: C.accent5 } },
  ], { x: M, y: 3.85, w: 6.3, h: 3.1, fontSize: 12 });
  image(s, APP("C17b-pareja-con-camino-detalle-completo.png"), 7.2, 1.3, 2.7, 5.6, "C16 · Detalle de pareja: coincidencias, puntuación, tres señales");
  image(s, APP("C22d-luz-luciano-detalle-completo.png"), 10.1, 1.3, 2.7, 5.6, "C22 · Luz–Luciano: T = 84,0 con términos relacionados por el modelo");
  notes(s, `
    Embedding en lenguaje simple: cada texto se convierte en un vector de números tal que textos con significado parecido quedan cerca; el coseno mide esa cercanía (1 = misma dirección).
    F09 (IDF) va al anexo A5. Se excluyen Peru y Numerical Example; hasta 20 conceptos por perfil.
    No sumamos títulos y abstracts: duplicarían la evidencia de las huellas. No incorporamos citas ni fotos a esta señal.`);
}
// 20 Institución
{
  const s = slide("CONTENT", "Sugerencias", "Institución I: valores derivados de la cohorte (F11)");
  table(s, [
    ["Categoría excluyente", "Parejas", "Registradas", "p_c", "I × 100"],
    ["Grupo compartido", "94", "18", "19,15 %", "100"],
    ["Centro/instituto sin grupo", "85", "6", "7,06 %", "34,48"],
    ["Departamento sin coincidencia superior", "378", "17", "4,50 %", "20,60"],
    ["Ninguna coincidencia, información suficiente", "4.594", "32", "0,70 %", "0"],
    ["Información insuficiente", "205", "0", "no estimada", "N/D"],
  ], M, 1.3, 7.2, [3.0, 0.9, 1.1, 1.1, 1.1], { fontSize: 11 });
  formula(s, M, 3.9, 7.2, 1.55, ["I(c) = limitar_0_1[ (p_c − p_0) / (p_g − p_0) ]", "centro: ((6/85) − (32/4594)) / ((18/94) − (32/4594)) = 0,3448"], { fontSize: 13 });
  bullets(s, [
    "Una sola coincidencia, la más específica: grupo → centro/instituto → departamento → ninguna. Es la prioridad elegida, no un organigrama demostrado.",
    "34,48 es un contraste relativo a compartir grupo; no es 34,48 % de probabilidad de colaborar.",
    "Reemplaza los valores heurísticos 100–70–40. Seis positivos en centros son pocos; las parejas no son independientes.",
  ], { x: M, y: 5.55, w: 7.2, h: 1.4, fontSize: 11 });
  image(s, CRIS("C05-julio-cabecera.png"), 8.1, 1.3, 4.7, 2.7, "C05 · Julio Valdivia Silva: Centro BIO publicado; con Deyby (también BIO) → I = 34,48", { top: true });
  image(s, CRIS("C05-flores-luyo-cabecera.png"), 8.1, 4.2, 4.7, 2.7, "C05 · Luis Flores Luyo: DADS compartido con Julio Gutierrez Alva → I = 100", { top: true });
  notes(s, `
    p_0 = 32/4594 es la base sin coincidencia; p_g = 18/94 la referencia de grupo; p_c la categoría puntuada. Usar fracciones completas, no porcentajes redondeados.
    No sumar grupo + centro + departamento ni puntuar compartir UTEC o facultad general. Datos insuficientes → null.
    Calibración descriptiva en la misma red observada; no es validación predictiva ni causalidad. Valores guardados en analysis.json → recommendations.metadata.institutional_calibration.`);
}
// 21 Red R
{
  const s = slide("CONTENT", "Sugerencias", "Red R: proximidad por colaboradores intermedios (F12)");
  card(s, M, 1.3, 6.3, 2.2);
  circle(s, 0.95, 1.95, 0.55, "A", C.accent1); circle(s, 2.75, 1.55, 0.5, "B", C.accent6); circle(s, 2.75, 2.65, 0.5, "C", C.accent6); circle(s, 4.6, 2.1, 0.5, "D", C.accent6);
  line(s, 1.5, 2.2, 2.75, 1.8, C.accent1, "solid", 2); line(s, 1.5, 2.25, 2.75, 2.9, C.accent1, "solid", 4); line(s, 3.25, 1.8, 4.6, 2.3); line(s, 3.25, 2.9, 4.6, 2.4);
  text(s, "peso 2 → 25 %", { x: 1.75, y: 1.45, w: 1.2, h: 0.3, fontSize: 9, color: C.accent1 });
  text(s, "peso 6 → 75 %", { x: 1.75, y: 2.85, w: 1.2, h: 0.3, fontSize: 9, color: C.accent1 });
  text(s, "Desde A: continuar con 0,90 (vecino proporcional al peso: 22,5 % y 67,5 % del paso) o reiniciar en A con 0,10. Sin salidas → vuelve a A.", { x: 5.2, y: 1.45, w: 1.65, h: 1.9, fontSize: 9, color: C.text2 });
  formula(s, M, 3.65, 6.3, 1.7, ["P_A = 0,90 Mᵀ P_A + 0,10 e_A", "R_bruto(A,B) = (P_A(B) + P_B(A)) / 2", "R(A,B) = min(1, R_bruto / máx_positivo_entre_no_conectadas)"], { fontSize: 12 });
  bullets(s, [
    "Promediamos ambas direcciones porque la pareja no tiene dirección; el máximo es global, no cambia con filtros.",
    "R = 0 entre componentes desconectados o desde un aislado: Luz–Luciano comparten temas y departamento con R = 0.",
    "90/10 es un parámetro exploratorio distinto del peso global de Red (10 %). Las sugerencias nunca alimentan R.",
  ], { x: M, y: 5.5, w: 6.3, h: 1.45, fontSize: 11 });
  image(s, APP("C17a-pareja-con-camino.png"), 7.2, 1.3, 5.6, 3.0, "C17 · Deyby–Ruth Canahuire: R = 23,6/100 porque existe un camino registrado (grupo RIC, coincidencias de robótica)", { top: true });
  image(s, APP("C23b-luz-luciano-institucion100-pantalla.png"), 7.2, 4.4, 5.6, 2.5, "C17 · Luz–Luciano: sin camino observado, R = 0", { top: true });
  notes(s, `
    Random Walk with Restart implementado con Personalized PageRank de NetworkX (alpha 0,9, hasta 1.000 iteraciones, tolerancia 1e-12). M es la matriz de transición por pesos salientes; e_A concentra el reinicio en A; P_A(B) es la masa estacionaria en B. El símbolo T elevado es transpuesta.
    No es probabilidad de que colaboren. Ecuación completa y leyenda en el anexo A7.`);
}
// 22 Puntuación final
{
  const s = slide("CONTENT", "Sugerencias", "Cómo se obtiene la puntuación final (F13)");
  formula(s, M, 1.3, 6.4, 1.1, ["S = αT + βI + γR     α = 0,60; β = 0,30; γ = 0,10     mostrado: 100 × S"], { fontSize: 13 });
  card(s, M, 2.55, 6.4, 2.2);
  text(s, "Ejemplo real: Jose Javier Cerda Hernandez – Jose De La Puente Maldonado (mismo departamento, ambos con grado 0)", { x: M + 0.2, y: 2.65, w: 6.0, h: 0.5, fontSize: 11, bold: true });
  text(s, [
    { text: "T = 0,470273   I = 0,2059786   R = 0\n", options: { fontFace: "Courier New" } },
    { text: "S = 0,60×0,470273 + 0,30×0,2059786 + 0,10×0 = 0,343957 → 34,40/100\n", options: { fontFace: "Courier New" } },
    { text: "Aportes: temática 28,22 + institución 6,18 + red 0 = 34,40", options: { fontFace: "Courier New", bold: true } },
  ], { x: M + 0.2, y: 3.2, w: 6.0, h: 1.5, fontSize: 11 });
  formula(s, M, 4.9, 6.4, 1.0, ["S_faltantes = Σ_disp a_j señal_j / Σ_disp a_j      cobertura = Σ_disp a_j / Σ_todos a_j"], { fontSize: 11 });
  bullets(s, [
    "T/I/R son resultados por pareja; α/β/γ son importancias elegidas por el usuario. 60/30/10 es nuestro escenario inicial.",
    "Si falta una señal se renormaliza y se declara la cobertura (I = null con T = 0,5 → S = 0,4286, cobertura 70 %; I = 0 → S = 0,30, cobertura 100 %).",
    { text: "La puntuación es una prioridad exploratoria, no una probabilidad.", options: { bold: true, color: C.accent2 } },
  ], { x: M, y: 5.95, w: 6.4, h: 1.05, fontSize: 10 });
  image(s, APP("C17b-pareja-con-camino-detalle-completo.png"), 7.3, 1.3, 2.6, 5.6, "C16 · Deyby–Ruth: 85,4·0,6 + 100·0,3 + 23,6·0,1 = 83,6");
  image(s, APP("C19-controles.png"), 10.1, 1.3, 2.7, 5.6, "Pesos actuales a la vista: 60 / 30 / 10");
  notes(s, `
    Valores de Cerda–De La Puente verificados en /api/pairs/204309335274068/349372305644751: thematic 0,470273; institutional 0,2059785624; structural 0. R = 0 no impide temática o institución.
    Esta pareja ocupa el puesto 1.486 de 5.283 candidatas: no aparece como línea sugerida en el Top 5 %, por eso la mostramos con el dato guardado y usamos Deyby–Ruth como captura de detalle.
    Al mover una barra, las otras dos se redistribuyen proporcionalmente para sumar 100 % (60/30/10 → temática 80 % → 80/15/5).`);
}
// 23 Top %
{
  const s = slide("CONTENT", "Sugerencias", "Qué selecciona Top % (F14)");
  formula(s, M, 1.3, 4.2, 1.9, ["parejas = 104×103/2 = 5.356", "candidatas = 5.356 − 73 = 5.283", "cantidad = techo(candidatas × Top/100)", "1 % → 53 · 2 % → 106 · 5 % → 265"], { fontSize: 12 });
  bullets(s, [
    "Fracción del ranking de candidatas visibles, ordenado por S descendente con desempate estable por identificadores. No es un umbral de probabilidad.",
    "Solo se dibujan puntuaciones positivas; los filtros cambian el denominador.",
    "Límite visual 5 %: E_total = 73 + 265 = 338 < 4N = 416 (orientación E < 4N de Munzner, no garantía de legibilidad).",
    "CollaborationViz también limita a 5, pero no justifica ese número ni usa nuestro denominador.",
  ], { x: M, y: 3.4, w: 4.2, h: 3.5, fontSize: 11 });
  image(s, APP("C19-top0-colaboradores.png"), 5.1, 1.3, 3.8, 2.7, "C19 · Top 0 %: 0 sugeridas", { top: true });
  image(s, APP("C19-top1-colaboradores.png"), 9.0, 1.3, 3.8, 2.7, "C19 · Top 1 %: +53 sugeridas", { top: true });
  image(s, APP("C19-top5-colaboradores.png"), 5.1, 4.15, 3.8, 2.7, "C19 · Top 5 %: +265 sugeridas", { top: true });
  image(s, APP("C22c-luz-luciano-top2.png"), 9.0, 4.15, 3.8, 2.7, "Top 2 % (106): entra Luz–Luciano, puesto 100", { top: true });
  notes(s, `
    Techo redondea hacia arriba. Rango 0–5 %, paso 0,1, inicio 1 %. Pesos 60/30/10 y sin filtros en las cuatro capturas.
    En Colaboradores el tamaño cuenta conexiones visibles: con sugerencias los extremos crecen; al quitarlas vuelven.`);
}
// 24 Puentes con sugerencias
{
  const s = slide("CONTENT", "Sugerencias", "Puentes con sugerencias: escenario hipotético (F04)");
  formula(s, M, 1.3, 5.0, 0.9, ["G_sim = (V, E_registradas ∪ E_sugeridas_mostradas); B_sim = F03(G_sim)"], { fontSize: 11 });
  table(s, [
    ["Escenario", "Aristas", "B de Jimmy", "Máximo B", "Radio Jimmy"],
    ["Registradas", "73", "0,06797", "0,06797", "51"],
    ["+ Top 1 %", "126", "0,08578", "0,09366", "49,11"],
    ["+ Top 5 %", "338", "0,04148", "0,09459", "36,14"],
  ], M, 2.35, 5.0, [1.3, 0.8, 1.0, 1.0, 0.9], { fontSize: 11 });
  bullets(s, [
    "B puede subir y el radio bajar: también cambia el máximo del escenario que normaliza F07.",
    "Una ruta nueva puede reducir B al evitar que otros pasen por el mismo nodo (Top 5 %).",
    "El perfil conserva la B observada; R y S siguen usando la red observada: B_sim no realimenta las sugerencias.",
    "Un Web Worker calcula el escenario sin bloquear los controles; verificado contra NetworkX.",
    { text: "No atribuir al profesor colaboraciones que solo fueron sugeridas.", options: { color: C.accent5 } },
  ], { x: M, y: 4.1, w: 5.0, h: 2.8, fontSize: 11 });
  image(s, APP("C20-top0-puentes-jimmy.png"), 5.9, 1.3, 3.4, 2.3, "C20 · Top 0 %: intermediación observada", { top: true });
  image(s, APP("C20-top1-puentes-jimmy.png"), 9.4, 1.3, 3.4, 2.3, "C20 · Top 1 %: B simulada 0,0858", { top: true });
  image(s, APP("C20-top5-puentes-jimmy.png"), 5.9, 3.75, 3.4, 2.3, "C20 · Top 5 %: B simulada 0,0415", { top: true });
  image(s, APP("C20-jimmy-detalle-simulada.png"), 9.4, 3.75, 3.4, 3.1, "Detalle: B observada y simulada por separado", { top: true });
  notes(s, `
    Valores reproducidos el 27-10-2026 desde la app (window.utecvis.simulatedBridges): Top 1 % → B 0,0857783, máx 0,0936612, radio 49,11; Top 5 % → B 0,0414820, máx 0,0945888, radio 36,14. Coinciden con la tabla F04 del brief.
    Condiciones: sin filtros, pesos 60/30/10, sin pareja extra seleccionada. La leyenda dice “Intermediación simulada” y el tooltip identifica la simulación.`);
}

// =====================================================================
pres.addSection({ title: "Hallazgos" });
// 25
{
  const s = slide("CONTENT", "Hallazgos", "Hallazgo 1 · Colaboradores e intensidad difieren");
  card(s, M, 1.3, 5.6, 2.3);
  stat(s, M + 0.25, 1.4, 2.6, "9 / 11", "Jimmy Tarrillo Olano · k / W", C.accent1);
  stat(s, M + 3.0, 1.4, 2.6, "7 / 20", "Carmen Flores Barreda · k / W", C.accent3);
  bullets(s, [
    "Jimmy tiene más colaboradores distintos; Carmen concentra más trabajos por pareja (8 con Samuel Charca).",
    "Tarea T1: localizar extremos por tamaño en Colaboradores y confirmar los valores exactos en el detalle.",
    "W = 20 no son 20 publicaciones únicas: cuenta trabajos compartidos por pareja con repetición.",
    "Conclusión limitada a la cohorte y a la definición de trabajos; la app ya no tiene un ranking global.",
  ], { x: M, y: 3.8, w: 5.6, h: 3.1, fontSize: 12 });
  image(s, APP("C11-jimmy-colaboradores.png"), 6.5, 1.3, 6.3, 2.8, "C11 · Jimmy seleccionado: 9 colaboradores, 11 registros", { top: true });
  image(s, APP("C12-carmen-colaboradores.png"), 6.5, 4.15, 6.3, 2.8, "C12 · Carmen seleccionada: 7 colaboradores, 20 registros", { top: true });
  notes(s, `
    Insight analítico (rúbrica): relación entre hallazgo, señal visual (radio) y métrica (k, W). No llamar a Jimmy “mejor investigador”.`);
}
// 26
{
  const s = slide("CONTENT", "Hallazgos", "Hallazgo 2 · Puentes y departamentos");
  card(s, M, 1.3, 5.6, 2.3);
  stat(s, M + 0.25, 1.4, 2.6, "0,0680", "Jimmy · B observada · articulación · 6 vecinos de otros dptos.", C.accent1);
  stat(s, M + 3.0, 1.4, 2.6, "0,0523", "Monica Santa-Maria · B · articulación · k = 6, W = 9", C.accent2);
  bullets(s, [
    "Jimmy (Electrónica) conecta con Bioingeniería, Civil, Mecánica y un perfil sin departamento; Monica (Civil) con Industrial, Bioingeniería, Electrónica y Ciencias.",
    "Tarea T2: localizar B alta en Puentes y comprobar en el detalle los vecinos y sus departamentos.",
    "Máximos locales no son B recalculada por departamento: Carmen es máxima en Bioingeniería (0,0217) y Claudia Antonini en Industrial (0,0274).",
    { text: "B alta no demuestra por sí sola un vínculo entre departamentos: hay que inspeccionar vecinos.", options: { color: C.accent5 } },
  ], { x: M, y: 3.8, w: 5.6, h: 3.1, fontSize: 11 });
  image(s, APP("C14d-puentes-jimmy-seleccionado.png"), 6.5, 1.3, 6.3, 2.8, "C14 · Jimmy en Puentes: conexiones resaltadas hacia otros bloques", { top: true });
  image(s, APP("C14e-puentes-monica-seleccionada.png"), 6.5, 4.15, 6.3, 2.8, "C14 · Monica en Puentes: vecinos de cuatro departamentos", { top: true });
  notes(s, `
    Vecinos de Jimmy (network.json): Nuñez Ochoa y Flores Vega (Electrónica), Valdivia Silva, Parada Quinaya y Rodríguez Reyes (Bioingeniería), Santa-Maria y Horna Muñoz (Civil), Vela Saavedra (Mecánica), Canahuire Cabello (sin departamento).
    Vecinos de Monica: Antonini Bova (Industrial), Flores Barreda, Donayre Torres y Rodriguez Zuñiga (Bioingeniería), Tarrillo (Electrónica), Renom Andara (Ciencias).
    No confundir B global con cantidad de contactos interdepartamentales.`);
}
// 27
{
  const s = slide("CONTENT", "Hallazgos", "Hallazgo 3 · Integración y desconexión institucional");
  image(s, APP("C21-bioingenieria.png"), M, 1.3, 6.0, 3.0, "C21 · Bioingeniería e Ing. Química: 13 miembros, 11 aristas internas, 14 hacia fuera (13 a departamentos conocidos, 1 a un perfil sin departamento)", { top: true });
  image(s, APP("C21-humanidades.png"), 6.75, 1.3, 6.0, 3.0, "C21 · Humanidades, Artes y Ciencias Sociales: 8 miembros, 1 arista interna (De La Flor–Marcone), 0 salidas", { top: true });
  image(s, APP("C21-fisica.png"), M, 4.45, 2.9, 2.5, "C21 · Física: 2 miembros, 0 aristas", { top: true });
  image(s, APP("C21-negocios-digitales.png"), 3.7, 4.45, 2.9, 2.5, "C21 · Negocios Digitales: 2 miembros, 0 aristas", { top: true });
  bullets(s, [
    "Tarea T3: seleccionar el departamento desde la leyenda, con sugerencias OFF, y leer las conexiones registradas internas y externas.",
    "Ausencia de vínculo bajo nuestra extracción no es ausencia universal de colaboración.",
    "“Sin departamento” es información desconocida, no una institución.",
    "El treemap no cuantifica por sí solo la intensidad institucional: las cifras salen de las aristas.",
  ], { x: 6.75, y: 4.45, w: 6.0, h: 2.5, fontSize: 11 });
  notes(s, `
    Cifras calculadas el 27-10-2026 sobre data/network.json. Humanidades: una arista interna entre Antuané De La Flor Basterrechea y Giancarlo Marcone Flores.
    No decir que los ocho de Humanidades están mutuamente conectados ni que ninguno colabora fuera de UTEC.`);
}
// 28
{
  const s = slide("CONTENT", "Hallazgos", "Hallazgo 4 · Afinidad aunque no haya vínculo registrado");
  card(s, M, 1.3, 5.6, 2.3);
  stat(s, M + 0.25, 1.4, 2.6, "56,6", "S de Luz Adanaque – Luciano Romero (sobre 100)", C.accent2);
  text(s, [
    { text: "T = 84,04 · I = 20,60 · R = 0\n", options: { fontFace: "Courier New", bold: true } },
    { text: "Puesto 100 de 5.283 candidatas: no entra en Top 1 % (53), sí en Top 2 % (106).", options: {} },
  ], { x: M + 2.9, y: 1.45, w: 2.6, h: 2.0, fontSize: 10 });
  bullets(s, [
    "Luz tiene grado observado 0 y publica intereses y huellas: un aislado puede tener afinidad alta.",
    "Términos relacionados por el modelo: “color feature” ↔ “Color Image” (0,89); “image feature” ↔ “Procesamiento de imágenes” (0,71).",
    "Tarea T4: activar Sugerencias, subir a Top 2 %, seleccionar la línea violeta y leer las señales.",
    { text: "Es una candidata a explorar, no una colaboración que exista. No concluir que Luz trabaja sola.", options: { color: C.accent5 } },
  ], { x: M, y: 3.8, w: 5.6, h: 3.1, fontSize: 12 });
  image(s, APP("C22a-luz-top2-perfil.png"), 6.5, 1.3, 6.3, 2.8, "C22 · Luz seleccionada con Top 2 %: 0 colaboradores en la cohorte, 5 publicaciones", { top: true });
  image(s, APP("C22c-luz-luciano-top2.png"), 6.5, 4.15, 6.3, 2.8, "C22 · Pareja sugerida Luz–Luciano: línea violeta discontinua y detalle", { top: true });
  notes(s, `
    Pesos 60/30/10. Si se modifica la cohorte o los pesos, comprobar la posición en el ranking antes de la demo: no preparar una demo que espere verla en el Top 1 %.
    La similitud y la cercanía institucional sugieren una pareja para explorar, no una colaboración.`);
}
// 29 Sensibilidad
{
  const s = slide("CONTENT", "Hallazgos", "Sensibilidad y decisiones propias");
  image(s, APP("C22d-luz-luciano-detalle.png"), M, 1.3, 2.75, 4.3, "60/30/10 → S = 56,6", { top: true });
  image(s, APP("C23a-luz-luciano-tematica100.png"), 3.5, 1.3, 2.75, 4.3, "Temática 100 % → S = 84,0", { top: true });
  image(s, APP("C23b-luz-luciano-institucion100.png"), 6.4, 1.3, 2.75, 4.3, "Institución 100 % → S = 20,6", { top: true });
  table(s, [
    ["Calculado con datos", "Elegido por nosotros"],
    ["Aristas, pesos, k, W, B, componentes", "Nivel institucional más específico y normalización respecto a grupo"],
    ["Comunidades, articulaciones, RWR", "Pesos 60/30/10; hasta 20 conceptos; términos excluidos"],
    ["Similitudes del modelo multilingüe", "Reinicio RWR 10 %; radio, grosor, colores, fuerzas"],
    ["Proporciones de I (descriptivas)", "Top máximo 5 %; umbral de fotos 25 px"],
  ], 9.4, 1.3, 3.4, [1.6, 1.8], { fontSize: 9 });
  bullets(s, [
    "Mismas identidades, mismas señales T/I/R: el criterio elegido cambia la prioridad, no la evidencia registrada.",
    "Recalibración de I: con pesos iniciales, 40 de 53 parejas se conservan en Top 1 % y 220 de 265 en Top 5 % frente al antiguo 100–70–40. Es sensibilidad, no mejora predictiva comprobada.",
    "Con Institución al 100 %, compartir grupo produce S = 100 por construcción (por ejemplo Flores Luyo – Gutierrez Alva, DADS).",
  ], { x: M, y: 5.8, w: 12.1, h: 1.1, fontSize: 11 });
  notes(s, `
    Las tres capturas (C22d, C23a, C23b) son la misma pareja con tres juegos de pesos; dentro de cada captura las identidades y los pesos son constantes.
    Que una fórmula esté bien implementada no valida sus supuestos como predictor del futuro.`);
}

// =====================================================================
pres.addSection({ title: "Cierre" });
// 30 Entrega
{
  const s = slide("CONTENT", "Cierre", "Exactitud y entrega reproducible");
  const flow = ["CRIS UTEC (fuente)", "Cinco JSON en data/", "Flask (sirve datos y API)", "D3 (visualización e interacción)"];
  flow.forEach((t, i) => {
    const x = M + i * 3.05;
    s.addShape(pres.ShapeType.chevron, { x, y: 1.3, w: 2.95, h: 0.9, fill: { color: i === 3 ? C.accent2 : C.accent1 }, line: { color: C.background1, width: 0.5 }, objectName: name(s, "Paso") });
    text(s, t, { x: x + 0.6, y: 1.3, w: 1.9, h: 0.9, fontSize: 11, bold: true, color: C.background1, align: "center", valign: "middle" });
  });
  bullets(s, [
    "Solo D3 para la visualización; NetworkX (Python) calcula las métricas en la preparación y no forma parte de D3.",
    "Métricas contrastadas con NetworkX; B simulada del Web Worker comparada contra NetworkX en las pruebas de navegador.",
    "Datos, fotos y D3 locales: sin scraping, claves ni descarga de modelo durante la exposición.",
    "Pruebas: pytest (datos, métricas, API), node (scoring, betweenness, treemap) y smoke en navegador (Playwright).",
    "Entrega: ZIP del proyecto sin .venv ni cachés; revisado tras descomprimir con requirements.txt.",
  ], { x: M, y: 2.5, w: 6.4, h: 4.4, fontSize: 12 });
  image(s, APP("C25-dialogo-como-interpretar.png"), 7.3, 2.5, 5.5, 4.4, "La app explica su propio método en “Cómo interpretar” (botón ?)", { top: true });
  notes(s, `
    Comandos: python3 -m venv .venv; pip install -r requirements.txt; python -m flask --app app run --port 5050.
    No mostrar capturas de terminal en lugar de evidencia analítica. Repositorio: https://github.com/stewartmb/utecvis.`);
}
// 31 Límites
{
  const s = slide("CONTENT", "Cierre", "Alcances y límites");
  const items = [
    ["Cohorte", "104 perfiles de CRIS; no toda persona que investiga en UTEC ni su colaboración mundial."],
    ["Información faltante", "9 sin departamento, 14 sin intereses, 24 sin huella; null ≠ 0."],
    ["Reglas de coautoría", "Solo autores individuales identificados y proyectos; no encontrar arista = falta de evidencia, no prueba de no colaboración."],
    ["Similitud", "Semántica según un modelo; no complementariedad científica."],
    ["Escenarios", "S y B simulada son exploratorios; no hay validación con colaboraciones futuras ni umbral de éxito."],
    ["Lectura visual", "El tamaño no permite ordenar 104 valores con exactitud; el treemap no sustituye una comparación cuantitativa agregada."],
  ];
  items.forEach((it, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = M + col * 6.15, y = 1.3 + row * 1.85;
    card(s, x, y, 5.95, 1.65);
    text(s, it[0], { x: x + 0.2, y: y + 0.15, w: 5.5, h: 0.4, fontSize: 14, bold: true, color: C.accent5 });
    text(s, it[1], { x: x + 0.2, y: y + 0.6, w: 5.5, h: 1.0, fontSize: 12 });
  });
  notes(s, `
    Las cuatro tareas se cubren de forma exploratoria. No vender el trabajo como predictor validado ni como censo completo de UTEC.
    No se usan citas ni h-index para valorar a una persona. Los colaboradores externos no se agregan como nodos.`);
}
// 32 Aportes y demo
{
  const s = slide("DARK_TOP", "Cierre", "Aportes y demostración");
  s.addText("Cuatro hallazgos, una red explicable", { placeholder: "body" });
  bullets(s, [
    "Jimmy: 9 colaboradores y mayor intermediación; Carmen: más trabajos por pareja (20).",
    "Jimmy y Monica ocupan posiciones de paso entre departamentos; se comprueba en sus vecinos.",
    "Bioingeniería está integrada; Humanidades, Física y Negocios Digitales no tienen salidas registradas.",
    "Luz–Luciano: afinidad temática alta sin vínculo (S = 56,6, Top 2 %); añadir rutas redistribuye B.",
  ], { x: M, y: 2.1, w: 7.2, h: 3.6, fontSize: 14, color: C.background1 });
  card(s, 8.2, 2.1, 4.5, 3.6, { fill: C.accent1, line: C.accent1 });
  text(s, "Demo en vivo (localhost:5050)\n1. Panorama y leyenda\n2. Buscar a Jimmy → detalle\n3. Puentes → vecinos de Jimmy\n4. Humanidades y Bioingeniería desde la leyenda\n5. Sugerencias, Top 2 % → Luz–Luciano\n6. Puentes con Top 5 % → B simulada\n7. Restablecer", { x: 8.4, y: 2.25, w: 4.1, h: 3.3, fontSize: 13, color: C.background1 });
  text(s, "Referencias principales: CRIS UTEC · CollaborationViz (PLOS ONE 2014) · Harvard Catalyst Profiles · Group-in-a-Box (Chaturvedi et al. 2014) · Force in a Box (Guerra Gómez) · Brehmer y Munzner (2013) · Sentence-BERT y MiniLM multilingüe · NetworkX PageRank · DRACoR (Pradhan y Pal 2020) · D3. Bibliografía completa en el anexo A12.", { x: M, y: 6.2, w: 12.1, h: 1.0, fontSize: 11, color: C.accent6 });
  notes(s, `
    Distinguir inspiración y decisiones propias. La demo continúa con un caso real y no termina mostrando una lista de tecnologías.
    Capturas de respaldo por si falla una interacción: C09, C11, C14d, C21, C22c, C20-top5. La demo no depende de acceso a CRIS.`);
}

// =====================================================================
pres.addSection({ title: "Anexos" });
// A1 Rúbrica
{
  const s = slide("ANNEX", "Anexos", "A1 · Rúbrica y mapa de cobertura");
  image(s, HIST("08-rubrica.png"), M, 1.3, 4.0, 5.6, "E08 · Rúbrica proporcionada por el curso (20 puntos)");
  table(s, [
    ["Criterio", "Pts", "Láminas", "Evidencia"],
    ["Claridad de la visualización", "3", "15–18", "Leyendas de color, tamaño y líneas; datos ausentes claros"],
    ["Insight analítico", "3", "25–28", "Jimmy/Carmen, Jimmy/Monica, departamentos con datos reales"],
    ["≥ 4 tareas analíticas", "3", "3, 25–28", "Cuatro tareas con datos, operaciones y resultado observable"],
    ["Razonamiento de diseño", "2", "13–18, 23, 29", "Antes/después, canales, límites, animación con propósito"],
    ["Métricas de red", "2", "9, 11, 12, 19–24", "Fórmulas, variables, constantes, ejemplos y alcance"],
    ["Interacción y animación", "3", "18, demo", "Overview → zoom/filter → details; hover, click, Enter, drag"],
    ["Flask + D3", "2", "30, demo", "App funcional con datos locales, sin otra librería de visualización"],
    ["Presentación en clase", "2", "Relato y demo", "Objetivos, tareas, hallazgos y decisiones en el tiempo asignado"],
  ], 4.9, 1.3, 7.9, [2.0, 0.5, 1.4, 4.0], { fontSize: 10 });
  notes(s, "La rúbrica es el criterio, no una calificación obtenida. No prometer 20/20.");
}
// A2 Diccionario
{
  const s = slide("ANNEX", "Anexos", "A2 · Diccionario de campos y cobertura");
  table(s, [
    ["Campo", "Significado y papel", "Cobertura"],
    ["id", "SHA-256 de la URL canónica del perfil; estable, sin orden ni importancia", "104"],
    ["department / departments", "Primer departamento listado (color, bloque); lista completa conservada", "95"],
    ["affiliations", "Pertenencias con nombre, URL, tipo, rol y organisation_id; alimentan I", "102 relevantes"],
    ["research_areas", "Intereses declarados; fuente temática 1", "90"],
    ["fingerprint", "Conceptos de huella con concept_id, label, weight, subject; fuente temática 2", "80"],
    ["biography", "Respaldo temático solo si faltan ambas fuentes", "5 usados"],
    ["citations, h_index", "Publicados con proveedor y fecha; no alimentan aristas, tamaño, T, I ni R", "variable"],
    ["publication_count, project_count", "Registros distintos vinculados al perfil; no es número de colaboradores", "104"],
    ["network_metrics", "degree, weighted_degree, degree_centrality, betweenness, component, community, is_articulation", "104 (calculado)"],
    ["edges[].evidence", "Registros con DOI/URL, tipo, año y fuentes que respaldan cada arista", "73"],
  ], M, 1.3, 12.1, [2.6, 7.5, 2.0], { fontSize: 10 });
  notes(s, "Ejemplo fuente → dato: cabecera del perfil de Jimmy → name, department, SERMIC (research_group) → color verde oliva y bloque Electrónica.");
}
// A3 Deduplicación y externos
{
  const s = slide("ANNEX", "Anexos", "A3 · Deduplicación, autoría colectiva y externos");
  bullets(s, [
    "Clave de deduplicación: (tipo, DOI) si hay DOI; si no, (tipo, URL normalizada). Proyectos por URL.",
    "Campos unidos al deduplicar: personas, personas enlazadas, observaciones, metadatos de autores, conceptos, colaboraciones de autor y métricas.",
    "author_faculty_ids excluye roles de editor, traductor y compilador; author_list_scope indica colectivo, ficha detallada o listado.",
    "Una pareja recibe arista de coautoría solo si ambos están en author_faculty_ids y el registro no tiene autor colectivo; los proyectos crean shared_project.",
    "Asociaciones de perfil sin autores individuales confirmados se conservan en publicaciones, pero no crean arista (432 registros retirados del grafo).",
    "Externos: faculty_id nulo; conservados como contexto; no crean nodos ni cambian k, B ni R.",
  ], { x: M, y: 1.3, w: 6.6, h: 5.6, fontSize: 12 });
  image(s, CRIS("C08-cabecera.png"), 7.5, 1.3, 5.3, 2.7, "C08 · Dos internos (Valdivia-Silva, Guio) y nueve autores sin identificación en la cohorte", { top: true });
  image(s, CRIS("C18-cabecera.png"), 7.5, 4.15, 5.3, 2.7, "C18 · “The LHCb collaboration”: autoría colectiva, sin arista", { top: true });
  notes(s, "Validaciones del ETL: sin autoenlaces, sin aristas duplicadas, peso = número de evidencias, tipos y contadores coherentes con la evidencia.");
}
// A4 F02/F03/F05
{
  const s = slide("ANNEX", "Anexos", "A4 · Grado, intermediación, componentes y puentes");
  formula(s, M, 1.3, 6.0, 2.3, ["k(v) = |vecinos de v|      W(v) = Σ_u w_vu", "B(v) = [Σ σ_st(v)/σ_st] / [(N−1)(N−2)/2],  N = 104", "densidad = E / [N(N−1)/2] = 73/5.356 = 0,01363"], { fontSize: 12 });
  table(s, [
    ["Concepto", "Definición", "Valor actual"],
    ["Componente", "Conjunto unido por algún camino", "62 (57 aislados)"],
    ["Aislado", "k = 0", "57"],
    ["Nodo de articulación", "Al retirarlo aumentan los componentes", "9"],
    ["Arista puente", "Al retirarla aumentan los componentes", "13"],
    ["Comunidades (modularidad)", "Agrupación voraz ponderada", "10 con > 1 persona, 57 unitarias"],
    ["Capa coautoría / proyectos", "Aristas por tipo", "35 / 51 (13 con ambas)"],
  ], M, 3.8, 6.0, [1.9, 2.5, 1.6], { fontSize: 10 });
  card(s, 7.0, 1.3, 5.8, 5.6);
  text(s, "Caminos empatados: si entre s y t hay dos caminos mínimos y solo uno pasa por v, la pareja aporta 1/2 a v. Parejas desconectadas aportan 0. Los extremos no cuentan. Cada arista vale un paso (weight = None): la frecuencia de trabajos no se interpreta como distancia.\n\nDiferencias: la arista puente y el nodo de articulación son propiedades de conectividad; B mide posición de paso aunque nada se desconecte. Jimmy es articulación y tiene la B máxima (0,0680); Carmen no es articulación y tiene B 0,0217.\n\nMáximos locales: Carmen es la B más alta entre miembros de Bioingeniería; Claudia Antonini (0,0274) entre Industrial. No se recalcula B dentro del departamento.", { x: 7.2, y: 1.45, w: 5.4, h: 5.3, fontSize: 11 });
  notes(s, "Cálculo con NetworkX sobre las 73 aristas registradas; las sugerencias nunca entran aquí.");
}
// A5 F09/F10
{
  const s = slide("ANNEX", "Anexos", "A5 · IDF, embeddings y normalización temática");
  formula(s, M, 1.3, 6.0, 2.6, ["IDF(c) = ln((N_h + 1)/(df(c) + 1)) + 1,   N_h = 80", "q(c) = peso_CRIS(c) × IDF(c)", "u_A = normalizar(promedio emb(intereses))", "f_A = normalizar(Σ q(c)·emb(c) / Σ q(c))", "v_A = normalizar(promedio de fuentes disponibles)"], { fontSize: 11 });
  bullets(s, [
    "Ejemplo didáctico (N_h = 80): df = 1 → IDF ≈ 4,70; df = 40 → IDF ≈ 1,68. Con peso 0,5: q ≈ 2,35 frente a 0,84. Un término común discrimina menos.",
    "Se excluyen pesos no positivos y los términos “Peru” y “Numerical Example”; etiquetas repetidas conservan la mayor q; hasta 20 conceptos por perfil.",
    "Biografía: fragmentos de hasta (longitud máxima − 2) tokens con solapamiento de 16; solo cuando faltan intereses y huellas.",
    "T = coseno limitado a 0–1 (los negativos pasan a 0). Se muestran hasta dos pares de términos relacionados con similitud ≥ 0,45 como explicación; no se suman a T.",
    "Modelo: sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2, revisión e8f8c211…; CPU, semilla fija.",
  ], { x: 6.9, y: 1.3, w: 5.9, h: 5.6, fontSize: 11 });
  text(s, "Control semántico guardado en analysis.json: equivalent_languages = 0,835962; different_topics = 0,146285. Es un ejemplo de coherencia multilingüe, no una validación exhaustiva.", { x: M, y: 4.1, w: 6.0, h: 1.2, fontSize: 11, color: C.text2 });
  notes(s, "La preparación se ejecuta una vez (python -m app.recommendations --prepare) y la app usa los resultados sin cargar el modelo.");
}
// A6 F11
{
  const s = slide("ANNEX", "Anexos", "A6 · Calibración institucional completa");
  table(s, [
    ["Categoría", "Parejas", "Registradas", "p_c", "I"],
    ["Grupo compartido", "94", "18", "0,191489", "1,000000"],
    ["Centro/instituto sin grupo", "85", "6", "0,070588", "0,344794"],
    ["Departamento sin coincidencia superior", "378", "17", "0,044974", "0,205979"],
    ["Ninguna coincidencia (información suficiente)", "4.594", "32", "0,006966", "0"],
    ["Información insuficiente", "205", "0", "—", "null"],
  ], M, 1.3, 7.0, [3.2, 0.9, 1.1, 0.9, 0.9], { fontSize: 11 });
  formula(s, M, 3.7, 7.0, 1.3, ["I(c) = clip((p_c − p_none) / (p_group − p_none), 0, 1)", "departamento: (0,044974 − 0,006966)/(0,191489 − 0,006966) = 0,205979"], { fontSize: 11 });
  bullets(s, [
    "Categorías excluyentes: se toma la coincidencia más específica por organisation_id.",
    "Parejas sin afiliaciones relevantes en alguno de los dos perfiles → I = null (no cero) y cobertura < 100 %.",
    "Se recalibra sobre la cohorte completa al regenerar; nunca sobre filtros. Si grupo no supera a la base, el comando se detiene.",
    "Efecto del cambio frente a 100–70–40: Top 1 % conserva 40/53; Top 5 % conserva 220/265. T y R idénticos.",
  ], { x: M, y: 5.15, w: 7.0, h: 1.8, fontSize: 11 });
  image(s, CRIS("C05-gutierrez-cabecera.png"), 7.9, 1.3, 4.9, 5.6, "C05 · Julio Gutierrez Alva: DADS compartido con Luis Flores Luyo (I = 100)", { top: true });
  notes(s, "Guardado en analysis.json → recommendations.metadata.institutional_calibration. Seis positivos en centros son pocos y las parejas comparten investigadores: no es validación predictiva.");
}
// A7 F12
{
  const s = slide("ANNEX", "Anexos", "A7 · RWR completo: transición, reinicio, simetría y normalización");
  formula(s, M, 1.3, 6.3, 2.4, ["M_ij = w_ij / Σ_k w_ik  (salidas inexistentes → origen)", "P_A = 0,90 · Mᵀ · P_A + 0,10 · e_A", "R_bruto(A,B) = (P_A(B) + P_B(A)) / 2", "R(A,B) = min(1, R_bruto(A,B) / máx_{sin arista} R_bruto)"], { fontSize: 12 });
  bullets(s, [
    "M: matriz de transición normalizada por pesos salientes; e_A: vector con 1 en A; P_A(B): masa estacionaria en B al reiniciar en A.",
    "Pesos 2 y 6: condicionado a continuar 25 % y 75 %; del paso completo 22,5 % y 67,5 %, más 10 % de reinicio.",
    "Componentes distintos → R = 0; aislado → R = 0 hacia todos. R = 0 es una señal disponible, participa con su peso.",
    "El máximo se toma entre parejas sin arista de la red completa; si fuera 0, todas las R serían 0.",
    "Parámetros: alpha 0,9; hasta 1.000 iteraciones; tolerancia 1e-12; inicio y dangling en el origen; pesos de arista.",
    "Las sugerencias nunca se añaden al grafo de R: evita que una hipótesis refuerce su propia puntuación.",
  ], { x: 7.1, y: 1.3, w: 5.7, h: 5.6, fontSize: 11 });
  image(s, APP("C17a-pareja-con-camino.png"), M, 3.9, 6.3, 3.0, "Deyby–Ruth Canahuire: R = 23,6/100 (0 colaboradores comunes, pero conectados por caminos registrados)", { top: true });
  notes(s, "Implementado con nx.pagerank(personalization=reset, dangling=reset, nstart=reset, weight='weight').");
}
// A8 F13
{
  const s = slide("ANNEX", "Anexos", "A8 · Combinación, faltantes, cobertura y redistribución");
  formula(s, M, 1.3, 6.0, 2.0, ["S = Σ_{j disponible} a_j·señal_j / Σ_{j disponible} a_j", "cobertura = Σ_{j disponible} a_j / Σ_{todos} a_j", "mostrado = 100 × S"], { fontSize: 12 });
  table(s, [
    ["Caso", "T", "I", "R", "S", "Cobertura"],
    ["Cerda – De La Puente (real)", "0,470273", "0,205979", "0", "0,343957", "100 %"],
    ["Didáctico, I = null", "0,5", "null", "0", "0,30/0,70 = 0,428571", "70 %"],
    ["Didáctico, I = 0", "0,5", "0", "0", "0,30", "100 %"],
    ["Deyby – Ruth (real)", "0,853603", "1", "0,236311", "0,835793", "100 %"],
  ], M, 3.5, 6.0, [2.0, 0.8, 0.7, 0.7, 1.2, 0.6], { fontSize: 10 });
  bullets(s, [
    "Aportes: cada barra muestra a_j·señal_j renormalizado; los aportes suman S, no los valores crudos.",
    "Redistribución de controles: al mover un peso a x %, los otros reparten 100 − x proporcionalmente a sus valores anteriores; si ambos eran 0, por igual, ajustando el redondeo. 60/30/10 → temática 80 % → 80/15/5.",
    "Sin señales disponibles con peso positivo no hay puntuación.",
    "Null y cero no son equivalentes: el caso didáctico lo muestra (0,4286 frente a 0,30).",
  ], { x: 6.9, y: 1.3, w: 5.9, h: 5.6, fontSize: 11 });
  notes(s, "La puntuación sigue en 0–100 y no es una probabilidad.");
}
// A9 F14
{
  const s = slide("ANNEX", "Anexos", "A9 · Top %, límite visual y E < 4N");
  formula(s, M, 1.3, 6.0, 2.0, ["parejas_posibles = 104 × 103 / 2 = 5.356", "candidatas = 5.356 − 73 = 5.283", "cantidad = techo(candidatas_visibles × Top / 100)", "E_total(5 %) = 73 + 265 = 338 < 4 × 104 = 416"], { fontSize: 12 });
  bullets(s, [
    "Orden por S descendente; desempate estable por identificadores; solo puntuaciones positivas.",
    "Los filtros conservan solo parejas con ambos extremos visibles y cambian el denominador.",
    "E < 4N es una orientación de escala para nodo–enlace (Munzner), no garantía de legibilidad.",
    "CollaborationViz (demo rcna) usa un máximo de 5 en sus predicciones, pero su artículo no justifica ese número y su código no usa nuestro denominador.",
    "El 5 % es una decisión de diseño de UTECVis; no convierte el porcentaje en probabilidad.",
  ], { x: 6.9, y: 1.3, w: 5.9, h: 5.6, fontSize: 12 });
  image(s, APP("C19-top5-colaboradores.png"), M, 3.5, 6.0, 3.4, "C19 · Top 5 %: 338 aristas visibles en la cohorte completa", { top: true });
  notes(s, "Rango 0–5 %, paso 0,1, inicio 1 %. Al desactivar la capa desaparecen las aristas sugeridas y los tamaños vuelven a la red observada.");
}
// A10 F04/F07
{
  const s = slide("ANNEX", "Anexos", "A10 · B simulada y reescalado al máximo del escenario");
  formula(s, M, 1.3, 6.0, 1.7, ["G_sim = (V, E_registradas ∪ E_sugeridas_mostradas)", "B_sim = B(G_sim) con weight = None", "radio = 7 + 44 × √(B_sim / máx B_sim)"], { fontSize: 12 });
  table(s, [
    ["Escenario", "Aristas", "B Jimmy", "Máximo", "Radio"],
    ["Registradas", "73", "0,06796751", "0,06796751", "51,00"],
    ["+ Top 1 %", "126", "0,08577835", "0,09366122", "49,11"],
    ["+ Top 5 %", "338", "0,04148199", "0,09458883", "36,14"],
  ], M, 3.2, 6.0, [1.4, 0.9, 1.3, 1.3, 1.1], { fontSize: 11 });
  bullets(s, [
    "V sigue teniendo 104 personas. Una pareja seleccionada fuera del Top que conserve su línea también entra en el escenario.",
    "Los filtros cambian las sugerencias mostradas, pero no quitan aristas registradas ocultas del cálculo.",
    "El máximo del escenario cambia, por eso B puede subir (0,0680 → 0,0858) y el radio bajar (51 → 49,11).",
    "Web Worker: agrupación de cambios de 45 ms, reutilización si las parejas no cambian, descarte de resultados antiguos; verificado contra NetworkX en tests/browser_smoke.py.",
  ], { x: 6.9, y: 1.3, w: 5.9, h: 5.6, fontSize: 11 });
  image(s, APP("C20-top1-puentes-jimmy.png"), M, 4.8, 6.0, 2.1, null);
  notes(s, "Condiciones reproducibles: sin filtros, pesos 60/30/10, sin pareja extra seleccionada. Valores confirmados en la app el 27-10-2026.");
}
// A11 F15/F16
{
  const s = slide("ANNEX", "Anexos", "A11 · Comunidades conservadas y parámetros físicos");
  formula(s, M, 1.3, 6.0, 1.5, ["Q = (1/2m) Σ_ij [w_ij − s_i s_j/(2m)] δ(c_i, c_j)", "10 comunidades con > 1 persona · 57 unitarias"], { fontSize: 12 });
  text(s, "m: suma de pesos; s_i: suma de pesos del nodo i; c_i: comunidad; δ = 1 si misma comunidad. Calculadas con agrupación voraz ponderada (NetworkX). Son resultados guardados en analysis.json, no los bloques del treemap ni una opción actual del menú.", { x: M, y: 2.95, w: 6.0, h: 1.3, fontSize: 11, color: C.text2 });
  table(s, [
    ["Parámetro D3", "Valor", "Finalidad"],
    ["Distancia de enlace", "r_A + r_B + 80", "Espacio entre círculos conectados"],
    ["Intensidad del enlace", "0,12", "Resorte"],
    ["Repulsión", "−130", "Separación general"],
    ["Colisión", "radio + 4,5; 8 iteraciones", "Sin solapamientos"],
    ["Atracción al centro del bloque", "0,08", "Mantener dentro del departamento"],
    ["Fricción / enfriamiento", "0,50 / 0,035", "Amortiguar y asentar"],
    ["Semilla", "0,42; 200 pasos iniciales", "Posición inicial reproducible"],
    ["Transiciones", "300 ms; movimiento reducido respetado", "Mantener contexto"],
  ], 6.9, 1.3, 5.9, [2.2, 1.9, 1.8], { fontSize: 10 });
  bullets(s, [
    "Los parámetros modifican posiciones, no atributos académicos. La distancia dibujada no mide afinidad.",
    "Las sugerencias no crean resortes en el layout; sí transmiten tracción al arrastrar un nodo conectado visualmente por ellas.",
    "Límites rectangulares del departamento y corrección geométrica tras integrar el movimiento.",
  ], { x: M, y: 4.5, w: 6.0, h: 2.4, fontSize: 11 });
  notes(s, "No inventar una tarea de descubrir comunidades que la interfaz actual no ofrece.");
}
// A12 Referencias
{
  const s = slide("ANNEX", "Anexos", "A12 · Referencias, créditos y reproducción");
  table(s, [
    ["Referencia", "Papel en UTECVis", "Qué no afirmamos"],
    ["CRIS UTEC — cris.utec.edu.pe/es/persons/", "Fuente de perfiles y producción", "Que CRIS entregue nuestras métricas o IDs"],
    ["Bian et al. (2014) CollaborationViz, PLOS ONE 9(11): e111928; demo bianjiang.github.io/rcna", "Red académica, RWR, enlaces sugeridos", "Que valide nuestro 5 % o combinación"],
    ["Harvard Catalyst Profiles — connects.catalyst.harvard.edu", "Red de coautoría y explicación de relaciones", "Codificación idéntica de tamaño/color"],
    ["Duke, Webs of Minds and Ideas (today.duke.edu, 2017)", "Antecedente de similitud académica", "Que exista una demo operativa"],
    ["Chaturvedi et al. (2014) Group-in-a-Box, CGF; Guerra Gómez, Force in a Box", "Agrupar la red en regiones", "Que reproduzcamos el plugin exacto"],
    ["Brehmer y Munzner (2013) tipología multinivel de tareas; Munzner, Visualization Analysis & Design", "Separar propósito, datos y operaciones; E < 4N", "Que E < 4N garantice legibilidad"],
    ["Reimers y Gurevych (2019) Sentence-BERT; paraphrase-multilingual-MiniLM-L12-v2 (rev. e8f8c21)", "Embeddings y comparación semántica", "Que entrenemos o validemos afinidad científica"],
    ["NetworkX — pagerank, betweenness_centrality, greedy_modularity_communities", "Implementación de métricas y PPR", "Que la API valide las sugerencias"],
    ["Pradhan y Pal (2020) DRACoR, Knowledge-Based Systems", "Antecedente de combinación de señales", "Que tomemos de allí 60/30/10"],
    ["D3 v7 (d3js.org); Flask", "Visualización e interacción; servidor local", "Que NetworkX forme parte de D3"],
  ], M, 1.3, 12.1, [5.2, 3.6, 3.3], { fontSize: 9 });
  text(s, "Créditos de imágenes: capturas de CRIS UTEC (27-10-2026) y de la app UTECVis (commit 6fb18ab) en presentacion/evidencias/; E01–E08 históricos sin retocar. Reproducir ejemplos: README.md y GUIA_PROYECTO.md; valores en data/analysis.json y data/network.json.", { x: M, y: 6.3, w: 12.1, h: 0.7, fontSize: 10, color: C.text2 });
  notes(s, "Detalles y matices de cada fuente en REFERENCIAS.md.");
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log("written", OUT, "slides:", n);
})();

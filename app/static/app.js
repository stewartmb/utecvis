import {
  DEFAULT_WEIGHTS,
  adjustWeights,
  scorePair,
  selectTop,
  pairKey,
  visibleConnections,
} from "./scoring.mjs";

import { createTreemapLayout } from "./treemap-layout.mjs";

const $ = (id) => document.getElementById(id);
const d3 = window.d3;
const nf = new Intl.NumberFormat("es-PE");
const decimal = (n, places = 1) =>
  n == null
    ? "No disponible"
    : new Intl.NumberFormat("es-PE", { maximumFractionDigits: places }).format(
        n,
      );
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const normalized = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const shortDepartment = (s) =>
  (s || "Sin departamento publicado").replace(/^Departamento de /, "");
const initials = (s) => {
  const words = s.split(/\s+/);
  return (words[0][0] + (words[1]?.[0] || "")).toUpperCase();
};
const shortName = (s) => {
  const words = s.split(/\s+/);
  return words.length > 3 ? `${words[0]} ${words.slice(-2).join(" ")}` : s;
};
const relationLabel = (kind) =>
  ({
    coauthorship: "Coautoría individual",
    shared_project: "Proyecto compartido",
    academic_collaboration: "Colaboración registrada",
  })[kind] || kind;
const signalLabel = (key) =>
  ({
    thematic: "Afinidad temática",
    institutional: "Cercanía institucional",
    structural: "Proximidad en la red",
  })[key];
const criterionText = {
  thematic: "Intereses y huellas temáticas. Biografía solo si faltan ambos.",
  institutional: "Grupo compartido: 100. Centro/instituto: 70. Departamento: 40. Solo el nivel más específico.",
  structural: "RWR sobre colaboraciones registradas: continúa 90 % y reinicia 10 %. Sin camino: 0.",
};
const criterionName = (key, label = signalLabel(key)) =>
  `<span class="criterion-help" tabindex="0" role="button" data-criterion="${key}" aria-label="Criterio: ${escape(label)}" aria-describedby="criterion-description-${key}">${label}</span>`;

const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const duration = reducedMotion ? 0 : 300;
const PHOTO_MIN_DIAMETER_PX = 25;
const palette = [
  "#367d80",
  "#bc8850",
  "#9c6fa4",
  "#5a8eb0",
  "#7d9857",
  "#c4746d",
  "#a0a24c",
  "#687aa3",
  "#56a18f",
  "#ad7892",
  "#86744d",
];
const state = {
  task: "collaborators",
  layout: "treemap",
  metric: "degree",
  department: "",
  predictions: false,
  percent: 1,
  weights: { ...DEFAULT_WEIGHTS },
  selected: null,
  selectedPair: null,
  neighborsOnly: false,
  hovered: null,
  hoveredPair: null,
  personKind: "publications",
  productionOpen: false,
};
let network,
  nodes,
  nodeById,
  observed,
  recommendations = [],
  preparation = {},
  visibleIds;
let departments,
  colors,
  layout,
  svg,
  layer,
  zoom,
  nodeSelection,
  edgeSelection,
  predictionSelection;
let width = 700,
  height = 600,
  zoomLevel = 1,
  top = { ranked: [], display: [], eligible: 0 };
let lastFitRadius = null;
let requestSerial = 0;
let connectionCounts = new Map();
let visibleWorkCounts = new Map();
let nodeRadii = new Map();
let metricMaxima = {};
let rankingSignature = "";
let suggestionFrame = null;
let displayedPredictions = [];
let tooltipHTML = "";
const pairCache = new Map();
const personCache = new Map();

async function getJSON(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

function nodeColor(node) {
  return node.department ? colors(node.department) : "#a3afa6";
}

function radius(node) {
  return nodeRadii.get(node.id) ?? 7;
}

function updateNodeRadii() {
  for (const n of nodes) {
    const value = state.metric === "degree"
      ? connectionCounts.get(n.id)?.total ?? n.network_metrics.degree
      : n.network_metrics[state.metric];
    const ratio = Math.max(0, value) / (metricMaxima[state.metric] || 1);
    nodeRadii.set(n.id, 7 + 44 * (state.metric === "degree" ? ratio : Math.sqrt(ratio)));
  }
}

function scheduleSuggestions() {
  if (suggestionFrame !== null) return;
  suggestionFrame = requestAnimationFrame(() => {
    suggestionFrame = null;
    renderGraph({ live: true });
    if (!$("inspector-panel").hidden) refreshInspector();
  });
}


function setInspector(open) {
  $("inspector-panel").hidden = !open;
}


function nodeConnectionText(node) {
  const counts = connectionCounts.get(node.id) || { recorded: 0, suggested: 0 };
  return `${counts.recorded} colaboradores registrados, ${visibleWorkCounts.get(node.id) || 0} trabajos compartidos${counts.suggested ? `, ${counts.suggested} conexiones sugeridas` : ""}`;
}

function nodeTooltip(node) {
  const counts = connectionCounts.get(node.id) || { recorded: 0, suggested: 0 };
  const works = visibleWorkCounts.get(node.id) || 0;
  const photo = node.photo_url && !node.photoFailed
    ? `<img src="${escape(node.photo_url)}" alt="" width="44" height="44">` : "";
  return `<div class="node-tooltip">
    <div class="node-tooltip-info"><strong>${escape(node.name)}</strong><small>${escape(shortDepartment(node.department))}</small></div>
    <div class="tooltip-photo" style="--person-color:${nodeColor(node)}"><span>${escape(initials(node.name))}</span>${photo}</div>
    <div class="tooltip-metrics">
      <div><b>${nf.format(counts.recorded)}</b><span>Colaboradores</span></div>
      <div><b>${nf.format(works)}</b><span>Trabajos compartidos</span></div>
    </div>
    ${state.predictions ? `<div class="tooltip-suggestions">${nf.format(counts.suggested)} conexiones sugeridas</div>` : ""}
  </div>`;
}

function tags(values, klass = "") {
  return `<div class="tag-list">${values.map((t) => `<span class="tag ${klass}">${escape(t)}</span>`).join("")}</div>`;
}

function fillControls() {
  departments = [
    ...new Set(nodes.map((n) => n.department).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  colors = d3.scaleOrdinal(departments, palette);
}

function computeVisible() {
  let visible = nodes.filter(
    (n) =>
      (!state.department ||
        (state.department === "unknown"
          ? !n.department
          : n.department === state.department)),
  );
  if (state.neighborsOnly && state.selected) {
    const neighbors = new Set([state.selected]);
    for (const edge of observed) {
      if (edge.source === state.selected) neighbors.add(edge.target);
      if (edge.target === state.selected) neighbors.add(edge.source);
    }
    visible = visible.filter((n) => neighbors.has(n.id));
  }
  return new Set(visible.map((n) => n.id));
}

function updateStats() {
  const edges = observed.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );
  $("network-stats").innerHTML =
    `<div class="stat"><strong>${visibleIds.size}</strong><span>personas</span></div><div class="stat"><strong>${edges.length}</strong><span>registradas</span></div>${displayedPredictions.length ? `<div class="stat predicted-stat"><strong>+${displayedPredictions.length}</strong><span>sugeridas</span></div>` : ""}`;
  $("candidate-count").textContent =
    state.predictions ? `${nf.format(top.display.length)} ${top.display.length === 1 ? "sugerencia" : "sugerencias"}` : "Desactivadas";
  $("candidate-count").title =
    state.predictions
      ? `Seleccionadas de ${nf.format(top.eligible)} parejas sin conexión registrada, dentro de los filtros actuales. No es una probabilidad de colaboración.`
      : "Activa las sugerencias para explorar posibles colaboraciones.";
  renderActiveFilters();
  $("network-svg").setAttribute(
    "aria-label",
    `Red académica: ${visibleIds.size} investigadores visibles, ${edges.length} conexiones registradas y ${displayedPredictions.length} sugerencias visibles.`,
  );
  $("graph-message").textContent = visibleIds.size
    ? ""
    : "No hay investigadores con esta combinación de filtros. Prueba otro departamento.";
}

function renderActiveFilters() {
  const filters = [];
  if (state.department)
    filters.push(["department", state.department === "unknown" ? "Sin departamento" : shortDepartment(state.department)]);
  if (state.neighborsOnly && state.selected)
    filters.push(["neighborsOnly", `Conexiones de ${shortName(nodeById.get(state.selected).name)}`]);
  $("active-filters").hidden = !filters.length;
  $("active-filters").innerHTML = filters.map(([key, label]) =>
    `<button class="filter-chip" data-clear-filter="${key}" aria-label="Quitar selección: ${escape(label)}"><span class="chip-label">${escape(label)}</span><span aria-hidden="true">×</span></button>`
  ).join("") + (filters.length > 1 ? '<button class="text-button" data-clear-filter="all">Quitar todo</button>' : "");
}

function previewCategory(value = null) {
  const matches = (n) => value === null || (value === "unknown" ? !n.department : n.department === value);
  nodeSelection?.classed("category-dimmed", (n) => !matches(n));
  const unrelated = (e) => !matches(nodeById.get(e.source)) && !matches(nodeById.get(e.target));
  edgeSelection?.classed("category-edge-dimmed", unrelated);
  predictionSelection?.classed("category-edge-dimmed", unrelated);
}

function renderLegend() {
  const selected = state.department;
  const entries = [
    ...departments.map((d) => [shortDepartment(d), colors(d), d, nodes.filter((n) => n.department === d).length]),
    ["Sin departamento", "#a3afa6", "unknown", nodes.filter((n) => !n.department).length],
  ];
  $("color-legend").innerHTML = entries.map(([name, color, value, count]) =>
    `<button class="legend-item${selected === value ? " active" : ""}" data-category="${escape(value)}" aria-pressed="${selected === value}" title="Ver ${escape(name)}"><i class="legend-dot" style="background:${color}"></i><span>${escape(name)}</span><strong>${count}</strong></button>`
  ).join("");
}

function showTooltip(event, html) {
  const tip = $("tooltip");
  if (tooltipHTML !== html) {
    tip.innerHTML = html;
    tooltipHTML = html;
    tip.querySelector(".tooltip-photo img")?.addEventListener("error", (event) => event.currentTarget.remove(), { once: true });
  }
  const isPerson = Boolean(tip.querySelector(".node-tooltip"));
  tip.classList.toggle("person-tooltip", isPerson);
  tip.hidden = false;
  const rect = $("graph-container").getBoundingClientRect();
  const x = event.clientX - rect.left, y = event.clientY - rect.top;
  const left = x + 14 + tip.offsetWidth <= rect.width - 8 ? x + 14 : x - tip.offsetWidth - 14;
  const top = isPerson && y >= tip.offsetHeight + 20 ? y - tip.offsetHeight - 12 : y + (isPerson ? 16 : -15);
  tip.style.left = `${Math.max(8, Math.min(rect.width - tip.offsetWidth - 8, left))}px`;
  tip.style.top = `${Math.max(8, Math.min(rect.height - tip.offsetHeight - 8, top))}px`;
}

function hoverEdge(event, edge, html) {
  state.hoveredPair = [edge.source, edge.target];
  state.hovered = null;
  focusStyles();
  showTooltip(event, html);
}

function leaveEdge() {
  state.hoveredPair = null;
  $("tooltip").hidden = true;
  focusStyles();
}

function focusStyles() {
  const seed = state.hoveredPair ? null : state.hovered || state.selected;
  const adjacent = new Set(seed ? [seed] : []);
  if (seed)
    for (const e of [...observed, ...displayedPredictions]) {
      if (e.source === seed) adjacent.add(e.target);
      if (e.target === seed) adjacent.add(e.source);
    }
  const pair = state.hoveredPair || (!seed ? state.selectedPair : null);
  if (pair) pair.forEach((id) => adjacent.add(id));
  const focusActive = Boolean(seed || pair);
  const focusedEdge = (e) =>
    pair
      ? pairKey(e.source, e.target) === pairKey(...pair)
      : Boolean(seed && (e.source === seed || e.target === seed));
  nodeSelection
    .classed(
      "selected",
      (n) => n.id === state.selected || state.selectedPair?.includes(n.id),
    )
    .classed("hovered", (n) => n.id === state.hovered)
    .classed(
      "dimmed",
      (n) => focusActive && !adjacent.has(n.id),
    );
  nodeSelection
    .select(".node-label")
    .style("display", (n) =>
      n.id === seed || pair?.includes(n.id) || zoomLevel > 1.7
        ? null
        : "none",
    );
  edgeSelection
    .classed("edge-dimmed", (e) => focusActive && !focusedEdge(e))
    .classed("edge-focused", focusedEdge)
    .classed("edge-hovered", (e) => Boolean(state.hoveredPair && pairKey(e.source, e.target) === pairKey(...state.hoveredPair)));
  edgeSelection.filter(focusedEdge).raise();
  predictionSelection
    ?.classed("edge-dimmed", (e) => focusActive && !focusedEdge(e))
    .classed("edge-focused", focusedEdge)
    .classed("edge-hovered", (e) => Boolean(state.hoveredPair && pairKey(e.source, e.target) === pairKey(...state.hoveredPair)))
    .classed(
      "selected",
      (p) => state.selectedPair && pairKey(p.source, p.target) === pairKey(...state.selectedPair),
    );
  predictionSelection?.filter(focusedEdge).raise();
}

function edgePath(edge) {
  const a = nodeById.get(edge.source);
  const b = nodeById.get(edge.target);
  return a && b ? `M${a.x},${a.y}L${b.x},${b.y}` : "";
}

function predictedPath(edge) {
  const a = nodeById.get(edge.source),
    b = nodeById.get(edge.target);
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return `M${a.x},${a.y}Q${(a.x + b.x) / 2 - dy * 0.09},${(a.y + b.y) / 2 + dx * 0.09} ${b.x},${b.y}`;
}

function tick() {
  nodeSelection?.attr("transform", (n) => `translate(${n.x},${n.y})`);
  edgeSelection?.attr("d", edgePath);
  layer?.selectAll(".observed-hit").attr("d", edgePath);
  predictionSelection?.attr("d", predictedPath);
  layer?.selectAll(".prediction-hit").attr("d", predictedPath);
}

function renderTreemap() {
  const groups = layer.select(".treemap-layer").selectAll("g.department-box")
    .data(layout.cells || [], (b) => b.key)
    .join((enter) => {
      const group = enter.append("g").attr("class", "department-box");
      group.append("rect");
      group.append("text").attr("class", "department-box-label");
      group.append("text").attr("class", "department-box-count");
      return group;
    });
  groups.select("rect").attr("x", (b) => b.x0).attr("y", (b) => b.y0)
    .attr("width", (b) => b.x1 - b.x0).attr("height", (b) => b.y1 - b.y0)
    .attr("fill", (b) => b.key === "Sin departamento" ? "#a3afa6" : colors(b.key));
  updateTreemapLabels();
  groups.select(".department-box-label")
    .on("mouseenter", showDepartmentTooltip)
    .on("mousemove", showDepartmentTooltip)
    .on("mouseleave", () => { $("tooltip").hidden = true; });
}

function showDepartmentTooltip(event, box) {
  const color = box.key === "Sin departamento" ? "#a3afa6" : colors(box.key);
  showTooltip(event, `<div class="tooltip-kicker"><i style="background:${color}"></i>Departamento</div>
    <strong>${escape(box.key)}</strong>
    <div class="department-tooltip-count"><b>${nf.format(box.count)}</b> ${box.count === 1 ? "investigador visible" : "investigadores visibles"}</div>
    <small>Área del bloque = número de investigadores.</small>`);
}

function updateTreemapLabels() {
  const groups = layer?.select(".treemap-layer").selectAll("g.department-box");
  if (!groups) return;
  // Keep department headings readable even when growing nodes enlarge the world
  // and the camera fits it below the usual overview zoom. Truncate to box width.
  const font = Math.max(14, 9.5 / zoomLevel);
  groups.select(".department-box-label")
    .attr("x", (b) => b.x0 + 14)
    .attr("y", (b) => b.y0 + Math.max(20, 13 / zoomLevel))
    .style("font-size", `${font}px`)
    .style("display", null)
    .style("stroke-width", `${2 / zoomLevel}px`)
    .text((b) => {
      const label = shortDepartment(b.key);
      const limit = Math.max(3, Math.floor((b.x1 - b.x0 - 28) / (font * 0.55)));
      return label.length > limit ? label.slice(0, limit - 1) + "…" : label;
    });
  groups.select(".department-box-count").attr("x", (b) => b.x0 + 14).attr("y", (b) => b.y0 + 35)
    .style("display", zoomLevel < 0.65 ? "none" : null)
    .text((b) => `${b.count} ${b.count === 1 ? "investigador" : "investigadores"}`);
}

function setupGraph() {
  svg = d3.select("#network-svg");
  const container = $("graph-container");
  width = container.clientWidth;
  height = container.clientHeight;
  layer = svg.append("g");
  layer.append("g").attr("class", "treemap-layer");
  layer.append("g").attr("class", "observed-layer");
  layer.append("g").attr("class", "observed-hit-layer");
  layer.append("g").attr("class", "prediction-layer");
  layer.append("g").attr("class", "prediction-hit-layer");
  layer.append("g").attr("class", "node-layer");
  zoom = d3
    .zoom()
    .scaleExtent([0.25, 5])
    .on("zoom", (event) => {
      layer.attr("transform", event.transform);
      zoomLevel = event.transform.k;
      state.hoveredPair = null;
      updateTreemapLabels();
      if (nodeSelection) { focusStyles(); updateNodePhotos(); }
      $("tooltip").hidden = true;
    });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", (event) => {
    if (event.target === svg.node() || event.target.closest(".department-box")) clearSelection();
  });
  layout = createTreemapLayout(d3, radius, { onTick: tick, reducedMotion });
  new ResizeObserver(() => {
    const w = container.clientWidth,
      h = container.clientHeight;
    if (Math.abs(w - width) > 5 || Math.abs(h - height) > 5) {
      width = w;
      height = h;
      fitGraph(false);
    }
  }).observe(container);
}

function renderGraph({ live = false } = {}) {
  if (state.hoveredPair) { state.hoveredPair = null; $("tooltip").hidden = true; }
  if (suggestionFrame !== null) {
    cancelAnimationFrame(suggestionFrame);
    suggestionFrame = null;
  }
  visibleIds = computeVisible();
  if (state.hovered && !visibleIds.has(state.hovered)) state.hovered = null;
  const rankKey = `${recommendations.length}:${Object.values(state.weights).join(",")}:${[...visibleIds].join(",")}`;
  if (rankingSignature !== rankKey) {
    top = selectTop(recommendations, state.weights, state.percent, visibleIds);
    rankingSignature = rankKey;
  } else {
    const requested = Math.ceil(top.eligible * state.percent / 100);
    top = { ...top, requested, display: top.ranked.slice(0, requested) };
  }
  const visibleEdges = observed.filter(
    (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
  );
  const thickness = d3
    .scaleLog()
    .domain([
      1,
      Math.max(
        2,
        d3.max(observed, (e) => e.weight),
      ),
    ])
    .range([1.5, 6]);
  edgeSelection = layer
    .select(".observed-layer")
    .selectAll("path")
    .data(visibleEdges, (e) => pairKey(e.source, e.target))
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "observed-edge")
          .attr("opacity", 0)
          .call((s) => s.transition().duration(duration).attr("opacity", 1)),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("stroke-width", (e) => thickness(e.weight));
  layer
    .select(".observed-hit-layer")
    .selectAll("path")
    .data(visibleEdges, (e) => pairKey(e.source, e.target))
    .join("path")
    .attr("class", "edge-hit observed-hit")
    .on("mouseenter", (event, e) =>
      hoverEdge(
        event, e,
        `<div class="tooltip-kicker">Conexión registrada</div><strong>${escape(shortName(nodeById.get(e.source).name))} ↔ ${escape(shortName(nodeById.get(e.target).name))}</strong><div class="tooltip-inline-stat"><b>${e.weight}</b> ${e.weight === 1 ? "trabajo compartido" : "trabajos compartidos"}</div><small>${e.relations.map(relationLabel).join(" / ")}</small>`,
      ),
    )
    .on("mouseleave", leaveEdge)
    .on("click", (event, e) => {
      event.stopPropagation();
      selectPair(e.source, e.target);
    });
  let predictionEdges = state.predictions ? [...top.display] : [];
  if (
    state.predictions &&
    state.selectedPair &&
    !observed.some(
      (e) => pairKey(e.source, e.target) === pairKey(...state.selectedPair),
    )
  ) {
    const featured = recommendations.find(
      (p) => pairKey(p.source, p.target) === pairKey(...state.selectedPair),
    );
    if (
      featured &&
      visibleIds.has(featured.source) &&
      visibleIds.has(featured.target) &&
      !predictionEdges.some(
        (p) => pairKey(p.source, p.target) === pairKey(...state.selectedPair),
      )
    )
      predictionEdges.push(scorePair(featured, state.weights));
  }
  displayedPredictions = predictionEdges;
  connectionCounts = visibleConnections(
    visibleIds,
    visibleEdges,
    predictionEdges,
  );
  visibleWorkCounts = new Map([...visibleIds].map((id) => [id, 0]));
  for (const edge of visibleEdges) {
    for (const id of [edge.source, edge.target])
      visibleWorkCounts.set(id, visibleWorkCounts.get(id) + edge.weight);
  }
  updateNodeRadii();
  predictionSelection = layer
    .select(".prediction-layer")
    .selectAll("path")
    .data(predictionEdges, (p) => pairKey(p.source, p.target))
    .join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "predicted-edge")
          .attr("opacity", 0)
          .call((s) => s.transition().duration(duration).attr("opacity", 1)),
      (update) => update,
      (exit) => exit.remove(),
    );
  layer
    .select(".prediction-hit-layer")
    .selectAll("path")
    .data(predictionEdges, (p) => pairKey(p.source, p.target))
    .join("path")
    .attr("class", "edge-hit prediction-hit")
    .on("mouseenter", (event, p) =>
      hoverEdge(
        event, p,
        `<div class="tooltip-kicker">Conexión sugerida</div><strong>${escape(shortName(nodeById.get(p.source).name))} ↔ ${escape(shortName(nodeById.get(p.target).name))}</strong><div class="tooltip-inline-stat"><b>${decimal(p.score * 100)}</b> / 100 · prioridad</div><small>Clic para ver las coincidencias.</small>`,
      ),
    )
    .on("mouseleave", leaveEdge)
    .on("click", (event, p) => {
      event.stopPropagation();
      selectPair(p.source, p.target);
    });
  const layoutChanged = layout.configure(
    nodes.filter((n) => visibleIds.has(n.id)),
    visibleEdges,
    connectionCounts,
    predictionEdges,
    { live },
  );
  renderTreemap();
  nodeSelection = layer
    .select(".node-layer")
    .selectAll("g.node")
    .data(
      nodes.filter((n) => visibleIds.has(n.id)),
      (n) => n.id,
    )
    .join(
      (enter) => {
        const g = enter
          .append("g")
          .attr("class", "node")
          .attr("role", "button")
          .attr("tabindex", 0);
        g.append("circle").attr("class", "node-halo");
        g.append("circle").attr("class", "node-core");
        g.append("clipPath").attr("id", (n) => `photo-clip-${n.id}`)
          .append("circle").attr("class", "photo-mask");
        g.append("image").attr("class", "node-photo")
          .attr("preserveAspectRatio", "xMidYMid slice")
          .attr("clip-path", (n) => `url(#photo-clip-${n.id})`)
          .on("load", (event, n) => { n.photoLoaded = true; updateNodePhotos(); })
          .on("error", (event, n) => { n.photoFailed = true; updateNodePhotos(); });
        g.append("text").attr("class", "node-initials");
        g.append("text").attr("class", "node-label");
        return g;
      },
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("data-id", (n) => n.id)
    .attr("data-visible-degree", (n) => connectionCounts.get(n.id).total)
    .attr(
      "aria-label",
      (n) =>
        `${n.name}, ${nodeConnectionText(n)}, ${shortDepartment(n.department)}`,
    )
    .on("mouseenter", (event, n) => {
      state.hoveredPair = null;
      state.hovered = n.id;
      focusStyles();
      showTooltip(
        event,
        nodeTooltip(n),
      );
    })
    .on("mousemove", (event, n) => {
      if (!$("tooltip").hidden)
        showTooltip(
          event,
          nodeTooltip(n),
        );
    })
    .on("mouseleave", () => {
      state.hovered = null;
      state.hoveredPair = null;
      $("tooltip").hidden = true;
      focusStyles();
    })
    .on("click", (event, n) => {
      event.stopPropagation();
      selectPerson(n.id);
    })
    .on("keydown", (event, n) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPerson(n.id);
      }
    })
    .call(
      d3
        .drag()
        .filter((event) => !event.button && !layout.dragging)
        .clickDistance(4)
        .on("start", function (event, n) {
          $("tooltip").hidden = true;
          state.hoveredPair = null;
          state.hovered = n.id;
          d3.select(this).classed("dragging", true).raise();
          layout.startDrag(n);
          focusStyles();
        })
        .on("drag", (event, n) => {
          layout.drag(n, event.x, event.y);
          tick();
        })
        .on("end", function (event, n) {
          d3.select(this).classed("dragging", false);
          state.hovered = null;
          state.hoveredPair = null;
          layout.release(n);
          focusStyles();
          tick();
          if (lastFitRadius !== layout.outerRadius) fitGraph(false);
        }),
    );
  // Shrink immediately; animate growth only. Final radii were already used
  // for collision separation, so growing marks cannot overlap their neighbours.
  for (const [klass, padding] of [
    [".node-halo", 3],
    [".node-core", 0],
  ]) {
    nodeSelection
      .select(klass)
      .interrupt()
      .each(function (n) {
        const mark = d3.select(this),
          target = radius(n) + padding;
        const previous = Number(mark.attr("r")) || 0;
        if (target > previous)
          mark.transition().duration(duration).attr("r", target);
        else mark.attr("r", target);
      });
  }
  nodeSelection
    .select(".node-core")
    .attr("fill", nodeColor)
    .attr("stroke", "#fff");
  nodeSelection
    .select(".node-initials")
    .text((n) => initials(n.name))
    .attr("fill", "white")
    .style("visibility", (n) => (radius(n) < 11 ? "hidden" : "visible"))
    .style("font-size", (n) => `${Math.max(6, radius(n) * 0.7)}px`);
  nodeSelection
    .select(".node-label")
    .text((n) => shortName(n.name))
    .attr("x", (n) => radius(n) + 7)
    .attr("y", 3);
  updateNodePhotos();
  tick();
  focusStyles();
  updateStats();
  renderLegend();
  previewCategory();
  if (layoutChanged && lastFitRadius !== layout.outerRadius) fitGraph(false);
}

function updateNodePhotos() {
  nodeSelection?.each(function (n) {
    const group = d3.select(this), r = radius(n);
    const show = Boolean(n.photo_url && !n.photoFailed && r * 2 * zoomLevel >= PHOTO_MIN_DIAMETER_PX);
    const inner = Math.max(0, r - Math.max(2.5, 2 / zoomLevel));
    group.select(".photo-mask").attr("r", inner);
    const photo = group.select(".node-photo")
      .attr("x", -inner).attr("y", -inner).attr("width", inner * 2).attr("height", inner * 2)
      .style("display", show ? null : "none");
    if (show && !photo.attr("href")) photo.attr("href", n.photo_url);
    group.select(".node-initials").style("display", show && n.photoLoaded ? "none" : null);
  });
}

function fitGraph(animated = true) {
  const visible = nodes.filter((n) => visibleIds?.has(n.id));
  if (!visible.length) return;
  const { x0, x1, y0, y1 } = layout.bounds;
  // Keep the persistent suggestion controls in the left margin on wide screens.
  const wide = width >= 1100;
  const leftSpace = wide ? 310 : 24;
  const rightSpace = 24;
  const selectionSpace = $("active-filters").hidden ? 0 : $("active-filters").offsetHeight + 15;
  const controls = document.querySelector(".prediction-controls").getBoundingClientRect();
  const topSpace = (wide ? 55 : controls.bottom - $("graph-container").getBoundingClientRect().top + 24) + selectionSpace;
  const bottomSpace = width <= 720 ? 65 : 28;
  const availableHeight = Math.max(120, height - topSpace - bottomSpace);
  const availableWidth = Math.max(150, width - rightSpace - leftSpace);
  const scale =
    Math.min(
      availableWidth / Math.max(100, x1 - x0),
      availableHeight / Math.max(100, y1 - y0),
      2.8,
    ) * 0.98;
  const transform = d3.zoomIdentity
    .translate(
      leftSpace + availableWidth / 2 - ((x0 + x1) / 2) * scale,
      topSpace + availableHeight / 2 - ((y0 + y1) / 2) * scale,
    )
    .scale(scale);
  lastFitRadius = layout.outerRadius;
  (animated && !reducedMotion ? svg.transition().duration(400) : svg).call(
    zoom.transform,
    transform,
  );
}

function clearInspector() {
  $("inspector").replaceChildren();
  setInspector(false);
}

function renderWorks(works) {
  return works
    .map(
      (w) =>
        `<article class="work"><a href="${escape(w.source_url)}" target="_blank" rel="noreferrer">${escape(w.title)} ↗</a><div class="work-meta">${escape(w.year || (w.start_date ? w.start_date.slice(0, 4) : "Sin año publicado"))}${w.relation ? " · " + escape(relationLabel(w.relation)) : ""}${w.status ? " · " + escape(w.status) : ""}${w.author_collaborations?.length ? "<br>Autoría colectiva: " + escape(w.author_collaborations.join(", ")) : ""}</div>${w.people_display ? `<div class="work-meta">${escape(w.people_display)}</div>` : ""}</article>`,
    )
    .join("");
}

async function selectPerson(id, options = {}) {
  const token = ++requestSerial;
  setInspector(true);
  $("inspector").scrollTop = 0;
  if (state.selected !== id) state.productionOpen = false;
  state.selected = id;
  state.selectedPair = null;
  state.personKind = options.kind || "publications";
  $("search-results").hidden = true;
  renderGraph();
  if (!options.keepPosition) {
    const n = nodeById.get(id);
    const transform = d3.zoomTransform(svg.node());
    const [x, y] = transform.apply([n.x, n.y]);
    if (x < 20 || x > width - 20 || y < 20 || y > height - 20) fitGraph(true);
  }
  $("inspector").innerHTML =
    '<div class="loading-placeholder">Consultando perfil…</div>';
  try {
    const url = `/api/professors/${id}?kind=${state.personKind}`;
    if (!personCache.has(url)) personCache.set(url, await getJSON(url));
    if (token !== requestSerial) return;
    renderPerson(personCache.get(url));
  } catch (error) {
    if (token === requestSerial)
      $("inspector").innerHTML =
        `<p class="empty-state">${escape(error.message)}</p>`;
  }
}

function renderPerson(data) {
  const n = data.node,
    m = n.network_metrics;
  $("inspector").innerHTML =
    `<button class="back-button" data-back>← Volver al panorama</button><div class="avatar" style="color:${nodeColor(n)};background:${nodeColor(n)}18;border-color:${nodeColor(n)}55">${escape(initials(n.name))}</div><div class="eyebrow">INVESTIGADOR / UTEC</div><h2>${escape(n.name)}</h2><p class="department-name">${escape(n.department || "Sin departamento publicado")}</p><a class="text-link" href="${escape(n.source_url)}" target="_blank" rel="noreferrer">Ver perfil en CRIS ↗</a><div class="metric-grid"><div><strong>${m.degree}</strong><span>colaboradores en la cohorte</span></div><div><strong>${nf.format(m.weighted_degree)}</strong><span>registros compartidos</span></div><div><strong>${decimal(m.betweenness, 4)}</strong><span>intermediación</span></div><div><strong>${data.cross_department_neighbors}</strong><span>vecinos de otros departamentos</span></div></div><p class="scope-note">Métricas de la red observada completa.</p><button id="neighbors-only" class="button neighbor-button${state.neighborsOnly ? " active" : ""}" aria-pressed="${state.neighborsOnly}">${state.neighborsOnly ? "Volver a toda la selección" : "Ver solo sus conexiones"}</button>${!m.degree ? '<div class="insight-note"><strong>Sin conexiones dentro de estos 104 perfiles.</strong> Sus trabajos pueden tener coautores externos; no equivale a investigar en solitario.</div>' : ""}<section class="detail-section"><h3>Intereses de investigación</h3>${n.research_areas.length ? tags(n.research_areas) : '<p class="scope-note">No publicados en el perfil.</p>'}${data.preparation?.biography_fallback ? '<p class="scope-note">Temática estimada desde la biografía: información limitada.</p>' : ""}</section><section class="detail-section"><h3>Pertenencias</h3>${
      n.affiliations
        .filter((a) => a.type !== "university")
        .map(
          (a) =>
            `<div class="affiliation">${escape(a.name)}${a.role ? `<small>${escape(a.role)}</small>` : ""}</div>`,
        )
        .join("") ||
      '<p class="scope-note">Sin pertenencias específicas publicadas.</p>'
    }</section>${data.neighbors.length ? `<section class="detail-section"><h3>Colaboradores registrados · ${data.neighbors.length}</h3>${data.neighbors.map((p) => `<button class="rank-row" data-pair="${n.id},${p.id}"><span class="rank-person">${escape(shortName(p.name))}<small>${p.relations.map(relationLabel).join(" · ")}</small></span><span class="rank-value">${nf.format(p.weight)}<small>registros</small></span></button>`).join("")}</section>` : ""}<details class="detail-section production-details" ${state.productionOpen ? "open" : ""}><summary>Publicaciones y proyectos</summary><div class="ranking-tabs"><button data-kind="publications" class="${data.kind === "publications" ? "active" : ""}">Publicaciones (${n.publication_count})</button><button data-kind="projects" class="${data.kind === "projects" ? "active" : ""}">Proyectos (${n.project_count})</button></div><div id="work-list">${renderWorks(data.works) || '<p class="empty-state">No hay registros de este tipo asociados al perfil.</p>'}</div>${data.has_more ? `<button id="load-person-works" class="button load-more" data-offset="20">Ver más registros</button>` : ""}</details>`;
  bindInspector();
  document.querySelector(".production-details").addEventListener("toggle", (event) => { state.productionOpen = event.currentTarget.open; });
  $("neighbors-only").addEventListener("click", () => {
    state.neighborsOnly = !state.neighborsOnly;
    applyFilters();
  });
  $("load-person-works")?.addEventListener("click", async (event) => {
    const button = event.currentTarget,
      offset = Number(button.dataset.offset);
    button.disabled = true;
    try {
      const more = await getJSON(
        `/api/professors/${n.id}?kind=${data.kind}&offset=${offset}`,
      );
      if (
        state.selected !== n.id ||
        state.selectedPair ||
        state.personKind !== data.kind
      )
        return;
      $("work-list").insertAdjacentHTML("beforeend", renderWorks(more.works));
      button.dataset.offset = offset + 20;
      button.hidden = !more.has_more;
    } catch (error) {
      button.textContent = error.message;
    }
    button.disabled = false;
  });
}

async function selectPair(a, b) {
  const token = ++requestSerial;
  setInspector(true);
  $("inspector").scrollTop = 0;
  state.selected = null;
  state.selectedPair = [Math.min(a, b), Math.max(a, b)];
  state.neighborsOnly = false;
  renderGraph();
  $("inspector").innerHTML =
    '<div class="loading-placeholder">Consultando las señales y su evidencia…</div>';
  const key = pairKey(a, b);
  try {
    if (!pairCache.has(key))
      pairCache.set(key, await getJSON(`/api/pairs/${a}/${b}`));
    if (token !== requestSerial) return;
    renderPair(pairCache.get(key));
  } catch (error) {
    if (token === requestSerial)
      $("inspector").innerHTML =
        `<p class="empty-state">${escape(error.message)}</p>`;
  }
}

function pairCoincidences(data) {
  const shared = data.institution.shared || [];
  const exact = shared.filter((o) => o.type === data.institution.level);
  const memberships = (exact.length ? exact : shared).slice(0, 2);
  const evidence = [];
  if (data.observed) evidence.push(`<div><strong>${data.total} trabajos compartidos</strong><small>Colaboración registrada</small></div>`);
  for (const org of memberships) evidence.push(`<div><small>Pertenencia compartida</small><a href="${escape(org.source_url)}" target="_blank" rel="noreferrer">${escape(org.name)} ↗</a></div>`);
  const interests = data.signals?.shared_interests || [];
  const concepts = data.signals?.shared_concepts || [];
  if (interests.length || concepts.length) evidence.push(`<div><small>${interests.length ? "Intereses coincidentes" : "Conceptos coincidentes"}</small>${tags((interests.length ? interests : concepts).slice(0, 4))}</div>`);
  if (data.common_neighbors.length) evidence.push(`<div><small>Colaboradores comunes · ${data.common_neighbors.length}</small><strong>${data.common_neighbors.slice(0, 2).map((id) => escape(shortName(nodeById.get(id).name))).join(" · ")}${data.common_neighbors.length > 2 ? "…" : ""}</strong></div>`);
  if (!evidence.length && data.signals?.related_terms?.length) {
    const term = data.signals.related_terms[0];
    evidence.push(`<div><small>Relación temática estimada</small><strong>${escape(term.a)} ↔ ${escape(term.b)}</strong><small>Detectada por el modelo; no es coincidencia textual.</small></div>`);
  }
  return `<section class="pair-coincidences"><h3>${data.observed ? "Evidencia compartida" : "Qué tienen en común"}</h3>${evidence.join("") || '<p>Sin coincidencias directas publicadas.</p>'}</section>`;
}

function renderPair(data) {
  const a = nodeById.get(data.source),
    b = nodeById.get(data.target);
  const scored = data.signals ? scorePair(data.signals, state.weights) : null;
  const observedLabel = data.observed
    ? "CONEXIÓN REGISTRADA"
    : "CANDIDATO A EXPLORAR";
  const explanation = {
    thematic: data.signals?.shared_interests?.length
      ? "Comparten intereses declarados."
      : "Comparación semántica de los temas disponibles.",
    institutional:
      data.institution.score === null
        ? "Faltan pertenencias específicas suficientes para comparar."
        : data.institution.shared.length
          ? `${data.institution.level === "research_group" ? "Grupo de investigación" : ["research_center", "institute"].includes(data.institution.level) ? "Centro o instituto" : "Departamento"} compartido; no se suman niveles.`
          : "No se publicó una pertenencia específica compartida.",
    structural: !data.path.length
      ? "Están en componentes desconectados: RWR = 0."
      : `${data.common_neighbors.length} colaboradores comunes. La señal utiliza solo la red observada.`,
  };
  const contributions = scored
    ? Object.entries(state.weights)
        .map(([k, w]) => `${signalLabel(k)} ${w} %`)
        .join(" · ")
    : "";
  $("inspector").innerHTML =
    `<button class="back-button" data-back>← Volver al panorama</button><div class="eyebrow" style="margin-top:23px">${observedLabel}</div><div class="pair-names"><span>${escape(a.name)}<small>${escape(shortDepartment(a.department))}</small></span><span>↕</span><span>${escape(b.name)}<small>${escape(shortDepartment(b.department))}</small></span></div>${pairCoincidences(data)}${
      data.observed
        ? tags(
            Object.entries(data.observed.counts).map(
              ([kind, count]) => `${relationLabel(kind)} · ${count}`,
            ),
          )
        : `<div class="score-total"><span>Prioridad exploratoria</span><strong>${scored?.score != null ? decimal(scored.score * 100) : "—"}<small> / 100</small></strong></div><p class="score-weights">${contributions}</p><p class="scope-note score-coverage">No es una probabilidad de colaboración. ${scored ? `Cobertura de señales activas: ${decimal(scored.coverage * 100, 0)} %.` : ""}</p>`
    }${data.signals ? `<section class="detail-section"><h3>Las tres señales</h3>${["thematic", "institutional", "structural"].map((key) => `<div class="signal-row"><div class="signal-label"><i class="signal-dot ${key}"></i>${criterionName(key)}<strong>${data.signals[key] == null ? "N/D" : decimal(data.signals[key] * 100)}<small>${data.signals[key] == null ? "" : " /100"}</small></strong></div><div class="signal-track"><span class="${key}" style="width:${(data.signals[key] ?? 0) * 100}%"></span></div><div class="signal-explanation">${explanation[key]}</div></div>`).join("")}</section>` : '<p class="scope-note">La comparación de afinidad aún no está preparada.</p>'}${data.profiles && Object.values(data.profiles).some((p) => p?.biography_fallback) ? '<div class="insight-note">Uno de estos perfiles usa <strong>biografía como respaldo</strong>. Su cobertura temática es menor que la de perfiles con intereses y huellas.</div>' : ""}<details class="pair-extra"><summary>Más coincidencias y explicación</summary>${data.signals?.shared_concepts?.length ? `<section class="detail-section"><h3>Conceptos coincidentes</h3>${tags(data.signals.shared_concepts)}</section>` : ""}${data.signals?.shared_interests?.length ? `<section class="detail-section"><h3>Intereses coincidentes</h3>${tags(data.signals.shared_interests)}</section>` : ""}${data.signals?.related_terms?.length ? `<section class="detail-section"><h3>Términos relacionados por el modelo</h3>${data.signals.related_terms.map((t) => `<div class="related-terms">${escape(t.a)}<span>↔ ${escape(t.b)}</span></div>`).join("")}<p class="scope-note">Ejemplos de semejanza textual; no prueban colaboración.</p></section>` : ""}${data.institution.shared.length ? `<section class="detail-section"><h3>Pertenencia compartida</h3>${data.institution.shared.map((o) => `<div class="affiliation"><a href="${escape(o.source_url)}" target="_blank" rel="noreferrer">${escape(o.name)} ↗</a></div>`).join("")}</section>` : ""}<section class="detail-section"><h3>Camino en la red observada</h3><p class="path-text">${data.path.length ? data.path.map((id) => escape(shortName(nodeById.get(id).name))).join(" → ") : "No hay un camino entre ambos dentro de esta cohorte."}</p></section></details>${data.observed ? `<section class="detail-section"><h3>Registros compartidos · ${data.total}</h3><div id="pair-work-list">${renderWorks(data.works)}</div>${data.has_more ? '<button id="load-pair-works" class="button load-more" data-offset="20">Ver más evidencia</button>' : ""}</section>` : ""}<div class="detail-section"><button class="button" data-person="${a.id}">Ver primer perfil</button> <button class="button" data-person="${b.id}">Ver segundo perfil</button></div>`;
  bindInspector();
  $("load-pair-works")?.addEventListener("click", async (event) => {
    const button = event.currentTarget,
      offset = Number(button.dataset.offset);
    button.disabled = true;
    try {
      const more = await getJSON(`/api/pairs/${a.id}/${b.id}?offset=${offset}`);
      if (
        !state.selectedPair ||
        pairKey(...state.selectedPair) !== pairKey(a.id, b.id)
      )
        return;
      $("pair-work-list").insertAdjacentHTML(
        "beforeend",
        renderWorks(more.works),
      );
      button.dataset.offset = offset + 20;
      button.hidden = !more.has_more;
    } catch (error) {
      button.textContent = error.message;
    }
    button.disabled = false;
  });
}

function bindInspector() {
  $("inspector")
    .querySelectorAll("[data-person]")
    .forEach((b) =>
      b.addEventListener("click", () => selectPerson(Number(b.dataset.person))),
    );
  $("inspector")
    .querySelectorAll("[data-pair]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        selectPair(...b.dataset.pair.split(",").map(Number)),
      ),
    );
  $("inspector")
    .querySelectorAll("[data-kind]")
    .forEach((b) =>
      b.addEventListener("click", () =>
        selectPerson(state.selected, {
          kind: b.dataset.kind,
          keepPosition: true,
        }),
      ),
    );
  $("inspector")
    .querySelector("[data-back]")
    ?.addEventListener("click", clearSelection);
}

function refreshInspector() {
  if (state.selectedPair) {
    const data = pairCache.get(pairKey(...state.selectedPair));
    if (data) renderPair(data);
  } else if (state.selected) {
    const data = personCache.get(
      `/api/professors/${state.selected}?kind=${state.personKind}`,
    );
    if (data) renderPerson(data);
  } else clearInspector();
}

function clearSelection() {
  ++requestSerial;
  state.hovered = null;
  state.hoveredPair = null;
  state.selected = null;
  state.selectedPair = null;
  state.neighborsOnly = false;
  renderGraph();
  clearInspector();
  $("inspector").scrollTop = 0;
  setInspector(false);
}

function applyFilters() {
  renderGraph();
  if (
    (state.selected && !visibleIds.has(state.selected)) ||
    state.selectedPair?.some((id) => !visibleIds.has(id))
  )
    clearSelection();
  refreshInspector();
  fitGraph(true);
}

function setTask(task) {
  ++requestSerial;
  state.task = task;
  state.selected = null;
  state.selectedPair = null;
  state.hovered = null;
  state.hoveredPair = null;
  state.neighborsOnly = false;
  state.metric = task === "bridges" ? "betweenness" : "degree";
  document.querySelectorAll("[data-task]").forEach((b) => {
    const active = b.dataset.task === task;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  setInspector(false);
  renderGraph();
  clearInspector();
  updateMetricKey();
  fitGraph(false);
}

function syncSuggestionControls() {
  $("prediction-toggle").disabled = !recommendations.length;
  $("prediction-toggle").setAttribute("aria-checked", String(state.predictions));
  $("prediction-options").disabled = !state.predictions;
  $("prediction-options").hidden = !state.predictions;
  if (!state.predictions) $("criteria-options").open = false;
  document.querySelector(".prediction-controls").classList.toggle("showing-predictions", state.predictions);
}

function updateMetricKey() {
  $("metric-key").textContent = {
    degree: "Conexiones visibles",
    betweenness: "Intermediación observada",
  }[state.metric];
  $("metric-key").title =
    state.metric === "degree"
      ? "Vecinos por conexiones registradas y sugeridas que aparecen en pantalla. Las sugerencias no modifican las métricas observadas."
      : "Métrica de la red observada completa.";
}

function wireCriterionHelp() {
  for (const key of Object.keys(criterionText)) {
    const label = document.querySelector(`label[for="weight-${key}"]`);
    const name = { thematic: "Temática", institutional: "Institución", structural: "Red" }[key];
    label.querySelector(".signal-dot").insertAdjacentHTML("afterend", criterionName(key, name));
    // Labels originally contained an unwrapped text node.
    for (const child of [...label.childNodes]) if (child.nodeType === Node.TEXT_NODE) child.remove();
    $(`weight-${key}`).setAttribute("aria-label", `Peso de ${name.toLowerCase()}`);
    const description = document.createElement("span");
    description.id = `criterion-description-${key}`;
    description.className = "sr-only";
    description.textContent = criterionText[key];
    document.body.append(description);
  }
  const tip = $("criterion-tooltip");
  const show = (trigger) => {
    const rect = trigger.getBoundingClientRect();
    tip.textContent = criterionText[trigger.dataset.criterion];
    tip.hidden = false;
    tip.style.left = `${Math.max(10, Math.min(innerWidth - 270, rect.left))}px`;
    tip.style.top = `${Math.max(8, rect.top - tip.offsetHeight - 9)}px`;
  };
  for (const type of ["mouseover", "focusin"]) document.addEventListener(type, (event) => {
    const trigger = event.target.closest("[data-criterion]");
    if (trigger) show(trigger);
  });
  for (const type of ["mouseout", "focusout"]) document.addEventListener(type, (event) => {
    if (event.target.closest("[data-criterion]") && !event.relatedTarget?.closest?.("[data-criterion]")) tip.hidden = true;
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-criterion]");
    if (trigger) { event.preventDefault(); show(trigger); } else tip.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") tip.hidden = true;
    const trigger = event.target.closest("[data-criterion]");
    if (trigger && ["Enter", " "].includes(event.key)) { event.preventDefault(); show(trigger); }
  });
}

function wireControls() {
  wireCriterionHelp();
  const legend = document.querySelector(".map-legend");
  const controls = document.querySelector(".prediction-controls");
  const reserveControls = new ResizeObserver(() => {
    const panel = document.querySelector(".network-panel");
    panel.style.setProperty("--legend-height", `${legend.offsetHeight}px`);
    panel.style.setProperty("--prediction-height", `${controls.offsetHeight}px`);
    fitGraph(false);
  });
  reserveControls.observe(legend);
  reserveControls.observe(controls);
  $("inspector-close").addEventListener("click", clearSelection);
  $("active-filters").addEventListener("click", (event) => {
    const key = event.target.closest("[data-clear-filter]")?.dataset.clearFilter;
    if (!key) return;
    if (key === "all") {
      Object.assign(state, { department: "", neighborsOnly: false });
    } else state[key] = key === "neighborsOnly" ? false : "";
    applyFilters();
  });
  for (const type of ["mouseover", "focusin"])
    $("color-legend").addEventListener(type, (event) => {
      const value = event.target.closest("[data-category]")?.dataset.category;
      if (value !== undefined) previewCategory(value);
    });
  $("color-legend").addEventListener("mouseleave", () => previewCategory());
  $("color-legend").addEventListener("focusout", (event) => {
    if (!$("color-legend").contains(event.relatedTarget)) previewCategory();
  });
  $("color-legend").addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.department = state.department === button.dataset.category ? "" : button.dataset.category;
    applyFilters();
  });
  document
    .querySelectorAll("[data-task]")
    .forEach((b) => b.addEventListener("click", () => setTask(b.dataset.task)));
  $("prediction-toggle").addEventListener("click", () => {
    state.predictions = !state.predictions;
    // Closing the layer also clears a suggested pair inspected outside the Top.
    if (!state.predictions && state.selectedPair && !observed.some(
      (e) => pairKey(e.source, e.target) === pairKey(...state.selectedPair),
    )) clearSelection();
    syncSuggestionControls();
    renderGraph();
    refreshInspector();
  });
  $("top-percent").addEventListener("input", (event) => {
    state.percent = Number(event.target.value);
    $("top-percent-value").textContent = `${decimal(state.percent)} %`;
    scheduleSuggestions();
  });
  document.querySelectorAll("[data-weight]").forEach((input) =>
    input.addEventListener("input", (event) => {
      state.weights = adjustWeights(
        state.weights,
        input.dataset.weight,
        event.target.value,
      );
      for (const [key, value] of Object.entries(state.weights)) {
        $(`weight-${key}`).value = value;
        $(`value-${key}`).textContent = `${value} %`;
      }
      scheduleSuggestions();
    }),
  );
  $("fit").addEventListener("click", () => fitGraph(true));
  $("zoom-in").addEventListener("click", () =>
    svg.transition().duration(duration).call(zoom.scaleBy, 1.35),
  );
  $("zoom-out").addEventListener("click", () =>
    svg
      .transition()
      .duration(duration)
      .call(zoom.scaleBy, 1 / 1.35),
  );
  $("reset").addEventListener("click", () => {
    Object.assign(state, {
      department: "",
      predictions: false,
      percent: 1,
      weights: { ...DEFAULT_WEIGHTS },
      productionOpen: false,
      selected: null,
      selectedPair: null,
      hovered: null,
      hoveredPair: null,
      neighborsOnly: false,
    });
    $("search").value = "";
    $("search-results").hidden = true;
    document.querySelector(".color-legend").open = false;
    $("top-percent").value = 1;
    $("top-percent-value").textContent = "1 %";
    for (const [key, value] of Object.entries(state.weights)) {
      $(`weight-${key}`).value = value;
      $(`value-${key}`).textContent = `${value} %`;
    }
    syncSuggestionControls();
    layout.reset(nodes);
    setTask("collaborators");
    setInspector(false);
    fitGraph(true);
  });
  const dialog = $("method-dialog");
  for (const id of ["method-open"])
    $(id).addEventListener("click", (event) => {
      event.preventDefault();
      dialog.showModal();
    });
  $("method-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (
        event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom
      )
        dialog.close();
    }
  });
  $("search").addEventListener("input", (event) => {
    const query = normalized(event.target.value.trim());
    const results =
      query.length > 1
        ? nodes.filter((n) => normalized(n.name).includes(query)).slice(0, 7)
        : [];
    $("search-results").hidden = !query;
    $("search-results").innerHTML = results.length
      ? results
          .map(
            (n) =>
              `<button class="search-result" data-search-id="${n.id}">${escape(n.name)}<small>${escape(shortDepartment(n.department))}</small></button>`,
          )
          .join("")
      : '<div class="search-result">Escribe al menos dos letras o prueba otro nombre.</div>';
    $("search-results")
      .querySelectorAll("button")
      .forEach((b) =>
        b.addEventListener("click", () =>
          findPerson(Number(b.dataset.searchId)),
        ),
      );
  });
  $("search").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      const first = $("search-results").querySelector("button");
      if (first) findPerson(Number(first.dataset.searchId));
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      $("search-results").querySelector("button")?.focus();
    }
    if (event.key === "Escape") $("search-results").hidden = true;
  });
  document.addEventListener("click", (event) => {
    if (
      !event.target.closest(".search-wrap") &&
      !event.target.closest(".search-results")
    )
      $("search-results").hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("method-dialog").open) {
      clearSelection();
    }
  });
}

function findPerson(id) {
  if (!visibleIds.has(id)) {
    Object.assign(state, { department: "", neighborsOnly: false });
  }
  $("search").value = nodeById.get(id).name;
  selectPerson(id);
  fitGraph(true);
}

async function start() {
  try {
    network = await getJSON("/api/network");
    nodes = network.nodes;
    observed = network.edges;
    for (const metric of ["degree", "betweenness"])
      metricMaxima[metric] = d3.max(nodes, (n) => n.network_metrics[metric]) || 1;
    nodeById = new Map(nodes.map((n) => [n.id, n]));
    fillControls();
    setupGraph();
    wireControls();
    renderGraph();
    clearInspector();
    fitGraph(false);
    try {
      const data = await getJSON("/api/recommendations");
      recommendations = data.pairs;
      preparation = data.profiles;
      syncSuggestionControls();
      renderGraph();
      refreshInspector();
      $("prediction-error").hidden = true;
    } catch (error) {
      $("prediction-error").textContent = error.message;
      $("prediction-error").hidden = false;
    }
    window.utecvis = {
      state,
      nodes,
      observed,
      get top() {
        return top;
      },
      get visibleIds() {
        return visibleIds;
      },
      get preparation() {
        return preparation;
      },
      get layout() {
        return layout;
      },
      get connectionCounts() {
        return connectionCounts;
      },
    };
  } catch (error) {
    $("graph-message").textContent =
      `No se pudo cargar la red: ${error.message}`;
    $("inspector").innerHTML =
      '<p class="empty-state">Revisa la disponibilidad de los datos y vuelve a cargar la página.</p>';
  }
}

start();

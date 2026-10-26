import {
  DEFAULT_WEIGHTS,
  adjustWeights,
  scorePair,
  selectTop,
  pairKey,
  visibleConnections,
} from "./scoring.mjs";

import { createNetworkLayout } from "./layout.mjs";

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
const reducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
).matches;
const duration = reducedMotion ? 0 : 300;
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
  metric: "degree",
  color: "department",
  department: "",
  organisation: "",
  predictions: false,
  percent: 1,
  weights: { ...DEFAULT_WEIGHTS },
  selected: null,
  selectedPair: null,
  neighborsOnly: false,
  hovered: null,
  personKind: "publications",
  rankMetric: "degree",
};
let network,
  nodes,
  nodeById,
  observed,
  recommendations = [],
  preparation = {},
  institutions = [],
  visibleIds;
let departments,
  colors,
  communityColors,
  nontrivialCommunities,
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
let displayedPredictions = [];
const pairCache = new Map();
const personCache = new Map();

async function getJSON(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
  return data;
}

function nodeColor(node) {
  if (state.color === "community") {
    return node.network_metrics.degree
      ? communityColors(node.network_metrics.community)
      : "#a3afa6";
  }
  return node.department ? colors(node.department) : "#a3afa6";
}

function radius(node) {
  if (state.metric === "degree") {
    const count =
      connectionCounts.get(node.id)?.total ?? node.network_metrics.degree;
    // Fixed scale: adding a connection always grows its endpoints, even when
    // another node becomes the new maximum. Zero-degree nodes remain visible.
    return 7 + 12 * Math.sqrt(count);
  }
  const max = d3.max(nodes, (n) => n.network_metrics[state.metric]) || 1;
  return (
    7 + Math.sqrt(Math.max(0, node.network_metrics[state.metric]) / max) * 44
  );
}

function setInspector(open) {
  $("inspector-panel").hidden = !open;
  $("rankings-toggle").setAttribute("aria-expanded", String(open));
}

function setFilters(open) {
  $("filters-panel").hidden = !open;
  $("filters-toggle").setAttribute("aria-expanded", String(open));
  if (open) setInspector(false);
}

function nodeConnectionText(node) {
  const counts = connectionCounts.get(node.id) || { recorded: 0, suggested: 0 };
  return `${counts.recorded} registradas${counts.suggested ? ` + ${counts.suggested} sugeridas` : ""}`;
}

function metricText(value, key = state.metric) {
  return key === "betweenness" ? decimal(value, 4) : nf.format(value);
}

function tags(values, klass = "") {
  return `<div class="tag-list">${values.map((t) => `<span class="tag ${klass}">${escape(t)}</span>`).join("")}</div>`;
}

function fillControls() {
  departments = [
    ...new Set(nodes.map((n) => n.department).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "es"));
  colors = d3.scaleOrdinal(departments, palette);
  const memberships = new Map();
  for (const node of nodes) {
    for (const org of node.affiliations) {
      if (
        !["research_group", "research_center", "institute"].includes(org.type)
      )
        continue;
      if (!memberships.has(org.organisation_id))
        memberships.set(org.organisation_id, { ...org, members: new Set() });
      memberships.get(org.organisation_id).members.add(node.id);
    }
  }
  institutions = [...memberships.values()].sort(
    (a, b) =>
      b.members.size - a.members.size || a.name.localeCompare(b.name, "es"),
  );
  $("department").insertAdjacentHTML(
    "beforeend",
    departments
      .map(
        (d) =>
          `<option value="${escape(d)}">${escape(shortDepartment(d))}</option>`,
      )
      .join("") + '<option value="unknown">Sin departamento publicado</option>',
  );
  $("organisation").insertAdjacentHTML(
    "beforeend",
    institutions
      .map(
        (o) =>
          `<option value="${escape(o.organisation_id)}">${escape(o.name)} (${o.members.size})</option>`,
      )
      .join(""),
  );
  nontrivialCommunities = [
    ...new Set(
      nodes
        .filter((n) => n.network_metrics.degree > 0)
        .map((n) => n.network_metrics.community),
    ),
  ].sort((a, b) => a - b);
  communityColors = d3.scaleOrdinal(nontrivialCommunities, palette);
}

function computeVisible() {
  let visible = nodes.filter(
    (n) =>
      (!state.department ||
        (state.department === "unknown"
          ? !n.department
          : n.departments.includes(state.department))) &&
      (!state.organisation ||
        n.affiliations.some((o) => o.organisation_id === state.organisation)),
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
    `${top.display.length} / ${nf.format(top.eligible)} parejas`;
  $("candidate-count").title =
    "Fracción de parejas candidatas. No es una probabilidad de colaboración.";
  const count =
    Number(Boolean(state.department)) +
    Number(Boolean(state.organisation)) +
    Number(state.neighborsOnly);
  $("filter-count").hidden = !count;
  $("filter-count").textContent = count;
  $("network-svg").setAttribute(
    "aria-label",
    `Red académica: ${visibleIds.size} investigadores visibles, ${edges.length} conexiones registradas y ${displayedPredictions.length} sugerencias visibles.`,
  );
  $("graph-message").textContent = visibleIds.size
    ? ""
    : "No hay investigadores con esta combinación de filtros. Prueba otro grupo o departamento.";
}

function renderLegend() {
  $("legend-title").textContent =
    state.color === "department" ? "Departamentos" : "Comunidades";
  const entries =
    state.color === "department"
      ? [
          ...departments.map((d) => [shortDepartment(d), colors(d)]),
          ["Sin departamento", "#a3afa6"],
        ]
      : [
          ...nontrivialCommunities.map((c) => [
            `Comunidad ${c + 1}`,
            communityColors(c),
          ]),
          ["Sin conexiones observadas", "#a3afa6"],
        ];
  $("color-legend").innerHTML = entries
    .map(
      ([name, color]) =>
        `<span class="legend-item"><i class="legend-dot" style="background:${color}"></i>${escape(name)}</span>`,
    )
    .join("");
}

function showTooltip(event, html) {
  const tip = $("tooltip");
  tip.innerHTML = html;
  tip.hidden = false;
  const rect = $("graph-container").getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(rect.width - tip.offsetWidth - 8, event.clientX - rect.left + 16))}px`;
  tip.style.top = `${Math.max(8, Math.min(rect.height - tip.offsetHeight - 8, event.clientY - rect.top - 15))}px`;
}

function focusStyles() {
  const seed = state.hovered || state.selected;
  const adjacent = new Set(seed ? [seed] : []);
  if (seed)
    for (const e of [...observed, ...displayedPredictions]) {
      if (e.source === seed) adjacent.add(e.target);
      if (e.target === seed) adjacent.add(e.source);
    }
  if (state.selectedPair) state.selectedPair.forEach((id) => adjacent.add(id));
  nodeSelection
    .classed(
      "selected",
      (n) => n.id === state.selected || state.selectedPair?.includes(n.id),
    )
    .classed("hovered", (n) => n.id === state.hovered)
    .classed(
      "dimmed",
      (n) => seed && !adjacent.has(n.id) && !state.selectedPair?.includes(n.id),
    );
  nodeSelection
    .select(".node-label")
    .style("display", (n) =>
      n.id === seed || state.selectedPair?.includes(n.id) || zoomLevel > 1.7
        ? null
        : "none",
    );
  edgeSelection
    .classed(
      "edge-dimmed",
      (e) => seed && e.source !== seed && e.target !== seed,
    )
    .classed(
      "edge-focused",
      (e) =>
        state.selectedPair &&
        pairKey(e.source, e.target) === pairKey(...state.selectedPair),
    );
  predictionSelection
    ?.classed(
      "edge-dimmed",
      (p) => seed && p.source !== seed && p.target !== seed,
    )
    .classed(
      "selected",
      (p) =>
        state.selectedPair &&
        pairKey(p.source, p.target) === pairKey(...state.selectedPair),
    );
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
  layer?.select(".isolate-ring").attr("r", layout?.ringRadius || 0);
  nodeSelection?.attr("transform", (n) => `translate(${n.x},${n.y})`);
  edgeSelection?.attr("d", edgePath);
  layer?.selectAll(".observed-hit").attr("d", edgePath);
  predictionSelection?.attr("d", predictedPath);
  layer?.selectAll(".prediction-hit").attr("d", predictedPath);
}

function setupGraph() {
  svg = d3.select("#network-svg");
  const container = $("graph-container");
  width = container.clientWidth;
  height = container.clientHeight;
  layer = svg.append("g");
  layer
    .append("circle")
    .attr("class", "isolate-ring")
    .attr("fill", "none")
    .attr("pointer-events", "none");
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
      if (nodeSelection) focusStyles();
      $("tooltip").hidden = true;
    });
  svg.call(zoom).on("dblclick.zoom", null);
  svg.on("click", (event) => {
    if (event.target === svg.node()) clearSelection();
  });
  layout = createNetworkLayout(d3, radius, { onTick: tick, reducedMotion });
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

function renderGraph() {
  visibleIds = computeVisible();
  if (state.hovered && !visibleIds.has(state.hovered)) state.hovered = null;
  top = selectTop(recommendations, state.weights, state.percent, visibleIds);
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
    .range([2.2, 13]);
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
      showTooltip(
        event,
        `<strong>${escape(shortName(nodeById.get(e.source).name))} ↔ ${escape(shortName(nodeById.get(e.target).name))}</strong><small>${e.weight} registros compartidos · ${e.relations.map(relationLabel).join(" / ")}</small>`,
      ),
    )
    .on("mouseleave", () => {
      $("tooltip").hidden = true;
    })
    .on("click", (event, e) => {
      event.stopPropagation();
      selectPair(e.source, e.target);
    });
  let predictionEdges = state.predictions ? [...top.display] : [];
  if (
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
      showTooltip(
        event,
        `<strong>Conexión sugerida</strong><small>${escape(shortName(nodeById.get(p.source).name))} ↔ ${escape(shortName(nodeById.get(p.target).name))}</small><small>Prioridad ${decimal(p.score * 100)} / 100 · Clic para ver por qué</small>`,
      ),
    )
    .on("mouseleave", () => {
      $("tooltip").hidden = true;
    })
    .on("click", (event, p) => {
      event.stopPropagation();
      selectPair(p.source, p.target);
    });
  const layoutChanged = layout.configure(
    nodes.filter((n) => visibleIds.has(n.id)),
    visibleEdges,
    connectionCounts,
    predictionEdges,
  );
  layer
    .select(".isolate-ring")
    .attr("r", layout.ringRadius)
    .style("display", layout.isolatedCount > 2 ? null : "none");
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
      state.hovered = n.id;
      focusStyles();
      showTooltip(
        event,
        `<strong>${escape(n.name)}</strong><small>${escape(shortDepartment(n.department))}</small><small>${nodeConnectionText(n)}</small>`,
      );
    })
    .on("mousemove", (event, n) => {
      if (!$("tooltip").hidden)
        showTooltip(
          event,
          `<strong>${escape(n.name)}</strong><small>${escape(shortDepartment(n.department))}</small><small>${nodeConnectionText(n)}</small>`,
        );
    })
    .on("mouseleave", () => {
      state.hovered = null;
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
  tick();
  focusStyles();
  updateStats();
  renderLegend();
  if (layoutChanged && lastFitRadius !== layout.outerRadius) fitGraph(false);
}

function fitGraph(animated = true) {
  const visible = nodes.filter((n) => visibleIds?.has(n.id));
  if (!visible.length) return;
  const small = visible.length <= 3;
  const extent = layout.outerRadius;
  const x0 = small ? d3.min(visible, (n) => n.x - radius(n)) - 20 : -extent;
  const x1 = small ? d3.max(visible, (n) => n.x + radius(n)) + 20 : extent;
  const y0 = small ? d3.min(visible, (n) => n.y - radius(n)) - 20 : -extent;
  const y1 = small ? d3.max(visible, (n) => n.y + radius(n)) + 20 : extent;
  // A circular graph uses the full height; the wide-screen controls occupy
  // the otherwise empty right margin rather than covering the network.
  const wide = width >= 1100;
  const rightSpace = wide ? 320 : 24;
  const topSpace = width <= 720 ? 105 : 70;
  const bottomSpace = width <= 720 ? 225 : wide ? 28 : 165;
  const availableHeight = Math.max(120, height - topSpace - bottomSpace);
  const availableWidth = Math.max(150, width - rightSpace - 24);
  const scale =
    Math.min(
      availableWidth / Math.max(100, x1 - x0),
      availableHeight / Math.max(100, y1 - y0),
      2.8,
    ) * 0.98;
  const transform = d3.zoomIdentity
    .translate(
      24 + availableWidth / 2 - ((x0 + x1) / 2) * scale,
      topSpace + availableHeight / 2 - ((y0 + y1) / 2) * scale,
    )
    .scale(scale);
  lastFitRadius = layout.outerRadius;
  (animated && !reducedMotion ? svg.transition().duration(400) : svg).call(
    zoom.transform,
    transform,
  );
}

function rankingHTML(metric) {
  return [...nodes]
    .filter((n) => visibleIds.has(n.id))
    .sort(
      (a, b) =>
        b.network_metrics[metric] - a.network_metrics[metric] || a.id - b.id,
    )
    .slice(0, 10)
    .map(
      (n, i) =>
        `<button class="rank-row" data-person="${n.id}"><span class="rank-number">${String(i + 1).padStart(2, "0")}</span><span class="person-dot" style="background:${nodeColor(n)}"></span><span class="rank-person">${escape(shortName(n.name))}<small>${escape(shortDepartment(n.department))}</small></span><span class="rank-value">${metricText(n.network_metrics[metric], metric)}<small>${metric === "degree" ? "personas" : metric === "weighted_degree" ? "registros" : "intermediación"}</small></span></button>`,
    )
    .join("");
}

function renderOverview() {
  const panel = $("inspector");
  if (state.task === "affinities") {
    panel.innerHTML = `<div class="eyebrow">AFINIDADES</div><h2>Parejas sugeridas</h2><p class="scope-note">Prioridad exploratoria · no es probabilidad.</p><div class="ranking-list">${
      top.ranked
        .slice(0, 8)
        .map(
          (p, i) =>
            `<button class="rank-row" data-pair="${p.source},${p.target}"><span class="rank-number">${i + 1}</span><span class="rank-person">${escape(shortName(nodeById.get(p.source).name))}<small>↔ ${escape(shortName(nodeById.get(p.target).name))}</small></span><span class="rank-value">${decimal(p.score * 100)}<small>/ 100</small></span></button>`,
        )
        .join("") ||
      '<p class="empty-state">Sin candidatos con estos pesos y filtros.</p>'
    }</div>`;
  } else if (state.task === "communities") {
    const groups = institutions.filter((o) =>
      [...o.members].some((id) => visibleIds.has(id)),
    );
    panel.innerHTML = `<div class="eyebrow">PERTENENCIAS</div><h2>Grupos y centros</h2><p class="scope-note">El color muestra comunidades de la red observada.</p>${groups.map((o) => `<button class="group-card" data-group="${escape(o.organisation_id)}"><span>${escape(o.name)}</span><strong>${[...o.members].filter((id) => visibleIds.has(id)).length}</strong></button>`).join("") || '<p class="empty-state">Sin grupos publicados en esta selección.</p>'}`;
  } else {
    const bridges = state.task === "bridges";
    const metric = bridges ? "betweenness" : state.rankMetric;
    panel.innerHTML = `<div class="eyebrow">RED OBSERVADA</div><h2>${bridges ? "Puentes" : "Colaboradores"}</h2>${bridges ? '<p class="scope-note">Intermediación · red completa de 104 personas.</p>' : `<div class="ranking-tabs"><button data-rank="degree" class="${metric === "degree" ? "active" : ""}">Colaboradores</button><button data-rank="weighted_degree" class="${metric === "weighted_degree" ? "active" : ""}">Trabajos</button></div>`}<div class="ranking-list">${rankingHTML(metric)}</div><p class="scope-note">Solo conexiones registradas. Selecciona para consultar evidencia.</p>`;
  }
  bindInspector();
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
  setFilters(false);
  setInspector(true);
  $("inspector").scrollTop = 0;
  state.selected = id;
  state.selectedPair = null;
  state.personKind = options.kind || "publications";
  $("neighbors-only").disabled = false;
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
  const candidates = top.ranked
    .filter((p) => p.source === n.id || p.target === n.id)
    .slice(0, 5);
  const sourceNames = {
    research_areas: "Intereses declarados",
    fingerprint: "Huella temática",
    biography: "Biografía como respaldo",
  };
  $("inspector").innerHTML =
    `<button class="back-button" data-back>← Volver al panorama</button><div class="avatar" style="color:${nodeColor(n)};background:${nodeColor(n)}18;border-color:${nodeColor(n)}55">${escape(initials(n.name))}</div><div class="eyebrow">INVESTIGADOR / UTEC</div><h2>${escape(n.name)}</h2><p class="department-name">${escape(n.department || "Sin departamento publicado")}</p><a class="text-link" href="${escape(n.source_url)}" target="_blank" rel="noreferrer">Ver perfil en CRIS ↗</a><div class="metric-grid"><div><strong>${m.degree}</strong><span>colaboradores en la cohorte</span></div><div><strong>${nf.format(m.weighted_degree)}</strong><span>registros compartidos</span></div><div><strong>${decimal(m.betweenness, 4)}</strong><span>intermediación</span></div><div><strong>${data.cross_department_neighbors}</strong><span>vecinos de otros departamentos</span></div></div><p class="scope-note">Métricas de la red observada completa.</p>${!m.degree ? '<div class="insight-note"><strong>Sin conexiones dentro de estos 104 perfiles.</strong> Sus trabajos pueden tener coautores externos; no equivale a investigar en solitario.</div>' : ""}<section class="detail-section"><h3>Intereses de investigación</h3>${n.research_areas.length ? tags(n.research_areas) : '<p class="scope-note">No publicados en el perfil.</p>'}<p class="scope-note">${(data.preparation?.sources || []).map((s) => sourceNames[s]).join(" + ") || "Sin preparación temática"}${data.preparation?.biography_fallback ? ". Cobertura temática limitada." : ""}</p></section><section class="detail-section"><h3>Pertenencias</h3>${
      n.affiliations
        .filter((a) => a.type !== "university")
        .map(
          (a) =>
            `<div class="affiliation">${escape(a.name)}${a.role ? `<small>${escape(a.role)}</small>` : ""}</div>`,
        )
        .join("") ||
      '<p class="scope-note">Sin pertenencias específicas publicadas.</p>'
    }</section>${data.neighbors.length ? `<section class="detail-section"><h3>Colaboradores registrados · ${data.neighbors.length}</h3>${data.neighbors.map((p) => `<button class="rank-row" data-pair="${n.id},${p.id}"><span class="rank-person">${escape(shortName(p.name))}<small>${p.relations.map(relationLabel).join(" · ")}</small></span><span class="rank-value">${nf.format(p.weight)}<small>registros</small></span></button>`).join("")}</section>` : ""}${
      candidates.length
        ? `<section class="detail-section"><h3>Candidatos según tus prioridades</h3>${candidates
            .map((p) => {
              const other = nodeById.get(
                p.source === n.id ? p.target : p.source,
              );
              return `<button class="rank-row" data-pair="${p.source},${p.target}"><span class="rank-person">${escape(shortName(other.name))}<small>Sin conexión registrada</small></span><span class="rank-value">${decimal(p.score * 100)}<small>/ 100</small></span></button>`;
            })
            .join(
              "",
            )}<p class="scope-note">Mejores parejas de este perfil entre los filtros actuales, aunque estén fuera del Top global.</p></section>`
        : ""
    }<section class="detail-section"><h3>Producción registrada</h3><div class="ranking-tabs"><button data-kind="publications" class="${data.kind === "publications" ? "active" : ""}">Publicaciones (${n.publication_count})</button><button data-kind="projects" class="${data.kind === "projects" ? "active" : ""}">Proyectos (${n.project_count})</button></div><div id="work-list">${renderWorks(data.works) || '<p class="empty-state">No hay registros de este tipo asociados al perfil.</p>'}</div>${data.has_more ? `<button id="load-person-works" class="button load-more" data-offset="20">Ver más registros</button>` : ""}</section>${n.biography ? `<details class="detail-section profile-bio"><summary>Perfil profesional</summary><p>${escape(n.biography)}</p></details>` : ""}`;
  bindInspector();
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
  setFilters(false);
  setInspector(true);
  $("inspector").scrollTop = 0;
  state.selected = null;
  state.selectedPair = [Math.min(a, b), Math.max(a, b)];
  state.neighborsOnly = false;
  $("neighbors-only").disabled = true;
  $("neighbors-only").classList.remove("active");
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
          ? "Coincidencia institucional más específica, sin sumar niveles."
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
    `<button class="back-button" data-back>← Volver al panorama</button><div class="eyebrow" style="margin-top:23px">${observedLabel}</div><div class="pair-names"><span>${escape(a.name)}<small>${escape(shortDepartment(a.department))}</small></span><span>↕</span><span>${escape(b.name)}<small>${escape(shortDepartment(b.department))}</small></span></div>${
      data.observed
        ? tags(
            Object.entries(data.observed.counts).map(
              ([kind, count]) => `${relationLabel(kind)} · ${count}`,
            ),
          )
        : `<div class="score-total"><span>Prioridad exploratoria<br>con tus pesos actuales</span><strong>${scored?.score != null ? decimal(scored.score * 100) : "—"}<small> / 100</small></strong></div><p class="scope-note">No es una probabilidad de colaboración. ${scored ? `Cobertura de señales activas: ${decimal(scored.coverage * 100, 0)} %.` : ""}</p>`
    }${data.signals ? `<section class="detail-section"><h3>Las tres señales</h3>${["thematic", "institutional", "structural"].map((key) => `<div class="signal-row"><div class="signal-label"><i class="signal-dot ${key}"></i>${signalLabel(key)}<strong>${data.signals[key] == null ? "N/D" : decimal(data.signals[key] * 100)}<small>${data.signals[key] == null ? "" : " /100"}</small></strong></div><div class="signal-track"><span class="${key}" style="width:${(data.signals[key] ?? 0) * 100}%"></span></div><div class="signal-explanation">${explanation[key]}</div></div>`).join("")}<p class="scope-note">${contributions}</p></section>` : '<p class="scope-note">La comparación de afinidad aún no está preparada.</p>'}${data.profiles && Object.values(data.profiles).some((p) => p?.biography_fallback) ? '<div class="insight-note">Uno de estos perfiles usa <strong>biografía como respaldo</strong>. Su cobertura temática es menor que la de perfiles con intereses y huellas.</div>' : ""}${data.signals?.shared_concepts?.length ? `<section class="detail-section"><h3>Conceptos coincidentes</h3>${tags(data.signals.shared_concepts)}</section>` : ""}${data.signals?.shared_interests?.length ? `<section class="detail-section"><h3>Intereses coincidentes</h3>${tags(data.signals.shared_interests)}</section>` : ""}${data.signals?.related_terms?.length ? `<section class="detail-section"><h3>Términos relacionados por el modelo</h3>${data.signals.related_terms.map((t) => `<div class="related-terms">${escape(t.a)}<span>↔ ${escape(t.b)}</span></div>`).join("")}<p class="scope-note">Ejemplos de semejanza textual; no prueban colaboración.</p></section>` : ""}${data.institution.shared.length ? `<section class="detail-section"><h3>Pertenencia compartida</h3>${data.institution.shared.map((o) => `<div class="affiliation"><a href="${escape(o.source_url)}" target="_blank" rel="noreferrer">${escape(o.name)} ↗</a></div>`).join("")}</section>` : ""}<section class="detail-section"><h3>Camino en la red observada</h3><p class="path-text">${data.path.length ? data.path.map((id) => escape(shortName(nodeById.get(id).name))).join(" → ") : "No hay un camino entre ambos dentro de esta cohorte."}</p></section>${data.observed ? `<section class="detail-section"><h3>Registros compartidos · ${data.total}</h3><div id="pair-work-list">${renderWorks(data.works)}</div>${data.has_more ? '<button id="load-pair-works" class="button load-more" data-offset="20">Ver más evidencia</button>' : ""}</section>` : ""}<div class="detail-section"><button class="button" data-person="${a.id}">Ver primer perfil</button> <button class="button" data-person="${b.id}">Ver segundo perfil</button></div>`;
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
    .querySelectorAll("[data-rank]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        state.rankMetric = b.dataset.rank;
        state.metric = state.rankMetric;
        $("metric").value = state.metric;
        renderGraph();
        renderOverview();
        updateMetricKey();
      }),
    );
  $("inspector")
    .querySelectorAll("[data-group]")
    .forEach((b) =>
      b.addEventListener("click", () => {
        state.organisation = b.dataset.group;
        $("organisation").value = state.organisation;
        applyFilters();
      }),
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
  } else renderOverview();
}

function clearSelection() {
  ++requestSerial;
  state.hovered = null;
  state.selected = null;
  state.selectedPair = null;
  state.neighborsOnly = false;
  $("neighbors-only").disabled = true;
  $("neighbors-only").classList.remove("active");
  renderGraph();
  renderOverview();
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

function setPredictions(enabled) {
  if (!recommendations.length && enabled) return;
  state.predictions = enabled;
  document
    .querySelector(".prediction-controls")
    .classList.toggle("showing-predictions", enabled);
  $("prediction-toggle").setAttribute("aria-checked", String(enabled));
  $("prediction-options").hidden = !enabled;
  $("prediction-status").hidden = enabled;
  $("candidate-count").hidden = !enabled;
  renderGraph();
  updateMetricKey();
  refreshInspector();
}

function setTask(task) {
  state.task = task;
  document.querySelector(".controls").scrollTop = 0;
  document
    .querySelectorAll("[data-task]")
    .forEach((b) => b.classList.toggle("active", b.dataset.task === task));
  if (task === "bridges") {
    state.metric = "betweenness";
    $("metric").value = state.metric;
  }
  if (task === "collaborators") {
    state.metric = state.rankMetric;
    $("metric").value = state.metric;
  }
  if (task === "affinities" || task === "communities") {
    state.metric = "degree";
    $("metric").value = state.metric;
  }
  state.color = task === "communities" ? "community" : "department";
  $("color").value = state.color;
  if (task === "affinities") setPredictions(true);
  else setPredictions(false);
  clearSelection();
  setFilters(false);
  setInspector(task !== "affinities");
  updateMetricKey();
}

function updateMetricKey() {
  $("metric-key").textContent = {
    degree: "Conexiones visibles",
    weighted_degree: "Trabajos registrados",
    betweenness: "Intermediación observada",
  }[state.metric];
  $("metric-key").title =
    state.metric === "degree"
      ? "Vecinos por conexiones registradas y sugeridas que aparecen en pantalla. Las sugerencias no modifican las métricas observadas."
      : "Métrica de la red observada completa.";
}

function wireControls() {
  $("filters-toggle").addEventListener("click", () =>
    setFilters($("filters-panel").hidden),
  );
  $("filters-close").addEventListener("click", () => setFilters(false));
  $("rankings-toggle").addEventListener("click", () => {
    const open = $("inspector-panel").hidden;
    setFilters(false);
    if (open) clearSelection();
    setInspector(open);
  });
  $("inspector-close").addEventListener("click", clearSelection);
  $("clear-filters").addEventListener("click", () => {
    state.department = "";
    state.organisation = "";
    state.neighborsOnly = false;
    $("department").value = "";
    $("organisation").value = "";
    $("neighbors-only").classList.remove("active");
    applyFilters();
  });
  document
    .querySelectorAll("[data-task]")
    .forEach((b) => b.addEventListener("click", () => setTask(b.dataset.task)));
  $("department").addEventListener("change", (event) => {
    state.department = event.target.value;
    applyFilters();
  });
  $("organisation").addEventListener("change", (event) => {
    state.organisation = event.target.value;
    applyFilters();
  });
  $("metric").addEventListener("change", (event) => {
    state.metric = event.target.value;
    renderGraph();
    updateMetricKey();
  });
  $("color").addEventListener("change", (event) => {
    state.color = event.target.value;
    renderGraph();
    refreshInspector();
  });
  $("prediction-toggle").addEventListener("click", () =>
    setPredictions(!state.predictions),
  );
  $("top-percent").addEventListener("input", (event) => {
    state.percent = Number(event.target.value);
    $("top-percent-value").textContent = `${decimal(state.percent)} %`;
    renderGraph();
    refreshInspector();
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
      renderGraph();
      refreshInspector();
    }),
  );
  $("neighbors-only").addEventListener("click", () => {
    state.neighborsOnly = !state.neighborsOnly;
    $("neighbors-only").classList.toggle("active", state.neighborsOnly);
    applyFilters();
  });
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
      organisation: "",
      percent: 1,
      weights: { ...DEFAULT_WEIGHTS },
      rankMetric: "degree",
      selected: null,
      selectedPair: null,
      hovered: null,
      neighborsOnly: false,
    });
    $("department").value = "";
    $("organisation").value = "";
    $("search").value = "";
    $("search-results").hidden = true;
    $("top-percent").value = 1;
    $("top-percent-value").textContent = "1 %";
    for (const [key, value] of Object.entries(state.weights)) {
      $(`weight-${key}`).value = value;
      $(`value-${key}`).textContent = `${value} %`;
    }
    layout.reset(nodes);
    setTask("collaborators");
    setInspector(false);
    setFilters(false);
    fitGraph(true);
  });
  const dialog = $("method-dialog");
  for (const id of ["method-open", "footer-method"])
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
      setFilters(false);
      clearSelection();
    }
  });
}

function findPerson(id) {
  const n = nodeById.get(id);
  if (!visibleIds.has(id)) {
    state.department = "";
    state.organisation = "";
    state.neighborsOnly = false;
    $("department").value = "";
    $("organisation").value = "";
  }
  $("search").value = n.name;
  selectPerson(id);
  fitGraph(true);
}

async function start() {
  try {
    network = await getJSON("/api/network");
    nodes = network.nodes;
    observed = network.edges;
    nodeById = new Map(nodes.map((n) => [n.id, n]));
    fillControls();
    setupGraph();
    wireControls();
    renderGraph();
    renderOverview();
    fitGraph(false);
    try {
      const data = await getJSON("/api/recommendations");
      recommendations = data.pairs;
      preparation = data.profiles;
      renderGraph();
      refreshInspector();
      $("prediction-status").textContent = "Desactivadas";
    } catch (error) {
      $("prediction-status").textContent = error.message;
      $("prediction-toggle").disabled = true;
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

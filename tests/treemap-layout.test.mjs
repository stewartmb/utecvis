import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createTreemapLayout} from "../app/static/treemap-layout.mjs";
import {selectTop, visibleConnections, DEFAULT_WEIGHTS, pairKey} from "../app/static/scoring.mjs";
const require = createRequire(import.meta.url);
const d3 = require("../app/static/vendor/d3.min.js");
const data = JSON.parse(readFileSync(new URL("../data/network.json", import.meta.url)));
const analysis = JSON.parse(readFileSync(new URL("../data/analysis.json", import.meta.url)));
const existing = new Set(data.edges.map((e) => pairKey(e.source, e.target)));
const candidates = analysis.recommendations.pairs.filter((p) => !existing.has(pairKey(p.source, p.target)));

function fixture() {
  const nodes = structuredClone(data.nodes);
  let counts = new Map();
  const radius = (n) => 7 + 44 * (counts.get(n.id)?.total ?? n.network_metrics.degree) / 9;
  const layout = createTreemapLayout(d3, radius);
  function update(percent = 0, weights = DEFAULT_WEIGHTS, selected = nodes) {
    const ids = new Set(selected.map((n) => n.id));
    const edges = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
    const suggested = selectTop(candidates, weights, percent, ids).display;
    counts = visibleConnections(ids, edges, suggested);
    layout.configure(selected, edges, counts, suggested);
  }
  return {nodes, layout, radius, update};
}

function verify(layout, radius) {
  assert.ok(layout.maxOverlap < 0.06, `Overlap ${layout.maxOverlap}`);
  for (const n of layout.nodes) {
    const b = layout.boxFor(n), r = radius(n);
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    assert.ok(n.x - r >= b.x0 + 16 - 0.01);
    assert.ok(n.x + r <= b.x1 - 16 + 0.01);
    assert.ok(n.y - r >= b.y0 + 44 - 0.01);
    assert.ok(n.y + r <= b.y1 - 16 + 0.01);
  }
  const ratios = layout.cells.map((b) => (b.x1 - b.x0) * (b.y1 - b.y0) / b.count);
  if (ratios.length) assert.ok(Math.max(...ratios) / Math.min(...ratios) < 1.000001);
}

test("Treemap: 104 investigadores por departamento, área proporcional y métricas intactas", () => {
  const {nodes, layout, radius, update} = fixture();
  const metrics = JSON.stringify(nodes.map((n) => n.network_metrics));
  update(); verify(layout, radius);
  assert.equal(layout.cells.reduce((s, b) => s + b.count, 0), 104);
  assert.ok(layout.cells.length > 1);
  assert.equal(JSON.stringify(nodes.map((n) => n.network_metrics)), metrics);
});

test("Treemap mantiene contención y separación con Top 1, 2 y 10 %, pesos extremos y filtros", () => {
  const {nodes, layout, radius, update} = fixture();
  for (const p of [0, 1, 2, 10, 0]) { update(p); verify(layout, radius); }
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    update(10, {thematic:0, institutional:0, structural:0, [key]:100}); verify(layout, radius);
  }
  update(1, DEFAULT_WEIGHTS, nodes.filter((n) => n.department === nodes[0].department)); verify(layout, radius);
  update(0, DEFAULT_WEIGHTS, [nodes[0]]); verify(layout, radius);
  update(0, DEFAULT_WEIGHTS, []); assert.equal(layout.cells.length, 0);
});

test("Arrastrar conserva la pertenencia publicada y evita solapamientos incluso en esquinas", () => {
  const {layout, radius, update} = fixture(); update(1);
  const n = layout.nodes.find((n) => n.network_metrics.degree > 0);
  const metrics = JSON.stringify(layout.nodes.map((p) => p.network_metrics));
  const box = layout.boxFor(n);
  layout.startDrag(n);
  for (const [x, y] of [[box.x0,box.y0],[box.x1,box.y1],[0,0],[1e6,-1e6]]) {
    layout.drag(n, x, y); layout.advance(8); verify(layout, radius);
  }
  layout.release(n); verify(layout, radius);
  assert.equal(JSON.stringify(layout.nodes.map((p) => p.network_metrics)), metrics);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createNetworkLayout } from "../app/static/layout.mjs";
import {
  visibleConnections,
  selectTop,
  DEFAULT_WEIGHTS,
  pairKey,
} from "../app/static/scoring.mjs";
const require = createRequire(import.meta.url);
const d3 = require("../app/static/vendor/d3.min.js");
const data = JSON.parse(
  readFileSync(new URL("../data/network.json", import.meta.url)),
);
const analysis = JSON.parse(
  readFileSync(new URL("../data/analysis.json", import.meta.url)),
);
const existing = new Set(data.edges.map((e) => pairKey(e.source, e.target)));
const candidates = analysis.recommendations.pairs.filter(
  (e) => !existing.has(pairKey(e.source, e.target)),
);

function fixture() {
  const nodes = structuredClone(data.nodes);
  let counts = new Map();
  const radius = (n) =>
    7 + 12 * Math.sqrt(counts.get(n.id)?.total ?? n.network_metrics.degree);
  const layout = createNetworkLayout(d3, radius);
  const update = (
    percent = 0,
    weights = DEFAULT_WEIGHTS,
    ids = new Set(nodes.map((n) => n.id)),
  ) => {
    const observed = data.edges.filter(
      (e) => ids.has(e.source) && ids.has(e.target),
    );
    const predicted = selectTop(candidates, weights, percent, ids).display;
    counts = visibleConnections(ids, observed, predicted);
    layout.configure(
      nodes.filter((n) => ids.has(n.id)),
      observed,
      counts,
    );
    return counts;
  };
  return { nodes, layout, update, radius };
}

function verify(layout, radius) {
  assert.ok(layout.maxOverlap < 0.06, `Overlap: ${layout.maxOverlap}`);
  const isolated = layout.nodes.filter((n) => layout.isIsolated(n));
  for (const n of layout.nodes) {
    assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y));
    if (layout.isIsolated(n))
      assert.ok(Math.abs(Math.hypot(n.x, n.y) - layout.ringRadius) < 1e-6);
    else
      assert.ok(Math.hypot(n.x, n.y) + radius(n) <= layout.coreRadius + 0.01);
  }
  if (isolated.length > 2) {
    const angles = isolated
      .map((n) => Math.atan2(n.y, n.x))
      .sort((a, b) => a - b);
    for (let i = 0; i < angles.length; i++) {
      const difference =
        (angles[(i + 1) % angles.length] - angles[i] + 2 * Math.PI) %
        (2 * Math.PI);
      assert.ok(Math.abs(difference - (2 * Math.PI) / angles.length) < 1e-6);
    }
  }
}

test("104 nodos: los aislados forman un círculo y los conectados quedan dentro sin solaparse", () => {
  const { layout, update, radius } = fixture();
  update();
  assert.equal(layout.isolatedCount, 55);
  verify(layout, radius);
});

test("Top 1, 2 y 10 %, extremos de pesos y vuelta al grafo observado respetan las restricciones", () => {
  const { nodes, layout, update, radius } = fixture();
  const metrics = JSON.stringify(nodes.map((n) => n.network_metrics));
  for (const p of [0, 1, 2, 10, 0]) {
    update(p);
    verify(layout, radius);
  }
  for (const key of ["thematic", "institutional", "structural"]) {
    update(10, { thematic: 0, institutional: 0, structural: 0, [key]: 100 });
    verify(layout, radius);
  }
  assert.equal(metrics, JSON.stringify(nodes.map((n) => n.network_metrics)));
});

test("D3 restringe el arrastre al interior y separa los círculos al soltar", () => {
  const { layout, update, radius } = fixture();
  update(2);
  const n = layout.nodes.find((n) => !layout.isIsolated(n));
  layout.drag(n, 100000, -100000);
  verify(layout, radius);
  layout.release(n);
  verify(layout, radius);
});

test("filtros, nodo único y restablecimiento reproducible", () => {
  const { nodes, layout, update, radius } = fixture();
  update();
  const initial = nodes.map((n) => [n.id, n.x, n.y]);
  const ids = new Set(
    nodes.filter((n) => n.department === nodes[0].department).map((n) => n.id),
  );
  update(10, DEFAULT_WEIGHTS, ids);
  verify(layout, radius);
  update(0, DEFAULT_WEIGHTS, new Set([nodes[0].id]));
  verify(layout, radius);
  layout.reset(nodes);
  update();
  verify(layout, radius);
  assert.deepEqual(
    nodes.map((n) => [n.id, n.x, n.y]),
    initial,
  );
});

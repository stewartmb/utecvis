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
      predicted,
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
  assert.equal(layout.isolatedCount, 57);
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

test("al mantener un nodo arrastrado, sus vecinos siguen el enlace antes de soltar", () => {
  const nodes = [1, 2, 3, 4].map((id) => ({ id, network_metrics: { degree: id < 3 ? 1 : 0 } }));
  const radius = () => 15;
  let frames = 0;
  const layout = createNetworkLayout(d3, radius, { onTick: () => frames++, reducedMotion: true });
  const counts = new Map(nodes.map((n) => [n.id, { total: n.network_metrics.degree }]));
  layout.configure(nodes, [{ source: 1, target: 2 }], counts);
  const a = nodes[0], b = nodes[1];
  const before = { x: b.x, y: b.y };
  const target = { x: a.x + 150, y: a.y - 100 };
  layout.startDrag(a);
  layout.drag(a, target.x, target.y);
  for (let i = 0; i < 30; i++) {
    layout.advance();
    verify(layout, radius);
  }
  assert.ok(Math.hypot(b.x - before.x, b.y - before.y) > 20);
  assert.ok((b.x - before.x) * 150 + (b.y - before.y) * -100 > 0);
  assert.equal(a.x, a.fx);
  assert.equal(a.y, a.fy);
  assert.ok(frames > 0);
  layout.release(a);
  assert.equal(a.fx, null);
  assert.equal(layout.dragging, false);
  verify(layout, radius);
});

test("arrastrar sobre otro nodo no permite solaparlo en ningún paso de la simulación", () => {
  const { layout, update, radius } = fixture();
  update(10);
  const connected = layout.nodes.filter((n) => !layout.isIsolated(n));
  const a = connected[0], b = connected[1];
  layout.startDrag(a);
  for (let i = 0; i < 12; i++) {
    layout.drag(a, b.x, b.y);
    layout.advance(2);
    verify(layout, radius);
  }
  layout.release(a);
  verify(layout, radius);
});

test("los aislados se pueden reordenar por el perímetro sin cubrirse ni crear enlaces", () => {
  const { layout, update, radius } = fixture();
  update();
  const n = layout.nodes.find((n) => layout.isIsolated(n));
  const old = { x: n.x, y: n.y };
  layout.startDrag(n);
  for (let i = 0; i < 30; i++) {
    const angle = i * 0.35;
    layout.drag(n, 1e5 * Math.cos(angle), 1e5 * Math.sin(angle));
    assert.ok(layout.maxOverlap < 0.06);
    assert.ok(Math.abs(Math.hypot(n.x, n.y) - layout.ringRadius) < 0.001);
  }
  layout.release(n);
  verify(layout, radius);
  assert.ok(Math.hypot(n.x - old.x, n.y - old.y) > 50);
  assert.equal(n.network_metrics.degree, 0);
});


test("la tracción acompaña el desplazamiento y se transmite por la cadena de vecinos", () => {
  const nodes = [1, 2, 3, 4, 5].map((id) => ({ id, network_metrics: { degree: id > 3 ? 0 : id === 2 ? 2 : 1 } }));
  const counts = new Map(nodes.map((n) => [n.id, { total: n.network_metrics.degree }]));
  const layout = createNetworkLayout(d3, () => 10);
  layout.configure(nodes, [{ source: 1, target: 2 }, { source: 2, target: 3 }], counts);
  const before = nodes.map((n) => ({ x: n.x, y: n.y }));
  layout.drag(nodes[0], nodes[0].x + 100, nodes[0].y);
  layout.advance(35);
  assert.ok(nodes[1].x - before[1].x > 65);
  assert.ok(nodes[2].x - before[2].x > 35);
  verify(layout, () => 10);
  layout.release(nodes[0]);
});

test("una sugerencia visible transmite el arrastre sin convertirse en enlace observado", () => {
  const nodes = [1, 2, 3, 4, 5].map((id) => ({ id, network_metrics: { degree: 0 } }));
  const counts = new Map(nodes.map((n) => [n.id, { total: n.id < 3 ? 1 : 0 }]));
  const layout = createNetworkLayout(d3, () => 10);
  layout.configure(nodes, [], counts, [{ source: 1, target: 2 }]);
  const before = nodes[1].x;
  layout.drag(nodes[0], nodes[0].x + 100, nodes[0].y);
  layout.advance(35);
  assert.ok(nodes[1].x - before > 65);
  assert.ok(nodes.every((n) => n.network_metrics.degree === 0));
  verify(layout, () => 10);
  layout.release(nodes[0]);
});

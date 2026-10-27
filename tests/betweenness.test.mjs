import test from "node:test";
import assert from "node:assert/strict";
import { betweenness } from "../app/static/betweenness.mjs";

const edge = (source, target) => ({ source, target });

test("Brandes: caminos, aislados y normalización sobre toda la cohorte", () => {
  assert.deepEqual(betweenness([1, 2, 3], [edge(1, 2), edge(2, 3)]), [[1, 0], [2, 1], [3, 0]]);
  const values = new Map(betweenness([1, 2, 3, 4, 5, 6], [edge(1, 2), edge(2, 3)]));
  assert.equal(values.get(2), 0.1);
  assert.equal(values.get(6), 0);
  assert.deepEqual(betweenness([1, 2], [edge(1, 2)]), [[1, 0], [2, 0]]);
});

test("Brandes reparte caminos mínimos empatados y una nueva arista puede reducir B", () => {
  const diamond = [edge(1, 2), edge(1, 3), edge(2, 4), edge(3, 4)];
  for (const [, value] of betweenness([1, 2, 3, 4], diamond))
    assert.equal(value, 1 / 6);
  const triangle = [edge(1, 2), edge(2, 3), edge(1, 3)];
  assert.ok(betweenness([1, 2, 3], triangle).every(([, value]) => value === 0));
});

test("No duplica aristas, no usa pesos como distancia y conserva entradas", () => {
  const ids = [1, 2, 3];
  const edges = [edge(1, 2), edge(2, 1), edge(2, 3), edge(1, 1), edge(1, 9)];
  edges[0].weight = 100;
  const before = JSON.stringify({ ids, edges });
  assert.deepEqual(betweenness(ids, edges), [[1, 0], [2, 1], [3, 0]]);
  assert.equal(JSON.stringify({ ids, edges }), before);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  adjustWeights,
  scorePair,
  selectTop,
  rankCandidates,
  DEFAULT_WEIGHTS,
  visibleConnections,
} from "../app/static/scoring.mjs";

test("el grado visible cuenta nuevas aristas sin duplicar ni alterar la red observada", () => {
  const observed = [{ source: 1, target: 2 }];
  const suggested = [
    { source: 2, target: 3 },
    { source: 3, target: 2 },
    { source: 1, target: 2 },
    { source: 4, target: 5 },
  ];
  const before = JSON.stringify(observed);
  const counts = visibleConnections(new Set([1, 2, 3, 4]), observed, suggested);
  assert.deepEqual(counts.get(2), { recorded: 1, suggested: 1, total: 2 });
  assert.deepEqual(counts.get(3), { recorded: 0, suggested: 1, total: 1 });
  assert.deepEqual(counts.get(4), { recorded: 0, suggested: 0, total: 0 });
  assert.equal(
    [...counts.values()].reduce((sum, n) => sum + n.total, 0),
    4,
  );
  assert.equal(
    visibleConnections(new Set([1, 2]), observed, suggested).get(2).total,
    1,
  );
  assert.equal(
    visibleConnections(new Set([1, 2, 3]), observed, []).get(3).total,
    0,
  );
  assert.equal(JSON.stringify(observed), before);
});

test("los controles conservan 100 % incluso en los extremos", () => {
  assert.deepEqual(adjustWeights(DEFAULT_WEIGHTS, "thematic", 80), {
    thematic: 80,
    institutional: 15,
    structural: 5,
  });
  const extreme = adjustWeights(DEFAULT_WEIGHTS, "structural", 100);
  assert.deepEqual(extreme, { thematic: 0, institutional: 0, structural: 100 });
  const result = adjustWeights(extreme, "structural", 60);
  assert.equal(
    Object.values(result).reduce((a, b) => a + b),
    100,
  );
  assert.deepEqual(result, { thematic: 20, institutional: 20, structural: 60 });
});

test("una señal ausente no se interpreta como cero", () => {
  const pair = {
    source: 1,
    target: 2,
    thematic: 0.8,
    institutional: null,
    structural: 0,
  };
  const scored = scorePair(pair, DEFAULT_WEIGHTS);
  assert.ok(Math.abs(scored.score - 0.48 / 0.7) < 1e-12);
  assert.equal(scored.coverage, 0.7);
  assert.equal(scored.contributions.institutional, null);
  assert.equal(
    scorePair(pair, { thematic: 0, institutional: 100, structural: 0 }).score,
    null,
  );
});

test("cambiar prioridades cambia el ranking sin modificar los datos originales", () => {
  const pairs = [
    { source: 1, target: 2, thematic: 0.9, institutional: 0, structural: 0 },
    { source: 1, target: 3, thematic: 0.2, institutional: 1, structural: 0.5 },
  ];
  const original = JSON.stringify(pairs);
  assert.equal(
    rankCandidates(pairs, { thematic: 100, institutional: 0, structural: 0 })[0]
      .target,
    2,
  );
  assert.equal(
    rankCandidates(pairs, { thematic: 0, institutional: 100, structural: 0 })[0]
      .target,
    3,
  );
  assert.equal(JSON.stringify(pairs), original);
});

test("Top % usa parejas elegibles, respeta filtros y no rellena con puntuaciones cero", () => {
  const pairs = [];
  for (let i = 0; i < 100; i++)
    pairs.push({
      source: 1,
      target: i + 2,
      thematic: i / 100,
      institutional: 0,
      structural: 0,
    });
  assert.equal(selectTop(pairs, DEFAULT_WEIGHTS, 1).display.length, 1);
  assert.equal(selectTop(pairs, DEFAULT_WEIGHTS, 0).display.length, 0);
  assert.equal(selectTop(pairs, DEFAULT_WEIGHTS, 10).display.length, 10);
  const filtered = selectTop(pairs, DEFAULT_WEIGHTS, 10, new Set([1, 2, 3]));
  assert.equal(filtered.eligible, 2);
  assert.equal(filtered.display.length, 1);
  const tied = rankCandidates(
    [
      { source: 3, target: 4, thematic: 1 },
      { source: 1, target: 5, thematic: 1 },
    ],
    { thematic: 100 },
  );
  assert.equal(tied[0].source, 1);
});

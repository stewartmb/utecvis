export const KEYS = ["thematic", "institutional", "structural"];
export const DEFAULT_WEIGHTS = {
  thematic: 60,
  institutional: 30,
  structural: 10,
};
export const pairKey = (a, b) => [Math.min(a, b), Math.max(a, b)].join(":");

// Display-only degree. It never changes observed metrics or recommendation inputs.
export function visibleConnections(ids, observed, suggested) {
  const counts = new Map(
    [...ids].map((id) => [id, { recorded: 0, suggested: 0, total: 0 }]),
  );
  const seen = new Set();
  for (const [kind, edges] of [
    ["recorded", observed],
    ["suggested", suggested],
  ]) {
    for (const edge of edges) {
      const { source, target } = edge;
      const key = pairKey(source, target);
      if (
        source === target ||
        !counts.has(source) ||
        !counts.has(target) ||
        seen.has(key)
      )
        continue;
      seen.add(key);
      for (const id of [source, target]) {
        counts.get(id)[kind] += 1;
        counts.get(id).total += 1;
      }
    }
  }
  return counts;
}

export function adjustWeights(previous, key, value) {
  if (!KEYS.includes(key)) throw new Error("Señal desconocida");
  const chosen = Math.max(0, Math.min(100, Math.round(Number(value))));
  const rest = KEYS.filter((k) => k !== key);
  const total = rest.reduce((s, k) => s + previous[k], 0);
  const first = Math.round(
    (100 - chosen) * (total ? previous[rest[0]] / total : 0.5),
  );
  return {
    ...previous,
    [key]: chosen,
    [rest[0]]: first,
    [rest[1]]: 100 - chosen - first,
  };
}

export function scorePair(pair, weights) {
  let active = 0;
  let possible = 0;
  let numerator = 0;
  const contributions = {};
  for (const key of KEYS) {
    const weight = Math.max(0, Number(weights[key]) || 0);
    possible += weight;
    const available =
      pair[key] !== null &&
      pair[key] !== undefined &&
      Number.isFinite(pair[key]);
    if (available) {
      active += weight;
      numerator += weight * pair[key];
    }
    contributions[key] = available ? weight * pair[key] : null;
  }
  return {
    ...pair,
    score: active ? numerator / active : null,
    coverage: possible ? active / possible : 0,
    contributions: Object.fromEntries(
      KEYS.map((k) => [
        k,
        contributions[k] === null || !active ? null : contributions[k] / active,
      ]),
    ),
  };
}

export function rankCandidates(pairs, weights, visible = null) {
  return pairs
    .filter(
      (p) =>
        p.source !== p.target &&
        (!visible || (visible.has(p.source) && visible.has(p.target))),
    )
    .map((p) => scorePair(p, weights))
    .filter((p) => p.score !== null && p.score > 0)
    .sort(
      (a, b) => b.score - a.score || a.source - b.source || a.target - b.target,
    );
}

export function selectTop(pairs, weights, percent, visible = null) {
  const eligible = pairs.filter(
    (p) =>
      p.source !== p.target &&
      (!visible || (visible.has(p.source) && visible.has(p.target))),
  );
  const ranked = rankCandidates(eligible, weights);
  const count = Math.ceil(
    (eligible.length * Math.max(0, Math.min(5, Number(percent) || 0))) / 100,
  );
  return {
    ranked,
    display: ranked.slice(0, count),
    eligible: eligible.length,
    requested: count,
  };
}

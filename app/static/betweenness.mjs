// Brandes, exact normalized node betweenness for an undirected unweighted graph.
// This works on a scenario copy; it never changes recorded metrics or RWR.
export function betweenness(ids, edges) {
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const adjacency = Array.from({ length: n }, () => new Set());
  for (const { source, target } of edges) {
    const a = index.get(source), b = index.get(target);
    if (a === undefined || b === undefined || a === b) continue;
    adjacency[a].add(b);
    adjacency[b].add(a);
  }
  const values = new Float64Array(n);
  for (let source = 0; source < n; source++) {
    const predecessors = Array.from({ length: n }, () => []);
    const distance = new Int32Array(n).fill(-1);
    const paths = new Float64Array(n);
    const queue = [source];
    distance[source] = 0;
    paths[source] = 1;
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head];
      for (const w of adjacency[v]) {
        if (distance[w] < 0) {
          distance[w] = distance[v] + 1;
          queue.push(w);
        }
        if (distance[w] === distance[v] + 1) {
          paths[w] += paths[v];
          predecessors[w].push(v);
        }
      }
    }
    const dependencies = new Float64Array(n);
    for (let i = queue.length - 1; i >= 0; i--) {
      const w = queue[i];
      for (const v of predecessors[w])
        dependencies[v] += (paths[v] / paths[w]) * (1 + dependencies[w]);
      if (w !== source) values[w] += dependencies[w];
    }
  }
  // Each undirected pair was traversed from both ends. This factor both
  // removes that duplication and normalizes by choose(n - 1, 2).
  const factor = n > 2 ? 1 / ((n - 1) * (n - 2)) : 0;
  return ids.map((id, i) => [id, values[i] * factor]);
}

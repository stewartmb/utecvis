import { betweenness } from "./betweenness.mjs";

self.onmessage = ({ data: { token, ids, edges } }) => {
  const start = performance.now();
  const values = betweenness(ids, edges);
  self.postMessage({ token, values, elapsed: performance.now() - start });
};

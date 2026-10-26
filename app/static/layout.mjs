// D3 only: forces, circular boundary and quadtree collision correction.
// This module changes presentation coordinates, never observed metrics or scores.
export function createNetworkLayout(d3, nodeRadius, options = {}) {
  const notify = options.onTick || (() => {});
  const animated = Boolean(options.onTick) && !options.reducedMotion;
  let dragged = null;
  let ringOrder = [];
  let adjacency = new Map(),
    dragGroup = new Map(),
    dragOrigin = null;
  const gap = 9;
  let items = [],
    links = [],
    counts = new Map();
  let ringRadius = 470,
    coreRadius = 434,
    outerRadius = 486;
  let signature = "",
    simulation = null;

  const isIsolated = (n) =>
    (counts.get(n.id)?.total ?? n.network_metrics.degree) === 0;
  const fixed = (n) => n.fx != null || n.fy != null;

  function confine(n) {
    if (isIsolated(n)) {
      n.x = n.fx;
      n.y = n.fy;
      n.vx = 0;
      n.vy = 0;
      return;
    }
    const limit = Math.max(1, coreRadius - nodeRadius(n) - gap);
    const distance = Math.hypot(n.x, n.y);
    if (distance > limit) {
      n.x *= limit / distance;
      n.y *= limit / distance;
      n.vx = 0;
      n.vy = 0;
      if (fixed(n)) {
        n.fx = n.x;
        n.fy = n.y;
      }
    }
  }

  function anchorRing() {
    const isolated = items.filter(isIsolated);
    const order = new Map(ringOrder.map((id, i) => [id, i]));
    isolated.sort(
      (a, b) => (order.get(a.id) ?? a.id) - (order.get(b.id) ?? b.id),
    );
    isolated.forEach((n, i) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / isolated.length;
      n.fx = ringRadius * Math.cos(angle);
      n.fy = ringRadius * Math.sin(angle);
      confine(n);
    });
  }

  function enforceBounds() {
    items.forEach(confine);
  }

  function separate(maxIterations = 250) {
    const largest = d3.max(items, nodeRadius) || 0;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let overlap = 0;
      const tree = d3.quadtree(
        items,
        (n) => n.x,
        (n) => n.y,
      );
      for (const a of items) {
        const reach = nodeRadius(a) + largest + gap;
        tree.visit((quad, x0, y0, x1, y1) => {
          if (!quad.length) {
            let leaf = quad;
            do {
              const b = leaf.data;
              if (a.index < b.index) {
                let dx = b.x - a.x,
                  dy = b.y - a.y;
                let distance = Math.hypot(dx, dy);
                const required = nodeRadius(a) + nodeRadius(b) + gap;
                if (distance < required - 0.005) {
                  if (!distance) {
                    dx = 0.001;
                    dy = 0;
                    distance = 0.001;
                  }
                  const penetration = required - distance;
                  const af = fixed(a),
                    bf = fixed(b);
                  if (!(af && bf)) {
                    const shift = penetration + 0.015;
                    const wa = af ? 0 : bf ? 1 : 0.5;
                    const wb = bf ? 0 : af ? 1 : 0.5;
                    a.x -= (dx / distance) * shift * wa;
                    a.y -= (dy / distance) * shift * wa;
                    b.x += (dx / distance) * shift * wb;
                    b.y += (dy / distance) * shift * wb;
                    overlap = Math.max(overlap, penetration);
                  }
                }
              }
              leaf = leaf.next;
            } while (leaf);
          }
          return (
            x0 > a.x + reach ||
            x1 < a.x - reach ||
            y0 > a.y + reach ||
            y1 < a.y - reach
          );
        });
      }
      enforceBounds();
      if (overlap < 0.03) return;
    }
  }

  function maxOverlap() {
    let result = 0;
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i],
          b = items[j];
        result = Math.max(
          result,
          nodeRadius(a) +
            nodeRadius(b) +
            gap -
            Math.hypot(a.x - b.x, a.y - b.y),
        );
      }
    return result;
  }

  function configure(visible, observedLinks, currentCounts, suggestedLinks = []) {
    const next =
      visible
        .map(
          (n) =>
            `${n.id}:${nodeRadius(n).toFixed(5)}:${currentCounts.get(n.id)?.total ?? 0}`,
        )
        .join("|") +
      observedLinks.map((e) => `${e.source}:${e.target}`).join("|") +
      suggestedLinks.map((e) => `suggested:${e.source}:${e.target}`).join("|");
    counts = currentCounts;
    if (next === signature) return false;
    signature = next;
    simulation?.stop();
    dragged = null;
    dragGroup = new Map();
    dragOrigin = null;
    items = [...visible].sort((a, b) => a.id - b.id);
    links = observedLinks.map((e) => ({ source: e.source, target: e.target }));
    adjacency = new Map(items.map((n) => [n.id, new Set()]));
    for (const e of [...observedLinks, ...suggestedLinks]) {
      adjacency.get(e.source)?.add(e.target);
      adjacency.get(e.target)?.add(e.source);
    }
    const connected = items.filter((n) => !isIsolated(n));
    const isolated = items.filter(isIsolated);
    ringOrder = isolated.map((n) => n.id);
    const ringNodeRadius = d3.max(isolated, nodeRadius) || 0;
    const footprint = d3.sum(connected, (n) => (nodeRadius(n) + gap) ** 2);
    const requiredCore = Math.sqrt(footprint / 0.72);
    const ringSpacing =
      isolated.length > 1
        ? (2 * ringNodeRadius + gap) / (2 * Math.sin(Math.PI / isolated.length))
        : 0;
    // Reserve room for the usual Top 0–2 % changes before zooming out for
    // dense scenarios; this preserves perceptible growth in the common range.
    ringRadius = Math.max(
      items.length > 3 ? 470 : 90,
      requiredCore + 2 * ringNodeRadius + 25,
      ringSpacing,
    );
    coreRadius = ringRadius - (isolated.length ? 2 * ringNodeRadius + 22 : 0);
    outerRadius = ringRadius + ringNodeRadius + gap;
    connected.forEach((n, i) => {
      const entered =
        n.onRing || !Number.isFinite(n.x) || !Number.isFinite(n.y);
      n.fx = null;
      n.fy = null;
      if (entered) {
        const angle = i * Math.PI * (3 - Math.sqrt(5));
        const distance =
          coreRadius *
          0.72 *
          Math.sqrt((i + 0.5) / Math.max(1, connected.length));
        n.x = distance * Math.cos(angle);
        n.y = distance * Math.sin(angle);
      }
      n.onRing = false;
      n.vx = 0;
      n.vy = 0;
      confine(n);
    });
    anchorRing();
    isolated.forEach((n) => {
      n.onRing = true;
    });
    simulation = d3
      .forceSimulation(items)
      .randomSource(d3.randomLcg(0.42))
      .alphaDecay(0.035)
      .velocityDecay(0.5)
      .force(
        "link",
        d3
          .forceLink(links)
          .id((n) => n.id)
          .distance((e) => nodeRadius(e.source) + nodeRadius(e.target) + 115)
          .strength(0.32)
          .iterations(2),
      )
      .force(
        "charge",
        d3.forceManyBody().strength((n) => (isIsolated(n) ? 0 : -340)),
      )
      .force(
        "collision",
        d3
          .forceCollide((n) => nodeRadius(n) + gap / 2)
          .strength(1)
          .iterations(8),
      )
      .force("drag-x", d3.forceX().strength(0))
      .force("drag-y", d3.forceY().strength(0))
      .force("x", d3.forceX(0).strength(0.006))
      .force("y", d3.forceY(0).strength(0.006))
      .force("boundary", enforceBounds)
      .on("tick", () => {
        // forceCollide is a soft velocity constraint. Project positions after
        // integration, before painting, so a pinned node cannot cover another.
        project();
        notify();
      })
      .on("end", () => {
        project();
        notify();
      })
      .stop();
    settle();
    return true;
  }

  function settle() {
    if (!items.length) return;
    simulation.alpha(0.7);
    for (let i = 0; i < 220; i++) {
      simulation.tick();
      enforceBounds();
    }
    separate();
    // Dense scenarios require more space rather than overlapping circles.
    for (let attempt = 0; maxOverlap() > 0.05 && attempt < 6; attempt++) {
      ringRadius *= 1.12;
      coreRadius *= 1.12;
      outerRadius *= 1.12;
      items
        .filter((n) => !isIsolated(n))
        .forEach((n) => {
          n.x *= 1.12;
          n.y *= 1.12;
        });
      anchorRing();
      separate(400);
    }
    enforceBounds();
    items.forEach((n) => {
      n.vx = 0;
      n.vy = 0;
    });
  }

  function project() {
    enforceBounds();
    separate(80);
    if (maxOverlap() > 0.05) separate(800);
  }

  // The same integration path is used by animation and deterministic tests.
  function advance(iterations = 1) {
    for (let i = 0; i < iterations; i++) {
      simulation?.tick();
      project();
    }
    notify();
  }

  function startDrag(n) {
    if (!items.includes(n) || (dragged && dragged !== n)) return false;
    dragged = n;
    n.fx = n.x;
    n.fy = n.y;
    n.vx = n.vy = 0;
    if (!isIsolated(n)) {
      // Snapshot this visible connected group. Direct neighbours follow the
      // full pointer displacement; transmission decreases at each graph hop.
      dragOrigin = { x: n.x, y: n.y };
      const depths = new Map([[n.id, 0]]),
        queue = [n.id];
      for (let i = 0; i < queue.length; i++) {
        const id = queue[i];
        for (const peer of adjacency.get(id) || []) {
          if (!depths.has(peer)) {
            depths.set(peer, depths.get(id) + 1);
            queue.push(peer);
          }
        }
      }
      dragGroup = new Map(
        items.filter((p) => depths.has(p.id) && p !== n).map((p) => [
          p.id,
          { x: p.x, y: p.y, influence: 0.78 ** (depths.get(p.id) - 1) },
        ]),
      );
      simulation.force("drag-x").strength((p) => (dragGroup.has(p.id) ? 0.85 : 0));
      simulation.force("drag-y").strength((p) => (dragGroup.has(p.id) ? 0.85 : 0));
      updatePull();
      simulation.alpha(Math.max(simulation.alpha(), 0.45)).alphaTarget(0.35);
      if (animated) simulation.restart();
    }
    return true;
  }

  function updatePull() {
    if (!dragOrigin || !dragged) return;
    const dx = dragged.x - dragOrigin.x,
      dy = dragged.y - dragOrigin.y;
    simulation.force("drag-x").x((p) => {
      const origin = dragGroup.get(p.id);
      return origin ? origin.x + dx * origin.influence : p.x;
    });
    simulation.force("drag-y").y((p) => {
      const origin = dragGroup.get(p.id);
      return origin ? origin.y + dy * origin.influence : p.y;
    });
  }

  function dragRing(n, x, y) {
    // An isolated node can travel around the perimeter. Adjacent ring nodes
    // make room along the circle; no fictional link to the core is introduced.
    const angle = Math.atan2(y, x);
    const tau = Math.PI * 2;
    const others = items.filter((p) => isIsolated(p) && p !== n);
    const relative = (p) => (Math.atan2(p.y, p.x) - angle + tau) % tau;
    others.sort((a, b) => relative(a) - relative(b));
    const ringSize = d3.max([n, ...others], nodeRadius) || 0;
    const step =
      2 * Math.asin(Math.min(1, (2 * ringSize + gap + 0.1) / (2 * ringRadius)));
    const position = (p, phi) => {
      p.x = p.fx = ringRadius * Math.cos(phi);
      p.y = p.fy = ringRadius * Math.sin(phi);
      p.vx = p.vy = 0;
    };
    position(n, angle);
    let previous = 0;
    others.forEach((p, i) => {
      const phi = Math.max(
        previous + step,
        Math.min(relative(p), tau - (others.length - i) * step),
      );
      position(p, angle + phi);
      previous = phi;
    });
  }

  function drag(n, x, y) {
    if (dragged !== n && !startDrag(n)) return;
    if (isIsolated(n)) {
      dragRing(n, x, y);
      notify();
      return;
    }
    n.x = n.fx = x;
    n.y = n.fy = y;
    confine(n);
    updatePull();
    project();
    // Reduced motion follows the pointer immediately, without a cooling timer.
    if (!animated) advance(options.reducedMotion ? 8 : 1);
    else notify();
  }

  function release(n) {
    if (dragged !== n) return;
    dragged = null;
    dragGroup = new Map();
    dragOrigin = null;
    simulation.force("drag-x").strength(0);
    simulation.force("drag-y").strength(0);
    if (isIsolated(n)) {
      const relative = (p) =>
        (Math.atan2(p.y, p.x) + Math.PI / 2 + 2 * Math.PI) % (2 * Math.PI);
      ringOrder = items
        .filter(isIsolated)
        .sort((a, b) => relative(a) - relative(b))
        .map((p) => p.id);
      anchorRing();
      notify();
      return;
    }
    n.fx = n.fy = null;
    simulation.alphaTarget(0);
    if (animated) simulation.restart();
    else {
      settle();
      notify();
    }
  }

  function reset(all = items) {
    simulation?.stop();
    dragged = null;
    ringOrder = [];
    dragGroup = new Map();
    dragOrigin = null;
    signature = "";
    all.forEach((n) => {
      n.x = NaN;
      n.y = NaN;
      n.onRing = false;
      n.fx = null;
      n.fy = null;
    });
  }

  return {
    configure,
    startDrag,
    advance,
    drag,
    release,
    reset,
    isIsolated,
    get dragging() {
      return dragged !== null;
    },
    get ringRadius() {
      return ringRadius;
    },
    get outerRadius() {
      return outerRadius;
    },
    get coreRadius() {
      return coreRadius;
    },
    get isolatedCount() {
      return items.filter(isIsolated).length;
    },
    get maxOverlap() {
      return maxOverlap();
    },
    get nodes() {
      return items;
    },
  };
}

// Experimental force-in-a-box layout. D3 treemap partitions departments;
// D3 forces arrange researchers inside their department's rectangle.
// Rectangle area represents researcher count, not collaboration or importance.
export function createTreemapLayout(d3, nodeRadius, options = {}) {
  const notify = options.onTick || (() => {});
  const animated = Boolean(options.onTick) && !options.reducedMotion;
  const gap = 9, padding = 16, header = 44;
  let items = [], cells = [], boxes = new Map(), counts = new Map();
  let simulation = null, signature = "", dragged = null;
  let worldWidth = 1500, worldHeight = 1000;
  let adjacency = new Map(), pull = new Map(), dragOrigin = null;
  const groupKey = (n) => n.department || "Sin departamento";
  const fixed = (n) => n.fx != null || n.fy != null;
  const boxFor = (n) => boxes.get(groupKey(n));

  function confine(n) {
    const b = boxFor(n), r = nodeRadius(n);
    if (!b) return;
    const x = Math.max(b.x0 + padding + r, Math.min(b.x1 - padding - r, n.x));
    const y = Math.max(b.y0 + header + r, Math.min(b.y1 - padding - r, n.y));
    if (x !== n.x) n.vx = 0;
    if (y !== n.y) n.vy = 0;
    n.x = x; n.y = y;
    if (fixed(n)) { n.fx = x; n.fy = y; }
  }

  function overlaps() {
    let worst = 0;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        worst = Math.max(worst, nodeRadius(a) + nodeRadius(b) + gap - Math.hypot(a.x - b.x, a.y - b.y));
      }
    }
    return worst;
  }

  function project(iterations = 160) {
    items.forEach(confine);
    for (let step = 0; step < iterations; step++) {
      let worst = 0;
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          if (groupKey(a) !== groupKey(b)) continue;
          let dx = b.x - a.x, dy = b.y - a.y;
          let distance = Math.hypot(dx, dy);
          const required = nodeRadius(a) + nodeRadius(b) + gap;
          if (distance >= required - 0.005) continue;
          if (distance < 1e-6) { dx = 0.001; dy = 0.001; distance = Math.hypot(dx, dy); }
          const penetration = required - distance + 0.02;
          const af = fixed(a), bf = fixed(b);
          const wa = af ? 0 : bf ? 1 : 0.5, wb = bf ? 0 : af ? 1 : 0.5;
          a.x -= dx / distance * penetration * wa;
          a.y -= dy / distance * penetration * wa;
          b.x += dx / distance * penetration * wb;
          b.y += dy / distance * penetration * wb;
          confine(a); confine(b);
          worst = Math.max(worst, penetration);
          // At a wall, separate along the less constrained axis as well.
          if (Math.hypot(a.x - b.x, a.y - b.y) < required - 0.01) {
            const vertical = Math.abs(dx) > Math.abs(dy);
            const axis = vertical ? "y" : "x";
            const direction = (b[axis] - a[axis]) >= 0 ? 1 : -1;
            a[axis] -= direction * penetration * wa;
            b[axis] += direction * penetration * wb;
            confine(a); confine(b);
          }
        }
      }
      if (worst < 0.03) break;
    }
  }

  // A conservative shelf packing verifies that the area can accommodate every
  // circle before forces start. All rectangles grow uniformly if needed, so
  // their area ratios continue to encode researcher count exactly.
  function packing(cell, members) {
    const ordered = [...members].sort((a, b) => nodeRadius(b) - nodeRadius(a) || a.id - b.id);
    let x = cell.x0 + padding, y = cell.y0 + header, row = 0;
    const positions = new Map();
    for (const n of ordered) {
      const diameter = nodeRadius(n) * 2;
      if (x + diameter > cell.x1 - padding) {
        x = cell.x0 + padding; y += row + gap; row = 0;
      }
      if (x + diameter > cell.x1 - padding || y + diameter > cell.y1 - padding) return null;
      positions.set(n.id, { x: x + diameter / 2, y: y + diameter / 2 });
      x += diameter + gap; row = Math.max(row, diameter);
    }
    return positions;
  }

  function partition() {
    const groups = d3.groups(items, groupKey).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "es"));
    const root = d3.hierarchy({children: groups.map(([name, members]) => ({name, count: members.length}))}).sum((d) => d.count || 0);
    // Shared edges without inner padding keep area proportional to count.
    d3.treemap().tile(d3.treemapSquarify.ratio(1.2)).size([worldWidth, worldHeight])(root);
    cells = root.leaves().map((leaf) => ({
      key: leaf.data.name, count: leaf.data.count,
      x0: leaf.x0 - worldWidth / 2, y0: leaf.y0 - worldHeight / 2,
      x1: leaf.x1 - worldWidth / 2, y1: leaf.y1 - worldHeight / 2,
    }));
    boxes = new Map(cells.map((b) => [b.key, b]));
    return groups;
  }

  function configure(visible, observedLinks, currentCounts, suggestedLinks = [], update = {}) {
    const next = visible.map((n) => `${n.id}:${nodeRadius(n).toFixed(5)}`).join("|") +
      observedLinks.map((e) => `${e.source}:${e.target}`).join("|") +
      suggestedLinks.map((e) => `s:${e.source}:${e.target}`).join("|");
    counts = currentCounts;
    if (signature === next) return false;
    signature = next;
    simulation?.stop(); dragged = null; pull.clear(); dragOrigin = null;
    items = [...visible].sort((a, b) => a.id - b.id);
    if (!items.length) { cells = []; boxes.clear(); return true; }
    const cohortScale = Math.min(1, Math.sqrt(items.length / 104));
    worldWidth = 1500 * cohortScale; worldHeight = 1000 * cohortScale;
    let groups, packed;
    for (let attempt = 0; attempt < 60; attempt++) {
      groups = partition(); packed = new Map();
      let fits = true;
      for (const [key, members] of groups) {
        const b = boxes.get(key), positions = packing(b, members);
        const footprint = d3.sum(members, (n) => Math.PI * (nodeRadius(n) + gap / 2) ** 2);
        if (!positions || footprint > (b.x1 - b.x0 - 2 * padding) * (b.y1 - b.y0 - header - padding) * 0.24) { fits = false; break; }
        for (const [id, position] of positions) packed.set(id, position);
      }
      if (fits) break;
      worldWidth *= 1.12; worldHeight *= 1.12;
    }
    for (const n of items) {
      const b = boxFor(n), p = packed.get(n.id);
      n.fx = n.fy = null; n.onRing = false; n.vx = n.vy = 0;
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || n.x < b.x0 || n.x > b.x1 || n.y < b.y0 + header || n.y > b.y1) {
        n.x = p.x; n.y = p.y;
      }
      confine(n);
    }
    adjacency = new Map(items.map((n) => [n.id, new Set()]));
    for (const e of [...observedLinks, ...suggestedLinks]) {
      adjacency.get(e.source)?.add(e.target); adjacency.get(e.target)?.add(e.source);
    }
    simulation = d3.forceSimulation(items).randomSource(d3.randomLcg(0.42))
      .velocityDecay(0.5).alphaDecay(0.035)
      .force("link", d3.forceLink(observedLinks.map((e) => ({source:e.source, target:e.target}))).id((n) => n.id)
        .distance((e) => nodeRadius(e.source) + nodeRadius(e.target) + 80).strength(0.12))
      .force("charge", d3.forceManyBody().strength(-130))
      .force("collision", d3.forceCollide((n) => nodeRadius(n) + gap / 2).iterations(8))
      .force("x", d3.forceX((n) => (boxFor(n).x0 + boxFor(n).x1) / 2).strength(0.08))
      .force("y", d3.forceY((n) => (boxFor(n).y0 + header + boxFor(n).y1) / 2).strength(0.08))
      .force("drag-x", d3.forceX().strength(0)).force("drag-y", d3.forceY().strength(0))
      .on("tick", () => { project(); notify(); })
      .on("end", () => { project(500); notify(); }).stop();
    if (update.live && animated) {
      project(300);
      simulation.alpha(0.18).restart();
    } else {
      for (let i = 0; i < 200; i++) { simulation.tick(); project(12); }
      project(1200);
      items.forEach((n) => { n.vx = n.vy = 0; });
    }
    return true;
  }

  function startDrag(n) {
    if (!items.includes(n) || (dragged && dragged !== n)) return false;
    dragged = n; n.fx = n.x; n.fy = n.y;
    dragOrigin = {x:n.x, y:n.y};
    // Only the directly connected peers in the same institutional box follow
    // the pointer. Cross-department peers stay in their own published group.
    pull = new Map(items.filter((p) => p !== n && groupKey(p) === groupKey(n) && adjacency.get(n.id)?.has(p.id))
      .map((p) => [p.id, {x:p.x, y:p.y}]));
    simulation.force("drag-x").strength((p) => pull.has(p.id) ? 0.5 : 0);
    simulation.force("drag-y").strength((p) => pull.has(p.id) ? 0.5 : 0);
    simulation.alpha(0.45).alphaTarget(0.25);
    if (animated) simulation.restart();
    return true;
  }

  function drag(n, x, y) {
    if (dragged !== n && !startDrag(n)) return;
    n.x = n.fx = x; n.y = n.fy = y; confine(n);
    simulation.force("drag-x").x((p) => pull.has(p.id) ? pull.get(p.id).x + n.x - dragOrigin.x : p.x);
    simulation.force("drag-y").y((p) => pull.has(p.id) ? pull.get(p.id).y + n.y - dragOrigin.y : p.y);
    project(800);
    if (!animated) advance(options.reducedMotion ? 8 : 1);
    else notify();
  }

  function advance(iterations = 1) {
    for (let i = 0; i < iterations; i++) { simulation?.tick(); project(); }
    notify();
  }

  function release(n) {
    if (dragged !== n) return;
    dragged = null; n.fx = n.fy = null; pull.clear(); dragOrigin = null;
    simulation.force("drag-x").strength(0); simulation.force("drag-y").strength(0);
    simulation.alphaTarget(0);
    if (animated) simulation.restart();
    else { advance(60); notify(); }
  }

  function reset(all = items) {
    simulation?.stop(); signature = ""; dragged = null; cells = []; boxes.clear();
    all.forEach((n) => { n.x = n.y = NaN; n.fx = n.fy = null; n.onRing = false; });
  }

  return {
    configure, startDrag, drag, release, advance, reset,
    isIsolated: (n) => (counts.get(n.id)?.total ?? n.network_metrics.degree) === 0,
    get dragging() { return dragged !== null; },
    get nodes() { return items; }, get cells() { return cells; },
    get bounds() { return {x0:-worldWidth/2,y0:-worldHeight/2,x1:worldWidth/2,y1:worldHeight/2}; },
    get outerRadius() { return Math.max(worldWidth, worldHeight) / 2; },
    get ringRadius() { return 0; }, get isolatedCount() { return 0; },
    get maxOverlap() { return overlaps(); },
    boxFor,
  };
}

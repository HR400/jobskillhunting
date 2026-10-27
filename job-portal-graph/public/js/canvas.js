/**
 * public/js/canvas.js — vis-network canvas (Ticket 36).
 *
 * Implements plan §10.2 & §10.4:
 *   - vis-network 2D graph with physics stabilisation then freeze
 *   - ~300-node cap
 *   - Node colours / shapes by type: Candidate, Job, Employer, Skill
 *   - Edge colours by state: satisfied (green), below (amber), missing (red dashed)
 *   - Node click handler dispatching selection to Inspector
 */

const MAX_NODES = 300;

const NODE_COLORS = {
  Candidate: { background: '#0071e3', border: '#005bb5' },
  Job: { background: '#ff9500', border: '#cc7700' },
  Employer: { background: '#af52de', border: '#893eb0' },
  Skill: { background: '#34c759', border: '#289e44' },
};

const EDGE_COLORS = {
  satisfied: '#34c759',
  below: '#ff9500',
  missing: '#ff3b30',
  neutral: '#86868b',
};

export function initCanvas(container, handlers = {}) {
  if (typeof handlers === 'function') handlers = { onSelectNode: handlers };
  const { onSelectNode, onHoverNode } = handlers;
  if (!window.vis || !window.vis.Network) {
    container.innerHTML = '<p class="muted">vis-network library not loaded.</p>';
    return null;
  }

  const nodes = new window.vis.DataSet([]);
  const edges = new window.vis.DataSet([]);
  const hypotheticalIds = new Set();

  const options = {
    nodes: {
      shape: 'dot',
      font: { face: 'system-ui, -apple-system, sans-serif', size: 12, color: '#1d1d1f' },
      borderWidth: 2,
    },
    edges: {
      smooth: { type: 'continuous' },
      font: { size: 10, align: 'middle' },
    },
    physics: {
      stabilization: { iterations: 120, updateInterval: 25 },
      barnesHut: { gravitationalConstant: -2400, centralGravity: 0.25, springLength: 90 },
    },
    interaction: {
      hover: true,
      tooltipDelay: 150,
      hideEdgesOnDrag: true,
    },
  };

  const network = new window.vis.Network(container, { nodes, edges }, options);

  // Stabilise then freeze (plan §10.5, Ticket 36).
  network.once('stabilizationIterationsDone', () => {
    network.setOptions({ physics: false });
  });

  network.on('click', (params) => {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const node = nodes.get(nodeId);
      if (node && onSelectNode) {
        onSelectNode(node);
      }
    }
  });

  // Ticket 41: hovering a node feeds the linked views (plan §10.5).
  network.on('hoverNode', (params) => {
    const node = nodes.get(params.node);
    if (node && onHoverNode) onHoverNode({ id: node.id, type: node.nodeType });
  });
  network.on('blurNode', () => onHoverNode && onHoverNode(null));

  /** Dims everything but `id` and its edges; `null` restores full opacity. */
  function highlight(id) {
    const key = id === null || id === undefined ? null : String(id);
    nodes.update(
      nodes.get().map((n) => ({
        id: n.id,
        opacity: key === null || n.id === key ? 1 : 0.25,
      })),
    );
    edges.update(
      edges.get().map((e) => {
        const base = e.baseWidth ?? e.width ?? 1.5;
        const near = key !== null && (e.from === key || e.to === key);
        return {
          id: e.id,
          baseWidth: base,
          width: near ? base + 1.5 : base,
          opacity: key === null || near ? 1 : 0.15,
        };
      }),
    );
  }

  return {
    network,
    nodes,
    edges,
    highlight,
    /** Centres and selects one node (Ticket 41: canvas responds to bar/radar clicks). */
    focus(id) {
      const key = String(id);
      if (!nodes.get(key)) return;
      network.selectNodes([key]);
      network.focus(key, { scale: 1.1, animation: false });
    },
    /** Ticket 43: outlines jobs a hypothetical skill set unlocks, adding those the
     * stored ranking never drew. `clearHypothetical()` removes them again. */
    showHypothetical(jobs) {
      this.clearHypothetical();
      for (const job of jobs ?? []) {
        if (!job.newly_unlocked) continue;
        const id = String(job.job_id);
        hypotheticalIds.add(id);
        if (nodes.get(id)) {
          const existing = nodes.get(id);
          nodes.update({
            id,
            baseBorderWidth: existing.baseBorderWidth ?? existing.borderWidth ?? 2,
            borderWidth: 5,
          });
        } else {
          nodes.add({
            id,
            label: `${job.job_title} — hypothetical`,
            title: `Newly unlocked by the hypothetical skills (${job.hypothetical.match_pct}%)`,
            shape: 'dot',
            size: 18,
            borderWidth: 5,
            color: { background: '#86868b', border: '#0071e3' },
            nodeType: 'Job',
            hypothetical: true,
          });
        }
      }
    },
    clearHypothetical() {
      for (const id of hypotheticalIds) {
        const node = nodes.get(id);
        if (!node) continue;
        if (node.hypothetical) nodes.remove(id);
        else nodes.update({ id, borderWidth: node.baseBorderWidth ?? 2 });
      }
      hypotheticalIds.clear();
    },
    render(subgraph) {
      nodes.clear();
      edges.clear();

      if (!subgraph || !subgraph.nodes || subgraph.nodes.length === 0) {
        container.innerHTML = '<p class="muted">No graph data to display.</p>';
        return;
      }

      // Respect the ~300 node cap.
      const rawNodes = subgraph.nodes.slice(0, MAX_NODES);
      const validNodeIds = new Set(rawNodes.map((n) => String(n.id)));

      const styledNodes = rawNodes.map((n) => {
        const type = n.type || 'Skill';
        const colors = NODE_COLORS[type] || NODE_COLORS.Skill;
        let size = 14;
        if (type === 'Candidate') size = 22;
        else if (type === 'Job') size = 18;
        else if (type === 'Employer') size = 16;

        return {
          id: String(n.id),
          label: n.label || n.id,
          title: `${type}: ${n.label || n.id}`,
          shape: type === 'Employer' ? 'diamond' : 'dot',
          size,
          color: {
            background: colors.background,
            border: colors.border,
            highlight: { background: colors.background, border: '#ffffff' },
          },
          font: { color: document.body.dataset.mode === 'dark' ? '#f5f5f7' : '#1d1d1f' },
          nodeType: type,
          rawProps: n.props || {},
        };
      });

      const styledEdges = (subgraph.edges || [])
        .filter((e) => validNodeIds.has(String(e.from)) && validNodeIds.has(String(e.to)))
        .map((e) => {
          const color = EDGE_COLORS[e.state] || EDGE_COLORS.neutral;
          return {
            id: String(e.id),
            from: String(e.from),
            to: String(e.to),
            color: { color, highlight: color },
            width: e.state === 'satisfied' ? 2.5 : 1.5,
            baseWidth: e.state === 'satisfied' ? 2.5 : 1.5,
            dashes: e.state === 'missing',
            title: `${e.type || ''} (${e.state || 'neutral'})`,
          };
        });

      nodes.add(styledNodes);
      edges.add(styledEdges);

      // Re-enable physics briefly to stabilize layout for new data.
      network.setOptions({ physics: { enabled: true } });
      network.once('stabilizationIterationsDone', () => {
        network.setOptions({ physics: false });
      });
    },
  };
}

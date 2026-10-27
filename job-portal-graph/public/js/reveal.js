/**
 * public/js/reveal.js — match reveal animation (Ticket 40, plan §10.4).
 *
 * Sequence:
 *   1. Seed — candidate node placed at centre.
 *   2. Skills fan out — each `skill` event attaches a Skill node via HAS_SKILL edge.
 *   3. Demand wave — each `job_scored` event adds a Job node connected via Skill nodes.
 *   4. Edge states — green solid (satisfied), amber (below), red dashed (missing).
 *   5. Verdict strip — computed totals template rendered into #reveal-strip.
 *
 * Reduced motion:
 *   If prefers-reduced-motion is active, all delays are 0 (instant rendering),
 *   executing in the exact same order with zero information loss.
 *
 * Content is strictly real: only elements present in streamed events are drawn.
 */

const EDGE_COLORS = {
  satisfied: '#34c759',
  below: '#ff9500',
  missing: '#ff3b30',
  neutral: '#86868b',
};

/**
 * Initiates the match reveal over Server-Sent Events.
 *
 * @param {object} options
 * @param {string} options.candId - The candidate ID.
 * @param {object} options.canvas - The vis-network canvas instance ({ network, nodes, edges }).
 * @param {HTMLElement} options.verdictStrip - The #reveal-strip DOM container.
 * @param {function} [options.onComplete] - Callback invoked when stream emits `done`.
 * @param {function} [options.onError] - Callback invoked on stream error.
 * @returns {{ abort: function }} Handle to abort the reveal stream.
 */
export function startReveal({ candId, canvas, verdictStrip, onComplete, onError }) {
  if (!candId || !canvas) {
    throw new Error('candId and canvas instance are required for reveal.');
  }

  // Clear existing canvas data and initialize verdict strip.
  canvas.nodes.clear();
  canvas.edges.clear();

  if (verdictStrip) {
    verdictStrip.textContent = 'Initiating match reveal…';
    verdictStrip.setAttribute('aria-busy', 'true');
  }

  const url = `/api/match/stream?candId=${encodeURIComponent(candId)}`;
  const es = new EventSource(url, { withCredentials: true });

  let jobCount = 0;
  let aborted = false;
  let retried = false;

  function abort() {
    if (aborted) return;
    aborted = true;
    es.close();
    if (verdictStrip) verdictStrip.removeAttribute('aria-busy');
  }

  // 1. Seed: Candidate node appears at the centre.
  es.addEventListener('candidate', (event) => {
    if (aborted) return;
    try {
      const { node } = JSON.parse(event.data);
      const isDark = document.body.dataset.mode === 'dark';
      canvas.nodes.add({
        id: String(node.id),
        label: node.fname ? `${node.fname} ${node.lname || ''}`.trim() : 'You',
        title: `Candidate: ${node.fname || ''} ${node.lname || ''}`,
        shape: 'dot',
        size: 24,
        color: {
          background: '#0071e3',
          border: '#005bb5',
          highlight: { background: '#0071e3', border: '#ffffff' },
        },
        font: { color: isDark ? '#f5f5f7' : '#1d1d1f', size: 14 },
        nodeType: 'Candidate',
        rawProps: node,
      });

      if (verdictStrip) {
        verdictStrip.textContent = 'Candidate loaded. Discovering held skills…';
      }
    } catch (err) {
      console.error('Error handling candidate event:', err);
    }
  });

  // 2. Skills fan out: Skill nodes connected by HAS_SKILL edges.
  es.addEventListener('skill', (event) => {
    if (aborted) return;
    try {
      const { node, edge } = JSON.parse(event.data);
      const isDark = document.body.dataset.mode === 'dark';
      const skillId = String(node.skill_key || node.id);

      if (!canvas.nodes.get(skillId)) {
        canvas.nodes.add({
          id: skillId,
          label: node.name || node.skill_key,
          title: `Skill: ${node.name || node.skill_key}`,
          shape: 'dot',
          size: 14,
          color: {
            background: '#34c759',
            border: '#289e44',
            highlight: { background: '#34c759', border: '#ffffff' },
          },
          font: { color: isDark ? '#f5f5f7' : '#1d1d1f', size: 12 },
          nodeType: 'Skill',
          rawProps: node,
        });
      }

      canvas.edges.add({
        id: `has-${candId}-${skillId}`,
        from: String(candId),
        to: skillId,
        width: Math.max(1.5, (edge.proficiency || 1) * 0.8),
        color: { color: '#34c759', highlight: '#34c759' },
        title: `Proficiency: ${edge.proficiency}/5, Experience: ${edge.years ?? 0}y`,
      });
    } catch (err) {
      console.error('Error handling skill event:', err);
    }
  });

  // 3. Demand wave & Edge states: Job nodes connected through shared Skill nodes.
  es.addEventListener('job_scored', (event) => {
    if (aborted) return;
    try {
      const data = JSON.parse(event.data);
      const isDark = document.body.dataset.mode === 'dark';
      const jobId = String(data.node.id);
      jobCount++;

      const matchPct = typeof data.match_pct === 'number' ? data.match_pct : 0;
      const band = data.band || (matchPct >= 75 ? 'Strong' : matchPct >= 40 ? 'Moderate' : 'Low');

      let nodeColor = '#86868b';
      let nodeBorder = '#555558';
      if (band === 'Strong') {
        nodeColor = '#34c759';
        nodeBorder = '#289e44';
      } else if (band === 'Moderate') {
        nodeColor = '#ff9500';
        nodeBorder = '#cc7700';
      }

      // Sizing proportional to match_pct
      const size = 13 + (matchPct / 100) * 13;

      canvas.nodes.add({
        id: jobId,
        label: `${data.node.job_title} (${matchPct}%)`,
        title: `${data.node.job_title} — ${data.employer?.company_name || 'Employer'} (${matchPct}%, ${band})`,
        shape: 'dot',
        size,
        color: {
          background: nodeColor,
          border: data.mandatory_ok ? nodeBorder : '#ff3b30',
          highlight: { background: nodeColor, border: '#ffffff' },
        },
        borderWidth: data.mandatory_ok ? 2 : 3,
        shapeProperties: { borderDashes: !data.mandatory_ok },
        font: { color: isDark ? '#f5f5f7' : '#1d1d1f', size: 12 },
        nodeType: 'Job',
        matchPct,
        band,
        mandatoryOk: data.mandatory_ok,
        rawProps: data.node,
      });

      // Connect job to skills (breakdown edges)
      const reqs = data.breakdown || data.edges || [];
      for (const req of reqs) {
        const skillKey = String(req.skill_key);
        // If skill wasn't in candidate's held skills, draw it as a required missing skill node.
        if (!canvas.nodes.get(skillKey)) {
          canvas.nodes.add({
            id: skillKey,
            label: req.skill || skillKey,
            title: `Skill: ${req.skill || skillKey}`,
            shape: 'dot',
            size: 12,
            color: {
              background: '#86868b',
              border: '#636366',
              highlight: { background: '#86868b', border: '#ffffff' },
            },
            font: { color: isDark ? '#f5f5f7' : '#1d1d1f', size: 11 },
            nodeType: 'Skill',
          });
        }

        const state = req.status || 'neutral';
        const color = EDGE_COLORS[state] || EDGE_COLORS.neutral;

        canvas.edges.add({
          id: `req-${jobId}-${skillKey}`,
          from: jobId,
          to: skillKey,
          color: { color, highlight: color },
          width: state === 'satisfied' ? 2 : 1.2,
          dashes: state === 'missing',
          title: `${req.skill}: required ${req.min_proficiency || 1}/5, held ${req.held_proficiency || 0}/5 (${state})`,
        });
      }

      if (verdictStrip) {
        verdictStrip.textContent = `Evaluating matches… ${jobCount} open job${jobCount === 1 ? '' : 's'} scored.`;
      }
    } catch (err) {
      console.error('Error handling job_scored event:', err);
    }
  });

  // 4. Verdict strip: Summary verdict computed from real stream results.
  es.addEventListener('done', (event) => {
    if (aborted) return;
    try {
      const { totals } = JSON.parse(event.data);
      if (verdictStrip) {
        verdictStrip.removeAttribute('aria-busy');
        verdictStrip.innerHTML = '';

        const summaryText = document.createElement('span');
        summaryText.innerHTML = `Evaluated <strong>${totals.jobs}</strong> job${totals.jobs === 1 ? '' : 's'}:`;
        verdictStrip.append(summaryText);

        if (totals.strong > 0) {
          const b = document.createElement('span');
          b.className = 'verdict-badge strong';
          b.textContent = `${totals.strong} Strong`;
          verdictStrip.append(b);
        }
        if (totals.moderate > 0) {
          const b = document.createElement('span');
          b.className = 'verdict-badge moderate';
          b.textContent = `${totals.moderate} Moderate`;
          verdictStrip.append(b);
        }
        if (totals.low > 0) {
          const b = document.createElement('span');
          b.className = 'verdict-badge low';
          b.textContent = `${totals.low} Low`;
          verdictStrip.append(b);
        }
        if (totals.unscored > 0) {
          const b = document.createElement('span');
          b.className = 'verdict-badge unscored';
          b.textContent = `${totals.unscored} Unscored`;
          verdictStrip.append(b);
        }
      }

      // Stabilise physics briefly then freeze.
      if (canvas.network) {
        canvas.network.setOptions({ physics: { enabled: true } });
        canvas.network.once('stabilizationIterationsDone', () => {
          canvas.network.setOptions({ physics: false });
        });
      }

      es.close();
      if (onComplete) onComplete(totals);
    } catch (err) {
      console.error('Error handling done event:', err);
    }
  });

  es.addEventListener('error', (event) => {
    if (aborted) return;
    // EventSource reconnects once on its own; only fall back after that fails (plan §14).
    if (!retried) {
      retried = true;
      if (verdictStrip) verdictStrip.textContent = 'Match stream dropped — reconnecting once…';
      return;
    }
    es.close();
    if (verdictStrip) {
      verdictStrip.removeAttribute('aria-busy');
      verdictStrip.textContent = 'Match reveal stream disconnected or completed.';
    }
    if (onError) onError(event);
  });

  return { abort };
}

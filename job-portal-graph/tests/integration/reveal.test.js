/**
 * TEST ONLY — tests/integration/reveal.test.js (Ticket 40)
 *
 * Done-when check for Ticket 40:
 *   - public/js/reveal.js implements startReveal
 *   - Every drawn element corresponds strictly to stream events (seed → skills → demand wave → edge states)
 *   - Reduced motion path renders all stream elements and loses no information
 *   - Verdict strip computes totals template directly from event data
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { startReveal } from '../../public/js/reveal.js';

describe('Ticket 40 — Reveal', () => {
  let mockNodes;
  let mockEdges;
  let mockNetwork;
  let mockCanvas;
  let mockVerdictStrip;
  let eventListeners;
  let mockEventSource;

  beforeEach(() => {
    const nodeMap = new Map();
    const edgeMap = new Map();

    mockNodes = {
      add: vi.fn((n) => {
        const item = Array.isArray(n) ? n[0] : n;
        nodeMap.set(String(item.id), item);
      }),
      get: vi.fn((id) => nodeMap.get(String(id))),
      clear: vi.fn(() => nodeMap.clear()),
    };

    mockEdges = {
      add: vi.fn((e) => {
        const item = Array.isArray(e) ? e[0] : e;
        edgeMap.set(String(item.id), item);
      }),
      get: vi.fn((id) => edgeMap.get(String(id))),
      clear: vi.fn(() => edgeMap.clear()),
    };

    mockNetwork = {
      setOptions: vi.fn(),
      once: vi.fn((event, cb) => cb && cb()),
    };

    mockCanvas = {
      nodes: mockNodes,
      edges: mockEdges,
      network: mockNetwork,
    };

    mockVerdictStrip = {
      textContent: '',
      innerHTML: '',
      setAttribute: vi.fn(),
      removeAttribute: vi.fn(),
      append: vi.fn((child) => {
        mockVerdictStrip.textContent += ` ${child.textContent || child.innerText || ''}`;
      }),
    };

    eventListeners = {};
    mockEventSource = {
      addEventListener: vi.fn((ev, cb) => {
        eventListeners[ev] = cb;
      }),
      close: vi.fn(),
    };

    global.EventSource = function() {
      return mockEventSource;
    };
    global.document = {
      body: { dataset: { mode: 'light' } },
      createElement: (tag) => ({
        tagName: tag.toUpperCase(),
        className: '',
        textContent: '',
        append: vi.fn(),
      }),
    };
  });

  it('populates canvas strictly from stream events in order: seed → skills → demand wave → edge states → verdict', () => {
    const onComplete = vi.fn();
    startReveal({
      candId: 'cand-123',
      canvas: mockCanvas,
      verdictStrip: mockVerdictStrip,
      onComplete,
    });

    // 1. Seed: candidate event
    expect(eventListeners.candidate).toBeDefined();
    eventListeners.candidate({
      data: JSON.stringify({
        node: { id: 'cand-123', fname: 'Jane', lname: 'Doe', candidate_type: 'experienced' },
      }),
    });

    const candNode = mockNodes.get('cand-123');
    expect(candNode).toBeDefined();
    expect(candNode.nodeType).toBe('Candidate');
    expect(candNode.label).toBe('Jane Doe');

    // 2. Skills fan out
    expect(eventListeners.skill).toBeDefined();
    eventListeners.skill({
      data: JSON.stringify({
        node: { id: 'skill-python', skill_key: 'python', name: 'Python' },
        edge: { type: 'HAS_SKILL', proficiency: 4, years: 3 },
      }),
    });

    const skillNode = mockNodes.get('python');
    expect(skillNode).toBeDefined();
    expect(skillNode.nodeType).toBe('Skill');
    expect(skillNode.label).toBe('Python');

    const hasEdge = mockEdges.get('has-cand-123-python');
    expect(hasEdge).toBeDefined();
    expect(hasEdge.from).toBe('cand-123');
    expect(hasEdge.to).toBe('python');

    // 3. Demand wave & edge states: job_scored event
    expect(eventListeners.job_scored).toBeDefined();
    eventListeners.job_scored({
      data: JSON.stringify({
        node: { id: 'job-999', job_title: 'Python Backend Dev' },
        employer: { emp_id: 'emp-1', company_name: 'Acme Corp' },
        match_pct: 100,
        band: 'Strong',
        mandatory_ok: true,
        breakdown: [
          { skill: 'Python', skill_key: 'python', status: 'satisfied', min_proficiency: 3, held_proficiency: 4 },
        ],
      }),
    });

    const jobNode = mockNodes.get('job-999');
    expect(jobNode).toBeDefined();
    expect(jobNode.nodeType).toBe('Job');
    expect(jobNode.matchPct).toBe(100);
    expect(jobNode.band).toBe('Strong');

    const reqEdge = mockEdges.get('req-job-999-python');
    expect(reqEdge).toBeDefined();
    expect(reqEdge.from).toBe('job-999');
    expect(reqEdge.to).toBe('python');
    expect(reqEdge.dashes).toBe(false);

    // 4. Verdict strip: done event
    expect(eventListeners.done).toBeDefined();
    eventListeners.done({
      data: JSON.stringify({
        totals: { jobs: 1, strong: 1, moderate: 0, low: 0, unscored: 0 },
      }),
    });

    expect(mockVerdictStrip.removeAttribute).toHaveBeenCalledWith('aria-busy');
    expect(mockVerdictStrip.textContent).toContain('1');
    expect(mockEventSource.close).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledWith({ jobs: 1, strong: 1, moderate: 0, low: 0, unscored: 0 });
  });

  it('reduced motion preserves all drawn elements and loses zero information', () => {
    global.window = {
      matchMedia: vi.fn((query) => ({
        matches: query.includes('prefers-reduced-motion'),
      })),
    };

    const onComplete = vi.fn();
    startReveal({
      candId: 'cand-red',
      canvas: mockCanvas,
      verdictStrip: mockVerdictStrip,
      onComplete,
    });

    // Feed same events
    eventListeners.candidate({
      data: JSON.stringify({
        node: { id: 'cand-red', fname: 'Red', lname: 'Motion' },
      }),
    });
    eventListeners.skill({
      data: JSON.stringify({
        node: { id: 's1', skill_key: 'sql', name: 'SQL' },
        edge: { type: 'HAS_SKILL', proficiency: 5, years: 4 },
      }),
    });
    eventListeners.job_scored({
      data: JSON.stringify({
        node: { id: 'job-red', job_title: 'Database Engineer' },
        match_pct: 60,
        band: 'Moderate',
        mandatory_ok: false,
        breakdown: [
          { skill: 'SQL', skill_key: 'sql', status: 'satisfied', min_proficiency: 3, held_proficiency: 5 },
        ],
      }),
    });
    eventListeners.done({
      data: JSON.stringify({
        totals: { jobs: 1, strong: 0, moderate: 1, low: 0, unscored: 0 },
      }),
    });

    // Verify all nodes and edges are drawn without omission
    expect(mockNodes.get('cand-red')).toBeDefined();
    expect(mockNodes.get('sql')).toBeDefined();
    const jobNode = mockNodes.get('job-red');
    expect(jobNode).toBeDefined();
    expect(jobNode.borderWidth).toBe(3); // mandatory_ok is false -> dashed border indicator
    expect(mockEdges.get('has-cand-red-sql')).toBeDefined();
    expect(mockEdges.get('req-job-red-sql')).toBeDefined();
    expect(onComplete).toHaveBeenCalled();
  });
});

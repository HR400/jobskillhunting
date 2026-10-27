/** TEST ONLY — career step selection from real Dijkstra results (Ticket 53). */
import { describe, it, expect } from 'vitest';
import { pickCareerSteps } from '../../src/services/careerPath.js';

const missing = [
  { skill_key: 'neo4j', name: 'Neo4j' },
  { skill_key: 'docker', name: 'Docker' },
  { skill_key: 'rust', name: 'Rust' },
];

describe('pickCareerSteps (Ticket 53)', () => {
  it('keeps the cheapest path per missing skill and orders nearest first', () => {
    const steps = pickCareerSteps(missing, [
      { target: 'neo4j', path: ['JavaScript', 'Neo4j'], weight: 0.5 },
      { target: 'neo4j', path: ['JavaScript', 'SQL', 'Neo4j'], weight: 1.5 },
      { target: 'docker', path: ['JavaScript', 'Docker'], weight: 1 },
    ]);

    expect(steps.map((step) => step.skill_key)).toEqual(['neo4j', 'docker', 'rust']);
    expect(steps[0]).toMatchObject({ weight: 0.5, hops: 1, reachable: true });
    expect(steps[2]).toMatchObject({ weight: null, hops: null, path: [], reachable: false });
  });

  it('treats an empty path as unreachable and keeps names stable on ties', () => {
    const steps = pickCareerSteps(
      [
        { skill_key: 'b', name: 'Beta' },
        { skill_key: 'a', name: 'Alpha' },
      ],
      [{ target: 'a', path: [], weight: 1 }],
    );
    expect(steps).toEqual([
      { skill_key: 'a', name: 'Alpha', path: [], hops: null, weight: null, reachable: false },
      { skill_key: 'b', name: 'Beta', path: [], hops: null, weight: null, reachable: false },
    ]);
  });
});

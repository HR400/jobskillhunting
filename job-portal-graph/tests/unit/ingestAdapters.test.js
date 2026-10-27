/** TEST ONLY — feed mapping stays faithful to each API shape (Ticket 48). */
import { describe, it, expect } from 'vitest';
import { mapArbeitnow } from '../../src/ingest/adapters/arbeitnow.js';
import { mapAdzuna } from '../../src/ingest/adapters/adzuna.js';
import { mapGreenhouse, mapLever, mapAshby } from '../../src/ingest/adapters/ats.js';

describe('feed adapters (Ticket 48)', () => {
  it('maps Arbeitnow rows and keeps their public URL', () => {
    const [job] = mapArbeitnow({
      data: [{ slug: 'a-1', title: 'Engineer', description: '<p>Neo4j</p>', url: 'https://a.test/1' }],
    });
    expect(job).toEqual({
      external_ref: 'arbeitnow:a-1',
      job_title: 'Engineer',
      descriptive: 'Neo4j',
      source_url: 'https://a.test/1',
    });
  });

  it('maps Adzuna rows', () => {
    const [job] = mapAdzuna({
      results: [{ id: 42, title: 'Dev', description: 'Graph', redirect_url: 'https://z.test/42' }],
    });
    expect(job).toMatchObject({ external_ref: 'adzuna:42', source_url: 'https://z.test/42' });
  });

  it('maps Greenhouse, Lever and Ashby boards with board-qualified refs', () => {
    expect(
      mapGreenhouse('acme', {
        jobs: [{ id: 7, title: 'Backend', content: '<b>Go</b>', absolute_url: 'https://g.test/7' }],
      })[0],
    ).toMatchObject({ external_ref: 'greenhouse:acme:7', descriptive: 'Go' });

    expect(
      mapLever('acme', [
        { id: 'l1', text: 'Frontend', descriptionPlain: 'React', hostedUrl: 'https://l.test/1' },
      ])[0],
    ).toMatchObject({ external_ref: 'lever:acme:l1', descriptive: 'React' });

    expect(
      mapAshby('acme', {
        jobs: [{ id: 'a1', title: 'Data', descriptionHtml: '<i>SQL</i>', jobUrl: 'https://s.test/1' }],
      })[0],
    ).toMatchObject({ external_ref: 'ashby:acme:a1', descriptive: 'SQL' });
  });
});

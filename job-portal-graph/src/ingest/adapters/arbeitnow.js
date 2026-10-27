/** src/ingest/adapters/arbeitnow.js — free, keyless EU/remote board (Ticket 48). */
import { config } from '../../config.js';
import { fetchJson } from '../http.js';
import { stripHtml } from '../text.js';

const API = 'https://www.arbeitnow.com/api/job-board-api';

export function mapArbeitnow(body) {
  return (body?.data ?? []).map((job) => ({
    external_ref: `arbeitnow:${job.slug}`,
    job_title: job.title,
    descriptive: stripHtml(job.description),
    source_url: job.url,
  }));
}

export const arbeitnowAdapter = {
  name: 'arbeitnow',
  source: 'Arbeitnow',
  isConfigured: () => config.ENABLE_ARBEITNOW,
  async fetchJobs({ limit }) {
    const jobs = [];
    for (let page = 1; jobs.length < limit && page <= 4; page += 1) {
      const body = await fetchJson(`${API}?page=${page}`, { minIntervalMs: 1000 });
      jobs.push(...mapArbeitnow(body));
      if (!body?.links?.next) break;
    }
    return jobs.slice(0, limit);
  },
};

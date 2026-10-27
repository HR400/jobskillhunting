/** src/ingest/adapters/adzuna.js — keyed aggregator; obey its rate limit (Ticket 48). */
import { config } from '../../config.js';
import { fetchJson } from '../http.js';
import { stripHtml } from '../text.js';

const API = 'https://api.adzuna.com/v1/api/jobs';

export function mapAdzuna(body) {
  return (body?.results ?? []).map((job) => ({
    external_ref: `adzuna:${job.id}`,
    job_title: job.title,
    descriptive: stripHtml(job.description),
    source_url: job.redirect_url,
  }));
}

export const adzunaAdapter = {
  name: 'adzuna',
  source: 'Adzuna',
  isConfigured: () => Boolean(config.ADZUNA_APP_ID && config.ADZUNA_APP_KEY),
  async fetchJobs({ limit }) {
    const country = encodeURIComponent(config.ADZUNA_COUNTRY);
    const url =
      `${API}/${country}/search/1?app_id=${encodeURIComponent(config.ADZUNA_APP_ID)}` +
      `&app_key=${encodeURIComponent(config.ADZUNA_APP_KEY)}` +
      `&results_per_page=${Math.min(limit, 50)}&content-type=application/json`;
    return mapAdzuna(await fetchJson(url, { minIntervalMs: 1000 })).slice(0, limit);
  },
};

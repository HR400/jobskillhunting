/**
 * src/ingest/adapters/ats.js — public Greenhouse/Lever/Ashby boards (Ticket 48).
 *
 * Boards are named per company in `.env`; each posting keeps its public URL.
 */
import { config } from '../../config.js';
import { fetchJson } from '../http.js';
import { stripHtml } from '../text.js';

const list = (value) =>
  String(value ?? '')
    .split(',')
    .map((board) => board.trim())
    .filter(Boolean);

export function mapGreenhouse(board, body) {
  return (body?.jobs ?? []).map((job) => ({
    external_ref: `greenhouse:${board}:${job.id}`,
    job_title: job.title,
    descriptive: stripHtml(job.content),
    source_url: job.absolute_url,
  }));
}

export function mapLever(board, body) {
  return (Array.isArray(body) ? body : []).map((job) => ({
    external_ref: `lever:${board}:${job.id}`,
    job_title: job.text,
    descriptive: stripHtml(job.descriptionPlain ?? job.description),
    source_url: job.hostedUrl,
  }));
}

export function mapAshby(board, body) {
  return (body?.jobs ?? []).map((job) => ({
    external_ref: `ashby:${board}:${job.id}`,
    job_title: job.title,
    descriptive: stripHtml(job.descriptionPlain ?? job.descriptionHtml),
    source_url: job.jobUrl,
  }));
}

export const atsAdapter = {
  name: 'ats',
  source: 'Company ATS',
  isConfigured: () =>
    [config.ATS_GREENHOUSE_BOARDS, config.ATS_LEVER_BOARDS, config.ATS_ASHBY_BOARDS].some(
      (value) => list(value).length > 0,
    ),
  async fetchJobs({ limit }) {
    const jobs = [];
    for (const board of list(config.ATS_GREENHOUSE_BOARDS)) {
      const body = await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`);
      jobs.push(...mapGreenhouse(board, body));
    }
    for (const board of list(config.ATS_LEVER_BOARDS)) {
      const body = await fetchJson(`https://api.lever.co/v0/postings/${board}?mode=json`);
      jobs.push(...mapLever(board, body));
    }
    for (const board of list(config.ATS_ASHBY_BOARDS)) {
      const body = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
      jobs.push(...mapAshby(board, body));
    }
    return jobs.slice(0, limit);
  },
};

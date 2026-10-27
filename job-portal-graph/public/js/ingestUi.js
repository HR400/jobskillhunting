/**
 * public/js/ingestUi.js — Phase 5 ingest surfaces (Ticket 49).
 *
 *   - `renderUnscored`: jobs with no requirements, labelled unscored, with the
 *     feed link when they were imported.
 *   - `mountEmptyState`: the plan §10.7 empty state. *Import real jobs* renders
 *     only when `/api/meta/capabilities` reports a configured feed; the run
 *     needs the operator token, so the form asks for it rather than pretending.
 */
import { api } from './api.js';

function link(job) {
  if (!job.source_url) return null;
  const a = document.createElement('a');
  a.href = job.source_url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = job.source ?? 'Source';
  return a;
}

export function renderUnscored(container, jobs = []) {
  container.textContent = '';
  if (jobs.length === 0) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const heading = document.createElement('h3');
  heading.textContent = 'Unscored jobs (no requirements)';
  const list = document.createElement('ul');
  list.className = 'unscored-list';
  for (const job of jobs) {
    const item = document.createElement('li');
    item.dataset.jobId = job.job_id;
    item.append(job.job_title, ' — Unscored');
    const source = link(job);
    if (source) item.append(' · ', source);
    list.append(item);
  }
  container.append(heading, list);
}

export async function mountEmptyState(container) {
  try {
    const [jobs, caps] = await Promise.all([
      api.get('/jobs?limit=1'),
      api.get('/meta/capabilities'),
    ]);
    if ((jobs.jobs ?? []).length > 0) {
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.textContent = '';

    const title = document.createElement('h3');
    title.textContent = 'No jobs yet';
    const explain = document.createElement('p');
    explain.className = 'muted';
    explain.textContent = 'The database is empty. An employer can post a job from the profile panel.';
    container.append(title, explain);

    if (!caps.capabilities?.feeds) return;

    const form = document.createElement('form');
    form.className = 'import-form';
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Feed to import');
    for (const adapter of caps.capabilities.adapters ?? []) {
      const option = document.createElement('option');
      option.value = adapter.name;
      option.textContent = adapter.source;
      select.append(option);
    }
    const token = document.createElement('input');
    token.type = 'password';
    token.placeholder = 'Operator token';
    token.setAttribute('aria-label', 'Operator token');
    const run = document.createElement('button');
    run.type = 'submit';
    run.textContent = 'Import real jobs';
    const status = document.createElement('p');
    status.className = 'muted';
    status.setAttribute('aria-live', 'polite');

    form.append(select, token, run, status);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      status.textContent = 'Importing…';
      try {
        const res = await fetch(`/api/ingest/${encodeURIComponent(select.value)}/run`, {
          method: 'POST',
          headers: { 'x-ingest-token': token.value },
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error?.message ?? `Import failed (${res.status}).`);
        status.textContent = `Imported ${body.created} new job${body.created === 1 ? '' : 's'}; ${body.duplicates} already present.`;
        if (body.created > 0) window.setTimeout(() => window.location.reload(), 1200);
      } catch (err) {
        status.textContent = err.message;
      }
    });
    container.append(form);
  } catch {
    container.hidden = true;
  }
}

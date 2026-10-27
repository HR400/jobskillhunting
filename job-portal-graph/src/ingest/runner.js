/**
 * src/ingest/runner.js — run one feed adapter and upsert its jobs (Tickets 47–48).
 *
 * Jobs without an `external_ref` are skipped: they cannot be deduped, and the
 * unique constraint would not protect them. Requirements are extracted
 * deterministically from the catalogue, so a re-run replaces them cleanly.
 */
import { executeRead, executeWrite } from '../db/tx.js';
import { toNumber } from '../lib/queryMeta.js';
import {
  UPSERT_INGESTED_JOB,
  UPSERT_INGESTED_REQUIREMENTS,
  SKILL_CATALOGUE,
} from '../queries/ingest.js';
import { extractRequirements } from './extract.js';

export async function ingestJobs(adapter, { limit = 25 } = {}) {
  const fetchedAt = new Date().toISOString();
  const rows = await adapter.fetchJobs({ limit });
  const usable = rows.filter((row) => row.external_ref);
  const skipped = rows.length - usable.length;
  if (usable.length === 0) {
    return { adapter: adapter.name, source: adapter.source, fetched: 0, created: 0, duplicates: 0, skipped, fetched_at: fetchedAt };
  }

  const catalogue = await executeRead((tx) => tx.run(SKILL_CATALOGUE));
  const skills = catalogue.records.map((r) => ({
    skill_key: r.get('skill_key'),
    name: r.get('name'),
    aliases: r.get('aliases'),
  }));

  const jobs = usable.map((row) => ({
    ...row,
    source: adapter.source,
    source_url: row.source_url ?? adapter.sourceUrl ?? null,
    requirements: extractRequirements(`${row.job_title} ${row.descriptive ?? ''}`, skills),
  }));

  const result = await executeWrite(async (tx) => {
    const upsert = await tx.run(UPSERT_INGESTED_JOB, { jobs, fetchedAt });
    await tx.run(UPSERT_INGESTED_REQUIREMENTS, { jobs });
    return upsert;
  });
  const created = toNumber(result.records[0].get('created'));
  return {
    adapter: adapter.name,
    source: adapter.source,
    fetched: jobs.length,
    created,
    duplicates: jobs.length - created,
    requirements: jobs.reduce((sum, job) => sum + job.requirements.length, 0),
    skipped,
    fetched_at: fetchedAt,
  };
}

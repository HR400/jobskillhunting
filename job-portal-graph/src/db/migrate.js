/**
 * src/db/migrate.js
 *
 * Runs every constraint/index from plan §7.1 idempotently on boot.
 * Each migration is tracked as (:Migration {id, applied_at}) so two
 * consecutive boot runs create nothing twice.
 */
import { logger } from '../lib/logger.js';
import { getDriver } from './driver.js';
import { config } from '../config.js';

/** @type {{ id: string; cypher: string }[]} */
const MIGRATIONS = [
  {
    id: 'constraint_candidate_id',
    cypher:
      'CREATE CONSTRAINT candidate_id IF NOT EXISTS FOR (n:Candidate) REQUIRE n.cand_id IS UNIQUE',
  },
  {
    id: 'constraint_job_id',
    cypher:
      'CREATE CONSTRAINT job_id IF NOT EXISTS FOR (n:Job) REQUIRE n.job_id IS UNIQUE',
  },
  {
    id: 'constraint_job_ext_ref',
    cypher:
      'CREATE CONSTRAINT job_ext_ref IF NOT EXISTS FOR (n:Job) REQUIRE n.external_ref IS UNIQUE',
  },
  {
    id: 'constraint_employer_id',
    cypher:
      'CREATE CONSTRAINT employer_id IF NOT EXISTS FOR (n:Employer) REQUIRE n.emp_id IS UNIQUE',
  },
  {
    id: 'constraint_recruiter_id',
    cypher:
      'CREATE CONSTRAINT recruiter_id IF NOT EXISTS FOR (n:Recruiter) REQUIRE n.rec_id IS UNIQUE',
  },
  {
    id: 'constraint_company_id',
    cypher:
      'CREATE CONSTRAINT company_id IF NOT EXISTS FOR (n:Company) REQUIRE n.comp_id IS UNIQUE',
  },
  {
    id: 'constraint_skill_key',
    cypher:
      'CREATE CONSTRAINT skill_key IF NOT EXISTS FOR (n:Skill) REQUIRE n.skill_key IS UNIQUE',
  },
  {
    id: 'constraint_education_id',
    cypher:
      'CREATE CONSTRAINT education_id IF NOT EXISTS FOR (n:Education) REQUIRE n.edu_id IS UNIQUE',
  },
  {
    id: 'constraint_location_pin',
    cypher:
      'CREATE CONSTRAINT location_pin IF NOT EXISTS FOR (n:Location) REQUIRE n.pin_code IS UNIQUE',
  },
  {
    id: 'constraint_account_id',
    cypher:
      'CREATE CONSTRAINT account_id IF NOT EXISTS FOR (n:Account) REQUIRE n.account_id IS UNIQUE',
  },
  {
    id: 'constraint_account_email',
    cypher:
      'CREATE CONSTRAINT account_email IF NOT EXISTS FOR (n:Account) REQUIRE n.email IS UNIQUE',
  },
  {
    id: 'index_job_status',
    cypher:
      'CREATE INDEX job_status IF NOT EXISTS FOR (n:Job) ON (n.job_status)',
  },
  {
    id: 'index_job_closing',
    cypher:
      'CREATE INDEX job_closing IF NOT EXISTS FOR (n:Job) ON (n.closing_date)',
  },
  {
    id: 'index_skill_name',
    cypher:
      'CREATE INDEX skill_name IF NOT EXISTS FOR (n:Skill) ON (n.name)',
  },
];

/**
 * Run all pending migrations. A migration whose (:Migration {id}) node
 * already exists is skipped without touching the schema.
 */
export async function runMigrations() {
  const driver = getDriver();
  // Use a regular (auto-commit) session for schema commands —
  // DDL (CREATE CONSTRAINT / INDEX) cannot run inside managed transactions.
  const session = driver.session({ database: config.NEO4J_DATABASE });
  let applied = 0;
  let skipped = 0;

  try {
    for (const { id, cypher } of MIGRATIONS) {
      // Check if this migration was already applied.
      const check = await session.run(
        'MATCH (m:Migration {id: $id}) RETURN m LIMIT 1',
        { id },
      );
      if (check.records.length > 0) {
        skipped++;
        continue;
      }

      // Apply the schema change (IF NOT EXISTS makes it a no-op if it already exists
      // from a manual run, but we still record the Migration node).
      await session.run(cypher);

      // Record migration as applied.
      await session.run(
        'CREATE (m:Migration {id: $id, applied_at: datetime()})',
        { id },
      );

      logger.info({ migrationId: id }, 'migration applied');
      applied++;
    }
  } finally {
    await session.close();
  }

  logger.info({ applied, skipped, total: MIGRATIONS.length }, 'migrations complete');
}

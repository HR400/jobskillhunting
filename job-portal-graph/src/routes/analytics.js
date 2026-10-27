/**
 * src/routes/analytics.js — GDS analytics (Ticket 51; ticket 52 adds communities).
 *
 * PageRank is computed over the real `(:Candidate)-[:REFERS]->(:Candidate)`
 * graph. Without the GDS plugin the endpoint answers `unavailable` with the
 * reason; it never approximates a score in application code.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/errors.js';
import { executeRead } from '../db/tx.js';
import { getGds } from '../lib/gds.js';

export const analyticsRouter = Router();

const PAGERANK_PROJECTION = 'candidate-refers';
const COMMUNITIES_PROJECTION = 'candidate-skills';

async function dropProjection(name) {
  try {
    await executeRead((tx) => tx.run('CALL gds.graph.drop($name, false)', { name }));
  } catch {
    // A missing projection is the normal first-run case.
  }
}

analyticsRouter.get(
  '/pagerank',
  asyncHandler(async (req, res) => {
    const gds = await getGds();
    if (!gds.available) {
      res.json({
        unavailable: 'The GDS plugin is not installed on this database, so referral authority cannot be computed.',
        candidates: [],
      });
      return;
    }

    await dropProjection(PAGERANK_PROJECTION);
    try {
      await executeRead((tx) =>
        tx.run('CALL gds.graph.project($name, "Candidate", "REFERS")', { name: PAGERANK_PROJECTION }),
      );
      const result = await executeRead((tx) =>
        tx.run(
          `CALL gds.pageRank.stream($name)
           YIELD nodeId, score
           RETURN gds.util.asNode(nodeId).cand_id AS cand_id, score
           ORDER BY score DESC`,
          { name: PAGERANK_PROJECTION },
        ),
      );
      res.json({
        method: 'gds.pageRank',
        gds_version: gds.version,
        candidates: result.records.map((record) => ({
          cand_id: record.get('cand_id'),
          referrer_authority: record.get('score'),
        })),
      });
    } finally {
      await dropProjection(PAGERANK_PROJECTION);
    }
  }),
);

analyticsRouter.get(
  '/communities',
  asyncHandler(async (req, res) => {
    const gds = await getGds();
    if (!gds.available) {
      res.json({
        unavailable: 'The GDS plugin is not installed on this database, so skill communities cannot be computed.',
        clusters: [],
      });
      return;
    }

    await dropProjection(COMMUNITIES_PROJECTION);
    try {
      await executeRead((tx) =>
        tx.run('CALL gds.graph.project($name, ["Candidate", "Skill"], "HAS_SKILL")', {
          name: COMMUNITIES_PROJECTION,
        }),
      );
      const result = await executeRead((tx) =>
        tx.run(
          `CALL gds.louvain.stream($name)
           YIELD nodeId, communityId
           RETURN communityId, gds.util.asNode(nodeId) AS node`,
          { name: COMMUNITIES_PROJECTION },
        ),
      );

      const byCommunity = new Map();
      for (const record of result.records) {
        const communityId = String(record.get('communityId'));
        const node = record.get('node').properties;
        const cluster = byCommunity.get(communityId) ?? { candidates: [], skills: [] };
        if (node.cand_id) cluster.candidates.push(node.cand_id);
        if (node.skill_key) cluster.skills.push(node.name ?? node.skill_key);
        byCommunity.set(communityId, cluster);
      }

      const clusters = [...byCommunity.entries()]
        .map(([community, cluster]) => {
          // Labels come from what the members actually share, most common first.
          const counts = new Map();
          for (const skill of cluster.skills) counts.set(skill, (counts.get(skill) ?? 0) + 1);
          const skills = [...counts.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([skill]) => skill);
          return {
            community,
            label: skills[0] ?? 'No shared skills',
            candidate_count: cluster.candidates.length,
            candidates: cluster.candidates,
            skills,
          };
        })
        .sort((a, b) => b.candidate_count - a.candidate_count || a.label.localeCompare(b.label));

      res.json({ method: 'gds.louvain', gds_version: gds.version, clusters });
    } finally {
      await dropProjection(COMMUNITIES_PROJECTION);
    }
  }),
);

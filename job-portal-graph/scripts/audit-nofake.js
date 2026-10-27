/**
 * scripts/audit-nofake.js — Rule R1 & Plan §15 audit script (Ticket 60).
 *
 * Scans non-test code for:
 * - faker / @faker-js
 * - Math.random (allow-listing animation file only: public/js/reveal.js)
 * - lorem ipsum
 * - John Doe / Jane Doe / DA-1 sample names (Ram Nishtha, J001, APP001)
 * - Seed / demo scripts
 * - Imports of test fixtures into runtime code
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { relative, join } from 'node:path';

const ALLOW_LISTED_MATH_RANDOM = new Set([
  'public/js/reveal.js',
]);

const PROHIBITED_PATTERNS = [
  { rule: 'faker usage', regex: /\b(faker|@faker-js)\b/i },
  { rule: 'lorem ipsum placeholder', regex: /\blorem\s+ipsum\b|\blorem\b/i },
  { rule: 'placeholder name (John/Jane Doe)', regex: /\b(john|jane)\s+doe\b/i },
  { rule: 'DA-1 sample name (Ram Nishtha)', regex: /\bram\s+nishtha\b/i },
  { rule: 'DA-1 sample ID (J001/APP001)', regex: /\b(J001|APP001)\b/ },
];

export function auditFileContent(filePath, content) {
  const violations = [];
  const normalizedPath = filePath.replace(/\\/g, '/');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Math.random
    if (line.includes('Math.random()')) {
      const isAllowed = Array.from(ALLOW_LISTED_MATH_RANDOM).some((allowed) =>
        normalizedPath.endsWith(allowed),
      );
      if (!isAllowed) {
        violations.push({
          file: normalizedPath,
          line: i + 1,
          rule: 'Math.random in non-animation file',
          snippet: line.trim(),
        });
      }
    }

    // Check prohibited patterns
    for (const pat of PROHIBITED_PATTERNS) {
      if (pat.regex.test(line)) {
        violations.push({
          file: normalizedPath,
          line: i + 1,
          rule: pat.rule,
          snippet: line.trim(),
        });
      }
    }

    // Check test fixture import into runtime
    if (
      (normalizedPath.startsWith('src/') || normalizedPath.startsWith('public/')) &&
      (/import\s+.*from\s+['"].*(tests\/|helpers\/fixtures|fixtures\.js)['"]/i.test(line) ||
        /require\(['"].*(tests\/|helpers\/fixtures|fixtures\.js)['"]\)/i.test(line))
    ) {
      violations.push({
        file: normalizedPath,
        line: i + 1,
        rule: 'test fixture imported in runtime code',
        snippet: line.trim(),
      });
    }
  }

  return violations;
}

function scanDir(dir, baseDir, fileList = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (
      entry === 'node_modules' ||
      entry === '.git' ||
      entry === '.cache' ||
      entry === 'tests' ||
      entry === 'results' ||
      entry.startsWith('out-')
    ) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      scanDir(fullPath, baseDir, fileList);
    } else if (
      stat.isFile() &&
      /\.(js|mjs|cjs|html|json)$/.test(entry) &&
      !entry.endsWith('package-lock.json') &&
      entry !== 'audit-nofake.js'
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

export function auditNoFake(baseDir = process.cwd()) {
  const violations = [];
  const files = scanDir(baseDir, baseDir);

  for (const file of files) {
    const relPath = relative(baseDir, file).replace(/\\/g, '/');

    // Rule: no seed/demo scripts
    const lowerRel = relPath.toLowerCase();
    if (
      (lowerRel.includes('seed') || lowerRel.includes('demo')) &&
      !lowerRel.includes('designdemo')
    ) {
      violations.push({
        file: relPath,
        line: 1,
        rule: 'prohibited seed or demo script',
        snippet: relPath,
      });
      continue;
    }

    const content = readFileSync(file, 'utf8');
    const fileViolations = auditFileContent(relPath, content);
    violations.push(...fileViolations);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

if (process.argv[1] && process.argv[1].endsWith('audit-nofake.js')) {
  console.log('Running audit:nofake (Rule R1, Plan §15)...');
  const result = auditNoFake();

  if (result.passed) {
    console.log('✅ audit:nofake passed: 0 fake data, seed scripts, or test fixture leaks detected.');
    process.exit(0);
  } else {
    console.error(`❌ audit:nofake FAILED with ${result.violations.length} violation(s):\n`);
    for (const v of result.violations) {
      console.error(`  ${v.file}:${v.line} - [${v.rule}]`);
      console.error(`    ${v.snippet}\n`);
    }
    process.exit(1);
  }
}

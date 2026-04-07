/**
 * Run all migration scripts in order.
 * Usage: node scripts/migrate.js
 */

import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const scripts = [
  'migrate-posts.js',
  'migrate-projects.js',
  'migrate-stories.js',
  'migrate-work.js',
];

for (const script of scripts) {
  console.log(`\n── ${script} ──`);
  execSync(`node ${path.join(__dirname, script)}`, { stdio: 'inherit' });
}

console.log('\n✓ Migration complete');

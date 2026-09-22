#!/usr/bin/env node
/**
 * rebuild-catalogue.mjs — Regenerate catalogue.json from every decks/<slug>/manifest.json.
 *
 * The catalogue entry is a public SUBSET of each manifest (enough to render the card).
 * Never copies scenes/quiz/deck internals into the catalogue.
 *
 * Usage: node scripts/rebuild-catalogue.mjs
 */

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DECKS_DIR = join(REPO_ROOT, 'decks');
const CATALOGUE_PATH = join(REPO_ROOT, 'catalogue.json');
const CATEGORIES = [
  'Science', 'Engineering', 'Mathematics', 'AI & Computing', 'Earth & Geospatial',
  'Business & Finance', 'Biology & Life Sciences', 'Everyday Concepts', 'Education'
];

async function main() {
  const examples = [];
  if (existsSync(DECKS_DIR)) {
    const entries = await readdir(DECKS_DIR);
    for (const slug of entries) {
      const dir = join(DECKS_DIR, slug);
      if (!(await stat(dir)).isDirectory()) continue;
      const mPath = join(dir, 'manifest.json');
      if (!existsSync(mPath)) continue;
      const m = JSON.parse(await readFile(mPath, 'utf8'));
      examples.push({
        slug: m.slug,
        title: m.title,
        category: m.category,
        summary: m.summary,
        tags: m.tags || [],
        level: m.level || 'Beginner',
        sceneCount: m.sceneCount || (m.scenes ? m.scenes.length : 0),
        durationSec: m.durationSec || 0,
        thumbnail: m.thumbnail || 'thumbnail.svg',
        featured: m.featured === true,
        hasAudio: Array.isArray(m.scenes) && m.scenes.some(s => s && s.audioPath),
        publishedAt: m.publishedAt || null,
      });
    }
  }

  // Stable sort: category order, then title
  examples.sort((a, b) => {
    const ca = CATEGORIES.indexOf(a.category), cb = CATEGORIES.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return String(a.title).localeCompare(String(b.title));
  });

  const catalogue = {
    metadata: {
      version: '1.0',
      product: 'Explain It',
      source: 'nebula-curated',
      last_updated: new Date().toISOString().slice(0, 10),
      total_examples: examples.length,
      categories: CATEGORIES,
    },
    examples,
  };
  await writeFile(CATALOGUE_PATH, JSON.stringify(catalogue, null, 2) + '\n', 'utf8');
  console.log(`Rebuilt catalogue.json → ${examples.length} example(s).`);
}

main().catch(e => { console.error(e); process.exit(1); });

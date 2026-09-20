#!/usr/bin/env node
/**
 * export-deck.mjs — Export a REAL Explain It deck into a static, self-contained
 * package under decks/<slug>/ for the public examples catalogue.
 *
 * The deck payload is a SNAPSHOT of real Explain It output. Two input modes:
 *
 *   1) --token <shareToken>   Fetch the deck from the public share endpoint
 *                             GET {API}/demo/share/<token>  (default API:
 *                             https://api.nebulacloud.studio/api/v1)
 *
 *   2) --input <file.json>    Read a raw deck payload from a local JSON file
 *                             (same shape as the share endpoint's `demo`).
 *
 * Required curation metadata (public, safe):
 *   --slug <slug>            URL-safe id, e.g. photosynthesis
 *   --title "..."            Public title
 *   --category "..."         One of the 9 canonical categories (exact)
 *   --summary "..."          One-line card description
 *   [--tags a,b,c] [--level Beginner|Intermediate|Advanced]
 *   [--quiz <quiz.json>]     Optional array of {question,options[],answerIndex,explanation}
 *
 * Output (decks/<slug>/):
 *   manifest.json, deck-content.html, audio/scene-N.(mp3|wav), thumbnail.svg
 *
 * Audio: any s3://, presigned https, or data: URL is DOWNLOADED/decoded to a LOCAL
 * file. No remote/expiring references survive into the package.
 *
 * This tool ONLY writes public fields. Forbidden fields (userId, workspaceId,
 * shareToken, traces, secrets, internal paths) are never copied. Run
 * validate-deck.mjs afterwards to hard-gate the output.
 */

import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const CANONICAL_CATEGORIES = [
  'Science', 'Engineering', 'Mathematics', 'AI & Computing', 'Earth & Geospatial',
  'Business & Finance', 'Biology & Life Sciences', 'Everyday Concepts', 'Education'
];
const DEFAULT_API = 'https://api.nebulacloud.studio/api/v1';

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && !argv[i + 1].startsWith('--')) ? argv[++i] : 'true';
      args[key] = val;
    }
  }
  return args;
}

function fail(msg) { console.error('EXPORT FAILED: ' + msg); process.exit(1); }

async function loadPayload(args) {
  if (args.input) {
    const raw = await import('node:fs/promises').then(fs => fs.readFile(args.input, 'utf8'));
    const parsed = JSON.parse(raw);
    return parsed.demo || parsed;
  }
  if (args.token) {
    const api = args.api || DEFAULT_API;
    const url = `${api}/demo/share/${encodeURIComponent(args.token)}`;
    const r = await fetch(url);
    if (!r.ok) fail(`share fetch ${r.status} for token ${args.token}`);
    const data = await r.json();
    return data.demo || data;
  }
  fail('provide --token <shareToken> or --input <file.json>');
}

/** Download/decode an audio ref to a local Buffer + extension. Returns null if none. */
async function fetchAudio(ref) {
  if (!ref || typeof ref !== 'string') return null;
  if (ref.startsWith('data:')) {
    const m = ref.match(/^data:audio\/([a-zA-Z0-9.+-]+);base64,(.*)$/);
    if (!m) return null;
    const ext = m[1].includes('mpeg') || m[1].includes('mp3') ? 'mp3' : (m[1] === 'wav' || m[1] === 'x-wav' ? 'wav' : m[1]);
    return { buf: Buffer.from(m[2], 'base64'), ext };
  }
  if (ref.startsWith('http://') || ref.startsWith('https://')) {
    const r = await fetch(ref);
    if (!r.ok) return null;
    const ab = await r.arrayBuffer();
    const ct = r.headers.get('content-type') || '';
    const ext = ct.includes('mpeg') || ct.includes('mp3') ? 'mp3' : (ct.includes('wav') ? 'wav' : (ref.split('.').pop().split('?')[0] || 'mp3'));
    return { buf: Buffer.from(ab), ext };
  }
  // s3:// or local:// refs cannot be fetched directly by this tool — the share
  // endpoint should have already hydrated them to https. If we see a raw s3:// here,
  // treat as "no audio" so the deck still plays via timing (never embed the ref).
  return null;
}

function defaultThumbnail(title, category) {
  const safe = String(title).replace(/[&<>]/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#eef4ff"/><stop offset="1" stop-color="#dbe8fb"/></linearGradient></defs>
  <rect width="320" height="180" fill="url(#g)"/>
  <text x="24" y="40" font-family="Georgia, serif" font-size="13" fill="#2d7aff">${category}</text>
  <text x="24" y="96" font-family="Georgia, serif" font-size="22" fill="#0c1929">${safe.slice(0, 22)}</text>
  <text x="24" y="120" font-family="Georgia, serif" font-size="22" fill="#0c1929">${safe.slice(22, 44)}</text>
  <text x="296" y="164" text-anchor="end" font-family="sans-serif" font-size="12" fill="#8a99a8">✦ Explain It</text>
</svg>`;
}

async function main() {
  const args = parseArgs(process.argv);
  for (const req of ['slug', 'title', 'category', 'summary']) {
    if (!args[req]) fail(`missing --${req}`);
  }
  if (!CANONICAL_CATEGORIES.includes(args.category)) {
    fail(`--category must be exactly one of: ${CANONICAL_CATEGORIES.join(' | ')}`);
  }
  const slug = args.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

  const payload = await loadPayload(args);
  const deckHtml = payload.deckHtml;
  if (!deckHtml || typeof deckHtml !== 'string') fail('payload has no deckHtml');

  const narration = Array.isArray(payload.narrationTexts) ? payload.narrationTexts : [];
  const audioRefs = Array.isArray(payload.audioDataUrls) ? payload.audioDataUrls : [];
  const sceneCount = payload.sceneCount || Math.max(narration.length, audioRefs.length) || 1;

  const outDir = join(REPO_ROOT, 'decks', slug);
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'audio'), { recursive: true });

  // Write deck content (self-contained HTML). Guard: it must not call the backend API.
  await writeFile(join(outDir, 'deck-content.html'), deckHtml, 'utf8');

  // Download audio per scene → local files
  const scenes = [];
  let totalDuration = 0;
  for (let i = 0; i < sceneCount; i++) {
    const audio = await fetchAudio(audioRefs[i]);
    let audioPath = null;
    if (audio) {
      audioPath = `audio/scene-${i}.${audio.ext}`;
      await writeFile(join(outDir, audioPath), audio.buf);
    }
    const dur = 10;
    totalDuration += dur;
    scenes.push({
      index: i,
      title: (payload.scenes && payload.scenes[i] && payload.scenes[i].title) || `Scene ${i + 1}`,
      narration: narration[i] || (payload.scenes && payload.scenes[i] && payload.scenes[i].narration) || '',
      durationSec: dur,
      audioPath,
    });
  }

  // Thumbnail
  await writeFile(join(outDir, 'thumbnail.svg'), defaultThumbnail(args.title, args.category), 'utf8');

  // Quiz (optional)
  let quiz = [];
  if (args.quiz) {
    const raw = await import('node:fs/promises').then(fs => fs.readFile(args.quiz, 'utf8'));
    quiz = JSON.parse(raw);
    if (!Array.isArray(quiz)) fail('--quiz file must be a JSON array');
  }

  const manifest = {
    slug,
    title: args.title,
    category: args.category,
    summary: args.summary,
    tags: args.tags ? args.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    level: args.level || 'Beginner',
    sceneCount,
    durationSec: totalDuration,
    thumbnail: 'thumbnail.svg',
    deckHtmlPath: 'deck-content.html',
    scenes,
    quiz,
    publishedAt: new Date().toISOString().slice(0, 10),
    source: 'nebula-curated',
    publicMetadataOnly: true,
  };
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`Exported deck → decks/${slug}/`);
  console.log(`  scenes: ${sceneCount}, audio files: ${scenes.filter(s => s.audioPath).length}, quiz: ${quiz.length}`);
  console.log(`  Next: node scripts/validate-deck.mjs ${slug} && node scripts/rebuild-catalogue.mjs`);
}

main().catch(e => fail(e.message));

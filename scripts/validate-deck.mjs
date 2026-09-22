#!/usr/bin/env node
/**
 * validate-deck.mjs — Hard validation gate for a static deck package.
 *
 * Usage: node scripts/validate-deck.mjs <slug>        (validate one)
 *        node scripts/validate-deck.mjs --all         (validate every deck)
 *
 * Fails (exit 1) if a deck:
 *  - is missing required files/fields
 *  - uses a non-canonical category
 *  - references remote/expiring audio (s3://, presigned https, share tokens)
 *  - leaks any FORBIDDEN field (userId, workspaceId, shareToken, traces, secrets, internal paths)
 *  - the deck-content.html calls the backend API
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const DECKS_DIR = join(REPO_ROOT, 'decks');
const CANONICAL_CATEGORIES = [
  'Science', 'Engineering', 'Mathematics', 'AI & Computing', 'Earth & Geospatial',
  'Business & Finance', 'Biology & Life Sciences', 'Technology', 'Education',
  'Everyday Concepts', 'Other'
];

// Forbidden substrings scanned across manifest.json + deck-content.html
const FORBIDDEN_PATTERNS = [
  { re: /"?userId"?\s*[:=]/i, label: 'userId' },
  { re: /"?workspaceId"?\s*[:=]/i, label: 'workspaceId' },
  { re: /"?orgId"?s?\s*[:=]/i, label: 'orgId(s)' },
  { re: /"?shareToken"?\s*[:=]/i, label: 'shareToken' },
  { re: /"?share_token"?\s*[:=]/i, label: 'share_token' },
  { re: /s3:\/\//i, label: 's3:// reference' },
  { re: /X-Amz-Signature/i, label: 'presigned S3 URL' },
  { re: /AKIA[0-9A-Z]{16}/, label: 'AWS access key' },
  { re: /sk-[a-zA-Z0-9]{20,}/, label: 'secret key (sk-)' },
  { re: /-----BEGIN [A-Z ]+PRIVATE KEY-----/, label: 'private key' },
  { re: /\/opt\/nebula\//, label: 'internal server path' },
  { re: /\/home\/ubuntu\//, label: 'internal server path' },
  { re: /"?traceId"?\s*[:=]/i, label: 'traceId' },
  { re: /"?executionId"?\s*[:=]/i, label: 'executionId (internal)' },
];

// Deck content must not call the backend API at runtime.
const API_CALL_PATTERNS = [
  { re: /api\.nebulacloud\.studio/i, label: 'backend API host' },
  { re: /\/api\/v1\//i, label: 'backend API path' },
];

let errors = [];
function err(slug, msg) { errors.push(`[${slug}] ${msg}`); }

async function validateDeck(slug) {
  const dir = join(DECKS_DIR, slug);
  if (!existsSync(dir)) { err(slug, 'directory missing'); return; }

  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) { err(slug, 'manifest.json missing'); return; }

  let manifest;
  const manifestRaw = await readFile(manifestPath, 'utf8');
  try { manifest = JSON.parse(manifestRaw); } catch (e) { err(slug, 'manifest.json invalid JSON: ' + e.message); return; }

  // Required fields
  for (const f of ['slug', 'title', 'category', 'summary', 'deckHtmlPath', 'scenes']) {
    if (manifest[f] === undefined || manifest[f] === null) err(slug, `manifest missing "${f}"`);
  }
  if (manifest.slug && manifest.slug !== slug) err(slug, `manifest.slug "${manifest.slug}" != dir "${slug}"`);
  if (manifest.category && !CANONICAL_CATEGORIES.includes(manifest.category)) {
    err(slug, `non-canonical category "${manifest.category}"`);
  }

  // Decks are presented via the canonical Studio share page (shareUrl). A local
  // deck-content.html is optional; if present, it must not call the backend API or leak secrets.
  const deckPath = join(dir, manifest.deckHtmlPath || 'deck-content.html');
  if (existsSync(deckPath)) {
    const deckHtml = await readFile(deckPath, 'utf8');
    for (const p of API_CALL_PATTERNS) if (p.re.test(deckHtml)) err(slug, `deck-content.html references ${p.label}`);
    for (const p of FORBIDDEN_PATTERNS) if (p.re.test(deckHtml)) err(slug, `deck-content.html leaks ${p.label}`);
  }
  // Require a canonical share URL for presentation.
  if (!manifest.shareUrl || !/^https:\/\/app\.nebulacloud\.studio\/share\//.test(manifest.shareUrl)) {
    err(slug, 'missing/invalid shareUrl (must be a canonical Studio /share/ link)');
  }

  // Scenes + audio: local files only
  if (Array.isArray(manifest.scenes)) {
    for (const sc of manifest.scenes) {
      if (sc.audioPath) {
        if (/^https?:|^s3:|^data:/i.test(sc.audioPath)) err(slug, `scene ${sc.index} audioPath must be a local relative path, got remote/inline`);
        else if (!existsSync(join(dir, sc.audioPath))) err(slug, `scene ${sc.index} audio file missing: ${sc.audioPath}`);
      }
    }
  }

  // Forbidden fields anywhere in the manifest
  for (const p of FORBIDDEN_PATTERNS) if (p.re.test(manifestRaw)) err(slug, `manifest leaks ${p.label}`);

  // Quiz shape
  if (manifest.quiz && Array.isArray(manifest.quiz)) {
    manifest.quiz.forEach((q, i) => {
      if (!q.question || !Array.isArray(q.options) || typeof q.answerIndex !== 'number') {
        err(slug, `quiz[${i}] malformed (need question, options[], answerIndex)`);
      }
    });
  }
}

async function main() {
  const arg = process.argv[2];
  let slugs = [];
  if (arg === '--all' || !arg) {
    if (!existsSync(DECKS_DIR)) { console.log('No decks/ dir yet — nothing to validate.'); return; }
    const entries = await readdir(DECKS_DIR);
    for (const e of entries) { if ((await stat(join(DECKS_DIR, e))).isDirectory()) slugs.push(e); }
  } else {
    slugs = [arg];
  }

  for (const slug of slugs) await validateDeck(slug);

  if (errors.length) {
    console.error('VALIDATION FAILED:');
    for (const e of errors) console.error('  ✗ ' + e);
    process.exit(1);
  }
  console.log(`VALIDATION PASSED for ${slugs.length} deck(s): ${slugs.join(', ') || '(none)'}`);
}

main().catch(e => { console.error(e); process.exit(1); });

// Launch curation (idempotent): mark decks with valid MP3 audio as listed+eligible-featured;
// unlist the rest (keep entries + shareUrl); ensure exactly the audio decks are featured (max 8).
import fs from 'node:fs';

const catPath = new URL('../catalogue.json', import.meta.url);
const audit = JSON.parse(fs.readFileSync(new URL('../../_audio-audit.json', import.meta.url)));
const audioTokens = new Set(audit.rows.filter(r => r.audioNonEmpty > 0).map(r => r.token));

const cat = JSON.parse(fs.readFileSync(catPath));
const tok = (u) => { const m = /share\/([A-Za-z0-9_-]+)/.exec(u || ''); return m ? m[1] : null; };

let listed = 0, unlisted = 0;
for (const ex of cat.examples) {
  const hasAudio = audioTokens.has(tok(ex.shareUrl));
  ex.listed = hasAudio;         // only MP3-audio decks are listed for launch
  if (hasAudio) listed++; else { unlisted++; ex.featured = false; } // unlisted can't be featured
}

// Featured = first 8 listed decks (preserve any already-featured audio decks first).
const listedDecks = cat.examples.filter(e => e.listed);
const featuredPreferred = listedDecks.filter(e => e.featured);
const featuredFill = listedDecks.filter(e => !e.featured);
const featuredSet = [...featuredPreferred, ...featuredFill].slice(0, 8);
const featuredSlugs = new Set(featuredSet.map(e => e.slug));
for (const ex of cat.examples) ex.featured = featuredSlugs.has(ex.slug);

cat.metadata.listed_examples = listed;
cat.metadata.unlisted_examples = unlisted;
cat.metadata.last_updated = new Date().toISOString().slice(0, 10);

fs.writeFileSync(catPath, JSON.stringify(cat, null, 2) + '\n');

console.log('LISTED   =', listed);
console.log('UNLISTED =', unlisted, '(entries + shareUrl preserved, hidden from grid)');
console.log('FEATURED =', featuredSet.length, '(all listed w/ audio):');
featuredSet.forEach(e => console.log('  *', tok(e.shareUrl), e.title));

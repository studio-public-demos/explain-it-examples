// One-off audit: for every catalogue share token, hit the demo/share API and
// tally sceneCount vs narrationTexts vs audioDataUrls (non-empty).
import fs from 'node:fs';

const API = 'https://api.nebulacloud.studio/api/v1';
const cat = JSON.parse(fs.readFileSync(new URL('../catalogue.json', import.meta.url)));
const examples = cat.examples;

function tokenOf(shareUrl) {
  const m = /\/share\/([A-Za-z0-9_-]+)/.exec(shareUrl || '');
  return m ? m[1] : null;
}

function nonEmpty(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.filter((x) => typeof x === 'string' && x.trim().length > 0).length;
}

const rows = [];
let resolves = 0, withAudio = 0, completeAudio = 0, partialAudio = 0, noAudio = 0;

for (const ex of examples) {
  const token = tokenOf(ex.shareUrl);
  const row = { title: ex.title, token, catScenes: ex.sceneCount, http: null, scenes: null, narr: null, audio: null, audioNonEmpty: null, klass: null, keys: null, err: null };
  try {
    const res = await fetch(`${API}/demo/share/${token}`, { headers: { accept: 'application/json' } });
    row.http = res.status;
    if (res.ok) {
      resolves++;
      const j = await res.json();
      const data = j.demo ?? j.data ?? j.result ?? j;
      row.keys = Object.keys(data).join(',');
      const scenes = data.sceneCount ?? data.scenes?.length ?? (Array.isArray(data.narrationTexts) ? data.narrationTexts.length : null);
      const narr = Array.isArray(data.narrationTexts) ? data.narrationTexts.length : (Array.isArray(data.scenes) ? data.scenes.filter(s => s?.narration).length : null);
      const audioArr = data.audioDataUrls ?? data.audio ?? null;
      const audioLen = Array.isArray(audioArr) ? audioArr.length : null;
      const audioNE = nonEmpty(audioArr);
      row.scenes = scenes; row.narr = narr; row.audio = audioLen; row.audioNonEmpty = audioNE;
      if (audioNE === 0) { noAudio++; row.klass = 'NO_AUDIO'; }
      else { withAudio++;
        if (scenes && audioNE >= scenes) { completeAudio++; row.klass = 'COMPLETE'; }
        else { partialAudio++; row.klass = 'PARTIAL'; }
      }
    } else {
      row.klass = 'HTTP_ERR';
    }
  } catch (e) {
    row.err = String(e).slice(0, 120);
    row.klass = 'FETCH_ERR';
  }
  rows.push(row);
  process.stdout.write(`${row.klass ?? '?'}\t${row.http}\tsc=${row.scenes}\tnar=${row.narr}\taud=${row.audio}\tne=${row.audioNonEmpty}\t${row.token}\t${row.title}\n`);
}

console.log('\n===== KEYS (first resolved) =====');
console.log((rows.find(r => r.keys) || {}).keys || 'none');
console.log('\n===== SUMMARY =====');
console.log('TOTAL_SHARE_DECKS =', examples.length);
console.log('API_RESOLVES =', resolves);
console.log('DECKS_WITH_AUDIO_DATA =', withAudio);
console.log('DECKS_WITH_COMPLETE_AUDIO_PER_SCENE =', completeAudio);
console.log('DECKS_WITH_PARTIAL_AUDIO =', partialAudio);
console.log('DECKS_WITH_NO_AUDIO =', noAudio);

fs.writeFileSync(new URL('../../_audio-audit.json', import.meta.url), JSON.stringify({ summary: { total: examples.length, resolves, withAudio, completeAudio, partialAudio, noAudio }, rows }, null, 2));
console.log('\nWrote d:/Nebula/_audio-audit.json');

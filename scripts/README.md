# Publish pipeline (v1 — manual / admin)

Turns a **real** Explain It deck into a static, self-contained package under `decks/<slug>/`,
then rebuilds `catalogue.json`. No auto-publishing of Community submissions.

Requires Node 18+ (uses global `fetch`).

## Steps

```bash
# 1) Export a real deck. Source is either a public share token or a raw payload file.
#    (the payload shape matches GET /api/v1/demo/share/<token> → { demo: {...} })

node scripts/export-deck.mjs \
  --token <shareToken> \
  --slug photosynthesis \
  --title "How Photosynthesis Works" \
  --category "Biology & Life Sciences" \
  --summary "How plants convert sunlight into chemical energy." \
  --tags "biology,energy,plants" \
  --level Beginner \
  --quiz decks-input/photosynthesis.quiz.json     # optional

# ...or from a saved payload instead of --token:
#   --input decks-input/photosynthesis.deck.json

# 2) Validate (hard gate — fails on any forbidden field / remote audio / API call)
node scripts/validate-deck.mjs photosynthesis

# 3) Rebuild the catalogue index from all decks
node scripts/rebuild-catalogue.mjs

# 4) Commit + push → GitHub Pages deploys
git add decks/photosynthesis catalogue.json
git commit -m "publish(example): photosynthesis (Biology & Life Sciences)"
git push
```

## What the exporter guarantees

- Audio is DOWNLOADED to local files (`audio/scene-N.mp3`). No `s3://`, no presigned URLs, no expiry.
- Only public fields are written. `userId`, `workspaceId`, `shareToken`, traces, secrets, internal paths are never copied.
- `deck-content.html` is the real deck HTML snapshot; the validator rejects it if it calls the backend API.

## What the validator blocks (exit 1)

- Missing files/fields, non-canonical category, malformed quiz.
- Remote/expiring audio references.
- Any FORBIDDEN field (see `../SCHEMA.md`) in `manifest.json` or `deck-content.html`.
- `deck-content.html` referencing `api.nebulacloud.studio` or `/api/v1/`.

## Quiz file format (optional)

```json
[
  { "question": "…", "options": ["A","B","C","D"], "answerIndex": 2, "explanation": "…" }
]
```

# Static Deck Package Schema

Each example is a self-contained directory under `decks/<slug>/`. It renders with
zero dependency on the production database, backend API, or live share tokens.

## `catalogue.json`

```json
{
  "metadata": {
    "version": "1.0",
    "product": "Explain It",
    "source": "nebula-curated",
    "last_updated": "YYYY-MM-DD",
    "total_examples": 3,
    "categories": ["Science", "Engineering", "Mathematics", "AI & Computing",
      "Earth & Geospatial", "Business & Finance", "Biology & Life Sciences",
      "Everyday Concepts", "Education"]
  },
  "examples": [
    {
      "slug": "photosynthesis",
      "title": "How Photosynthesis Works",
      "category": "Biology & Life Sciences",
      "summary": "One-line description shown on the card.",
      "tags": ["biology", "energy", "plants"],
      "level": "Beginner",
      "sceneCount": 5,
      "durationSec": 62,
      "thumbnail": "thumbnail.svg",
      "publishedAt": "2026-09-20"
    }
  ]
}
```

`examples[].category` MUST be one of the 9 canonical categories exactly.
The catalogue entry is a SUBSET of the deck's `manifest.json` (enough to render the card).

## `decks/<slug>/manifest.json`

```json
{
  "slug": "photosynthesis",
  "title": "How Photosynthesis Works",
  "category": "Biology & Life Sciences",
  "summary": "Visual explanation of how plants convert light into chemical energy.",
  "tags": ["biology", "energy", "plants"],
  "level": "Beginner",
  "sceneCount": 5,
  "durationSec": 62,
  "thumbnail": "thumbnail.svg",
  "deckHtmlPath": "deck-content.html",
  "scenes": [
    { "index": 0, "title": "Sunlight arrives", "narration": "…", "durationSec": 12, "audioPath": "audio/scene-0.mp3" },
    { "index": 1, "title": "…", "narration": "…", "durationSec": 12, "audioPath": "audio/scene-1.mp3" }
  ],
  "quiz": [
    { "question": "…", "options": ["A", "B", "C", "D"], "answerIndex": 2, "explanation": "…" }
  ],
  "publishedAt": "2026-09-20",
  "source": "nebula-curated",
  "publicMetadataOnly": true
}
```

- `scenes[].audioPath` — relative path to a LOCAL audio file. Never an `s3://` ref or a presigned URL.
- `quiz` — may be an empty array `[]` if the deck has no quiz.

## `decks/<slug>/deck-content.html`

The self-contained deck HTML captured from Explain It: embedded SVG scenes, CSS
`motion-*` keyframes, and the deck's internal scene timer. It must NOT make network
calls to the backend API. The viewer loads it into a sandboxed iframe via `srcdoc`
and additionally sends `postMessage({type:'deck:goToScene', scene})` for manual navigation.

## Assets

- `decks/<slug>/audio/scene-N.mp3` — per-scene narration audio (downloaded, local).
- `decks/<slug>/thumbnail.svg` — card thumbnail (SVG or PNG).

## FORBIDDEN in any file (hard validation gate)

- `userId`, `workspaceId`, org IDs
- private prompts / raw user intent beyond the public title/summary
- execution traces, run IDs, internal execution metadata
- API keys, tokens, secrets, `share_token`, presigned URLs, `s3://` refs
- internal file paths

`scripts/validate-deck.mjs` fails the publish if any of these appear.

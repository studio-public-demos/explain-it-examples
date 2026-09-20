# Explain It — Examples

A standalone, **public**, Nebula-curated catalogue of example explanations built with [Explain It](https://explainit.today).

Live: https://studio-public-demos.github.io/explain-it-examples/
(planned custom domain: `examples.explainit.today`)

## What this is (and is NOT)

- **This IS**: a static GitHub Pages site. Self-contained, Nebula-curated example decks. No sign-in, no database, no live API/share-token dependency. Safe to use for marketing, GTM, embeds, and SEO.
- **This is NOT**: the in-product **Community** gallery. Community lives inside the authenticated app at `/dashboard/gallery`, is dynamic, user-published, and database-backed. The two systems are intentionally separate and must not be coupled.

| | Community | Explore Examples (this repo) |
|---|---|---|
| Access | Authenticated | Public |
| Content | User-published | Nebula-curated |
| Lifecycle | Dynamic, DB-backed | Static, stable |
| Location | `/dashboard/gallery` | GitHub Pages |
| Dependency | Production DB + share tokens | None |

## Structure

```
/
├── index.html            # Catalogue grid (fetches catalogue.json, groups by category)
├── deck.html             # Shared static viewer (?slug=<slug>) — plays a deck + quiz
├── catalogue.json        # The catalogue index (metadata + examples[])
├── decks/
│   └── <slug>/
│       ├── manifest.json       # Deck metadata + scenes + quiz (public-only fields)
│       ├── deck-content.html   # Self-contained deck HTML (SVG scenes + animations + timer)
│       ├── audio/scene-N.mp3   # Per-scene narration audio (local, no S3/presign)
│       └── thumbnail.svg       # Card thumbnail
├── .nojekyll
└── .github/workflows/pages.yml # GitHub Pages deploy
```

See [`SCHEMA.md`](./SCHEMA.md) for the exact deck package + catalogue schema, and
[`scripts/README.md`](./scripts/README.md) for the publish pipeline.

## Categories (canonical, exactly 9)

Science · Engineering · Mathematics · AI & Computing · Earth & Geospatial ·
Business & Finance · Biology & Life Sciences · Everyday Concepts · Education

## Publishing (v1 = manual / admin)

1. Author creates an explanation in Explain It (Demo User account).
2. Nebula reviews it.
3. Export to a static deck package (`scripts/export-deck.mjs`).
4. Validate — no PII / secrets / internal metadata (`scripts/validate-deck.mjs`).
5. Commit `decks/<slug>/` + append to `catalogue.json`.
6. Push to `main` → GitHub Pages deploys.

**Community submissions are never auto-published here.**

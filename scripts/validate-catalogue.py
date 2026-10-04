#!/usr/bin/env python3
"""Public Examples catalogue validator (deterministic).

Validates the static Public Examples catalogue and deck packages. Exit non-zero on
any ERROR. Deck-body (deck-content.html) and audio presence are reported as a
distinct STATIC_PLAYABLE gate so the metadata gates can pass independently.

Usage: python scripts/validate-catalogue.py [repo_root]
"""
import json, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CAT9 = ["Science","Engineering","Mathematics","AI & Computing","Earth & Geospatial",
        "Business & Finance","Biology & Life Sciences","Everyday Concepts","Education"]
FORBIDDEN = [
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"\bAKIA[0-9A-Z]{16}\b",
    r"\bgh[pousr]_[A-Za-z0-9]{20,}",
    r"X-Amz-Signature=",
    r"\bBearer\s+[A-Za-z0-9._-]{20,}",
    r"\bsk-[A-Za-z0-9]{20,}",
    r"s3://",
]

errors=[]; warnings=[]; static_missing=[]

cat_path=os.path.join(ROOT,"catalogue.json")
cat=json.load(open(cat_path,encoding="utf-8"))
meta=cat.get("metadata",{}); exs=cat.get("examples",[])

mc=meta.get("categories",[])
if sorted(mc)!=sorted(CAT9):
    errors.append(f"metadata.categories != canonical 9: extra={set(mc)-set(CAT9)} missing={set(CAT9)-set(mc)}")

slugs={}; titles={}
for e in exs:
    slug=e.get("slug","")
    slugs[slug]=slugs.get(slug,0)+1
    t=(e.get("title") or "").strip().lower(); titles[t]=titles.get(t,0)+1
    if e.get("category") not in CAT9:
        errors.append(f"[{slug}] non-canonical category: {e.get('category')}")
    if e.get("featured") and not e.get("listed"):
        errors.append(f"[{slug}] featured but not listed")
    for fld in ("slug","title","category","summary","sceneCount","durationSec","thumbnail"):
        if e.get(fld) in (None,"",[]):
            errors.append(f"[{slug}] missing/empty field: {fld}")
    deckdir=os.path.join(ROOT,"decks",slug)
    if not os.path.isdir(deckdir):
        errors.append(f"[{slug}] deck dir missing"); continue
    if not os.path.isfile(os.path.join(deckdir,"manifest.json")):
        errors.append(f"[{slug}] manifest.json missing")
    if not os.path.isfile(os.path.join(deckdir, e.get("thumbnail","thumbnail.svg"))):
        errors.append(f"[{slug}] thumbnail missing: {e.get('thumbnail')}")
    man_path=os.path.join(deckdir,"manifest.json")
    if os.path.isfile(man_path):
        m=json.load(open(man_path,encoding="utf-8"))
        html=os.path.join(deckdir, m.get("deckHtmlPath","deck-content.html"))
        if not os.path.isfile(html): static_missing.append(slug)

for s,n in slugs.items():
    if n>1: errors.append(f"duplicate slug: {s} x{n}")
for t,n in titles.items():
    if n>1: warnings.append(f"duplicate title (ci) x{n}: {t}")

scan_files=[cat_path]+[os.path.join(ROOT,"decks",d,"manifest.json")
                       for d in os.listdir(os.path.join(ROOT,"decks"))
                       if os.path.isfile(os.path.join(ROOT,"decks",d,"manifest.json"))]
for fp in scan_files:
    txt=open(fp,encoding="utf-8",errors="ignore").read()
    for pat in FORBIDDEN:
        if re.search(pat,txt):
            errors.append(f"FORBIDDEN pattern /{pat}/ in {os.path.relpath(fp,ROOT)}")

listed=sum(1 for e in exs if e.get("listed"))
if meta.get("total_examples")!=len(exs):
    errors.append(f"metadata.total_examples {meta.get('total_examples')} != actual {len(exs)}")
if meta.get("listed_examples")!=listed:
    errors.append(f"metadata.listed_examples {meta.get('listed_examples')} != actual {listed}")

print("=== VALIDATION ===")
print(f"total={len(exs)} listed={listed} unlisted={len(exs)-listed} featured={sum(1 for e in exs if e.get('featured'))}")
print(f"categories canonical-9: {'OK' if sorted(mc)==sorted(CAT9) else 'FAIL'}")
print(f"unique slugs: {'OK' if all(n==1 for n in slugs.values()) else 'FAIL'}")
print(f"forbidden strings: {'none' if not any('FORBIDDEN' in e for e in errors) else 'FOUND'}")
print(f"STATIC_PLAYABLE (deck-content.html present): {len(exs)-len(static_missing)}/{len(exs)} (missing deck body: {len(static_missing)})")
print()
if warnings:
    print("WARNINGS:")
    for w in warnings: print("  -", w)
    print()
if errors:
    print("ERRORS:")
    for e in errors: print("  -", e)
    print(f"\nRESULT: FAIL ({len(errors)} errors)")
    sys.exit(1)
else:
    note=""
    if static_missing:
        note=(f"\nNOTE: metadata/schema/safety = PASS, but {len(static_missing)} decks lack "
              f"deck-content.html -> STATIC_PLAYABLE NOT satisfied (asset-export gap, not a metadata defect).")
    print(f"RESULT: METADATA_PASS{note}")
    sys.exit(0)

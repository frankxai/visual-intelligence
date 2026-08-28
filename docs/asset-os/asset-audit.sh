#!/usr/bin/env bash
# Arcanea Asset OS — Phase 0 audit (read-only)
# Crawl -> manifest -> exact-dup (size-gated sha256) -> source/license + collection buckets
set -uo pipefail

OUT="${1:-./asset-audit-out}"
mkdir -p "$OUT"
RAW="$OUT/raw.tsv"           # size \t mtime \t ext \t collection \t source \t path
MANIFEST="$OUT/asset-manifest.tsv"
: > "$RAW"

ROOTS=(
"/c/Users/frank/Arcanea/.arcanea/visual-assets"
"/c/Users/frank/arcanea-nft-forge"
"/c/Users/frank/arcanea-onchain"
"/c/Users/frank/AnimeLegends.ai/vendor/arcanea-nft-forge"
"/c/Users/frank/OneDrive/NFT"
"/c/Users/frank/OneDrive/Desktop/Akamoto"
"/c/Users/frank/OneDrive/Bilder/Arcanea"
"/c/Users/frank/OneDrive/Dokumente/Downloads Old/NFT"
)

classify_collection() {
  local p="$1" lp
  lp=$(echo "$p" | tr '[:upper:]' '[:lower:]')
  case "$lp" in
    *vanguard*|*/pfps/*|*veldoria*) echo "Vanguard Forged" ;;
    *godbeast*)  echo "Godbeasts" ;;
    *faction*)   echo "Factions" ;;
    *guardian*)  echo "Guardians" ;;
    */faces/*)   echo "Faces" ;;
    */heroes/*)  echo "Heroes" ;;
    *mythology*) echo "Mythology" ;;
    *stellaris*) echo "Stellaris" ;;
    *book-cover*)echo "Book Covers" ;;
    */captures/*)echo "Captures" ;;
    *akamoto*|*/onedrive/nft/*) echo "Akamoto Archive (2021)" ;;
    *nft-forge*|*onchain*) echo "Engine/Repo Assets" ;;
    *) echo "Uncategorized" ;;
  esac
}

classify_source() {
  local f="$1" lf
  lf=$(echo "$f" | tr '[:upper:]' '[:lower:]')
  case "$lf" in
    *starryai*) echo "StarryAI" ;;
    frankx_*|*_beautiful_*) echo "Midjourney" ;;
    *vanguard*|*veldoria*|*luminor*) echo "Arcanea-gen (Higgsfield/Gemini)" ;;
    screenshot*) echo "Screenshot" ;;
    *) echo "Unknown" ;;
  esac
}

echo ">> crawling..."
for root in "${ROOTS[@]}"; do
  [ -d "$root" ] || continue
  while IFS= read -r -d '' f; do
    sz=$(stat -c %s "$f" 2>/dev/null) || continue
    mt=$(stat -c %Y "$f" 2>/dev/null)
    ext="${f##*.}"
    base="$(basename "$f")"
    col=$(classify_collection "$f")
    src=$(classify_source "$base")
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$sz" "$mt" "$ext" "$col" "$src" "$f" >> "$RAW"
  done < <(find "$root" \( -path '*/node_modules/*' -o -path '*/.git/*' -o -path '*/dist/*' -o -path '*/.turbo/*' \) -prune -o \
              -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.gif' -o -iname '*.mp4' -o -iname '*.svg' \) -print0 2>/dev/null)
done

TOTAL=$(wc -l < "$RAW")
echo ">> $TOTAL assets catalogued"

# Size-gated exact-dup detection: only hash files whose size collides
echo ">> hashing size-collision groups for exact dups..."
DUPGROUPS="$OUT/dup-clusters.txt"; : > "$DUPGROUPS"
cut -f1 "$RAW" | sort -n | uniq -d > "$OUT/_colliding_sizes.txt"
while read -r csz; do
  [ -n "$csz" ] || continue
  awk -F'\t' -v s="$csz" '$1==s{print $6}' "$RAW" | while IFS= read -r f; do
    h=$(sha256sum "$f" 2>/dev/null | cut -c1-16)
    printf '%s\t%s\t%s\n' "$h" "$csz" "$f"
  done
done < "$OUT/_colliding_sizes.txt" | sort > "$OUT/_hashed.tsv"

# clusters with >1 identical hash = true exact dups
awk -F'\t' '{c[$1]++; rows[$1]=rows[$1]"\n   "$3} END{for(h in c) if(c[h]>1){print "DUP ("c[h]"x) hash="h rows[h]"\n"}}' "$OUT/_hashed.tsv" > "$DUPGROUPS"
DUPCOUNT=$(grep -c '^DUP' "$DUPGROUPS" 2>/dev/null || echo 0)
WASTED=$(awk -F'\t' '{c[$1]++; sz[$1]=$2} END{w=0; for(h in c) if(c[h]>1) w+=sz[h]*(c[h]-1); print w}' "$OUT/_hashed.tsv")

# Manifest (sorted, human-readable)
{ echo -e "size_bytes\text\tcollection\tsource\tpath"; \
  awk -F'\t' '{print $1"\t"$3"\t"$4"\t"$5"\t"$6}' "$RAW" | sort -t$'\t' -k3,3 -k1,1nr; } > "$MANIFEST"

# Report
REPORT="$OUT/PHASE0-REPORT.md"
{
echo "# Arcanea Asset OS — Phase 0 Audit"
echo ""
echo "Read-only crawl. $TOTAL media assets across ${#ROOTS[@]} roots."
echo ""
echo "## By collection bucket"
echo '```'
awk -F'\t' 'NR>1{c[$3]++} END{for(k in c) printf "%6d  %s\n", c[k], k}' "$MANIFEST" | sort -rn
echo '```'
echo "## By source / inferred license"
echo '```'
awk -F'\t' 'NR>1{c[$4]++} END{for(k in c) printf "%6d  %s\n", c[k], k}' "$MANIFEST" | sort -rn
echo '```'
echo "## By file type"
echo '```'
awk -F'\t' 'NR>1{c[$2]++} END{for(k in c) printf "%6d  .%s\n", c[k], k}' "$MANIFEST" | sort -rn
echo '```'
echo "## Exact duplicates (size-gated sha256)"
echo ""
echo "- Duplicate clusters found: **$DUPCOUNT**"
echo "- Reclaimable space from exact dups: **$(( WASTED / 1048576 )) MB**"
echo ""
echo "See \`dup-clusters.txt\` for the full list. First few:"
echo '```'
head -40 "$DUPGROUPS"
echo '```'
echo "## License note (action needed)"
echo "- **StarryAI (2021)** and **Midjourney** outputs carry different commercial-use terms than **Arcanea-gen** — confirm rights before any of these ship or mint."
echo "- **Unknown** source rows need manual provenance tagging."
} > "$REPORT"

rm -f "$OUT/_colliding_sizes.txt" "$OUT/_hashed.tsv"
echo ">> done. Report: $REPORT"
echo "----"
cat "$REPORT"

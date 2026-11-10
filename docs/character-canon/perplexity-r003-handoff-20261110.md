# Perplexity Infographic Designer — R003 review and integration handoff

Observed 2026-11-10 from [R003 v1 Drive folder](https://drive.google.com/drive/folders/1IxijvLqIC3iFP5M-ksqE_BTYM8LOXfum). **Read-only source/QA review; rendered pixels not independently inspected in this receipt.**

## Existing deliverables

| File | Exact Drive URL |
| --- | --- |
| Crew 1600×1200 | https://drive.google.com/file/d/1OnbEeRBgS6zQDo75EeJLoG1Nmb2uAakt/view |
| Crew 1080×1350 | https://drive.google.com/file/d/1m3mORg0fX0DhHfKrdEOv7-B5Ant9hNuE/view |
| Light 1600×1200 | https://drive.google.com/file/d/11TVhMS7-D3Bptn1xbZ5bywtTzLKvcmUS/view |
| Light 1080×1350 | https://drive.google.com/file/d/1GGrLwbKJI5GpgBG_07j9KQ9IzOgEH6gQ/view |
| Editable HTML | https://drive.google.com/file/d/1KwqL_Q4hr8o9DFdl8c02JorYuaH5Kso-/view |
| Designer QA | https://drive.google.com/file/d/1243-7ynn1UZxC5nxX2qJ0KVKbM4t87Iq/view |
| Claim-source matrix | https://drive.google.com/file/d/1axWtxVTQBHfP6qFw0pDo_aCjbLvpqOft/view |

## Evidence

The designer's own QA reports 30/30 crew landscape, 29/30 crew portrait, 29/30 light landscape, 28/30 light portrait, after addressing overlap and vendor-comparison issues. Treat these as **self-reported**, not independent validation. It acknowledges 13.5–14.5px portrait text and underused space in light variants. Claims map to the user's [published LLM gateway architecture guide](https://www.frankx.ai/blog/llm-gateway-architecture-guide); source.md deliberately omits speculative latency figures.

The source matrix says **Scrubber and Watcher** are new original FrankX robots as of 2026-11-10. They are not included in the existing five-bot v1 lineup and do not establish approved character canon. Preserve them as candidate `infographic-role-crew` extensions, not a renamed Mini Me or Starlight house agent.

## Next independent review gate

1. Inspect the four actual PNGs at native size and 25%; independently check visual hierarchy, text legibility, contrast and overlaps. Record reviewer, time, rubric, and issues.
2. Inspect editable HTML and source matrix against published source. Do not rely on self-score alone.
3. Match Coder, Gatekeeper, Librarian, Retry and Engine against the existing pose source files; document new Scrubber/Watcher recognition anchors separately.
4. Prepare a minimal diff for any typography/crop fixes. Never overwrite the original R003 v1.
5. Present the two strongest versions for founder selection. Only approved **exact output versions** enter Drive `05_Approved` and VIS's approval ledger.

## Cross-platform teammate instruction

For every new Perplexity infographic: load the version-pinned `skills/visual-canon-retrieval/SKILL.md` from VIS; resolve the source-map entries; use existing owned character assets, not invented lookalikes; keep all exact text/labels in HTML/SVG; save draft in `04_Projects` with sources.md, qa.md and exact image links. If VIS's authenticated gateway is unavailable, record source links and missing hashes as unresolved instead of claiming live catalog ingestion. New role bots are candidates until explicitly selected. Do not change the teammate's existing safety rules, scheduled jobs or approved folder.

**Status:** handoff prepared in GitHub only. Perplexity teammate configuration has not been modified; Browser Chat mode is read-only.

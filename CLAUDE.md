# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repository currently contains only [Spec Kit](https://github.com/github/spec-kit) (`speckit`) scaffolding for spec-driven development — no application code has been written yet. There is no `.git` repo at this directory level; it lives as an untracked subfolder inside the parent `pruebas de concepto` git repository.

Structure:
- `.specify/memory/constitution.md` — project constitution (currently the unfilled template; run `/speckit-constitution` to populate it before relying on it).
- `.specify/scripts/bash/` — shell helpers used by the speckit workflow (`create-new-feature.sh`, `setup-plan.sh`, `setup-tasks.sh`, `check-prerequisites.sh`, `common.sh`).
- `.specify/templates/` — templates for constitution/spec/plan/tasks/checklist docs.
- `.claude/skills/speckit-*` — the slash commands below.

## Spec-driven development workflow

Features are built through a fixed pipeline of slash commands, each gated on the previous step's output:

1. `/speckit-constitution` — establish/update project principles (`.specify/memory/constitution.md`).
2. `/speckit-specify` — create or update a feature spec from a natural-language description.
3. `/speckit-clarify` — resolve underspecified areas in the spec via targeted questions (run before `/speckit-plan` unless explicitly skipped).
4. `/speckit-plan` — generate the implementation plan and design artifacts from the spec.
5. `/speckit-tasks` — generate a dependency-ordered `tasks.md` from the plan.
6. `/speckit-analyze` — non-destructive consistency check across spec.md/plan.md/tasks.md.
7. `/speckit-checklist` — generate a custom review checklist for the feature.
8. `/speckit-implement` — execute `tasks.md` to build the feature.
9. `/speckit-converge` — diff the codebase against spec/plan/tasks and append any unbuilt work as new tasks.
10. `/speckit-taskstoissues` — convert tasks into GitHub issues instead of implementing directly.

Each feature's generated spec/plan/tasks live under a numbered feature directory created by `create-new-feature.sh` (sequential numbering, per `.specify/init-options.json`).

There is no build, lint, or test tooling yet — those commands will need to be added here once a stack is chosen and code exists.

## Design system compliance (mandatory before any UI/CSS change)

`docs/design-system.md` is the source of truth for all visual tokens (color, typography,
spacing, radii, elevation) — extracted from Stitch (Google's text-to-UI tool), project
"FleetControl Enterprise". `docs/design-references/screens/` has the actual reference
screenshots per screen/module. **Before writing or editing any CSS, Vuetify theme config, or
component markup that affects visual appearance, read both of these first** — do not invent
shadow/border/color/spacing values from general design judgment. If a screen doesn't have a
reference yet, fetch it from Stitch before implementing (see below), don't guess.

**Fetching from Stitch**: the Stitch MCP server (`stitch.googleapis.com/mcp`) is configured but
its `tools/list` discovery step is currently broken (`can't resolve reference
#/$defs/ScreenInstance` — a schema bug in `upload_design_md`'s `outputSchema`, already reported
to Stitch support). This blocks the tool-calling flow entirely. Workaround: call the JSON-RPC
endpoint directly via `curl`, bypassing the broken schema-list step:

```bash
source ~/.zshrc  # STITCH_API_KEY lives here, not in the Claude Code process env
curl -s -X POST https://stitch.googleapis.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "X-Goog-Api-Key: $STITCH_API_KEY" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_screens","arguments":{"projectId":"4499192746969655413"}}}'
```

Each screen's `screenshot.downloadUrl` (a `lh3.googleusercontent.com` URL) serves a small
thumbnail by default — append `=s2560` (or the screen's actual `width`) to get full resolution.
Save downloaded screens into `docs/design-references/screens/` and update `screens.md`'s table.

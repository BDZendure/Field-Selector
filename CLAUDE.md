# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Obsidian community plugin that injects a chevron-dropdown into rows of the **native Properties panel** so users can pick frontmatter values from a configurable list. Bundles to a single `main.js` consumed by Obsidian at runtime.

The repo lives *inside* an Obsidian vault's plugin folder (`.obsidian/plugins/Field-Selector`), so the working directory IS the install location — `npm run dev` writes `main.js` next to `manifest.json`, and reloading the plugin in Obsidian picks it up.

## Commands

- `npm run dev` — esbuild in watch mode, inline sourcemaps, writes `main.js` in repo root. Leave running while iterating.
- `npm run build` — `tsc -noEmit` typecheck, then a minified production bundle. Run this before shipping; `dev` skips the typecheck.

No test framework or linter is configured.

## Architecture

Entry: `src/main.ts` exports the default `FieldSelectorPlugin` (Obsidian loads this via `manifest.json` → `main.js`). It owns settings load/save and constructs a single `PropertyDropdownEngine` on `onload`.

Two collaborating pieces:

- **`PropertyDropdownEngine` (`src/propertyDropdown.ts`)** — the runtime. Obsidian renders the Properties panel as plain DOM (`.metadata-container` with `div.metadata-property[data-property-key]` rows); this engine watches it and grafts a chevron into each row whose key matches a configured field. Important invariants:
  - **Scan is debounced** via `queueMicrotask` (`scheduleScan`) — `layout-change`, `active-leaf-change`, `file-open`, and `metadataCache.changed` all collapse into one pass.
  - **Per-container `MutationObserver`** stored in a `WeakMap` rescans when Obsidian re-renders the property list.
  - **Chevron injection is idempotent** — checks `:scope > .fs-chevron` before adding, and strips chevrons whose key is no longer configured.
  - **Non-scalar values are skipped** — if frontmatter is an array/number/boolean (read from `metadataCache`, not the DOM), no chevron is injected. Only string/missing values get a dropdown.
  - **Writes go through `app.fileManager.processFrontMatter`** — never edit file text directly; this is the only Obsidian-sanctioned way to mutate frontmatter and keep the cache in sync.
  - **One popup at a time.** `popup`/`popupOwnerKey` track it; `closePopup` is called on every leaf/file change. Dismiss listeners (mousedown/keydown/scroll, all capture phase) are attached with a `setTimeout(0)` so the opening click doesn't immediately close.
  - **Popup positioning** measures with `visibility: hidden` first, then flips above the anchor or clamps horizontally if it would overflow the viewport.

- **`FieldSelectorSettingTab` (`src/settingsTab.ts`)** — settings UI. Renders the `fields: Record<string, string[]>` map as rows of (name input, chip list, add-value input). After any mutation it calls `plugin.saveSettings()`, which persists via `saveData` AND calls `engine.refresh()` so chevrons sync immediately without a leaf change. Renaming a key uses `renameKey` to preserve insertion order.

`src/settings.ts` is just the types and `DEFAULT_SETTINGS` (ships with `status` and `priority` examples).

## Styling

All injected DOM uses `fs-` prefixed classes defined in `styles.css` (Obsidian loads this automatically alongside `main.js`). Reuse `clickable-icon` and `menu` from Obsidian's own classes where the design intent is "look like Obsidian's native control."

## Things that bite

- **Don't read frontmatter from the DOM** — the row's displayed text may be stale or formatted. Always go through `metadataCache.getFileCache(file)?.frontmatter`.
- **`mousedown` handlers `preventDefault`** on the chevron and dropdown items — otherwise the property cell steals focus and Obsidian's own edit affordance opens instead of (or alongside) our popup.
- **Bundled, but `obsidian` is external.** `esbuild.config.mjs` marks `obsidian`, `electron`, all `@codemirror/*`, all `@lezer/*`, and Node built-ins as external. Don't add dependencies that need to be bundled without checking they aren't already provided by the host.
- **`manifest.json` and `versions.json` are part of the release artifact** — bumping `package.json` version alone isn't enough; Obsidian reads `manifest.json`.

# prompt-library-extension

A Chrome side panel extension that stores reusable prompt templates and inserts
the rendered text into the chat input on ChatGPT, Claude, or Gemini.

**Status:** prototype

## The problem

Reusing prompts across chat UIs means keeping them in a notes app and copy-pasting.
The part worth building is getting a saved prompt into the page: ChatGPT's
input is a plain textarea, Claude's is a contenteditable div, and Gemini uses
a custom rich-textarea element, and a background script can only reach any of
them by injecting a serialized function into the page's isolated world.
Variable substitution ({{var}} placeholders) and import/export validation are
the other real pieces.

## How it works

The whole UI lives in `extension/sidepanel.js` (loaded by
`sidepanel.html` per the manifest's `side_panel.default_path`). On load it
reads templates from `chrome.storage.local` under one key
(`promptLibraryStateV1`, see `core/templatesStore.js`).

Saving a template runs it through `core/validation.js`: title/body are
trimmed, capped at 120/10000 characters, and tags are deduped, lowercased, and
capped at 20 tags of 30 characters each.

Clicking Insert runs `core/templateParser.js`, which pulls ordered,
de-duplicated `{{var}}` names out of the body with a regex. If any exist, a
modal collects values and `core/templateRenderer.js` does the substitution.
The rendered text goes to `background.js` via
`chrome.runtime.sendMessage({type: "INSERT_PROMPT", ...})`. There,
`getSiteAdapterForUrl()` (`core/siteAdapters.js`) matches the active tab's
hostname against exactly four supported domains (chatgpt.com,
chat.openai.com, claude.ai, gemini.google.com), and
`chrome.scripting.executeScript()` injects a function that finds the active
element (or a fallback selector), sets `.value` or `.textContent`, dispatches
a bubbling `input` event, and focuses it.

That injected function is a hand-copied duplicate of
`core/insertEngine.js` — `executeScript` serializes `func` into the page, so
it can't `import` a module, and the real module is never actually run against
a live page. If insertion fails, the side panel falls back to a "Copy rendered
prompt" button (`navigator.clipboard.writeText`).

Import/export goes through `core/importExport.js`: exports wrap the template
array in `{version: 1, exportedAt, templates}`, and imports re-validate every
template with the same `validateTemplate()` before replacing state.

## Setup

```bash
cd prompt-library-extension && npm install
```

Then, to load the extension itself:

1. Open `chrome://extensions`, enable Developer mode.
2. Click "Load unpacked" and select the `extension/` subfolder — not the repo
   root, the manifest lives at `extension/manifest.json`.
3. Open chatgpt.com, chat.openai.com, claude.ai, or gemini.google.com, open
   the Prompt Library panel from the toolbar icon, save a template, and click
   Insert.

No build step: the manifest loads the background worker and
`sidepanel.html`'s script as native ES modules directly.

## Tests

```bash
npm test   # jest, jsdom environment — 5 suites / 5 tests, verified passing
npm run lint   # eslint, --max-warnings=0 — verified clean
```

## Known limitations

- The tested `core/insertEngine.js` is dead code in the real path. Insertion
  actually runs through a separate, untested copy of the same logic hand-duplicated
  inline in `background.js`, because an injected `func` can't import a module.
  `tests/insertEngine.test.js` verifies code that never runs against a live page.
- Test coverage is thin: 5 tests total, one case each, covering only the
  smallest pure-logic modules. There is no coverage for `templatesStore.js`,
  `siteAdapters.js`, `background.js` (the actual insertion handler), or
  `sidepanel.js` (404 lines — the entire UI).
- Site support is hardcoded to four hostnames with exact string equality: no
  www/subdomain tolerance, and no Copilot, Perplexity, Mistral, or local LLM
  UIs, despite the manifest describing support for "AI chat apps" generally.
- Insertion sets `.value`/`.textContent` directly and dispatches one bubbling
  `Event("input")`. React-controlled inputs — which ChatGPT, Claude, and
  Gemini all use — commonly ignore this pattern because React hooks the
  native property setter, not just the DOM event. This wasn't verified live
  in the audit, but the presence of a clipboard fallback right next to
  insertion suggests the author already hit this. contenteditable targets also
  get plain-text `.textContent`, which strips any formatting the host editor
  expects.
- No selector health-check: if any of the four sites changes its DOM,
  insertion fails silently with a generic toast and no telemetry.
- Import replaces the entire template library rather than merging — importing
  a file silently discards any local template that wasn't itself exported.
- No CI, no packaging script, no version-bump automation. The only install
  path is Load Unpacked; nothing suggests this has ever shipped as a .zip or
  been submitted to the Chrome Web Store.
- Storage is a single unversioned key with no migration path if the schema
  changes.
- Git history is two commits (initial build, then a .gitignore fix) — no
  iteration against real usage.

## What I'd build next

- Ship insertion as an actual content script file declared in the manifest
  (or injected via `files:`), so the tested `insertEngine.js` is the code that
  runs on the page.
- Verify insertion against each site's real controlled-input behavior (native
  property setter plus a proper `InputEvent`, or `execCommand`/paste
  simulation) instead of a plainly dispatched `Event`.
- Add tests for `siteAdapters.js`, `templatesStore.js`, and the `sidepanel.js`
  UI flow with jsdom and a fake `chrome.*` API.
- Add CI (`npm test` + `npm run lint` on push) and a packaging step before
  treating this as installable by anyone besides the developer.

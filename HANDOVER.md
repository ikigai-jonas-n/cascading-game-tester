# HANDOVER — Cascading Game Tester

This document is for the next Claude session. Read it completely before touching any file.

---

## What This App Is

A developer tool for testing slot game spin APIs. It:
- Fires HTTP spin requests to a local RGS backend
- Stores every spin in IndexedDB (via `src/db.js`)
- Displays spin history as cards in a right panel
- Lets you inspect the game grid field-by-field (tumble/cascade viewer)
- Supports filters, auto-play, cheat templates, and MongoDB import

**Stack:** SolidJS (JSX), Vite, IndexedDB (idb library), Web Workers for bulk spins.

---

## Directory Map

```
src/
├── main.jsx                  # App entry, mounts <App/>
├── index.html                # Vite entry, in src/ not root
├── filters.js                # FILTER_DEFS array + applyFilters()
├── db.js                     # IndexedDB: saveSpin, loadAllSpins, searchEntireDb, etc.
├── spin-worker.js            # Web Worker for bulk spin batches
├── store/
│   ├── gameStore.js          # game() signal — active game config
│   ├── historyStore.js       # globalHistory (store), activeFilters (store), currentSortedList (signal)
│   ├── sessionStore.js       # gameState, autoPlayRunning, playbackInterval, etc.
│   └── uiStore.js            # apiUrl, playerId, modal open states, loading overlay
├── services/
│   ├── spinService.js        # playSpin, playSingleSpin, stopAutoPlay, fireSpinRequest
│   ├── gameService.js        # triggerFilterUpdate, switchGame, app boot
│   ├── drawerService.js      # openRawDrawer, updatePlaybackLabels, syncPlaybackUI
│   └── exportService.js      # CSV/JSON export
└── components/
    ├── App.jsx
    ├── layout/               # LeftPanel, CenterPanel, RightPanel
    └── features/
        ├── FilterBar.jsx     # Filter chips + add filter UI (FULLY REWRITTEN — see below)
        ├── PlayControls.jsx  # PLAY/STOP buttons, spin mode selector, error display
        ├── SpinHistory.jsx   # Renders spin cards list
        ├── SpinCard.jsx      # Individual spin card
        ├── GameGrid.jsx      # The game grid display
        ├── HudDisplay.jsx    # Win/tumble counters
        ├── PlaybackControls.jsx
        ├── TumbleAudit.jsx
        ├── RawDrawer.jsx     # JSON viewer drawer on the right
        ├── SymbolMap.jsx
        ├── cheatTemplateStore.js  # allCheatTemplates() memo
        └── ToastContainer.jsx
    └── modals/
        ├── SettingsModal.jsx
        ├── QuickCheatModal.jsx
        ├── MongoRoundImportModal.jsx
        ├── ShortcutsModal.jsx
        ├── CustomGameModal.jsx
        ├── PaytableModal.jsx
        └── ChoicePromptModal.jsx
```

---

## SolidJS Gotchas — CRITICAL

### Store vs Signal Access

There are TWO kinds of reactive primitives. Mixing them up is the #1 bug source.

| Variable | Type | How to access | How to get length |
|---|---|---|---|
| `globalHistory` | `createStore([])` | `globalHistory[i]` | `globalHistory.length` (NO `()`) |
| `activeFilters` | `createStore([])` | `activeFilters[i]` | `activeFilters.length` (NO `()`) |
| `currentSortedList` | `createSignal([])` | `currentSortedList()` | `currentSortedList().length` |
| `autoPlayRunning` | `createSignal` | `autoPlayRunning()` | — |
| `game` | `createSignal` | `game()` | — |

**Never call `globalHistory()` — it's a store, not a signal.** You'll get `undefined`.

### Store Path-Based Mutation

```js
// Valid SolidJS store path mutation:
setActiveFilters(idx, 'disabled', (v) => !v);  // toggles disabled at index idx

// NOT valid (plain array signal would need a function):
setActiveFilters((prev) => [...prev, item]);  // works for replacing entire array
```

`setActiveFilters(idx, 'key', fn)` — path-based, only works on `createStore`.

### createEffect / createMemo Import

SolidJS does NOT auto-import. If a component uses `createMemo`, it MUST be in the import line. Missing import causes silent runtime crash (`templates is not a function` or similar).

Always check line 1 of every JSX file: `import { createSignal, Show, For, createMemo, createEffect, onCleanup } from 'solid-js';`

### For / Show

```jsx
<For each={activeFilters}>           // tracks store array reactively
  {(af, idx) => { ... idx() ... }}   // idx is a SIGNAL — must call idx() not idx
</For>

<Show when={pendingFilter()}>        // evaluates signal
  ...
</Show>
```

---

## Data Flow — Spin History

```
spin fires → spinService.playSingleSpin()
           → db.js saveSpin()
           → prependSpins([entry])           ← sets globalHistory store
           → triggerFilterUpdate()           ← only if filters active
           → rebuildSortedList()             ← always after history change
           → currentSortedList updated       ← SpinHistory re-renders
```

`triggerFilterUpdate()` in `gameService.js`:
- Searches ENTIRE IndexedDB (not just RAM)
- Calls `replaceHistory(spins)` + `rebuildSortedList()`
- Shows loading overlay during search
- Must be called after any `setActiveFilters` mutation

---

## Filter System

**`src/filters.js`** defines `FILTER_DEFS` — array of 19+ filter definitions.

Each def has:
```js
{
  id: 'winCondition',
  label: 'Win Amount',
  type: 'condition',          // toggle | condition | number | text | date | select | symbolCount | multiselect
  apply(spin, value, gameConfig) { ... },
  formatValue(value, gameConfig) { ... },  // optional — for chip display
  options: [...],             // for select type with static options
  optionsFromGame: true,      // for select type with dynamic options
}
```

**Stackable filter IDs** (can be added multiple times): `text`, `winCondition`, `hasSymbol`

**`applyFilters(history, activeFilters, gameConfig)`** — AND logic, skips disabled filters.

### FilterBar.jsx — State Machine (REWRITTEN)

FilterBar uses a `pendingFilter` signal as a "what are we configuring right now" state machine:

1. User clicks "+ Add Filter" → dropdown opens
2. User clicks a filter type:
   - `toggle` type → commits immediately, no input needed
   - all other types → sets `pendingFilter(def)`, dropdown closes
3. Inline form renders based on `pendingFilter().type`:
   - `condition`: operator select + number input → `{ op, num }`
   - `number`: number input → `float`
   - `text`: text input → `string`
   - `date`: date input → `string`
   - `select`: select from `def.options` OR text fallback if `def.optionsFromGame`
   - `symbolCount`: symbol dropdown (from `game().symbols`) + count input → `{ symId, count }`
   - `multiselect`: checkboxes (from `game().winCategories`) → `string[]`
4. User clicks "Add" → `confirmPending()` assembles correct value, calls `commitFilter(def, value)`
5. `commitFilter` calls `setActiveFilters((prev) => [...prev, { id, value }])` then `triggerFilterUpdate()`

**Chip display**: uses `def.formatValue(af.value, game())` if present, otherwise type-specific fallback.

---

## Stop Auto-Play — Abort Pattern

`spinService.js` exports `stopAutoPlay()`. Three things must be killed:

```js
let _autoPlayController = null;   // AbortController for HTTP (allCheatTemplates mode)
let _currentWorkers = [];         // Worker instances (worker pipeline mode)
let _resolveAutoPlay = null;      // Stored resolve() to exit the Promise

export function stopAutoPlay() {
  setAutoPlayRunning(false);
  if (_autoPlayController) { _autoPlayController.abort(); _autoPlayController = null; }
  _currentWorkers.forEach((w) => w.terminate());
  _currentWorkers = [];
  if (_resolveAutoPlay) { _resolveAutoPlay(); _resolveAutoPlay = null; }
}
```

`_resolveAutoPlay` is set as the FIRST LINE inside `new Promise((resolve) => { _resolveAutoPlay = resolve; ... })` so it's immediately accessible even before workers dispatch.

Workers check `autoPlayRunning()` in their `onmessage` handler — if false they drain without processing, then resolve.

**PlayControls.jsx** STOP button calls `stopAutoPlay` directly (imported from spinService).

---

## Error Display — Unified Style

Both `PlayControls.jsx` (spin errors) and `QuickCheatModal.jsx` (cheat errors) use this exact style:

```jsx
<Show when={errorSignal()}>
  <div style="color:var(--error); font-size:11px; padding:8px; background:rgba(244,63,94,0.1); border-radius:6px; border:1px solid rgba(244,63,94,0.3);">
    {errorSignal()}
  </div>
</Show>
```

---

## Spin Count Display

**FilterBar.jsx** shows `{currentSortedList().length}/{globalHistory.length}`:
- `currentSortedList()` — filtered+sorted count (signal, needs `()`)
- `globalHistory.length` — total in RAM (store, NO `()`)

---

## QuickCheatModal.jsx Notes

- `templates = createMemo(() => allCheatTemplates()[game().id] || [])` — requires `createMemo` import
- `handleTemplateChange` does NOT inject `configId`/`gameCode` — only reflects template JSON in textarea
- `handleSend` DOES inject: `parsed.configId = playerId()` and `parsed.gameCode = game().gameCode` at send time
- Single textarea only — no "Request to be sent" readonly second box
- Esc closes: `onKeyDown={(e) => { if (e.key === 'Escape') close(); }}`

---

## MongoDB Import

`MongoRoundImportModal.jsx` — accepts raw MongoDB Compass clipboard JSON (the `{}` array with `$oid`, `$date` etc). Converted via `mongoRoundConverter.js` + `bson` library. One clipboard paste = one `SpinHistory` card (BaseSpin + FreeSpins combined).

---

## What Was Fixed in Recent Sessions

| Fix | File | Status |
|---|---|---|
| FilterBar multi-step filters silently doing nothing | FilterBar.jsx | ✅ DONE — full rewrite |
| `{filtered}/{all}` count display | FilterBar.jsx | ✅ DONE |
| PlayN instant stop via STOP button | spinService.js, PlayControls.jsx | ✅ DONE |
| Unified HTTP error style | PlayControls.jsx, QuickCheatModal.jsx | ✅ DONE |
| Single textarea in QuickCheatModal | QuickCheatModal.jsx | ✅ DONE |
| `createMemo` missing import in QuickCheatModal | QuickCheatModal.jsx | ✅ DONE |

---

## What Still Needs Verifying / TODO

1. **Esc closes ALL overlay windows** — QuickCheatModal has it; verify SettingsModal, ShortcutsModal, CustomGameModal, PaytableModal, MongoRoundImportModal all also have it.
2. **FilterBar runtime test** — rewrite is complete but hasn't been tested in browser. Specifically check:
   - `triggerFilterUpdate` actually exported from `gameService.js` ✅ (confirmed line 36)
   - `setActiveFilters(idx, 'disabled', (v) => !v)` works — valid because `activeFilters` is `createStore` ✅
   - `select` type with `optionsFromGame: true` — currently falls back to text input; may need symbol dropdown for `gameId` filter
3. **`WIN_OPERATORS`** in `filters.js` — verify each has `.label` field (FilterBar uses `o.label` in option text). If they only have `.op`, the select will show blank options.

---

## How to Read the Codebase Efficiently

1. **Start with `src/filters.js`** — understanding FILTER_DEFS gives you the data model for the entire filter system.
2. **Read `src/store/historyStore.js`** — 73 lines, defines every data primitive the app depends on.
3. **Read `src/services/gameService.js` top 80 lines** — `triggerFilterUpdate` is the critical bridge between filter state and DB.
4. **Read `src/services/spinService.js` lines 47-64** — the stop pattern.
5. **For UI bugs:** Read the specific component, then its imports to see which store primitives it uses.
6. **For filter bugs:** Read `filters.js` first, then `FilterBar.jsx`, then `gameService.triggerFilterUpdate`.
7. **Never read raw JSON payloads** — they're huge. Use `ctx_execute` if you need to analyze them.

---

## Common Mistake Patterns

| Mistake | Effect | Prevention |
|---|---|---|
| `globalHistory()` with `()` | `undefined`, crash | It's a store — never call it |
| `currentSortedList.length` without `()` | 0 always | It's a signal — must call `()` |
| `idx` not called in `<For>` callback | Wrong index | Always `idx()` in For callbacks |
| Missing `createMemo`/`createEffect` in import | Silent crash | Always check line 1 imports |
| `setActiveFilters` without `triggerFilterUpdate()` | Filter applied to RAM only, DB not searched | Always pair them |
| Calling `rebuildSortedList()` without `replaceHistory()` | Filters stale data | `triggerFilterUpdate` does both |
| Modifying spin.rawData directly | Store mutation bug | Always copy — SolidJS stores are immutable |
| Reading `game().symbols` before game loaded | Empty object | Guard with `Object.entries(game().symbols || {})` |

---

## CSS Variables (index.css)

```
--bg-main, --bg-sidebar, --bg-card
--text-primary, --text-muted
--border-color
--error                          ← used in error display style
--btn-primary (class)
--btn-ghost (class)
```

Modal dialogs use class `modal-dialog` + `modal-content` + `modal-header` + `modal-body`.

---

## Dev Server

```bash
npm run dev
```

App runs at `http://localhost:5173`. Vite config proxies `/v1/` to the RGS backend URL stored in settings.

> vite.config.js note: `root` is set to `src/` — so `index.html` is at `src/index.html`, not repo root.

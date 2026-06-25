# Adding a Game to the Cascading Game Tester

A complete, opinionated guide (and Claude skill) for wiring a new slot game into
this tester. Read it top to bottom the first time. It covers the plugin contract,
the JSON-response → UI mapping (property by property), the render pipeline, the
win model, the choice/multi-stage flow, the **meta.private trap**, and a full
worked example (Olympus) including what broke and how it was fixed.

---

## 0. TL;DR — the 4 things you actually do

1. Create `src/games/<your-game>.{js,jsx}` exporting a **`GameConfig`** object as
   `default`. It auto-registers (`game-registry.js` globs `./games/*.{js,jsx}`).
2. Fill the **symbol maps**, **`gameCode`**, and **`defaultRequestBody`**.
3. If the game is a normal grid (fixed rows×cols, tumble/cascade), you're done —
   the **default `GameGrid`** renders it. If the board is unusual (line game,
   dynamic size, multiple board shapes, lives, etc.), add a **custom
   `components.GameBoard`**.
4. If the default win-per-field rule is wrong for your game, add
   **`hooks.computeFieldWin`**.

Everything else is optional polish.

---

## 1. Where a game plugs in

```
HTTP /v1/service/play  ──>  RGS backend (slot-game-server)
        ▲                          │ JSON response
        │ request body             ▼
spinService.fireSpinRequest ──> extractFields() ──> spin.fields[]  (frames)
        │                                                │
        │                                                ▼
   game-registry (your GameConfig)            GameGrid / your GameBoard renders a frame
```

- `spinService.fireSpinRequest(config)` POSTs to `${apiUrl()}/v1/service/play` with
  header `x-signature: rgs-local-signature` and body
  `{ ...request_body, gameCode: game().gameCode, id: playerId() }`.
- `request_body` is seeded from your `defaultRequestBody` (first run / Settings),
  persisted in `localStorage`.
- The response is sliced into **fields** (a.k.a. frames) and played back step by
  step in the center panel.

---

## 2. The `GameConfig` contract

Defined (loosely) in `src/game-registry.js`. Extra properties are allowed (games
freely add `paytable`, `betBase`, etc. as reference data the core ignores).

### Required / common

| Property | Type | Purpose |
|---|---|---|
| `id` | `string` | Unique key, e.g. `'olympus'`. Used in the game switcher + storage. |
| `name` | `string` | Display name. |
| `gameCode` | `string` | Sent to the backend (`LGS-020`). The RGS dispatches on this. |
| `symbols` | `Record<number, string>` **or** `Record<number,{name,emoji,color}>` | Maps a symbol ordinal to a label (and optionally emoji/color). Both shapes are supported — see §3. |
| `defaultRequestBody` | `object` | The initial spin request (`cashBet`, `currencyDec`, `stakes`, `rtpOption`, …). Seeds `localStorage.request_body`. |
| `grid` | `{ rows?, cols? }` | Board dimensions for the **default** renderer. Ignored if you supply a custom `GameBoard`. |
| `emptySymbolId` | `number` | Ordinal that means "empty cell" (not rendered as a win). |
| `scatterSymbolId` | `number` | Scatter ordinal (stats/labels). |
| `wildSymbolId` | `number` | Wild ordinal (set to an unused value, e.g. `-1` or `0`, if the game has no wild). |

### Optional

| Property | Type | Purpose |
|---|---|---|
| `emojis` | `Record<number,string>` | Emoji per ordinal (if `symbols` is the flat string form). |
| `colors` | `Record<number,string>` | Color per ordinal. |
| `playerId` | `string` | Default player/config id for requests. |
| `winCategories` | `Record<string,number>` | Win tiers (BIG_WIN, MEGA_WIN…) for filters + tags. |
| `actions` | `Array<{id,desc}>` | Human labels for `choices` (the ChoicePromptModal). |
| `winCap` | `number` | Max-win multiplier, for display/filters. |
| `isEnabled` | `boolean` | `false` hides it from the switcher. |
| `hooks` | see §6 | `computeFieldWin`, `goldenEnabled`, `extractFields`. |
| `components` | see §5 | `GameBoard`, `AuditTrail` custom UI. |

> Note: `src/docs/IGamePlugin.ts` is an **aspirational** React-flavoured contract.
> The **real** runtime contract is the `GameConfig` typedef in `game-registry.js`
> and the SolidJS components. When they disagree, the registry wins.

---

## 3. The JSON response → tester mapping (property by property)

The backend returns `{ data: <PlayOutput> }`. After `fireSpinRequest` unwraps
`.data`, the shape the tester cares about is:

```jsonc
{
  "step": {
    "gamePhases": [
      {
        "type": "regular | baseSpin | freeSpin | ...",
        "coins": "12.34",
        "playgrounds": [
          {
            "type": "basic | ...",
            "coins": "12.34",
            "fields": [
              {
                "coins": "12.34",
                "symbols": {
                  "initial": [/* ordinals */],
                  "final":   [/* ordinals */],
                  "payouts": [ { "symbol": 1, "coins": "50", "oak": 3, "positions": [0,1,2] } ]
                },
                "features": { /* game-specific, see below */ }
              }
            ]
          }
        ]
      }
    ],
    "summary": { "coins": "12.34", "hasMaxWin": false }
  },
  "meta": { "public": { "betAmount": "20", "spinMode": "commonGame" }, "private": { "isCheatTriggered": false } },
  "rng": {},
  "finished": true,
  "choices": [],
  "roundTags": ["regular"]
}
```

What the tester does with each property (`extractFields` + `buildSpinEntry` in
`spinService.js`):

| JSON path | Tester meaning |
|---|---|
| `step.gamePhases[]` | Phases. `extractFields` flattens every phase's fields into one `fields[]` frame list. |
| `gamePhases[].type` | `'baseSpin'` → sets `hasBaseSpin`; `'freeSpin'` → sets `hasFreeSpin`. **Any other value (e.g. `'regular'`) is fine but won't set those flags** — purely cosmetic (`spinType` label). Fields are still extracted. |
| `playgrounds[]` | Grouping (e.g. one playground per free-spin). Drives `playgroundStats` / labels. |
| `fields[]` | **The frames.** Each becomes one playback step. |
| `field.symbols.final` | 1D array of ordinals = the board after this step. **Required** for rendering. |
| `field.symbols.initial` | Board before the step (for tumble "before/after" double-grid). Optional. |
| `field.symbols.payouts[]` | Win lines/clusters. Each: `symbol`, `coins` (or `payoutCoins`), `oak`, `positions` (or `winPositions`). `positions` are flat indices used to **highlight winning cells** and (by default) to compute the field win. |
| `field.coins` | Per-field win string. Default `computeFieldWin` returns this. |
| `field.features` | **Game-specific render data.** Examples: `cumulativeMultiplier`, `golden[]`, `triggerFreeSpin`, `wildMultiplier`, and (Olympus) `livesAfter`, `newCoins[]`, `coins[]`, `modifier`. **This is where you put anything the frontend must render** (see §8). |
| `summary.coins` | **Headline round win.** `spin.totalWin` = this. Independent of per-field summing — so even cumulative bonuses report the right total. |
| `summary.hasMaxWin` | Max-win flag for the card. |
| `finished` | `false` + `choices` non-empty → triggers the choice/replay loop (§7). |
| `choices[]` | Available continuation choices (`[1]` etc). `actions` maps id → label. |
| `meta.public` | `betAmount`, `spinMode` — read for the card. |
| `meta.private` | Readable for **display** (e.g. `isCheatTriggered`). **DANGER:** you cannot reliably *send it back* — see §8. |
| `roundTags[]` | Tags shown on the card / used by filters. |
| `rng` | Reserved for seeds the frontend animates (nudge, reel activation). Currently informational. |

### Symbol map shapes (two are supported)

```js
// A) flat strings + separate emojis/colors (Olympus)
symbols: { 1: 'Diamond', 11: 'Scatter', '-1': 'Empty' },
emojis:  { 1: '💎', 11: '⭐', '-1': '' },
colors:  { 11: '#fbbf24' },

// B) combined objects (Magic G)
symbols: { 0: { name: 'H1 ALADDIN', emoji: '🧞', color: '#ff9800' }, ... },
```

Pick one and be consistent. `'-1'` keys are fine — JS coerces numeric/negative
keys to strings.

---

## 4. Render pipeline (frames)

`GameGrid.jsx`:
- `field = gameState.fields[gameState.currentIndex]` — the current frame.
- `phase = gameState.currentFramePhase` — passed to a custom board.
- If `game().components.GameBoard` exists → it renders everything (`<Dynamic
  component={GameBoard} frameData={field} phase={phase} />`).
- Otherwise the **default grid** renders `symbols.initial`/`symbols.final` using
  `grid.{rows,cols}`, highlighting `payouts[].positions` and (if
  `hooks.goldenEnabled`) `features.golden[]`.

### Cell index order (critical)

The default renderer maps a flat array to a grid **column-major**:

```
idx = col * rows + row
```

So `final[0..rows-1]` is column 0 top→bottom, then column 1, etc. **Your backend's
flatten order must match this**, or cells land in the wrong place. (Olympus
flattens `screen.flat()` over a `cols × rows` matrix — column-major — so it lines
up.) If you write a custom `GameBoard`, you own the mapping.

---

## 5. Custom `GameBoard` — when and how

Use the default grid when the board is a plain fixed rows×cols of single symbols.
Write a custom `components.GameBoard` when any of these is true:
- The board size changes per spin (Go-Ways).
- There are **multiple board shapes in one round** (Olympus: 4-cell base line vs
  5×4 bonus grid).
- You need extra chrome: lives, jackpot meter, multiplier badge, coin values.

Contract: `GameBoard(props)` where `props.frameData` = the current field,
`props.phase` = the frame phase string. It's a **SolidJS** component.

```jsx
function GameBoard(props) {
  const final = createMemo(() => props.frameData?.symbols?.final || []);
  const features = createMemo(() => props.frameData?.features || {});
  // branch on shape, read features, render.
}
export default { /* ...config... */, components: { GameBoard } };
```

---

## 6. Win model (`hooks.computeFieldWin`)

```js
// Default (no hook): field win = parseFloat(field.coins)
computeFieldWin(field, gameConfig) // → number
```

- **Accumulated win / cascade count** = sum / count of `computeFieldWin` across
  fields. **Headline win** = `summary.coins` (always trust this for the total).
- Override when per-field `coins` isn't the contribution. Examples:
  - Magic G: `coins * features.cumulativeMultiplier`.
  - Go-Ways: sum of `symbols.payouts[].coins`.
  - **Olympus bonus**: fields carry a *cumulative* grid total, so per-field
    contribution must be **0** (else you double-count) — the real total comes from
    `summary.coins`.

`hooks.goldenEnabled: true` turns on `features.golden[]` cell highlighting.

`hooks.extractFields(data)` is the escape hatch for non-standard engines — return
`{ fields, fieldMetadata, playgroundStats, hasBaseSpin, hasFreeSpin, playgroundCount }`.
You rarely need it; the default walks `gamePhases→playgrounds→fields`.

---

## 7. Choice / multi-stage flow

If a spin returns `finished:false` + `choices:[...]`, `fireSpinRequest` loops:
auto-picks `choices[0]` (or, interactively, prompts via `ChoicePromptModal` using
`actions[].desc` labels), re-fires with `{ ...reqBody, choice }`, and concatenates
the returned phases. So a "press to continue into the bonus" model works out of
the box.

**Olympus uses this two-request flow.** The base spin that triggers the bonus
returns `features.triggerFreeSpin=true`, `finished:false`, `choices:[1]`, and the
seeded golden-coin count in `meta.private.seedGoldenCoins`. `spinService.js`
forwards the prior response's `meta.private` into the follow-up `choice:1` request
(round-state carry), so the backend's Free Game seeds correctly. The two responses'
fields are stitched into one frame sequence (base 4 cells → bonus 20 cells each).

---

## 8. ⚠️ The `meta.private` rule (READ THIS)

**`meta.private` is for the BACKEND.** The backend reads/writes it freely (round
state, internal flags) — that's fine and expected. The **problem is the other
direction**:

> **If the FRONTEND needs to read a property, it must NOT live only in
> `meta.private` — move it to a public place** (`field.features`,
> `field.symbols.payouts`, `field.coins`, or `meta.public`).

So when adding a game, do this audit: list everything the UI must render, and
make sure none of it is trapped in `meta.private`. If it is, change the backend to
publish it (private → public). Backend-only bookkeeping can stay private.

**Per-frame render data → always `features`** (it lives on each field, is always
delivered to the client). Olympus puts coin value, tier, which coins are new, and
the modifier's chosen target in `features` for exactly this reason (see §9).

### Round-tripping `meta.private` across the two requests

The continuation request echoes the **prior response's** `meta.private` back to the
backend (the platform carries round-state; `spinService.js` does the same for the
tester by forwarding it on the `choice` request). The backend reads it directly —
e.g. Olympus reads `meta.private.seedGoldenCoins` on the `choice:1` request to seed
the Free Game. Do **not** widen `PlayRequestSchema` for game-specific fields; the
round-state carry already delivers the prior `meta.private` to the next request.

### Olympus audit (worked result)

The frontend plugin reads only `symbols.final`, `features.*`, `field.coins`, and
`payouts` — **nothing from `meta.private`**. Olympus's `meta.private`
(`baseGameWin`, `bonusTotalWin`) is backend-info only and is redundant with the
public `phase.coins` / `summary.coins`, so it needed no change. All render data
(coin value/tier, lives, modifier target, new coins) is already public in
`features`.

---

## 9. Worked example — Olympus (LGS-020): the full journey

Olympus is the awkward case that exercises everything: a **single-line base game**
(3 reels + a modifier reel) **plus** a **sticky 5×4 coin-collect bonus**. Two
totally different boards, two different response shapes, in one round.

### 9.1 The plugin (`src/games/olympus.jsx`)

- `gameCode: 'LGS-020'`, flat `symbols` + `emojis` + `colors`, `defaultRequestBody`
  with `commonGame` / `RTP_97`.
- Custom `components.GameBoard` that **branches on `final.length`**:
  - `=== 4` → **BaseBoard**: reels 1–3 (the line) + the modifier reel (4th cell),
    win-highlight from `payouts`.
  - else (`20`) → **BonusBoard**: 5×4 grid rendered from `features.coins`.
- `hooks.computeFieldWin`: base = sum of `payouts[].coins`; bonus fields → `0`
  (cumulative, headline from `summary.coins`).

### 9.2 What the backend publishes (all in `features`, public)

Base field `features`: `{ multiplier, triggerFreeSpin }`.

Bonus field `features`:
```jsonc
{
  "livesAfter": 3,
  "newCoins": [4],                       // flat indices that landed this spin
  "coins": [                             // every coin on the sticky grid
    { "index": 0, "col": 0, "row": 0, "value": 50, "tier": "gold",   "ordinal": 102, "isNew": false },
    { "index": 4, "col": 1, "row": 0, "value": 5,  "tier": "bronze", "ordinal": 100, "isNew": true  }
  ],
  "modifier": { "kind": "collector", "target": 0, "absorbed": [4], "beforeValue": 50, "afterValue": 55 }
}
```
Bonus `payouts` are **coin-related**: one entry per coin
`{ symbol: tierOrdinal, coins: value, oak: 1, positions: [index] }`.

The frontend reads `features.coins` for per-cell value+tier, glows `newCoins`,
and white-highlights `modifier.target` — **the backend decided the random target**,
the frontend only animates it.

### 9.3 The two-request flow (and the real lesson)

The base spin that triggers the bonus returns `features.triggerFreeSpin=true`,
`finished:false`, `choices:[1]`, and the seeded golden-coin count in
`meta.private.seedGoldenCoins`. The tester's choice loop fires a second `/play`
with `choice:1`, and `spinService.js` echoes the prior response's `meta.private`
back on that request. The backend reads `meta.private.seedGoldenCoins` to seed the
Free Game; `summary` accumulates base + bonus across the two responses.

**Lesson:** custom round-state lives in `meta.private` and rides the round-state
carry between requests — do **not** widen `PlayRequestSchema` per game. And keep
all *render* data public in `features` (the frontend never reads `meta.private`).

### 9.4 Quirks Olympus forced us to learn

- Base `final` is **4 cells** (3 main + modifier); bonus `final` is **20**. Branch
  on length.
- Coin **values** are not in `final` (that's ordinals only) → they're in
  `features.coins`. Don't try to read values off the grid array.
- Phase type is `'regular'` for base (not `'baseSpin'`), so `hasBaseSpin` stays
  false — cosmetic only.
- Column-major flatten (`idx = col*rows + row`) — the custom board mirrors it.

---

## 10. Step-by-step checklist for a new game

1. `cp src/games/magic-g.js src/games/<id>.js` (or start from `olympus.jsx` for a
   custom board).
2. Set `id`, `name`, `gameCode`, `symbols`/`emojis`/`colors`, `grid`,
   `emptySymbolId`, `scatterSymbolId`, `wildSymbolId`.
3. Set `defaultRequestBody` (match the backend's expected request — `cashBet` is a
   **string**, `stakes:[{type}]`, `rtpOption`).
4. Decide rendering: default grid (set `grid`) vs custom `GameBoard`.
5. Decide win model: default `field.coins` vs `hooks.computeFieldWin`.
6. Multi-stage? Use `finished:false` + `choices` (+ `actions` for interactive
   labels); carry round-state in `meta.private` (the prior response's `meta.private`
   is echoed back on the next request — see §9.3). Olympus does this.
7. Make sure **everything the UI must RENDER is public** (`features`/`payouts`/
   `meta.public`); `meta.private` is backend round-state only, never read by the UI.
8. `bun run build` (catches plugin/import errors). `bun run dev`, point the
   Settings `apiUrl` at a backend running your game, and spin.

---

## 11. Flow cheat-sheet

| Flow | What it looks like | What you do |
|---|---|---|
| **Common** (cluster/tumble) | One phase, fixed grid, `field.coins` = win, `summary` = total. | Data-only config + `grid`. Maybe `computeFieldWin` for a multiplier. |
| **Weird** (multi-board / line / dynamic) | Different `final` lengths or boards per phase; extra state (lives, coins, targets). | Custom `GameBoard` (branch on shape) + put state in `features`. Olympus. |
| **Tweak** (win/highlight differs) | Win isn't raw `field.coins`; golden cells; custom positions. | `hooks.computeFieldWin`, `hooks.goldenEnabled`, payouts `positions`. |
| **Multi-stage** | Bonus/freespin continuation. | `finished:false` + `choices` (+ `actions`); round-state via `meta.private` echoed on the next request. Olympus. |

---

## 12. SolidJS gotchas (from HANDOVER.md — still true)

- Stores (`globalHistory`, `activeFilters`) are accessed without `()`; signals
  (`game`, `currentSortedList`) need `()`.
- Import every primitive you use (`createMemo`, `Show`, `For`, `Index`, …) — a
  missing import is a silent runtime crash.
- `<For>` callback's index is a signal: `idx()`.
- Custom components are SolidJS, not React — no hooks, use `createMemo`.

---

## 13. Lint / build notes

- `*.jsx` plugins are **excluded** from `lint:code`/`prettier` globs (they lint
  `*.{js,ts}`). `type:check` (`tsc --noEmit`) currently can't run (no tsconfig).
  **`bun run build` (vite) is the real validity gate** — run it.
- The vite backend-extractor reads the slot-game-server repo for some configs; a
  self-contained plugin (hardcoded symbol maps, like Olympus) doesn't depend on it.

# Product Requirements Document: GameSimulator (React Rebuild)
**Target Developer:** Antigravity (Lead Frontend Engineer)
**Objective:** Rebuild the Vanilla JS monolithic simulator (`main.js`, `db.js`, `index.html`) into a modular, framework-driven React application using an "OS + Plugin" architecture. Ensure 100% UI, rendering, and data parsing parity with the legacy Vanilla JS system.

---

## 1. Executive Summary & Holistic View
The current application (`main.js`) is an anti-pattern. It tightly couples playback interval logic, DOM manipulation (`document.createElement`), and game-specific math parsing (e.g., hardcoded `goldenSet` checks and `winningGoldenTallies`) into a single file. 

To support dynamic games (Megaways, multi-layer grids, hold-and-grow), we are migrating to an **Inversion of Control (IoC) architecture**. 
* **The Core OS (React + Zustand):** Manages the layout shells (Sidebar, Main Stage), the play/pause `setInterval`, global IndexedDB state, and API routing. **The Core never renders a grid cell or calculates a game win.**
* **The Game Plugins:** React components and pure TS functions that receive raw JSON from the Core and return the game-specific UI and parsed stats.

---

## 2. Nitty-Gritty Details: Rebuilding the Core OS

### 2.1 State Management (Replacing `window.spinHistory` & globals)
Antigravity must use **Zustand** to replace the scattered global variables in `main.js`. 
* **State Tree:**
  * `spins`: Array of all processed spins (replaces `window.spinHistory`).
  * `currentSpinId`: Points to the active spin.
  * `currentFrameIndex`: Replaces `currentTumbleIndex`. Increments from `0` to `total_tumbles`.
  * `playbackSpeed`: Determines interval length (replaces `playbackSpeeds[currentSpeedIndex]`).
  * `isPlaying`: Boolean to manage the playback loop.

### 2.2 Storage Pipeline (Replacing `db.js`)
The current `db.js` uses raw IndexedDB. Antigravity must wrap this in `localforage` for Promise-based async reads/writes.
* **Gotcha:** `main.js` currently loops and saves spins sequentially. In React, writing 10,000 auto-spins will freeze the main thread.
* **Solution:** Implement chunked batch saving. Accumulate 500 spins in Zustand memory, dump to `localforage`, and yield to the browser paint cycle using `setTimeout(..., 0)`.

### 2.3 Search & Filters (Replacing `filters.js`)
Currently, `filters.js` uses strict value checking (`item.tumbleCount >= filters.minTumbleCount`). 
* **Requirement:** Integrate **Fuse.js**. 
* The Core OS maps over the `spins` array, extracts `pluginTags` (provided by the game plugin), and passes the flattened list to Fuse.js for powerful fuzzy searching (e.g., typing "15x multiplier gold" into a single search bar).

---

## 3. Nitty-Gritty Details: The Plugin Extraction (Sexy Fruits)

Antigravity must rip all Sexy Fruits logic out of `main.js` and move it to `plugins/sexy-fruits/`.

### 3.1 Data Parsing Parity (`parseCustomStats`)
In `main.js`, the `getSpinStats()` function is massive. It manually calculates `cascadeCount`, `winningGoldenTallies`, and `maxMultiplier`.
* **Action:** Move this exact math into the plugin's `parseCustomStats` hook.
* **Input:** Raw RGS JSON from `sexy_fruits_play_response_examples.md`.
* **Output:** A clean metadata object that the Core OS attaches to the spin history card.

### 3.2 UI Rendering Parity (`GameBoard`)
In `main.js`, `createGrid()` and `renderGrid()` manually build divs, check `initial_golden_indices`, and append CSS classes like `.golden-border` and `.wild-overlay`.
* **Action:** Rebuild this as a React `<GameBoard frameData={...} />` component.
* **Requirement:** Use CSS Modules (`sexy-fruits.module.css`). Port the exact CSS values from `index.css` to guarantee 100% visual parity. 

### 3.3 Audit Trail Parity (`AuditTrail`)
`main.js` dynamically generates HTML strings for `tumblesHtml`.
* **Action:** Rebuild as a declarative React `<AuditTrail frameData={...} />` component that maps over the tumbles and returns JSX.

---

## 4. Testing Strategy: Guaranteeing Layout & Logic Parity

To ensure the new React app works exactly like the Vanilla JS app, Antigravity must implement the following CI/CD testing pipeline:

### 4.1 Unit Testing (Vitest) - Data Parity
* Take 5 raw RGS JSON responses from `sexy_fruits_play_response_examples.md`.
* Feed them into the old `main.js` `getSpinStats()` function and log the output.
* Feed the same JSON into the new `SexyFruitsPlugin.parseCustomStats()`.
* **Assert:** `expect(newOutput).toEqual(oldOutput)`. This guarantees no math or parsing logic was lost in translation.

### 4.2 Visual Regression Testing (Playwright) - Layout Parity
Because this is a "life or death" parity requirement, DOM snapshots are not enough. We need pixel-perfect visual comparisons.
* **Setup:** Boot both the Vanilla JS app and the React app in Playwright.
* **Execution:** Inject a static JSON payload into both apps. Fast-forward to `Frame 3`. 
* **Assert:** Take a screenshot of the `.grid-container` in both apps. Run Playwright's `expect(page).toHaveScreenshot()` with a `maxDiffPixels` threshold of 0.

### 4.3 Integration Testing (RTL) - Playback Parity
* Render the React OS. Mock the `setInterval` timer.
* Click "Play". 
* **Assert:** Ensure Zustand's `currentFrameIndex` correctly increments at the exact millisecond intervals dictated by `playbackSpeed`, and that the `<GameBoard />` receives the updated props.

---

## 5. Architectural Gotchas & Risks

* **Gotcha 1: React Reconciliation Stutter.** If the timeline scrubs rapidly, re-rendering 25 grid cells every 50ms will cause lag. Antigravity must use `React.memo` on the individual `<GridCell />` components inside the plugin, ensuring they only re-render if their specific `id` or `isGolden` prop changes.
* **Gotcha 2: The Timeline Taxonomy.** The Vanilla JS hardcodes "Tumble" and "Cascade". Megaways or Respin games will break this UI. The Core OS must strictly call `activePlugin.getStepLabel(frame)` to populate header text.
* **Gotcha 3: Z-Index Collisions.** Moving from manual DOM to React components can mess up stacking contexts. The Core OS must enforce a strict `z-index` manifest (Grid: 10, Overlays: 20, Sidebar/Nav: 9000) to ensure dropdowns and wild overlays don't clip.
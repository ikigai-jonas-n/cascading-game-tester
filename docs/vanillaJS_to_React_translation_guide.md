# Product Requirements Document: GameSimulator (React Rebuild)
**Target Developer:** Antigravity (Lead Frontend Engineer)
**Objective:** Rebuild the Vanilla JS monolithic simulator (`main.js`, `db.js`, `index.html`) into a modular, framework-driven React application using an "OS + Plugin" architecture. Ensure 100% UI, rendering, and data parsing parity with the legacy Vanilla JS system while enabling infinite scalability for future games.

---

## 1. Executive Summary & Architectural Vision
The current application is a monolith anti-pattern. Playback intervals, DOM manipulation, and game-specific math (Sexy Fruits `goldenSet` logic) are all tightly coupled. 

To support dynamic games (Megaways, multi-layer grids, hold-and-grow), we must migrate to an **Inversion of Control (IoC) architecture**.
* **The Core OS (React + Zustand):** Manages the layout shells, the `setInterval` playback engine, global storage, and fuzzy searching. **The Core never renders a grid cell or calculates a game win.**
* **The Game Plugins:** Independent modules that receive raw JSON from the Core OS and return game-specific React UI components and parsed metadata.

---

## 2. The Translation Guide: Immediate Marching Orders
Antigravity, use this mapping to gut the legacy codebase file-by-file:

* **Delete `filters.js`:** The rigid array `.filter()` loops are dead. They are replaced by the **Fuse.js Search Index**, mapping over dynamic `pluginTags`.
* **Gut `db.js`:** The manual `onsuccess`/`onerror` IndexedDB callbacks are dead. Replace with **LocalForage**, wired directly into the Zustand Global History store for async, chunked batch saving.
* **Dissect `main.js` line by line:**
  * Extract the massive `getSpinStats()` function, pull it out entirely, and drop it into the Sexy Fruits plugin as the `parseCustomStats` hook.
  * Extract `renderGrid()` and `createGrid()` (along with the `.classList.add('golden-border')` manual DOM logic), and rewrite it as the declarative `ui.GameBoard` React component inside the plugin.
  * Extract the HTML string concatenation for the JSON audit trail, and rewrite it as the declarative `ui.AuditTrail` React component.
* **Clean up `index.html`:** Stop hardcoding game-specific DOM elements. Build generic React Layout Shells (Stage, Sidebar, Audit Drawer) that act as empty vessels for plugin component injection.

---

## 3. Core OS Specifications

### 3.1 State Management (Zustand)
Replace all global variables (`window.spinHistory`, `currentTumbleIndex`) with a centralized Zustand store.
* `spins`: Array of all processed spins.
* `currentSpinId`: Points to the active spin.
* `currentFrameIndex`: Replaces `currentTumbleIndex`. Increments based on `playbackSpeed`.

### 3.2 Storage Pipeline & Performance Budget
* **Chunked Writes:** Auto-play can generate 10,000+ spins. Zustand must accumulate spins in memory and flush to LocalForage in batches of 500, using `setTimeout` to yield to the browser paint cycle.
* **Virtualization (NEW):** The Spin History Sidebar cannot render 10,000 DOM nodes. Antigravity must implement `react-virtuoso` or `react-window` so only the visible ~15 cards are rendered in the DOM at any given time.

### 3.3 Deep Linking & QA Sharing (NEW)
* If QA finds a bug, they need to share it. The Core OS must read URL parameters on boot (e.g., `?plugin=sexy-fruits&spinId=1042`). The OS will automatically load the correct plugin, fetch the spin from DB/Network, and mount the UI.

### 3.4 UI Layout Shells (Injection Slots)
* **Sidebar Shell:** Renders generic headers. Actively injects `<activePlugin.ui.HistoryCardMeta />` into the card footers. Injects `<activePlugin.ui.ExtraSidePanel />` below the history list if it exists.
* **Main Stage Shell:** A `position: relative` container. Delegates base rendering to `<activePlugin.ui.GameBoard />`. If `<activePlugin.ui.CustomHUD />` exists, renders it as a `z-index: 100` absolute overlay.
* **Audit Drawer Shell:** Provides a dedicated slot for `<activePlugin.ui.AuditTrail />`.

---

## 4. The Local Simulator Engine (Mocking)
To unblock frontend from backend RGS deployment schedules, plugins may include an `IGameSimulator`.
* **Execution:** When "Mock Mode" is toggled in the UI, the Core OS bypasses the network and calls `activePlugin.simulator.simulateSpin(betAmount)`.
* **Requirements:** The loop must run local cluster/payline logic and return a JSON payload perfectly mirroring the real RGS schema. It must use a seeded RNG (e.g., `seedrandom`) so mock spins are deterministic and shareable.

---

## 5. Testing Strategy: Guaranteeing Parity

### 5.1 Unit Testing (Vitest) - Data Parity
* Feed 5 raw RGS JSON payloads into the legacy `main.js` `getSpinStats()` function and log the output.
* Feed the same JSON into the new `SexyFruitsPlugin.parseCustomStats()`.
* Assert: `expect(newOutput).toEqual(oldOutput)`.

### 5.2 Visual Regression (Playwright) - Layout Parity
* Boot both the Vanilla JS app and the React app. Inject identical static JSON.
* Fast-forward to a specific frame (e.g., Frame 3).
* Assert: `expect(page).toHaveScreenshot()` targeting the grid container, with `maxDiffPixels: 0`.

### 5.3 Integration Testing (RTL) - Playback Parity
* Mock the Zustand `setInterval` timer. Click Play.
* Assert: Ensure `currentFrameIndex` increments at exact millisecond intervals, and that `<GameBoard />` receives the correct updated props.

---

## 6. Architectural Gotchas & Safety Nets

* **Gotcha 1: React Reconciliation Stutter.** Rapid scrubbing will cause lag if 40+ Megaways cells re-render. Antigravity must use `React.memo` on individual `<GridCell />` components inside the plugin.
* **Gotcha 2: OS Crashing (NEW).** A game plugin might throw a JS error (e.g., trying to read an undefined symbol). Antigravity must wrap every plugin UI injection slot (GameBoard, CustomHUD, CardMeta) in a **React Error Boundary**. If a plugin crashes, the OS stays alive and displays a generic "Plugin Error" fallback.
* **Gotcha 3: The Timeline Taxonomy.** The Core OS must never hardcode "Tumble" or "Cascade". It must strictly call `activePlugin.getStepLabel(frame)` to populate header text.
* **Gotcha 4: Global CSS Bleed.** Plugins are strictly forbidden from using global CSS. All game styles must use CSS Modules (`styles.module.css`) to prevent *Sexy Fruits* animations from bleeding into *Captain Jack*.
* **Gotcha 5: Z-Index Collisions.** The Core OS enforces a strict z-index manifest: Game Boards (0-100), Plugin HUDs (101-200), Core OS Modals/Nav (9000+).
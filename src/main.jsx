import { render } from 'solid-js/web';
import App from './components/App.jsx';
import { boot } from './services/gameService.js';
import { loadCheatTemplates } from './components/features/cheatTemplateStore.js';

const root = document.getElementById('root');
render(() => <App />, root);

// Boot in parallel — both are independent
Promise.all([boot(), loadCheatTemplates()]).catch((err) => console.error('Boot failed:', err));

if (import.meta.env.DEV) {
  // Dev-only E2E test hook — exposes the app's REAL module singletons (the
  // same db.js Worker/OPFS connection the app itself uses) so Playwright
  // tests drive the actual running state. Importing db.js separately from a
  // test's own dynamic import() would create a second independent module
  // graph — a second Worker trying to open the same SAH-pool file, which
  // collides with the real one's exclusive access handle. Stripped entirely
  // from production builds (import.meta.env.DEV is statically false there).
  Promise.all([
    import('./db.js'),
    import('./store/historyStore.js'),
    import('./services/gameService.js'),
    import('./store/gameStore.js'),
  ])
    .then(([db, historyStore, gameService, gameStore]) => {
      window.__e2e = { ...db, ...historyStore, ...gameService, ...gameStore };
    })
    .catch((err) => console.error('E2E hook setup failed:', err));
}

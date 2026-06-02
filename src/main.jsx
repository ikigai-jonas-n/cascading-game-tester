import { render } from 'solid-js/web';
import App from './components/App.jsx';
import { boot } from './services/gameService.js';
import { loadCheatTemplates } from './components/features/cheatTemplateStore.js';

const root = document.getElementById('root');
render(() => <App />, root);

// Boot in parallel — both are independent
Promise.all([
  boot(),
  loadCheatTemplates(),
]).catch((err) => console.error('Boot failed:', err));

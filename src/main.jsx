import { render } from 'solid-js/web';
import App from './components/App.jsx';
import { boot } from './services/gameService.js';

const root = document.getElementById('root');
render(() => <App />, root);

boot().catch((err) => console.error('Boot failed:', err));

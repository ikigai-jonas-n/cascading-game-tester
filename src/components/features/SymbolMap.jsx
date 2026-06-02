import { Show } from 'solid-js';
import { game, symbols, emojis, symbolColors } from '../../store/gameStore.js';
import { showSymbolMap, setShowSymbolMap } from '../../store/uiStore.js';

export default function SymbolMap() {
  return (
    <div style="padding:12px 16px; border-top:1px solid var(--border-color);">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:9px; color:var(--text-muted); font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">
          <input
            type="checkbox"
            id="showSymbolMap"
            checked={showSymbolMap()}
            onChange={(e) => {
              setShowSymbolMap(e.target.checked);
              localStorage.setItem('show_symbol_map', e.target.checked);
            }}
          />
          Symbol Map
        </label>
      </div>

      <Show when={showSymbolMap()}>
        <div id="symbolMapOverlay" style="font-size:10px; font-family:monospace;">
          {Object.entries(game().symbols || {}).map(([id, name]) => {
            const emoji = (game().emojis || {})[id] || '';
            const color = (game().colors || {})[id] || '#666';
            return (
              <div style="display:flex; align-items:center; gap:6px; padding:2px 0;">
                <span style="color:#555; min-width:18px;">{id}</span>
                <span style="color:#444;">→</span>
                <span style={`color:${color}; font-weight:600;`}>{name}</span>
                <span>{emoji}</span>
              </div>
            );
          })}
        </div>
      </Show>
    </div>
  );
}

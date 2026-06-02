import { createSignal } from 'solid-js';
import RawDrawer from '../features/RawDrawer.jsx';
import SymbolMap from '../features/SymbolMap.jsx';

export default function RightPanel() {
  let col3Ref;
  const [col3Width, setCol3Width] = createSignal(localStorage.getItem('col3_width') || '420px');

  function startResize(e) {
    const startX = e.clientX;
    const startWidth = col3Ref.offsetWidth;
    const onMove = (moveE) => {
      const newWidth = Math.max(200, startWidth + (startX - moveE.clientX));
      setCol3Width(newWidth + 'px');
      localStorage.setItem('col3_width', newWidth + 'px');
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <aside
      id="col3"
      ref={col3Ref}
      aria-label="JSON Audit"
      style={`width: ${col3Width()}; min-width: 200px; display: flex; flex-direction: column; overflow: hidden;`}
    >
      <div class="resizer" data-target="col3" onMouseDown={startResize} />

      <div style="padding: 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-color);">
        <span style="font-size:12px;">📋</span>
        <span style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:var(--text-primary);">JSON AUDIT</span>
      </div>

      <RawDrawer />
      <SymbolMap />
    </aside>
  );
}

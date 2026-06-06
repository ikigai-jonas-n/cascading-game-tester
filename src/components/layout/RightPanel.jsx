import { createSignal } from 'solid-js';
import RawDrawer from '../features/RawDrawer.jsx';
import SymbolMap from '../features/SymbolMap.jsx';
import { rightPanelFontSize, setRightPanelFontSize, rightCollapsed, setRightCollapsed } from '../../store/uiStore.js';

export default function RightPanel() {
  let col3Ref;
  const [col3Width, setCol3Width] = createSignal(localStorage.getItem('col3_width') || '420px');

  function startResize(e) {
    e.preventDefault(); // FIX: Prevent text selection highlighting
    const startX = e.clientX;
    const startWidth = col3Ref.offsetWidth;
    col3Ref.style.transition = 'none'; // FIX: Prevent lag

    const onMove = (moveE) => {
      const newWidth = Math.max(200, startWidth + (startX - moveE.clientX));
      setCol3Width(newWidth + 'px');
    };
    const onUp = () => {
      col3Ref.style.transition = '';
      localStorage.setItem('col3_width', col3Width());
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const toggleCollapse = () => {
    const next = !rightCollapsed();
    setRightCollapsed(next);
    localStorage.setItem('right_panel_collapsed', next);
  };

  return (
    <aside
      id="col3"
      ref={col3Ref}
      aria-label="JSON Audit"
      style={`
        width: ${rightCollapsed() ? '0px' : col3Width()};
        min-width: 0;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        overflow: visible;
        position: relative;
        transition: width 0.22s cubic-bezier(0.4,0,0.2,1);
        border-left: ${rightCollapsed() ? 'none' : '1px solid var(--border-color)'};
        z-index: 10;
      `}
    >
      <div style={`display: flex; flex-direction: column; width: ${col3Width()}; height: 100%; overflow: hidden; opacity: ${rightCollapsed() ? 0 : 1}; transition: opacity 0.1s;`}>
        <div class="resizer" data-target="col3" onMouseDown={startResize} style={`display: ${rightCollapsed() ? 'none' : 'block'};`} />

      <div style="padding: 16px; display:flex; align-items:center; gap:8px; border-bottom:1px solid var(--border-color);">
        <span style="font-size:12px;">📋</span>
        <span style="font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:1px; color:var(--text-primary);">
          JSON AUDIT
        </span>
        <div style="margin-left: auto; display:flex; align-items:center; gap:6px; font-size:10px; color:var(--text-muted);">
          <span>A-</span>
          <input
            type="range"
            min="10"
            max="24"
            value={rightPanelFontSize()}
            onInput={(e) => {
              const val = parseInt(e.target.value, 10);
              setRightPanelFontSize(val);
              localStorage.setItem('right_panel_font_size', val);
            }}
            style="width: 60px; height: 4px;"
          />
          <span>A+</span>
        </div>
      </div>

      <RawDrawer />
      <SymbolMap />
      </div>

      {/* Collapse toggle tab — sticks out on the LEFT edge */}
      <button
        aria-label={rightCollapsed() ? 'Expand right panel' : 'Collapse right panel'}
        title={rightCollapsed() ? 'Expand panel (JSON Audit)' : 'Collapse panel'}
        onClick={toggleCollapse}
        style={`
          position: absolute;
          top: 50%;
          left: ${rightCollapsed() ? '-28px' : '-14px'};
          transform: translateY(-50%);
          z-index: 20;
          width: 28px;
          height: 56px;
          background: var(--bg-sidebar);
          border: 1px solid var(--border-color);
          border-right: ${rightCollapsed() ? '1px solid var(--border-color)' : 'none'};
          border-radius: ${rightCollapsed() ? '8px 0 0 8px' : '8px 0 0 8px'};
          color: var(--text-muted);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          transition: background 0.15s, color 0.15s, left 0.22s cubic-bezier(0.4,0,0.2,1);
          padding: 0;
          line-height: 1;
        `}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)'; e.currentTarget.style.color = 'var(--bg-accent)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-sidebar)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
      >
        {rightCollapsed() ? '‹' : '›'}
      </button>
    </aside>
  );
}
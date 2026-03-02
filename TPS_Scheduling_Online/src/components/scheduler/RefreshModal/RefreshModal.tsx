import './RefreshModal.css';

interface RefreshModalProps {
  onClose: () => void;
  onRefresh: (mode: 'quick' | 'full') => void;
}

export function RefreshModal({ onClose, onRefresh }: RefreshModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h2 className="refresh-modal-title">Refresh from Whiteboard 2.0</h2>
        <p className="refresh-modal-desc">
          This will discard all local changes and pull fresh data.
        </p>
        <div className="refresh-modal-options">
          <button
            onClick={() => { onClose(); onRefresh('quick'); }}
            className="refresh-option refresh-option-quick"
          >
            <div className="refresh-option-title quick">Quick Refresh</div>
            <div className="refresh-option-desc">
              Pulls latest cached data from the server. Fast (~10 seconds).
              Use this for routine refreshes during the day.
            </div>
          </button>
          <button
            onClick={() => { onClose(); onRefresh('full'); }}
            className="refresh-option refresh-option-full"
          >
            <div className="refresh-option-title full">Full Refresh</div>
            <div className="refresh-option-desc">
              Forces Google Apps Script to re-pull all data from Whiteboard 2.0.
              Slower (~1 minute). Use when data seems stale or after schedule changes in Whiteboard.
            </div>
          </button>
        </div>
        <button onClick={onClose} className="refresh-cancel">Cancel</button>
      </div>
    </div>
  );
}

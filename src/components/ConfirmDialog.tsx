type Props = {
  open: boolean;
  icon?: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ConfirmDialog({
  open, icon = '⚠️', title, message,
  confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, onConfirm, onCancel
}: Props) {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(15,20,35,0.55)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn .15s ease'
      }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: 'var(--white)',
        borderRadius: '20px',
        padding: '36px 32px 28px',
        maxWidth: '400px', width: '100%',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
        textAlign: 'center',
        animation: 'scaleIn .18s cubic-bezier(.34,1.56,.64,1)'
      }}>
        {/* Icon bubble */}
        <div style={{
          width: '64px', height: '64px', borderRadius: '50%',
          background: danger ? 'var(--red-pale)' : 'var(--teal-pale)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '28px', margin: '0 auto 20px'
        }}>
          {icon}
        </div>

        <div style={{
          fontFamily: '"Playfair Display", serif',
          fontSize: '19px', fontWeight: 700,
          color: 'var(--dark)', marginBottom: '10px'
        }}>
          {title}
        </div>

        <div style={{
          fontSize: '13.5px', color: 'var(--muted2)',
          lineHeight: 1.6, marginBottom: '28px'
        }}>
          {message}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '11px', borderRadius: '10px',
              border: '1.5px solid var(--border)',
              background: 'var(--bg)', color: 'var(--dark2)',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600, fontSize: '13.5px', cursor: 'pointer',
              transition: 'all .15s'
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'var(--bg)')}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: '11px', borderRadius: '10px',
              border: 'none',
              background: danger ? 'var(--red)' : 'var(--teal)',
              color: '#fff',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: 600, fontSize: '13.5px', cursor: 'pointer',
              transition: 'all .15s',
              boxShadow: danger ? '0 4px 14px rgba(239,68,68,.3)' : '0 4px 14px rgba(13,115,119,.3)'
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

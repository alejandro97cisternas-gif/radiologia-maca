import novexLogo from '/logonovex_t.png'

export default function NovexBadge({ style }: { style?: React.CSSProperties }) {
  return (
    <div style={{
      height: 36,
      padding: '0 24px',
      background: '#fff',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flexShrink: 0,
      ...style,
    }}>
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9CA3AF', fontWeight: 500 }}>Crafted by</span>
      <img src={novexLogo} alt="Novex" style={{ height: 16, width: 'auto' }} />
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#9CA3AF', fontWeight: 700 }}>Novex</span>
    </div>
  )
}

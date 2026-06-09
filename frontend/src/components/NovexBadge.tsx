import novexLogo from '/logonovex_t.png'

export default function NovexBadge({ style, dark = false }: { style?: React.CSSProperties; dark?: boolean }) {
  const textColor = dark ? 'rgba(255,255,255,0.4)' : '#9CA3AF'
  const border = dark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      padding: '12px 8px',
      borderTop: `1px solid ${border}`,
      ...style,
    }}>
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: textColor, fontWeight: 500 }}>Crafted by</span>
      <img src={novexLogo} alt="Novex" style={{ height: 16, width: 'auto', opacity: dark ? 0.4 : 1 }} />
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: textColor, fontWeight: 700 }}>Novex</span>
    </div>
  )
}

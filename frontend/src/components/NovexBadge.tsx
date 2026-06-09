export default function NovexBadge({ style, dark = false }: { style?: React.CSSProperties; dark?: boolean }) {
  const base = dark
    ? { color: 'rgba(255,255,255,0.45)', strong: 'rgba(255,255,255,0.7)' }
    : { color: '#cbd5e1', strong: '#94a3b8' }
  return (
    <div style={{
      textAlign: 'center',
      padding: '12px 8px',
      fontSize: 11,
      color: base.color,
      letterSpacing: '0.03em',
      ...style,
    }}>
      crafted by{' '}
      <span style={{ fontWeight: 700, color: base.strong }}>novex</span>
    </div>
  )
}

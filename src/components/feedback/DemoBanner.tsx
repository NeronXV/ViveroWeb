export function DemoBanner({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'demo-banner compact' : 'demo-banner'} role="note"><strong>Entorno de demostración</strong><span> Sin autenticación, pagos ni datos reales.</span></div>
}

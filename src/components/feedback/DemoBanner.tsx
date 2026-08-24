export function DemoBanner({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'demo-banner compact' : 'demo-banner'} role="note"><strong>Datos demostrativos</strong><span> La autorización es real; ventas, pagos y contenido operativo permanecen locales y de demostración.</span></div>
}

export function DemoBanner({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? 'demo-banner compact' : 'demo-banner'} role="note"><strong>Ruta demostrativa sin protección</strong><span> Caja y Administración aún no usan autorización, pagos ni datos reales.</span></div>
}

import { useMemo, useState, type FormEvent } from 'react'
import { useAdminPromotions } from './useAdminPromotions'
import { useAdminCatalog } from './useAdminCatalog'
import type { AdminPromotion, PromotionScope, PromotionType } from './admin-promotions-types'
import { pesosToCents, centsToPesos } from './admin-catalog-parser'

export function AdminPromotions({ active }: { active: boolean }) {
  const promoState = useAdminPromotions(active)
  const catalog = useAdminCatalog(active)

  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingPromo, setEditingPromo] = useState<AdminPromotion | null>(null)

  // Form State
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<PromotionScope>('ALL_PRODUCTS')
  const [promoType, setPromoType] = useState<PromotionType>('PERCENTAGE')
  const [valueStr, setValueStr] = useState('15')
  const [minPurchaseStr, setMinPurchaseStr] = useState('')
  const [maxDiscountStr, setMaxDiscountStr] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Filtrado de promociones
  const filteredPromotions = useMemo(() => {
    return promoState.promotions.filter((p) => {
      if (filterStatus === 'active') return p.isActive
      if (filterStatus === 'inactive') return !p.isActive
      return true
    })
  }, [promoState.promotions, filterStatus])

  if (!active) return null

  const handleOpenCreate = () => {
    setEditingPromo(null)
    setName('')
    setDescription('')
    setScope('ALL_PRODUCTS')
    setPromoType('PERCENTAGE')
    setValueStr('15')
    setMinPurchaseStr('')
    setMaxDiscountStr('')
    setStartsAt('')
    setEndsAt('')
    setIsActive(true)
    setSelectedProductIds([])
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (promo: AdminPromotion) => {
    setEditingPromo(promo)
    setName(promo.name)
    setDescription(promo.description || '')
    setScope(promo.scope)
    setPromoType(promo.promoType)
    setValueStr(
      promo.promoType === 'PERCENTAGE'
        ? String(promo.value)
        : centsToPesos(promo.value)
    )
    setMinPurchaseStr(promo.minPurchaseCents !== null ? centsToPesos(promo.minPurchaseCents) : '')
    setMaxDiscountStr(promo.maxDiscountCents !== null ? centsToPesos(promo.maxDiscountCents) : '')
    setStartsAt(promo.startsAt ? promo.startsAt.slice(0, 16) : '')
    setEndsAt(promo.endsAt ? promo.endsAt.slice(0, 16) : '')
    setIsActive(promo.isActive)
    setSelectedProductIds(promo.productIds)
    setFormError(null)
    setIsModalOpen(true)
  }

  const toggleProductSelection = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId)
        ? prev.filter((id) => id !== productId)
        : [...prev, productId]
    )
  }

  const handleSelectAllProducts = () => {
    setSelectedProductIds(catalog.products.map((p) => p.id))
  }

  const handleClearProducts = () => {
    setSelectedProductIds([])
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!name.trim()) {
      setFormError('El nombre de la campaña es obligatorio.')
      return
    }

    let parsedValue = 0
    if (promoType === 'PERCENTAGE') {
      parsedValue = parseFloat(valueStr)
      if (isNaN(parsedValue) || parsedValue <= 0 || parsedValue > 90) {
        setFormError('El porcentaje de descuento debe ser un valor entre 1% y 90%.')
        return
      }
    } else {
      parsedValue = pesosToCents(valueStr)
      if (parsedValue <= 0) {
        setFormError('El importe de descuento fijo debe ser mayor a $0.00.')
        return
      }
    }

    if (scope === 'SELECTED_PRODUCTS' && selectedProductIds.length === 0) {
      setFormError('Debes seleccionar al menos un producto para el alcance "Productos Seleccionados".')
      return
    }

    const minPurchaseCents = minPurchaseStr.trim() !== '' ? pesosToCents(minPurchaseStr) : null
    const maxDiscountCents = maxDiscountStr.trim() !== '' ? pesosToCents(maxDiscountStr) : null

    try {
      await promoState.upsertPromotion({
        id: editingPromo?.id ?? null,
        name: name.trim(),
        description: description.trim() || null,
        scope,
        promoType,
        value: parsedValue,
        minPurchaseCents,
        maxDiscountCents,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        isActive,
        productIds: scope === 'ALL_PRODUCTS' ? [] : selectedProductIds,
      })

      setIsModalOpen(false)
      setNotice(`✅ Campaña "${name.trim()}" guardada exitosamente en Supabase.`)
      setTimeout(() => setNotice(null), 4000)
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar la campaña.')
    }
  }

  const handleToggleActiveQuick = async (promo: AdminPromotion) => {
    try {
      await promoState.upsertPromotion({
        id: promo.id,
        name: promo.name,
        description: promo.description,
        scope: promo.scope,
        promoType: promo.promoType,
        value: promo.value,
        minPurchaseCents: promo.minPurchaseCents,
        maxDiscountCents: promo.maxDiscountCents,
        startsAt: promo.startsAt,
        endsAt: promo.endsAt,
        isActive: !promo.isActive,
        productIds: promo.productIds,
      })
      setNotice(
        !promo.isActive
          ? `🟢 Campaña "${promo.name}" activada.`
          : `⚪ Campaña "${promo.name}" pausada.`
      )
      setTimeout(() => setNotice(null), 4000)
    } catch (err) {
      setNotice(`⚠️ Error: ${err instanceof Error ? err.message : 'No fue posible actualizar el estado.'}`)
    }
  }

  return (
    <section className="db-tab-content active" aria-labelledby="promotions-title">
      {/* Header */}
      <div className="section-header-row">
        <div>
          <h3 id="promotions-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🏷️</span> Campañas y Promociones de Catálogo
          </h3>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Gestiona descuentos automáticos en Supabase para productos individuales o todo el catálogo.
          </p>
        </div>
        <button
          type="button"
          className="catalog-action"
          onClick={handleOpenCreate}
        >
          + Nueva Campaña / Oferta
        </button>
      </div>

      {notice && (
        <div className="form-notice" role="status" style={{ marginTop: '1rem' }}>
          <span>{notice}</span>
          <button
            type="button"
            className="mini-action-btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => setNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* KPI Stats Bar */}
      <div className="stock-kpi-bar" style={{ marginTop: '1rem' }}>
        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}>
            🔥
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">
              {promoState.promotions.filter((p) => p.isActive).length}
            </span>
            <span className="stock-kpi-label">Campañas Activas</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
            🌐
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">
              {promoState.promotions.filter((p) => p.scope === 'ALL_PRODUCTS' && p.isActive).length}
            </span>
            <span className="stock-kpi-label">En Todo el Catálogo</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
            🎯
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">
              {promoState.promotions.filter((p) => p.scope === 'SELECTED_PRODUCTS' && p.isActive).length}
            </span>
            <span className="stock-kpi-label">Por Productos</span>
          </div>
        </div>

        <div className="stock-kpi-card">
          <div className="stock-kpi-icon" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6' }}>
            📦
          </div>
          <div className="stock-kpi-info">
            <span className="stock-kpi-value">{promoState.promotions.length}</span>
            <span className="stock-kpi-label">Total Registradas</span>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="stock-filter-toolbar" style={{ marginTop: '1rem' }}>
        <div className="stock-status-chips">
          <button
            type="button"
            className={`stock-filter-chip ${filterStatus === 'all' ? 'active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            Todas ({promoState.promotions.length})
          </button>
          <button
            type="button"
            className={`stock-filter-chip ${filterStatus === 'active' ? 'active' : ''}`}
            onClick={() => setFilterStatus('active')}
          >
            🟢 Activas ({promoState.promotions.filter((p) => p.isActive).length})
          </button>
          <button
            type="button"
            className={`stock-filter-chip ${filterStatus === 'inactive' ? 'active' : ''}`}
            onClick={() => setFilterStatus('inactive')}
          >
            ⚪ Inactivas ({promoState.promotions.filter((p) => !p.isActive).length})
          </button>
        </div>

        <button
          type="button"
          className="refresh-btn-secondary"
          onClick={promoState.refresh}
          disabled={promoState.status === 'loading'}
          style={{ marginLeft: 'auto' }}
        >
          {promoState.status === 'loading' ? 'Cargando...' : '↻ Actualizar'}
        </button>
      </div>

      {/* Loading & Error States */}
      {promoState.status === 'loading' && promoState.promotions.length === 0 && (
        <div className="cashier-status-container" role="status" style={{ marginTop: '2rem' }}>
          <div className="loading-spinner" />
          <p>Cargando promociones autoritativas de Supabase…</p>
        </div>
      )}

      {promoState.status === 'error' && (
        <div className="admin-dialog-error" role="alert" style={{ marginTop: '1rem' }}>
          <span>⚠️</span> {promoState.error}
          <button type="button" className="mini-action-btn" onClick={promoState.refresh} style={{ marginLeft: '1rem' }}>
            Reintentar
          </button>
        </div>
      )}

      {/* List / Cards of Promotions */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '1rem',
          marginTop: '1.25rem',
        }}
      >
        {filteredPromotions.map((promo) => (
          <div
            key={promo.id}
            className="botanical-section-card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              border: promo.isActive
                ? '2px solid rgba(239, 68, 68, 0.4)'
                : '1px solid var(--surface-border)',
              opacity: promo.isActive ? 1 : 0.75,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ margin: '0 0 0.25rem', fontSize: '1.1rem' }}>{promo.name}</h4>
                {promo.description && (
                  <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.4 }}>
                    {promo.description}
                  </p>
                )}
              </div>
              <span
                style={{
                  background: promo.isActive ? '#ef4444' : 'var(--surface-border)',
                  color: promo.isActive ? '#fff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '20px',
                  whiteSpace: 'nowrap',
                }}
              >
                {promo.promoType === 'PERCENTAGE' ? `🔥 ${promo.value}% OFF` : `💰 -$${centsToPesos(promo.value)} MXN`}
              </span>
            </div>

            {/* Info Badges */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <span
                style={{
                  background: 'var(--bg-color)',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--surface-border)',
                }}
              >
                {promo.scope === 'ALL_PRODUCTS' ? '🌐 Todo el Catálogo' : `🎯 ${promo.productIds.length} Productos Seleccionados`}
              </span>
              <span
                style={{
                  background: promo.isActive ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-color)',
                  color: promo.isActive ? '#10b981' : 'var(--text-secondary)',
                  padding: '0.25rem 0.6rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {promo.isActive ? '🟢 Activa' : '⚪ Pausada'}
              </span>
            </div>

            {/* Fechas de vigencia */}
            {(promo.startsAt || promo.endsAt) && (
              <div style={{ marginTop: '0.65rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span>📅 Vigencia: </span>
                {promo.startsAt ? new Date(promo.startsAt).toLocaleDateString() : 'Inicio inmediato'}
                {' → '}
                {promo.endsAt ? new Date(promo.endsAt).toLocaleDateString() : 'Sin fecha límite'}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '1rem',
                display: 'flex',
                gap: '0.5rem',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                className="mini-action-btn"
                onClick={() => handleToggleActiveQuick(promo)}
                disabled={promoState.isMutating}
              >
                {promo.isActive ? '⏸ Pausar' : '▶ Activar'}
              </button>
              <button
                type="button"
                className="mini-action-btn primary"
                onClick={() => handleOpenEdit(promo)}
                disabled={promoState.isMutating}
              >
                ✏️ Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {promoState.status === 'ready' && filteredPromotions.length === 0 && (
        <div className="promo-empty-card">
          <div className="promo-empty-icon">🏷️</div>
          <div style={{ maxWidth: '460px' }}>
            <h4 style={{ margin: '0 0 0.5rem', fontSize: '1.2rem' }}>
              {filterStatus === 'all' ? 'Aún no hay campañas de promoción' : 'No hay campañas con este filtro'}
            </h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.92rem', lineHeight: 1.5 }}>
              {filterStatus === 'all'
                ? 'Crea ofertas especiales para temporadas, días festivos o plantas seleccionadas. Los descuentos calculados por Supabase se reflejarán automáticamente en el catálogo público.'
                : 'Cambia el filtro seleccionado o crea una nueva campaña para este grupo.'}
            </p>
          </div>
          <button
            type="button"
            className="catalog-action"
            style={{ marginTop: '0.5rem' }}
            onClick={handleOpenCreate}
          >
            + Crear Primera Campaña
          </button>
        </div>
      )}

      {/* Modal: Crear / Editar Promoción */}
      {isModalOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="promo-modal-title">
          <div className="admin-modal-content" style={{ maxWidth: '640px' }}>
            <div className="admin-modal-header">
              <h3 id="promo-modal-title">
                {editingPromo ? `Editar Campaña: ${editingPromo.name}` : 'Nueva Campaña de Promoción'}
              </h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsModalOpen(false)}>
                &times;
              </button>
            </div>

            {formError && <div className="admin-dialog-error" role="alert">{formError}</div>}

            <form onSubmit={handleSubmit}>
              {/* Sección 1: Datos Generales */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>🏷️</span>
                  <h4>Datos de la Campaña</h4>
                </div>

                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-name">Nombre de la Campaña *</label>
                    <input
                      id="promo-name"
                      type="text"
                      required
                      placeholder="Ej. Oferta Primavera 2026"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      disabled={promoState.isMutating}
                    />
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-scope">Alcance de Productos *</label>
                    <select
                      id="promo-scope"
                      value={scope}
                      onChange={(e) => setScope(e.target.value as PromotionScope)}
                      disabled={promoState.isMutating}
                    >
                      <option value="ALL_PRODUCTS">🌐 Todo el Catálogo</option>
                      <option value="SELECTED_PRODUCTS">🎯 Productos Seleccionados</option>
                    </select>
                  </div>
                </div>

                <div className="admin-form-group form-group" style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="promo-desc">Descripción o Motivo (opcional)</label>
                  <input
                    id="promo-desc"
                    type="text"
                    placeholder="Ej. Descuento especial de temporada en plantas de interior"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={promoState.isMutating}
                  />
                </div>
              </div>

              {/* Selector de Productos (Si scope === SELECTED_PRODUCTS) */}
              {scope === 'SELECTED_PRODUCTS' && (
                <div className="botanical-section-card">
                  <div className="botanical-section-header">
                    <span>🌿</span>
                    <h4>Seleccionar Productos ({selectedProductIds.length} seleccionados)</h4>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <button type="button" className="mini-action-btn" onClick={handleSelectAllProducts}>
                      Seleccionar Todos ({catalog.products.length})
                    </button>
                    <button type="button" className="mini-action-btn" onClick={handleClearProducts}>
                      Limpiar Selección
                    </button>
                  </div>

                  <div
                    style={{
                      maxHeight: '200px',
                      overflowY: 'auto',
                      border: '1px solid var(--surface-border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.5rem',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: '0.4rem',
                      background: 'var(--bg-color)',
                    }}
                  >
                    {catalog.products.map((p) => {
                      const isSelected = selectedProductIds.includes(p.id)
                      return (
                        <label
                          key={p.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.4rem 0.6rem',
                            borderRadius: 'var(--radius-sm)',
                            background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-color)',
                            border: isSelected ? '1px solid #10b981' : '1px solid var(--surface-border)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleProductSelection(p.id)}
                            style={{ width: 'auto', margin: 0 }}
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.commonName}
                            </strong>
                            <small style={{ color: 'var(--text-secondary)' }}>
                              ${centsToPesos(p.priceCents)} • {p.internalCode}
                            </small>
                          </div>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Sección 2: Tipo de Descuento y Valor */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>💲</span>
                  <h4>Cálculo del Descuento</h4>
                </div>

                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-type">Tipo de Descuento *</label>
                    <select
                      id="promo-type"
                      value={promoType}
                      onChange={(e) => setPromoType(e.target.value as PromotionType)}
                      disabled={promoState.isMutating}
                    >
                      <option value="PERCENTAGE">Porcentaje (% OFF)</option>
                      <option value="FIXED_AMOUNT">Monto Fijo ($ MXN por unidad)</option>
                    </select>
                  </div>

                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-val">
                      {promoType === 'PERCENTAGE' ? 'Porcentaje de Descuento (%) *' : 'Monto de Descuento ($ MXN) *'}
                    </label>
                    <input
                      id="promo-val"
                      type="text"
                      required
                      placeholder={promoType === 'PERCENTAGE' ? 'Ej. 25' : 'Ej. 50.00'}
                      value={valueStr}
                      onChange={(e) => setValueStr(e.target.value)}
                      disabled={promoState.isMutating}
                    />
                  </div>
                </div>

                {promoType === 'PERCENTAGE' && (
                  <div className="botanical-chips-grid" style={{ marginTop: '0.5rem' }}>
                    {[5, 10, 15, 20, 25, 30, 40, 50].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        className={`botanical-chip ${valueStr === String(pct) ? 'active' : ''}`}
                        onClick={() => setValueStr(String(pct))}
                      >
                        {pct}% OFF
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Sección 3: Parámetros Opcionales y Fechas */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>⚙️</span>
                  <h4>Vigencia y Restricciones (Opcional)</h4>
                </div>

                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-starts">Fecha y Hora de Inicio</label>
                    <input
                      id="promo-starts"
                      type="datetime-local"
                      value={startsAt}
                      onChange={(e) => setStartsAt(e.target.value)}
                      disabled={promoState.isMutating}
                    />
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-ends">Fecha y Hora de Término</label>
                    <input
                      id="promo-ends"
                      type="datetime-local"
                      value={endsAt}
                      onChange={(e) => setEndsAt(e.target.value)}
                      disabled={promoState.isMutating}
                    />
                  </div>
                </div>

                <div className="form-row" style={{ marginTop: '0.75rem' }}>
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-min-purchase">Compra Mínima ($ MXN)</label>
                    <input
                      id="promo-min-purchase"
                      type="text"
                      placeholder="Opcional (Ej. 300.00)"
                      value={minPurchaseStr}
                      onChange={(e) => setMinPurchaseStr(e.target.value)}
                      disabled={promoState.isMutating}
                    />
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="promo-max-disc">Descuento Máximo ($ MXN)</label>
                    <input
                      id="promo-max-disc"
                      type="text"
                      placeholder="Opcional (Ej. 500.00)"
                      value={maxDiscountStr}
                      onChange={(e) => setMaxDiscountStr(e.target.value)}
                      disabled={promoState.isMutating}
                    />
                  </div>
                </div>

                <div className="admin-form-group form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                  <input
                    id="promo-active-cb"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={promoState.isMutating}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <label htmlFor="promo-active-cb" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Campaña activa para publicación y aplicación inmediata
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                  disabled={promoState.isMutating}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={promoState.isMutating}>
                  {promoState.isMutating ? 'Guardando Campaña…' : (editingPromo ? 'Actualizar Campaña' : 'Crear Campaña')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

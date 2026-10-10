import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AdminCategory, AdminProduct } from '../admin-catalog-types'
import type { AdminInventoryBalance, InventoryMovement } from '../admin-types'
import { catalogingBinary, catalogingError } from './cataloging-service'
import { fetchAdminInventoryBalances, fetchInventoryHistory } from '../admin-service'
import type { InventoryPermissions } from '../inventory-preparation-service'
import { InventoryCountReview } from '../InventoryCountReview'
import { ProductQrLabelDialog } from '../ProductQrLabelDialog'
import { isValidLabelInternalCode } from '../product-qr-label'
import { activatePlant, fetchEditablePlant, fetchPlantPreparation, patchPlant, preparationLabels, stateLabels, type PlantPreparation } from './plants-service'
import { draftFromPlant, plantPatch, preserveEditedDraft, type PlantDraft } from './plants-model'
import { PlantPhoto } from './PlantPhoto'

export function PlantDetail({ product, preparation, categories, balance, branchName, canPrice, permissions, guard, onSaved, onStockUpdated, onNext, onBack, onCount, onInventory, onReception }: {
  product: AdminProduct; preparation: PlantPreparation; categories: AdminCategory[]; balance?: AdminInventoryBalance; branchName: string
  canPrice: boolean; permissions: InventoryPermissions; guard: (dirty: boolean, busy?: boolean) => void
  onSaved: (product: AdminProduct, preparation: PlantPreparation) => void; onNext: () => void; onBack: () => void; onCount: () => void; onInventory?: () => void; onReception?: () => void
  onStockUpdated: (balance: AdminInventoryBalance) => void
}) {
  const [base, setBase] = useState(product), [draft, setDraft] = useState(() => draftFromPlant(product))
  const [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null), [showQr, setShowQr] = useState(false)
  const [confirmPrice, setConfirmPrice] = useState(false), [uncertain, setUncertain] = useState(false)
  const [stock, setStock] = useState(balance), [history, setHistory] = useState<InventoryMovement[] | null>(null)
  const [reviewRevision, setReviewRevision] = useState(0)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromPlant(base)) || !!file || confirmPrice
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false } }, [])
  useEffect(() => {
    let active = true
    fetchEditablePlant(product.id).then(p => { if (active) { setBase(p); setDraft(draftFromPlant(p)) } })
      .catch(e => { if (active) { setError(catalogingError(e)); setUncertain(true) } })
    return () => { active = false }
  }, [product.id])
  useEffect(() => { guard(dirty, busy) }, [dirty, busy, guard])
  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  const field = (key: keyof PlantDraft, value: string) => setDraft(d => ({ ...d, [key]: value }))
  const selectPhoto = (selected?: File) => {
    if (!selected) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 5 * 1024 * 1024 || !selected.size) {
      setPhotoError('Elige una fotografía JPEG, PNG o WEBP de hasta 5 MiB.'); return
    }
    setFile(selected); setPhotoError(null); setNotice('Fotografía lista para guardar.')
  }
  const refreshPreparation = async (saved: AdminProduct) => {
    const state = await fetchPlantPreparation(saved.id, preparation.branchId)
    if (live.current) onSaved(saved, state)
  }
  const savePhoto = async (): Promise<boolean> => {
    if (!file) return true
    setPhotoError(null)
    try {
      if (!base.editRevision) throw new Error('Consulta la ficha actual antes de guardar.')
      await catalogingBinary(`products/${product.id}/catalog-photo`,file,base.editRevision,true)
      const saved = await fetchEditablePlant(product.id)
      if (!live.current) return false
      setBase(saved); setFile(null); await refreshPreparation(saved)
      setNotice('Fotografía guardada.'); return true
    } catch { if (live.current) setPhotoError('No se confirmó la fotografía. Los demás datos se conservan. Revisa la foto guardada antes de reintentar.'); return false }
  }
  const photoOnly = async () => {
    if (busy || !file) return
    setBusy(true); guard(dirty, true)
    try { await savePhoto() } finally { if (live.current) setBusy(false) }
  }
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy || uncertain || !base.editRevision) return
    const following = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'next'
    setBusy(true); setError(null); setNotice(''); guard(dirty, true)
    let saved: AdminProduct
    let attempted = false
    try {
      const patch = plantPatch(base, draft, canPrice, confirmPrice)
      if (String(draft.common_name).trim().length < 2) throw new Error('Indica el nombre de la planta.')
      attempted = Object.keys(patch).length > 0
      saved = await patchPlant(product.id, patch, base.editRevision)
      if (!live.current) return
      setBase(saved); setDraft(draftFromPlant(saved)); setConfirmPrice(false)
      await refreshPreparation(saved)
    } catch (e) {
      if (live.current) { setError(catalogingError(e)); setUncertain(attempted) }
      setBusy(false); return
    }
    // Independent upload: a failure keeps the selected file, draft and current
    // plant available. Never advance to another plant with a pending photo.
    let photoSaved = true
    if (file) {
      setPhotoError(null)
      try {
        await catalogingBinary(`products/${saved.id}/catalog-photo`,file,saved.editRevision,true)
        saved = await fetchEditablePlant(saved.id)
        if (!live.current) return
        setBase(saved); setFile(null); await refreshPreparation(saved)
      } catch { photoSaved = false; if (live.current) setPhotoError('Datos guardados. La fotografía quedó pendiente; puedes revisarla y reintentar sin volver a guardar la ficha.') }
    }
    if (!live.current) return
    setBusy(false); setNotice(photoSaved ? 'Ficha guardada correctamente.' : 'Nombre, precio e información guardados. Fotografía pendiente.')
    guard(!photoSaved, false)
    if (following && photoSaved) onNext()
  }
  const checkSaved = async () => {
    setBusy(true); guard(dirty, true); setError(null)
    try {
      const saved = await fetchEditablePlant(product.id)
      if (!saved) throw new Error('No se encontró la planta.')
      await refreshPreparation(saved)
      if (live.current) {
        setDraft(preserveEditedDraft(base, saved, draft)); setBase(saved); setUncertain(false)
        setNotice('Consulta completada. Tus cambios siguen en el formulario; compara el resultado antes de guardar otra vez.')
      }
    } catch { if (live.current) setError('No se pudo comprobar lo guardado. Conserva tus cambios y reintenta la consulta.') }
    finally { if (live.current) setBusy(false) }
  }
  const checkPhoto = async () => {
    setBusy(true); guard(dirty, true)
    try {
      const saved = await fetchEditablePlant(product.id)
      if (!saved) throw new Error()
      if (live.current) { setDraft(preserveEditedDraft(base, saved, draft)); setBase(saved); setNotice('Esta es la fotografía registrada. Si corresponde a tu selección, descarta la foto pendiente; si no, reintenta su carga.'); setPhotoError(null) }
    } catch { if (live.current) setPhotoError('No se pudo consultar la fotografía guardada.') }
    finally { if (live.current) setBusy(false) }
  }
  const refreshReview = async () => {
    setReviewRevision(r => r + 1)
    try {
      const [state, balances] = await Promise.all([fetchPlantPreparation(product.id, preparation.branchId), fetchAdminInventoryBalances()])
      if (balances.branchId !== preparation.branchId) throw new Error('Wrong branch')
      if (live.current) {
        onSaved(base, state)
        const refreshed = balances.items.find(b => b.productId === product.id)
        setStock(refreshed)
        if (refreshed) onStockUpdated(refreshed)
      }
    } catch { if (live.current) setError('La revisión terminó, pero falta actualizar el estado de la planta. Reintenta la consulta.') }
  }
  const activate = async () => {
    if (busy || dirty || !canPrice) return
    setBusy(true); guard(false, true); setError(null)
    try { const state = await activatePlant(product.id, preparation.branchId); const saved = await patchPlant(product.id, {}); if (live.current) { setBase(saved); onSaved(saved, state); setNotice('Planta habilitada para vender en esta sucursal.') } }
    catch { if (live.current) setError('No se confirmó la habilitación. Comprueba el estado antes de repetirla.') }
    finally { if (live.current) setBusy(false) }
  }
  const loadHistory = async () => {
    try { const result = await fetchInventoryHistory(product.id); if (result.branchId !== preparation.branchId) throw new Error('Wrong branch'); if (live.current) setHistory(result.items) }
    catch { if (live.current) setError('No se pudieron consultar los movimientos.') }
  }
  return <div className="plant-detail-page">
    <button className="plants-back" type="button" disabled={busy} onClick={onBack}>← Volver a Plantas</button>
    <div className="plant-detail-layout">
      <section className="plant-photo-panel" aria-label="Fotografía de la planta"><PlantPhoto hero imageId={base.image?.id} name={base.commonName} preview={preview} />
        <div className="plant-photo-actions"><label className="plants-file-button">Tomar foto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={e => { selectPhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
          <label className="plants-file-button secondary">Elegir fotografía<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e => { selectPhoto(e.target.files?.[0]); e.target.value = '' }} /></label>
        </div><p className="plants-helper">JPEG, PNG o WEBP · hasta 5 MiB. No es obligatoria para vender.</p>
        {file && <div className="plant-photo-pending"><p>{file.name} · {(file.size / 1024).toFixed(0)} KB</p><button className="plants-primary" type="button" disabled={busy} onClick={photoOnly}>{busy ? 'Guardando…' : 'Guardar fotografía'}</button><button className="plants-text-button" type="button" disabled={busy} onClick={() => { setFile(null); setPhotoError(null) }}>Descartar foto pendiente</button></div>}
        {photoError && <div className="plants-warning" role="alert"><p>{photoError}</p><button type="button" disabled={busy} onClick={checkPhoto}>Consultar fotografía guardada</button>{base.image && <PlantPhoto imageId={base.image.id} name="Fotografía registrada en el servidor" />}</div>}
      </section>
      <div className="plant-detail-information">
        <header className="plant-identity"><p className="plants-eyebrow">{product.categoryName} · {product.internalCode}</p><h4>{base.commonName}</h4>{base.scientificName && <p className="plant-scientific">{base.scientificName}</p>}<p className="plant-current-price">{preparation.priceConfirmed ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(base.priceCents / 100) : 'Precio pendiente'}</p><span className={`plant-state ${preparation.ready ? 'ready' : ''}`}>{stateLabels[preparation.commercialState]}</span></header>
        {!preparation.ready && <div className="plant-preparation"><strong>{preparation.ready ? 'Preparada para venta' : 'Para preparar esta planta'}</strong>{!preparation.ready && <ul>{preparation.reasons.map(r => <li key={r}>{preparationLabels[r]}</li>)}</ul>}<p>Fotografía y ficha botánica opcionales.</p>
          {!preparation.ready && canPrice && !preparation.reasons.some(r => ['DISABLED', 'CATEGORY_INACTIVE', 'PRICE_PENDING', 'INITIAL_COUNT_PENDING'].includes(r)) && <button type="button" disabled={busy || dirty} onClick={activate}>Habilitar venta en esta sucursal</button>}
        </div>}
        <div className="plant-stock-box"><span>Existencia · {branchName}</span><strong>{stock ? `${stock.totalQuantity} ${product.unit}` : 'No consultada'}</strong><small>La cantidad se modifica únicamente mediante operaciones autorizadas.</small></div>
        {notice && <p className="plants-notice" role="status">{notice}</p>}{error && <p className="plants-warning" role="alert">{error}</p>}
        {uncertain && <button type="button" disabled={busy} onClick={checkSaved}>Comprobar datos guardados</button>}
        <form className="plant-edit-form" onSubmit={save} aria-busy={busy}>
          <fieldset disabled={busy || uncertain || !base.editRevision}><legend>Información de la planta</legend><label><span>Nombre</span><input required minLength={2} maxLength={160} value={draft.common_name} onChange={e => field('common_name', e.target.value)} /></label>
            <div className="plant-price-field"><label><span>Precio de venta · MXN</span><input inputMode="decimal" placeholder="Precio pendiente" value={draft.price} disabled={!canPrice} onChange={e => field('price', e.target.value)} /></label><small>{preparation.priceConfirmed ? 'Precio confirmado' : 'Precio pendiente de confirmar'}{!canPrice ? ' · Sólo consulta con tus permisos actuales.' : ''}</small>
              {canPrice && !preparation.priceConfirmed && product.priceCents > 0 && <label className="plants-checkbox"><input type="checkbox" checked={confirmPrice} onChange={e => setConfirmPrice(e.target.checked)} />Confirmar este precio al guardar</label>}
            </div>
          </fieldset>
          <div className="plant-save-actions"><button className="plants-primary" type="submit" value="next" disabled={busy || uncertain || !base.editRevision}>{busy ? 'Guardando…' : 'Guardar y siguiente'}</button><button className="plants-text-button" type="submit" value="save" disabled={busy || uncertain || !base.editRevision}>Guardar ficha</button></div>
          <fieldset disabled={busy || uncertain || !base.editRevision}><legend className="sr-only">Detalles adicionales</legend><details className="plant-more-details"><summary>Más detalles</summary><label><span>Categoría</span><select aria-label="Categoría" value={draft.category_id} onChange={e => field('category_id', e.target.value)}>{categories.map(c => <option key={c.id} value={c.id}>{c.name}{!c.isActive ? ' · Inactiva' : ''}</option>)}</select></label>
              <label><span>Nombre científico · opcional</span><input maxLength={160} value={draft.scientific_name} onChange={e => field('scientific_name', e.target.value)} /></label>
              <label><span>Descripción y presentación</span><textarea aria-label="Descripción y presentación" maxLength={2000} rows={3} value={draft.description} onChange={e => field('description', e.target.value)} /></label>
              <label><span>Riego</span><textarea aria-label="Riego" maxLength={2000} rows={2} value={draft.watering_advice} onChange={e => field('watering_advice', e.target.value)} /></label>
              <label><span>Luz</span><input maxLength={160} value={draft.light_type} onChange={e => field('light_type', e.target.value)} /></label>
              <label><span>Clima recomendado</span><input maxLength={160} value={draft.recommended_climate} onChange={e => field('recommended_climate', e.target.value)} /></label>
              <div className="plant-field-pair"><label><span>Unidad</span><select aria-label="Unidad" value={draft.unit} onChange={e => field('unit', e.target.value)}>{['pieza', 'maceta', 'charola', 'bolsa', 'kg'].map(u => <option key={u}>{u}</option>)}</select></label><label><span>Mínimo de existencias</span><input inputMode="decimal" value={draft.minimum} onChange={e => field('minimum', e.target.value)} /></label></div>
              {canPrice && <label><span>Precio de mayoreo · opcional</span><input inputMode="decimal" value={draft.wholesale} onChange={e => field('wholesale', e.target.value)} /></label>}
              <p className="plants-helper">Código conservado: <strong>{product.internalCode}</strong>. Para códigos, activación general y categorías utiliza las herramientas de catálogo.</p>
            </details>
          </fieldset>

        </form>
        <div className="plant-work-actions">{permissions.canRecordCount && <button type="button" disabled={busy} onClick={onCount}>Registrar conteo</button>}<button type="button" disabled={busy || !isValidLabelInternalCode(product.internalCode)} onClick={() => setShowQr(true)}>Ver QR</button></div>
        {permissions.canRecordCount && <details className="plant-more-details"><summary>Conteos e historial</summary><InventoryCountReview canApprove={permissions.canApproveCounts} productId={product.id} revision={reviewRevision} products={[{ id: product.id, name: product.commonName, unit: product.unit }]} onChanged={() => { void refreshReview() }} />
          <button type="button" onClick={loadHistory}>Consultar movimientos</button>{history && <ul className="plant-history">{history.length === 0 && <li>No hay movimientos registrados.</li>}{history.map(m => <li key={m.id}><strong>{({ RECEPTION: 'Recepción', SALE: 'Venta', REFUND: 'Devolución', ADJUSTMENT_ADD: 'Ajuste aprobado', ADJUSTMENT_SUB: 'Ajuste aprobado' } as Record<string, string>)[m.movementType] ?? 'Movimiento'} · {m.quantity}</strong><span>{new Date(m.createdAt).toLocaleString('es-MX')} · {m.notes}</span></li>)}</ul>}</details>}
        {permissions.canReceive && <div className="plant-owner-tools"><p className="plants-eyebrow">Operación de propietarios</p><p>Las entradas de mercancía se registran en su circuito de recepción.</p>{onReception && <button type="button" disabled={busy} onClick={onReception}>Ir a compras y recepción</button>}{onInventory && <button type="button" disabled={busy} onClick={onInventory}>Abrir inventario de esta planta</button>}</div>}
      </div>
    </div>
    {showQr && <ProductQrLabelDialog products={[base]} onClose={() => setShowQr(false)} />}
  </div>
}

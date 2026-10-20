import { useEffect, useState, useId } from 'react'
import { useInventoryPermissions } from '../useInventoryPermissions'
import { useAuth } from '../../auth/useAuth'
import { canPublishCataloging } from '../../access/access-rules'
import type { AdminCategory, AdminProduct } from '../admin-catalog-types'
import {
  catalogingBinary,
  catalogingError,
  loadCatalogingDraft,
  parseCataloging,
  confirmCataloging,
  saveCataloging,
  saveCatalogingProgress,
  pendingCataloging,
  recoverCataloging,
  type CatalogingDraft,
} from './cataloging-service'
import { selectedPhotoError } from './photo-selection'
import { PlantPhoto } from './PlantPhoto'
import {
  initialWizardForm,
  parseWizardPrice,
  validateStep1,
  type WizardDraftForm,
  type WizardStep,
} from './cataloging-wizard-model'

export interface CatalogingWizardProps {
  draftId: string
  isNew?: boolean
  pendingDrafts: CatalogingDraft[]
  categories: AdminCategory[]
  products: AdminProduct[]
  onCompleted: (draftId: string) => void
  onNext: (nextDraftId: string) => void
  onClose: () => void
  guard: (dirty: boolean, busy?: boolean) => void
}

export function CatalogingWizard({
  draftId,
  isNew = false,
  pendingDrafts,
  categories,
  products,
  onCompleted,
  onNext,
  onClose,
  guard,
}: CatalogingWizardProps) {
  const { accessContext } = useAuth()
  const canPublish = canPublishCataloging(accessContext)
  const permissions = useInventoryPermissions()
  const [initialQuantity,setInitialQuantity] = useState('')
  const [step, setStep] = useState<WizardStep>(1)
  const [draft, setDraft] = useState<CatalogingDraft | null>(null)
  const [form, setForm] = useState<WizardDraftForm | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState<{ headline: string; details: string; statusType: 'ready' | 'pending' } | null>(null)

  // Step 1: Link existing product modal/toggle
  const [selectedProductId, setSelectedProductId] = useState('')
  const fromReceipt = !!draft?.source_evidence && typeof draft.source_evidence === 'object' && 'purchase_id' in draft.source_evidence
  const directNew = permissions.canApplyCount && !selectedProductId && !fromReceipt

  // Step 2: Photo state (no separate save button)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')

  // Step 3: Commercial inputs
  const [priceInput, setPriceInput] = useState('')

  // Unique IDs for accessibility
  const nameId = useId()
  const presentationId = useId()
  const categoryId = useId()
  const skuId = useId()
  const scientificId = useId()
  const barcodeId = useId()
  const notesId = useId()
  const priceInputId = useId()

  // Load active draft
  useEffect(() => {
    let active = true
    setLoading(true)
    setDraft(null)
    setForm(null)
    setError('')
    setFeedback(null)
    setStep(1)
    setPhotoFile(null)
    setPhotoPreview(null)
    setPriceInput('');setInitialQuantity('')
    setSelectedProductId('')

    loadCatalogingDraft(draftId)
      .then(d => {
        if (!active) return
        setDraft(d)
        setForm(initialWizardForm(d.fields, d.original_name))
        setInitialQuantity(d.fields.initial_quantity == null ? '' : String(d.fields.initial_quantity))
        if (d.fields.suggested_price_cents != null && d.fields.suggested_price_cents > 0) {
          setPriceInput((d.fields.suggested_price_cents / 100).toFixed(2))
        }
        setLoading(false)
      })
      .catch(err => {
        if (!active) return
        setError(catalogingError(err))
        setLoading(false)
      })

    return () => { active = false }
  }, [draftId])

  // Manage photo preview
  useEffect(() => {
    let active = true
    let blobUrl: string | null = null

    if (photoFile) {
      try {
        blobUrl = URL.createObjectURL(photoFile)
        setPhotoPreview(blobUrl)
      } catch {
        setPhotoError('No se pudo generar la vista previa de la foto.')
      }
    } else if (draft?.has_image) {
      catalogingBinary(`cataloging/${draft.id}/photo`)
        .then(blob => {
          if (!active) return
          blobUrl = URL.createObjectURL(blob as Blob)
          setPhotoPreview(blobUrl)
        })
        .catch(() => {
          if (!active) return
          setPhotoError('No se pudo cargar la foto existente.')
        })
    } else {
      setPhotoPreview(null)
    }

    return () => {
      active = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [photoFile, draft])

  // Guard dirty state
  const closed = draft?.status === 'LINKED' || draft?.status === 'PREPARED'
  const readOnly = closed || (draft?.status === 'REVIEW' && !canPublish)
  const pending = pendingCataloging()
  const isDirty = !readOnly && Boolean(initialQuantity !== (draft?.fields.initial_quantity == null ? '' : String(draft.fields.initial_quantity)) || photoFile || (form && draft && (
    JSON.stringify(form) !== JSON.stringify(initialWizardForm(draft.fields, draft.original_name))
    || priceInput !== (draft.fields.suggested_price_cents ? (draft.fields.suggested_price_cents / 100).toFixed(2) : '')
  )))
  useEffect(() => {
    guard(isDirty, busy)
  }, [isDirty, busy, guard])

  const handleSelectPhoto = (input: HTMLInputElement) => {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const validationError = selectedPhotoError(file)
    if (validationError) {
      setPhotoError(validationError)
      return
    }
    setPhotoError('')
    setPhotoFile(file)
  }

  const handleRecover = async () => {
    if (busy || !pending) return
    setBusy(true); setError('')
    try {
      const recovered = await recoverCataloging()
      if (recovered.id !== draftId) {
        setError('Se confirmó el guardado de otra planta. Puedes continuar con esta ficha.')
        onCompleted(recovered.id)
        return
      }
      // The replay is a receipt of that operation, not necessarily the latest revision.
      const current = await loadCatalogingDraft(draftId)
      if (current.revision !== recovered.revision && !['PREPARED','LINKED'].includes(current.status)) {
        setError('El guardado se confirmó, pero la ficha recibió otros cambios. Consulta la versión guardada antes de editarla.')
        return
      }
      setDraft(current)
      setPhotoError('')
      if (pending.photo) setPhotoFile(null)
      else {
        setForm(initialWizardForm(current.fields,current.original_name))
        const savedFields = (pending.body as { fields?: Record<string,unknown> } | null)?.fields
        if (savedFields && 'suggested_price_cents' in savedFields) setPriceInput(current.fields.suggested_price_cents ? (current.fields.suggested_price_cents / 100).toFixed(2) : '')
      }
      if (current.status === 'PREPARED' || current.status === 'LINKED') onCompleted(current.id)
      setError('Guardado comprobado. Revisa los datos antes de continuar.')
    } catch (err) { setError(catalogingError(err)) }
    finally { setBusy(false) }
  }

  const handleReload = async () => {
    if (busy || pending || !window.confirm('¿Cargar la ficha guardada? Se reemplazarán los cambios de este formulario que no hayas guardado.')) return
    setBusy(true)
    try {
      const current = await loadCatalogingDraft(draftId)
      setDraft(current); setForm(initialWizardForm(current.fields,current.original_name)); setPhotoFile(null)
      setPriceInput(current.fields.suggested_price_cents ? (current.fields.suggested_price_cents / 100).toFixed(2) : '')
      setError(''); setPhotoError('')
    } catch (err) { setError(catalogingError(err)) }
    finally { setBusy(false) }
  }

  // Step 1 -> Step 2
  const handleProceedToStep2 = async () => {
    if (!draft || !form || busy) return
    const { valid, errors } = validateStep1(form)
    if (!valid) {
      setError(errors.join(' '))
      return
    }
    setError('')
    setBusy(true)
    try {
      // Save progress so far
      const updated = await saveCataloging(draft.id, {
        revision: draft.revision,
        action: 'SAVE',
        fields: {
          approved_name: form.approved_name.trim(),
          presentation: form.presentation.trim(),
          category_id: form.category_id,
          internal_code: form.internal_code.trim(),
          scientific_name: form.scientific_name.trim(),
          barcode: form.barcode.trim(),
          description: form.description.trim(),
        },
      })
      setDraft(updated)
      setStep(2)
    } catch (err) {
      setError(catalogingError(err))
    } finally {
      setBusy(false)
    }
  }

  // Step 2 -> Step 3: Automatically uploads photo if one was selected
  const handleProceedToStep3 = async () => {
    if (!draft || busy) return
    setError('')
    setPhotoError('')

    if (photoFile) {
      setBusy(true)
      try {
        const uploadResult = await catalogingBinary(`cataloging/${draft.id}/photo`, photoFile, draft.revision)
        const updated = parseCataloging(uploadResult)
        setDraft(updated)
        setPhotoFile(null)
        setStep(3)
      } catch (err) {
        setPhotoError(catalogingError(err))
      } finally {
        setBusy(false)
      }
    } else {
      setStep(3)
    }
  }

  // Step 3: Publish to catalog
  const handlePublish = async () => {
    if (!draft || !form || busy) return
    setError('')

    let priceCents: number | null = null
    try {
      priceCents = parseWizardPrice(priceInput)
      if(directNew && (!priceCents || !/^\d+$/.test(initialQuantity) || Number(initialQuantity)>1000000))throw new Error('Indica un precio mayor a cero y la cantidad inicial; escribe 0 si no hay unidades.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Precio inválido')
      return
    }

    setBusy(true)
    try {
      const published = await confirmCataloging(draft.id, {
        revision: draft.revision,
        fields: {
          approved_name: form.approved_name.trim(),
          presentation: form.presentation.trim(),
          category_id: form.category_id,
          internal_code: form.internal_code.trim(),
          scientific_name: form.scientific_name.trim(),
          barcode: form.barcode.trim(),
          description: form.description.trim(),
        },
        price_cents: priceCents ?? 0,
        ...(directNew ? {initial_quantity:Number(initialQuantity)} : {}),
        ...(selectedProductId && suggestions.some(p=>p.id===selectedProductId) ? { product_id:Number(selectedProductId) } : {}),
      })

      const resultFeedback = published.publication?.ready
        ? {headline:'Planta lista para venta',details:'La ficha y la preparación comercial quedaron confirmadas.',statusType:'ready' as const}
        : {headline:'Ficha publicada',details:published.publication?.needs_initial_count
          ? published.publication.price_cents>0 ? 'Solo falta confirmar el conteo inicial de esta sucursal para venderla.' : 'Faltan el precio y el conteo inicial para venderla.'
          : 'Revisa el precio para dejarla vendible.',statusType:'pending' as const}
      setFeedback(resultFeedback)
      setDraft(published)
      onCompleted(draft.id)

    } catch (err) {
      setError(catalogingError(err))
    } finally {
      setBusy(false)
    }
  }

  // Save progress & exit
  const handleSaveAndExit = async () => {
    if (!draft || !form || busy) return
    setBusy(true)
    setError('')
    try {
      if (isDirty && !readOnly) {
        if (!fromReceipt && initialQuantity && (!/^\d+$/.test(initialQuantity) || Number(initialQuantity)>1000000)) throw new Error('Indica una cantidad inicial entera entre 0 y 1000000.')
        await saveCatalogingProgress(draft, {
            approved_name: form.approved_name.trim(),
            presentation: form.presentation.trim(),
            category_id: form.category_id,
            internal_code: form.internal_code.trim(),
            scientific_name: form.scientific_name.trim(),
            barcode: form.barcode.trim(),
            description: form.description.trim(),
            suggested_price_cents: parseWizardPrice(priceInput),
            ...(!fromReceipt ? {initial_quantity:initialQuantity===''?null:Number(initialQuantity)} : {}),
        }, photoFile, setDraft)
        setPhotoFile(null)
      }
      guard(false, false)
      onClose()
    } catch (err) {
      setError(catalogingError(err))
    } finally {
      setBusy(false)
    }
  }

  if (!loading && (!form || !draft)) return <div role="alert"><p>{error || 'No se pudo cargar la ficha.'}</p><button onClick={onClose}>Volver a Plantas</button></div>
  if (loading || !form || !draft) {
    return (
      <div className="cataloging-wizard-loading" role="status">
        <p>Cargando planta pendiente…</p>
      </div>
    )
  }

  const selectedCategoryName = categories.find(c => Number(c.id) === form.category_id)?.name ?? 'Sin categoría'
  const normalizeName = (value:string) => value.normalize('NFD').replace(/\p{Diacritic}/gu,'').toLocaleLowerCase('es-MX')
  const queryName=normalizeName(form.approved_name.trim())
  const firstWord=queryName.split(/\s+/).find(word=>word.length>=4)
  const suggestions = products.filter(p => queryName.length >= 3 && (normalizeName(p.commonName).includes(queryName)
    || Boolean(firstWord && normalizeName(p.commonName).includes(firstWord)))).slice(0,4)

  return (
    <div className="cataloging-wizard" aria-label="Asistente para completar planta">
      {/* Unified Compact Header */}
      <header className="cataloging-wizard-header">
        <div className="wizard-header-top-row">
          <span className="wizard-pending-badge">
            <span className="pending-indicator-dot" aria-hidden="true" />
            {isNew ? 'Nueva planta' : 'Completar planta pendiente'}
          </span>
          <button
            type="button"
            className="wizard-ghost-exit-btn wizard-save-exit-btn"
            disabled={busy || Boolean(pending)}
            onClick={() => void handleSaveAndExit()}
            title="Guardar cambios y volver a la lista"
          >
            {readOnly ? 'Volver a Plantas' : '✕ Guardar y salir'}
          </button>
        </div>

        {/* Stepper with progress bar */}
        <div className="wizard-stepper-container">
          <div className="wizard-progress-track">
            <div
              className="wizard-progress-fill"
              style={{ width: step === 1 ? '33.3%' : step === 2 ? '66.6%' : '100%' }}
            />
          </div>
          <div className="cataloging-wizard-progress" role="progressbar" aria-valuenow={step} aria-valuemin={1} aria-valuemax={3}>
            <button
              type="button"
              className={`progress-step-item ${step === 1 ? 'active' : 'completed'}`}
              onClick={() => { if (step > 1 && !busy) setStep(1) }}
              disabled={busy}
            >
              <span className="step-circle">{step > 1 ? '✓' : '1'}</span>
              <span className="step-label">Identificar</span>
            </button>
            <span className="step-connector" aria-hidden="true">→</span>
            <button
              type="button"
              className={`progress-step-item ${step === 2 ? 'active' : step > 2 ? 'completed' : 'pending'}`}
              onClick={() => { if (step > 2 && !busy) setStep(2) }}
              disabled={busy || step < 2}
            >
              <span className="step-circle">{step > 2 ? '✓' : '2'}</span>
              <span className="step-label">Fotografía</span>
            </button>
            <span className="step-connector" aria-hidden="true">→</span>
            <button
              type="button"
              className={`progress-step-item ${step === 3 ? 'active' : 'pending'}`}
              disabled={busy || step < 3}
            >
              <span className="step-circle">3</span>
              <span className="step-label">Publicar</span>
            </button>
          </div>
        </div>
      </header>

      {error && <div className="plants-warning" role="alert"><p>{error}</p>{!pending && <button disabled={busy} onClick={() => void handleReload()}>Cargar versión guardada</button>}</div>}
      {pending && <div className="plants-warning" role="alert"><p>Hay una operación sin confirmar. Compruébala antes de seguir.</p><button disabled={busy} onClick={() => void handleRecover()}>Comprobar guardado</button></div>}
      {readOnly && <p role="status">{closed ? 'Esta ficha ya fue añadida o vinculada al catálogo.' : 'Esta ficha está en revisión. Una persona con permiso de publicación puede completarla.'}</p>}
      {closed && <button onClick={() => { guard(false, false); const next = pendingDrafts.find(d => d.id !== draft.id); if (next) onNext(next.id); else onClose() }}>Continuar</button>}
      {feedback && (
        <div className={`wizard-feedback-banner ${feedback.statusType}`} role="status">
          <strong>{feedback.headline}</strong>
          <p>{feedback.details}</p>
        </div>
      )}

      <fieldset disabled={busy || Boolean(pending) || readOnly} style={{ border:0, margin:0, padding:0, minWidth:0 }}>
      {/* Step 1: Identificar */}
      {step === 1 && (
        <section className="wizard-step-content" aria-label="Paso 1: Identificar planta">
          <div className="wizard-header-title">
            <h3>{isNew ? 'Registrar una nueva planta' : 'Completar identificación'}</h3>
            {draft.original_name && draft.original_name !== 'Nueva planta' && draft.original_name.trim().toLowerCase() !== form.approved_name.trim().toLowerCase() ? (
              <p className="wizard-subtitle">Referencia importada: <strong>{draft.original_name}</strong> · Completa los datos comerciales.</p>
            ) : (
              <p className="wizard-subtitle">Completa el nombre, presentación y categoría para registrar la planta en el catálogo.</p>
            )}
          </div>

          <form className="wizard-form" onSubmit={e => { e.preventDefault(); void handleProceedToStep2() }}>
            <div className="form-group">
              <label htmlFor={nameId}>Nombre comercial o común *</label>
              <input
                id={nameId}
                required
                maxLength={160}
                placeholder="Ej. Cuna de Moisés, Ficus lira…"
                value={form.approved_name}
                onChange={e => setForm({ ...form, approved_name: e.target.value })}
              />
            </div>

            <div className="form-group-row">
              <div className="form-group">
                <label htmlFor={presentationId}>Presentación *</label>
                <input
                  id={presentationId}
                  required
                  maxLength={120}
                  placeholder="Ej. Maceta 6, Bolsa 2L, Colgante…"
                  value={form.presentation}
                  onChange={e => setForm({ ...form, presentation: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label htmlFor={categoryId}>Categoría *</label>
                <select
                  id={categoryId}
                  required
                  value={form.category_id ?? ''}
                  onChange={e => setForm({ ...form, category_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">Selecciona una categoría…</option>
                  {categories.filter(c => c.isActive).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Optional details accordion */}
            <details className="wizard-details-accordion">
              <summary className="wizard-accordion-summary">
                <div className="wizard-accordion-titles">
                  <span className="wizard-accordion-main-title">Más opciones</span>
                  <span className="wizard-accordion-subtitle">Opcional: SKU, nombre científico, luz y riego</span>
                </div>
                <span className="wizard-accordion-chevron" aria-hidden="true">▾</span>
              </summary>
              <div className="wizard-accordion-content">
                <div className="form-group">
                  <label htmlFor={skuId}>SKU interno (si lo dejas vacío, se autogenerará)</label>
                  <input
                    id={skuId}
                    maxLength={40}
                    placeholder="Opcional. Se autogenera si se deja vacío"
                    value={form.internal_code}
                    onChange={e => setForm({ ...form, internal_code: e.target.value })}
                  />
                </div>

                <div className="form-group-row">
                  <div className="form-group">
                    <label htmlFor={scientificId}>Nombre científico</label>
                    <input
                      id={scientificId}
                      maxLength={160}
                      placeholder="Ej. Spathiphyllum wallisii"
                      value={form.scientific_name}
                      onChange={e => setForm({ ...form, scientific_name: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor={barcodeId}>Código de barras</label>
                    <input
                      id={barcodeId}
                      maxLength={128}
                      placeholder="Opcional"
                      value={form.barcode}
                      onChange={e => setForm({ ...form, barcode: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor={notesId}>Cuidados, notas de identificación o descripción (luz, riego, clima)</label>
                  <textarea
                    id={notesId}
                    rows={2}
                    maxLength={2000}
                    placeholder="Observaciones de cuidados (luz directa/indirecta, frecuencia de riego), procedencia o floración…"
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>
            </details>

            {canPublish && suggestions.length > 0 && <div className="wizard-secondary-link-box"><strong>¿Ya existe? Elige una coincidencia visual</strong>
              <div className="wizard-suggestions">{suggestions.map(p => <button type="button" key={p.id} className={selectedProductId===p.id ? 'selected' : ''}
                onClick={() => { setSelectedProductId(selectedProductId===p.id ? '' : p.id); if(!priceInput&&p.priceCents>0)setPriceInput((p.priceCents/100).toFixed(2)) }} aria-pressed={selectedProductId===p.id}>
                <PlantPhoto imageId={p.image?.id} name={p.commonName} /><span>{p.commonName}<small>{p.internalCode}</small></span></button>)}</div>
              <small>{selectedProductId ? 'Se completará esta planta existente.' : 'Si es nueva, continúa sin elegir ninguna.'}</small>
            </div>}

            <div className="wizard-actions">
              <button
                type="submit"
                className="plants-primary wizard-cta"
                disabled={busy}
              >
                Continuar a Fotografía (Paso 2) →
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Step 2: Fotografía sin doble guardado */}
      {step === 2 && (
        <section className="wizard-step-content" aria-label="Paso 2: Fotografía de la planta">
          <div className="wizard-header-title">
            <h3>Fotografía de la planta</h3>
            <p className="wizard-subtitle">{form.approved_name} · {form.presentation}</p>
          </div>

          <div className="wizard-photo-container">
            {photoPreview ? (
              <div className="wizard-photo-preview-box">
                <img
                  src={photoPreview}
                  alt={`Vista previa de ${form.approved_name}`}
                  className="wizard-photo-img"
                />
                {photoFile && (
                  <p className="wizard-photo-hint">
                    ✓ Nueva fotografía lista para subirse al continuar.
                  </p>
                )}
              </div>
            ) : (
              <div className="wizard-photo-placeholder">
                <span className="placeholder-icon" aria-hidden="true">📷</span>
                <p>Sin fotografía asignada aún</p>
                <small>Una buena foto ayuda a identificarla en Caja y en el Catálogo.</small>
              </div>
            )}

            {photoError && <p className="plants-warning" role="alert">{photoError}</p>}

            <div className="wizard-photo-buttons">
              <label className="wizard-photo-btn primary">
                📷 Tomar foto
                <input
                  type="file"
                  capture="environment"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={e => handleSelectPhoto(e.currentTarget)}
                />
              </label>

              <label className="wizard-photo-btn secondary">
                📁 Elegir de galería
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy}
                  onChange={e => handleSelectPhoto(e.currentTarget)}
                />
              </label>

              {photoFile && (
                <button
                  type="button"
                  className="wizard-btn-ghost"
                  onClick={() => { setPhotoFile(null); setPhotoError('') }}
                >
                  Quitar foto seleccionada
                </button>
              )}
            </div>
          </div>

          <div className="wizard-actions wizard-actions-split">
            <button
              type="button"
              className="wizard-btn-secondary"
              disabled={busy}
              onClick={() => setStep(1)}
            >
              ← Volver al Paso 1
            </button>
            <button
              type="button"
              className="plants-primary wizard-cta"
              disabled={busy}
              onClick={() => void handleProceedToStep3()}
            >
              {busy ? 'Subiendo foto…' : 'Continuar al Paso 3 →'}
            </button>
          </div>
        </section>
      )}

      {/* Alta directa para perfiles autorizados; recepción y vinculaciones conservan su inventario. */}
      {step === 3 && (
        <section className="wizard-step-content" aria-label="Paso 3: Precio, Existencia y Publicar">
          <div className="wizard-header-title">
            <h3>Precio y confirmar</h3>
            <p className="wizard-subtitle">Completa los datos para habilitar la planta. Las cantidades de compras recibidas se conservan.</p>
          </div>

          {/* Plant summary card */}
          <div className="wizard-summary-card">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="summary-thumb" />
            ) : (
              <div className="summary-thumb-placeholder">🌿</div>
            )}
            <div className="summary-details">
              <h4>{form.approved_name}</h4>
              <p className="summary-meta">
                <strong>{form.presentation}</strong> · {selectedCategoryName}
              </p>
              <p className="summary-sku">
                SKU: {form.internal_code || 'Se autogenerará al publicar'}
              </p>
            </div>
          </div>

          <div className="wizard-commercial-fields">
            {directNew&&<label>Cantidad inicial en esta sucursal<input inputMode="numeric" value={initialQuantity} onChange={e=>setInitialQuantity(e.target.value)} placeholder="Incluye 0 si no hay unidades" /><small>Se registra una sola vez al crear la planta, sin aprobación adicional.</small></label>}
            <div className="form-group">
              <label htmlFor={priceInputId}>Precio de venta ($ MXN)</label>
              <input
                id={priceInputId}
                type="text"
                inputMode="decimal"
                placeholder={directNew?'Ej. 120.00':'Ej. 120.00 (Opcional)'}
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
              />
              <small className="field-hint">
                {directNew?'Necesario para habilitar la planta. Puedes guardar un borrador si aún no lo tienes.':'Si no lo tienes ahora, déjalo vacío y confírmalo después en la ficha.'}
              </small>
            </div>

          </div>

          <div className="wizard-actions wizard-actions-split">
            <button
              type="button"
              className="wizard-btn-secondary"
              disabled={busy}
              onClick={() => setStep(2)}
            >
              ← Volver al Paso 2
            </button>
            <button
              type="button"
              className="plants-primary wizard-cta-publish"
              disabled={busy}
              onClick={() => void (canPublish ? handlePublish() : handleSaveAndExit())}
            >
              {busy ? 'Guardando…' : canPublish ? directNew ? 'Guardar y habilitar' : 'Confirmar y publicar' : 'Guardar y salir'}
            </button>
          </div>
        </section>
      )}
      </fieldset>
    </div>
  )
}

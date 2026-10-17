import { useCallback, useEffect, useRef, useState } from 'react'
import { useBlocker, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { hasCapability } from '../../access/access-helpers'
import { useHeadingFocus } from '../../../app/usePageAccessibility'
import { AdminCatalog } from '../AdminCatalog'
import { useInventoryPermissions } from '../useInventoryPermissions'
import { usePlants } from './usePlants'
import { filterPlants, nextPendingPlant, type PlantFilters } from './plants-model'
import { stateLabels } from './plants-service'
import { PlantPhoto } from './PlantPhoto'
import { PlantDetail } from './PlantDetail'
import { PlantCount } from './PlantCount'
import { CatalogingWizard } from './CatalogingWizard'
import { loadCataloging, saveCataloging, pendingCataloging, recoverCataloging, pendingProductConfirmation, pendingProductAttemptKind, recoverProductConfirmation, emptyCatalogingFields, catalogingError, type CatalogingDraft } from './cataloging-service'
import './plants.css'

const money = (cents: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100)
export function AdminPlants({ onInventory, onReception, onWorkingState }: { onInventory?: (id?: string) => void; onReception?: () => void; onWorkingState: (dirty: boolean, busy: boolean) => void }) {
  const { accessContext: context } = useAuth()
  if (!context?.branch?.isActive) return <p role="alert">Necesitas una sucursal activa para trabajar con las plantas.</p>
  return <PlantsWorkspace key={`${context.userId}:${context.branch.id}:${context.capabilities.join(',')}`} branchId={context.branch.id}
    branchName={context.branch.name} canInventory={hasCapability(context, 'MANAGE_INVENTORY')} canPrice={hasCapability(context, 'MANAGE_PRICES')}
    onInventory={onInventory} onReception={onReception} onWorkingState={onWorkingState} />
}
function PlantsWorkspace({ branchId, branchName, canInventory, canPrice, onInventory, onReception, onWorkingState }: {
  branchId: string; branchName: string; canInventory: boolean; canPrice: boolean; onInventory?: (id?: string) => void; onReception?: () => void; onWorkingState: (dirty: boolean, busy: boolean) => void
}) {
  const data = usePlants(branchId, canInventory), permissions = useInventoryPermissions(canInventory)
  const [params, setParams] = useSearchParams()
  const filters: PlantFilters = { search: params.get('q') ?? '', category: params.get('category') ?? '', pending: params.get('pending') === '1', low: params.get('low') === '1' }
  const selected = params.get('plant'), countView = params.get('view') === 'count'
  const catalogingParam = params.get('cataloging')
  const [catalogingDrafts, setCatalogingDrafts] = useState<CatalogingDraft[]>([])
  const [creatingPlant, setCreatingPlant] = useState(false)
  const product = data.products.find(p => p.id === selected)
  const visible = filterPlants(data.products, data.preparations, data.balances, filters)
  const sequence = useRef<string[]>([]), listScroll = useRef(0), dirty = useRef(false), busy = useRef(false)
  const [notice, setNotice] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
  const blocker = useBlocker(() => dirty.current || busy.current)
  const heading = useHeadingFocus<HTMLHeadingElement>(selected ?? (catalogingParam ? 'wizard' : 'list'))
  const reportWork = useRef(onWorkingState)
  reportWork.current = onWorkingState
  const guard = useCallback((unsaved: boolean, saving = false) => { dirty.current = unsaved; busy.current = saving; reportWork.current(unsaved, saving) }, [])
  const refreshCataloging = useCallback(async () => {
    try {
      const drafts = await loadCataloging('', 'ALL', '')
      setCatalogingDrafts(drafts)
    } catch (err) {
      setNotice(catalogingError(err))
    }
  }, [])
  useEffect(() => {
    void refreshCataloging()
  }, [refreshCataloging])
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => { if (dirty.current || busy.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [])
  useEffect(() => () => reportWork.current(false, false), [])
  useEffect(() => {
    if (!selected && !catalogingParam) requestAnimationFrame(() => window.scrollTo({ top: listScroll.current }))
  }, [selected, catalogingParam])
  const filter = (key: string, value: string) => {
    // Router navigation updates history before React finishes its transition.
    // Read that current query so a quick second filter preserves the first.
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }
  const open = (id: string, view?: string) => {
    if (!selected) { listScroll.current = window.scrollY; sequence.current = visible.map(p => p.id) }
    const next = new URLSearchParams(params); next.set('plant', id)
    if (view) next.set('view', view); else next.delete('view')
    setParams(next)
    window.scrollTo({ top: 0 })
  }
  const back = () => { const next = new URLSearchParams(params); next.delete('plant'); next.delete('view'); setParams(next) }
  const next = () => {
    const id = nextPendingPlant(sequence.current.length ? sequence.current : visible.map(p => p.id), selected ?? '', data.preparations)
    if (id) { setNotice('Cambios guardados. Continúa con la siguiente planta.'); open(id) }
    else { setNotice('Terminaste esta selección. No quedan más plantas pendientes en la secuencia.'); back() }
  }

  const handleCreateNewPlant = async () => {
    if (busy.current || creatingPlant) return
    setCreatingPlant(true)
    setNotice('')
    try {
      const draft = await saveCataloging(null, {
        original_name: 'Nueva planta',
        fields: emptyCatalogingFields(),
      })
      await refreshCataloging()
      const nextP = new URLSearchParams(params)
      nextP.set('cataloging', draft.id)
      setParams(nextP)
    } catch (err) {
      setNotice(catalogingError(err))
    } finally {
      setCreatingPlant(false)
    }
  }

  const pendingDrafts = catalogingDrafts.filter(d => ['DRAFT', 'REVIEW'].includes(d.status))
  const pendingProducts = data.products.filter(p => !data.preparations[p.id]?.ready && data.preparations[p.id]?.commercialState !== 'DISABLED')
  const pendingDraftCount = pendingDrafts.length + pendingProducts.length
  const pendingOperation = pendingCataloging()
  const handleRecover = async () => {
    if (creatingPlant || busy.current) return
    setCreatingPlant(true)
    try {
      const result = await recoverCataloging()
      await refreshCataloging()
      data.refresh()
      setNotice('Guardado comprobado. Puedes continuar con la ficha.')
      const nextP = new URLSearchParams(params)
      nextP.set('cataloging',result.id)
      setParams(nextP)
    } catch (err) { setNotice(catalogingError(err)) }
    finally { setCreatingPlant(false) }
  }
  const handleRecoverProduct = async () => {
    setCreatingPlant(true)
    try { const kind=pendingProductAttemptKind(); await recoverProductConfirmation(); data.refresh(); setNotice(kind==='photo'?'Fotografía comprobada. Continúa con la ficha.':'Publicación comprobada. Consulta la ficha actualizada.') }
    catch(err) { setNotice(catalogingError(err)) }
    finally { setCreatingPlant(false) }
  }

  return <section className={`plants-workspace ${selected || catalogingParam ? 'plants-detail-workspace' : ''}`} aria-label="Plantas">
    <header className="plants-header">
      <div>
        <p className="plants-eyebrow">Vivero Dulcinea · Tu colección</p>
        <h3 ref={heading} tabIndex={-1}>{selected ? (countView ? 'Registrar conteo' : 'Ficha de planta') : catalogingParam ? 'Completar planta pendiente' : 'Plantas'}</h3>
        <p>{selected ? 'Un paso a la vez, entre tus plantas.' : catalogingParam ? 'Asistente de catalogación rápida.' : 'Busca, completa y cuida tu catálogo.'}</p>
      </div>
      <div className="plants-header-side">
        {!selected && !catalogingParam && (
          <button
            type="button"
            className="plants-primary plants-add-new-btn"
            disabled={creatingPlant}
            onClick={() => void handleCreateNewPlant()}
          >
            {creatingPlant ? 'Creando…' : '+ Nueva planta'}
          </button>
        )}
        <span className="plants-branch">Sucursal · <strong>{branchName}</strong></span>
      </div>
    </header>
    {notice && <p className="plants-notice" role="status">{notice}</p>}
    {!catalogingParam && pendingOperation && <div className="plants-warning" role="alert"><p>Hay una operación de Plantas sin confirmar.</p><button disabled={creatingPlant} onClick={() => void handleRecover()}>Comprobar guardado</button></div>}
    {!catalogingParam && pendingProductConfirmation() && <div className="plants-warning" role="alert"><p>Hay una publicación de planta sin confirmar.</p><button disabled={creatingPlant} onClick={() => void handleRecoverProduct()}>Comprobar publicación</button></div>}
    {blocker.state === 'blocked' && <div className="plants-warning" role="alertdialog" aria-label="Cambios sin guardar"><strong>{busy.current ? 'Espera a que termine la operación.' : 'Tienes cambios sin guardar.'}</strong><p>{busy.current ? 'Comprobaremos el resultado antes de continuar.' : 'Puedes seguir editando o salir y descartar los cambios de esta ficha.'}</p><button type="button" onClick={() => blocker.reset()}>Seguir aquí</button>{!busy.current && <button type="button" onClick={() => { guard(false); blocker.proceed() }}>Descartar y salir</button>}</div>}
    {data.status === 'loading' && <p role="status">Cargando tus plantas…</p>}
    {data.status === 'error' && <div className="plants-warning" role="alert"><p>{data.error}</p><button onClick={data.refresh}>Reintentar</button></div>}
    {data.status === 'ready' && <>
      {data.inventoryError && <div className="plants-warning" role="alert"><p>{data.inventoryError}</p><button onClick={data.refresh}>Actualizar existencias</button></div>}
      {catalogingParam ? (
        <CatalogingWizard
          draftId={catalogingParam}
          pendingDrafts={pendingDrafts}
          categories={data.categories}
          products={data.products}
          onCompleted={() => {
            void Promise.all([data.refresh(), refreshCataloging()])
          }}
          onNext={(nextId) => {
            const nextP = new URLSearchParams(params)
            nextP.set('cataloging', nextId)
            setParams(nextP)
          }}
          onClose={() => {
            const nextP = new URLSearchParams(params)
            nextP.delete('cataloging')
            setParams(nextP)
            void refreshCataloging()
          }}
          guard={guard}
        />
      ) : selected ? (
        !product ? (
          <div role="alert"><p>No encontramos esta planta en tu catálogo autorizado.</p><button onClick={back}>Volver a Plantas</button></div>
        ) : (
          data.preparations[product.id] && (countView ? <PlantCount key={`count-${product.id}`} product={product} branchName={branchName} canRecord={permissions.canRecordCount} guard={guard}
            onBack={() => open(product.id)} onSubmitted={() => { setNotice('Conteo enviado. Quedó pendiente de aprobación; las existencias no cambiaron.'); open(product.id) }} />
            : <PlantDetail key={product.id} product={product} preparation={data.preparations[product.id]} categories={data.categories}
              balance={data.balances.find(b => b.productId === product.id)} branchName={branchName} canPrice={canPrice} permissions={permissions} guard={guard}
              onSaved={data.update} onStockUpdated={data.updateStock} onNext={next} onBack={back} onCount={() => { setNotice(''); open(product.id, 'count') }} onInventory={onInventory ? () => onInventory(product.id) : undefined}
              onReception={onReception} />)
        )
      ) : (
        <>
          {pendingDraftCount > 0 ? (
            <div className="plants-pending-wizard-card">
              <div className="pending-wizard-info">
                <span className="pending-wizard-badge" aria-hidden="true">🌱</span>
                <div>
                  <h4>Completar plantas pendientes ({pendingDraftCount})</h4>
                  <p>Hay {pendingDraftCount === 1 ? '1 planta lista' : `${pendingDraftCount} plantas listas`} para verificar nombre, fotografía, precio o inventario inicial.</p>
                </div>
              </div>
              <div className="pending-wizard-actions">
                <button
                  type="button"
                  className="plants-primary pending-wizard-btn"
                  onClick={() => {
                    const first = pendingDrafts[0]
                    if (first) {
                      const nextP = new URLSearchParams(params)
                      nextP.set('cataloging', first.id)
                      setParams(nextP)
                    } else if (pendingProducts[0]) open(pendingProducts[0].id)
                  }}
                >
                  Completar plantas pendientes ({pendingDraftCount}) →
                </button>
                <button
                  type="button"
                  className="plants-btn-secondary"
                  disabled={creatingPlant}
                  onClick={() => void handleCreateNewPlant()}
                >
                  {creatingPlant ? 'Creando…' : '+ Nueva planta'}
                </button>
              </div>
            </div>
          ) : (
            <div className="plants-add-new-bar">
              <button
                type="button"
                className="plants-primary plants-add-new-btn"
                disabled={creatingPlant}
                onClick={() => void handleCreateNewPlant()}
              >
                {creatingPlant ? 'Creando…' : '+ Nueva planta'}
              </button>
            </div>
          )}

          <div className="plants-filters"><label className="plants-search"><span>Buscar una planta</span><input type="search" placeholder="Nombre o código…" value={filters.search} onChange={e => filter('q', e.target.value)} /></label>
            <label><span>Categoría</span><select aria-label="Categoría" value={filters.category} onChange={e => filter('category', e.target.value)}><option value="">Todas las plantas</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}{!c.isActive ? ' · Inactiva' : ''}</option>)}</select></label>
            <div className="plants-filter-chips"><button type="button" aria-pressed={filters.pending} onClick={() => filter('pending', filters.pending ? '' : '1')}>Por completar</button>{canInventory && <button type="button" disabled={!!data.inventoryError} aria-pressed={filters.low} onClick={() => filter('low', filters.low ? '' : '1')}>Existencias bajas</button>}</div></div>
          <div className="plants-list-heading"><p><strong>{visible.length}</strong> plantas en esta selección</p><button className="plants-text-button" onClick={data.refresh}>Actualizar</button></div>
          {visible.length === 0 && <div className="plants-empty"><h4>No hay plantas en esta selección</h4><p>Prueba otro nombre o ajusta los filtros.</p></div>}
          <div className="plants-grid">{visible.map(p => {
            const prep = data.preparations[p.id], balance = data.balances.find(b => b.productId === p.id)
            return <article className={`plant-card ${!prep.ready && prep.commercialState !== 'DISABLED' ? 'plant-card-pending' : ''}`} key={p.id}><button type="button" className="plant-card-open" onClick={() => open(p.id)} aria-label={`Abrir ficha de ${p.commonName}`}>
              <PlantPhoto imageId={p.image?.id} name={p.commonName} /><div className="plant-card-content"><span className={`plant-state ${prep.ready ? 'ready' : prep.commercialState === 'DISABLED' ? 'inactive' : ''}`}>{stateLabels[prep.commercialState]}</span><h4>{p.commonName}</h4><p className="plant-card-code">{p.internalCode} · {p.categoryName}</p><div className="plant-card-values"><strong>{prep.priceConfirmed ? money(p.priceCents) : 'Precio pendiente'}</strong><span>{balance ? `${balance.totalQuantity} ${p.unit}` : 'Existencia no consultada'}</span></div><span className="plant-card-link">Abrir ficha <span aria-hidden="true">↗</span></span></div>
            </button></article>
          })}</div>

          <details className="plants-advanced" open={toolsOpen} onToggle={e => setToolsOpen(e.currentTarget.open)}><summary>Herramientas del catálogo</summary>{toolsOpen && <><p>Creación de plantas, categorías, etiquetas en lote y opciones avanzadas existentes.</p><AdminCatalog active onContinueToInventory={onInventory} /></>}</details>
        </>
      )}
    </>}
  </section>
}

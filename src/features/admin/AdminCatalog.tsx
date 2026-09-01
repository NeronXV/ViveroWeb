import { useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { hasCapability } from '../access/access-helpers'
import { useAdminCatalog } from './useAdminCatalog'
import { centsToPesos, pesosToCents } from './admin-catalog-parser'
import type { AdminProduct, AdminCategory, ProductUnit } from './admin-catalog-types'
import { ProductQrLabelDialog } from './ProductQrLabelDialog'
import { isValidLabelInternalCode } from './product-qr-label'

function Feedback({
  status,
  error,
  retry,
}: {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  retry: () => void
}) {
  if (status === 'loading' || status === 'idle') {
    return (
      <div className="cashier-status-container" role="status">
        <div className="loading-spinner" />
        <p>Cargando catálogo administrativo…</p>
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="admin-directory-error" role="alert">
        <p className="error-copy">{error}</p>
        <button type="button" className="retry-btn-secondary" onClick={retry}>
          Reintentar
        </button>
      </div>
    )
  }
  return null
}

export function AdminCatalog({
  active,
  onContinueToInventory,
}: {
  active: boolean
  onContinueToInventory?: (productId?: string) => void
}) {
  const { accessContext } = useAuth()
  const canManageProducts = hasCapability(accessContext, 'MANAGE_PRODUCTS')
  const canManagePrices = hasCapability(accessContext, 'MANAGE_PRICES')

  const catalog = useAdminCatalog(active)

  // Modals
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)

  // Editing targets
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null)
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null)
  const [labelProduct, setLabelProduct] = useState<AdminProduct | null>(null)

  // Image Upload Fields
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [savedDialogData, setSavedDialogData] = useState<{
    productId: string
    productName: string
    imageError: string | null
  } | null>(null)

  // Product Form Fields
  const [internalCode, setInternalCode] = useState('')
  const [barcode, setBarcode] = useState('')
  const [commonName, setCommonName] = useState('')
  const [scientificName, setScientificName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [priceStr, setPriceStr] = useState('')
  const [wholesalePriceStr, setWholesalePriceStr] = useState('')
  const [unit, setUnit] = useState<ProductUnit>('pieza')
  const [minimumStock, setMinimumStock] = useState('0')
  const [wateringAdvice, setWateringAdvice] = useState('')
  const [lightType, setLightType] = useState('')
  const [recommendedClimate, setRecommendedClimate] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Category Form Fields
  const [categoryName, setCategoryName] = useState('')
  const [categoryDescription, setCategoryDescription] = useState('')
  const [categoryIsActive, setCategoryIsActive] = useState(true)

  // Error/Success state inside modals
  const [modalError, setModalError] = useState<string | null>(null)
  const [savedProductName, setSavedProductName] = useState<string | null>(null)

  // Quick category creation inside product modal
  const [isQuickCategoryOpen, setIsQuickCategoryOpen] = useState(false)
  const [quickCategoryName, setQuickCategoryName] = useState('')

  // Handle Image File Selection
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const MAX_SIZE = 5 * 1024 * 1024 // 5 MiB
    if (file.size > MAX_SIZE) {
      setModalError('La fotografía supera el límite máximo de 5 MiB.')
      return
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/jpg']
    if (!allowed.includes(file.type.toLowerCase())) {
      setModalError('Formato de imagen no compatible. Usa JPEG, PNG, WEBP o AVIF.')
      return
    }

    setModalError(null)
    setSelectedImageFile(file)
    setImagePreviewUrl(URL.createObjectURL(file))
    if (!activeImageId) {
      setActiveImageId(crypto.randomUUID())
    }
  }

  const handleRemoveImage = () => {
    setSelectedImageFile(null)
    setImagePreviewUrl(null)
    setActiveImageId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // Open product modal for creation
  const handleCreateProductOpen = () => {
    if (!canManagePrices) return
    setEditingProduct(null)
    setInternalCode('')
    setBarcode('')
    setCommonName('')
    setScientificName('')
    setDescription('')
    setCategoryId(catalog.categories[0]?.id || '')
    setPriceStr('')
    setWholesalePriceStr('')
    setUnit('pieza')
    setMinimumStock('0')
    setWateringAdvice('')
    setLightType('')
    setRecommendedClimate('')
    setIsActive(true)
    setModalError(null)
    setSavedProductName(null)
    setIsQuickCategoryOpen(false)
    setQuickCategoryName('')
    setSelectedImageFile(null)
    setImagePreviewUrl(null)
    setActiveImageId(crypto.randomUUID())
    setIsProductModalOpen(true)
  }

  // Handle quick category creation
  const handleQuickCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!quickCategoryName.trim() || quickCategoryName.trim().length < 2) {
      setModalError('El nombre de la nueva categoría debe tener al menos 2 caracteres.')
      return
    }

    try {
      const created = await catalog.upsertCategory({
        name: quickCategoryName.trim(),
        description: null,
        isActive: true,
      })
      setCategoryId(created.id)
      setQuickCategoryName('')
      setIsQuickCategoryOpen(false)
      setModalError(null)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error al crear la categoría rápida.')
    }
  }

  // Open product modal for editing
  const handleEditProductOpen = (product: AdminProduct) => {
    setEditingProduct(product)
    setInternalCode(product.internalCode)
    setBarcode(product.barcode || '')
    setCommonName(product.commonName)
    setScientificName(product.scientificName || '')
    setDescription(product.description || '')
    setCategoryId(product.categoryId)
    setPriceStr(centsToPesos(product.priceCents))
    setWholesalePriceStr(product.wholesalePriceCents !== null ? centsToPesos(product.wholesalePriceCents) : '')
    setUnit(product.unit)
    setMinimumStock(String(product.minimumStock))
    setWateringAdvice(product.wateringAdvice || '')
    setLightType(product.lightType || '')
    setRecommendedClimate(product.recommendedClimate || '')
    setIsActive(product.isActive)
    setModalError(null)
    setSelectedImageFile(null)
    setImagePreviewUrl(null)
    setActiveImageId(crypto.randomUUID())
    setIsProductModalOpen(true)
  }

  // Handle product form submission
  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError(null)

    // Validations
    if (!internalCode.trim() || internalCode.trim().length < 2 || internalCode.trim().length > 40) {
      setModalError('El código interno debe tener entre 2 y 40 caracteres.')
      return
    }
    if (barcode.trim() && (barcode.trim().length < 4 || barcode.trim().length > 128)) {
      setModalError('El código de barras debe tener entre 4 y 128 caracteres si se especifica.')
      return
    }
    if (!commonName.trim() || commonName.trim().length < 2 || commonName.trim().length > 160) {
      setModalError('El nombre común debe tener entre 2 y 160 caracteres.')
      return
    }
    if (!categoryId) {
      setModalError('Debes seleccionar una categoría.')
      return
    }

    try {
      let finalPriceCents = 0
      let finalWholesalePriceCents: number | null = null

      if (canManagePrices) {
        finalPriceCents = pesosToCents(priceStr)
        finalWholesalePriceCents = wholesalePriceStr.trim() !== '' ? pesosToCents(wholesalePriceStr) : null
      } else {
        if (!editingProduct) {
          throw new Error('Se requiere el permiso de precios para crear nuevos productos.')
        }
        finalPriceCents = editingProduct.priceCents
        finalWholesalePriceCents = editingProduct.wholesalePriceCents
      }

      const stockNum = parseFloat(minimumStock)
      if (isNaN(stockNum) || stockNum < 0) {
        throw new Error('La existencia mínima debe ser un número mayor o igual a cero.')
      }

      const saved = await catalog.upsertProduct({
        id: editingProduct?.id,
        internalCode: internalCode.toUpperCase(),
        barcode: barcode.trim() || null,
        commonName: commonName.trim(),
        scientificName: scientificName.trim() || null,
        description: description.trim() || null,
        categoryId,
        priceCents: finalPriceCents,
        wholesalePriceCents: finalWholesalePriceCents,
        unit,
        minimumStock: stockNum,
        wateringAdvice: wateringAdvice.trim() || null,
        lightType: lightType.trim() || null,
        recommendedClimate: recommendedClimate.trim() || null,
        isActive,
      })

      // Subir imagen si se seleccionó alguna
      let imageUploadErrMsg: string | null = null
      if (selectedImageFile) {
        try {
          await catalog.uploadProductImage(saved.id, selectedImageFile, activeImageId || undefined)
        } catch (imgErr) {
          imageUploadErrMsg = imgErr instanceof Error ? imgErr.message : 'No fue posible subir la imagen.'
        }
      }

      setIsProductModalOpen(false)
      setSavedProductName(commonName.trim())
      setSavedDialogData({
        productId: saved.id,
        productName: saved.commonName,
        imageError: imageUploadErrMsg,
      })
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error al guardar el producto.')
    }
  }

  // Open category list/creation modal
  const handleCategoryOpen = () => {
    setEditingCategory(null)
    setCategoryName('')
    setCategoryDescription('')
    setCategoryIsActive(true)
    setModalError(null)
    setIsCategoryModalOpen(true)
  }

  // Edit category trigger inside category modal
  const handleEditCategory = (cat: AdminCategory) => {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setCategoryDescription(cat.description || '')
    setCategoryIsActive(cat.isActive)
    setModalError(null)
  }

  // Handle category form submission
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalError(null)

    if (!categoryName.trim() || categoryName.trim().length < 2 || categoryName.trim().length > 100) {
      setModalError('El nombre de la categoría debe tener entre 2 y 100 caracteres.')
      return
    }

    try {
      await catalog.upsertCategory({
        id: editingCategory?.id,
        name: categoryName.trim(),
        description: categoryDescription.trim() || null,
        isActive: categoryIsActive,
      })

      // Reset Form
      setEditingCategory(null)
      setCategoryName('')
      setCategoryDescription('')
      setCategoryIsActive(true)
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'Error al guardar la categoría.')
    }
  }

  return (
    <section className="db-tab-content active" aria-busy={catalog.status === 'loading' || catalog.isMutating}>
      <div className="section-header-row">
        <div>
          <h3>Catálogo de Productos</h3>
          <p className="real-data-copy">Administración en tiempo real de productos y categorías en la base de datos.</p>
        </div>
        <div className="admin-actions-cell" style={{ gap: '0.5rem' }}>
          {canManageProducts && (
            <button type="button" className="catalog-action secondary" onClick={handleCategoryOpen}>
              Categorías
            </button>
          )}
          {canManageProducts && (
            <button
              type="button"
              className="catalog-action"
              onClick={handleCreateProductOpen}
              disabled={!canManagePrices}
              title={!canManagePrices ? 'Requiere permiso de precios para crear nuevos productos' : undefined}
            >
              + Nuevo Producto
            </button>
          )}
        </div>
      </div>

      {savedProductName && (
        <div className="form-notice">
          <span role="status">{savedProductName} quedó guardado en el catálogo.</span>
          {onContinueToInventory && (
            <button type="button" className="retry-btn-secondary" onClick={() => onContinueToInventory()}>
              Registrar ingreso al inventario
            </button>
          )}
        </div>
      )}

      {/* Filters card */}
      <div className="dashboard-filters-card">
        <div className="filters-grid">
          <div className="form-group">
            <label htmlFor="prod-search">Búsqueda</label>
            <input
              id="prod-search"
              type="text"
              placeholder="Buscar por nombre o código..."
              value={catalog.search}
              onChange={(e) => catalog.setSearch(e.target.value)}
              disabled={catalog.status === 'loading'}
            />
          </div>
          <div className="form-group">
            <label htmlFor="prod-category-filter">Categoría</label>
            <select
              id="prod-category-filter"
              value={catalog.categoryId || ''}
              onChange={(e) => catalog.setCategoryId(e.target.value || null)}
              disabled={catalog.status === 'loading'}
            >
              <option value="">Todas las categorías</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isActive ? '' : '(Inactiva)'}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="prod-status-filter">Estado</label>
            <select
              id="prod-status-filter"
              value={catalog.productStatus}
              onChange={(e) => catalog.setProductStatus(e.target.value as 'all' | 'active' | 'inactive')}
              disabled={catalog.status === 'loading'}
            >
              <option value="all">Todos los estados</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
            </select>
          </div>
        </div>
      </div>

      {/* Category Quick Chips Filter */}
      {catalog.categories.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1.25rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginRight: '0.25rem' }}>
            🏷️ Filtrar:
          </span>
          <button
            type="button"
            className={`botanical-chip ${catalog.categoryId === null ? 'active' : ''}`}
            onClick={() => catalog.setCategoryId(null)}
          >
            Todas ({catalog.products.length})
          </button>
          {catalog.categories.map((cat) => {
            const count = catalog.products.filter((p) => p.categoryId === cat.id).length
            return (
              <button
                key={cat.id}
                type="button"
                className={`botanical-chip ${catalog.categoryId === cat.id ? 'active' : ''}`}
                onClick={() => catalog.setCategoryId(catalog.categoryId === cat.id ? null : cat.id)}
              >
                {cat.name} {count > 0 ? `(${count})` : ''}
              </button>
            )
          })}
        </div>
      )}

      <Feedback status={catalog.status} error={catalog.error} retry={catalog.retry} />

      {catalog.status === 'ready' && catalog.products.length === 0 && (
        <p className="no-records-copy" role="status">No se encontraron productos que coincidan con la búsqueda.</p>
      )}

      {catalog.status === 'ready' && catalog.products.length > 0 && (
        <div className="table-responsive">
          <table className="db-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Nombre Común</th>
                <th>Nombre Científico</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Mayoreo</th>
                <th>Stock Min.</th>
                <th>Estado</th>
                {canManageProducts && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {catalog.products.map((product) => (
                <tr key={product.id}>
                  <td style={{ fontWeight: 'bold' }}>{product.internalCode}</td>
                  <td>
                    <div>{product.commonName}</div>
                    {product.barcode && (
                      <small style={{ color: 'var(--text-secondary)', display: 'block', fontSize: '0.75rem' }}>
                        CB: {product.barcode}
                      </small>
                    )}
                  </td>
                  <td>{product.scientificName ? <em>{product.scientificName}</em> : <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                  <td>{product.categoryName || 'Cargando...'}</td>
                  <td>${centsToPesos(product.priceCents)}</td>
                  <td>{product.wholesalePriceCents !== null ? `$${centsToPesos(product.wholesalePriceCents)}` : <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                  <td>{product.minimumStock} <small style={{ color: 'var(--text-secondary)' }}>{product.unit}</small></td>
                  <td>{product.isActive ? '🟢 Activo' : '🔴 Inactivo'}</td>
                  {canManageProducts && (
                    <td>
                      <div className="admin-actions-cell">
                        <button
                          type="button"
                          className="admin-action-btn secondary"
                          onClick={() => handleEditProductOpen(product)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="admin-action-btn primary"
                          onClick={() => setLabelProduct(product)}
                          disabled={!isValidLabelInternalCode(product.internalCode)}
                          title={!isValidLabelInternalCode(product.internalCode) ? 'El código interno no es válido para una etiqueta QR' : undefined}
                        >
                          Generar etiquetas QR
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {labelProduct && <ProductQrLabelDialog product={labelProduct} onClose={() => setLabelProduct(null)} />}

      {/* Modal: Create/Edit Product */}
      {isProductModalOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="product-modal-title">
          <div className="admin-modal-content" style={{ maxWidth: '650px' }}>
            <div className="admin-modal-header">
              <h3 id="product-modal-title">
                {editingProduct ? `Editar Producto: ${editingProduct.commonName}` : 'Crear Producto'}
              </h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsProductModalOpen(false)}>
                &times;
              </button>
            </div>

            {modalError && <div className="admin-dialog-error" role="alert">{modalError}</div>}

            <form onSubmit={handleProductSubmit}>
              {/* Sección 1: Identificación y Categoría */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>🌿</span>
                  <h4>Identificación y Categoría</h4>
                </div>
                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-code">Código Interno *</label>
                    <input
                      id="p-code"
                      type="text"
                      required
                      maxLength={40}
                      value={internalCode}
                      onChange={(e) => setInternalCode(e.target.value.toUpperCase())}
                      placeholder="Ej. SUC-ALOE-01"
                      disabled={catalog.isMutating}
                    />
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-barcode">Código de Barras (opcional)</label>
                    <input
                      id="p-barcode"
                      type="text"
                      maxLength={128}
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Ej. 7501234567890"
                      disabled={catalog.isMutating}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-common">Nombre Común *</label>
                    <input
                      id="p-common"
                      type="text"
                      required
                      maxLength={160}
                      value={commonName}
                      onChange={(e) => setCommonName(e.target.value)}
                      placeholder="Ej. Monstera Deliciosa"
                      disabled={catalog.isMutating}
                    />
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-scientific">Nombre Científico</label>
                    <input
                      id="p-scientific"
                      type="text"
                      maxLength={160}
                      value={scientificName}
                      onChange={(e) => setScientificName(e.target.value)}
                      placeholder="Ej. Monstera deliciosa Liebm."
                      disabled={catalog.isMutating}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <label htmlFor="p-category" style={{ margin: 0 }}>Categoría *</label>
                      <button
                        type="button"
                        className="mini-action-btn"
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
                        onClick={() => setIsQuickCategoryOpen(!isQuickCategoryOpen)}
                      >
                        {isQuickCategoryOpen ? '✕ Cerrar' : '+ Nueva categoría'}
                      </button>
                    </div>

                    {isQuickCategoryOpen && (
                      <div
                        style={{
                          background: 'var(--bg-color)',
                          padding: '0.6rem',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px dashed var(--primary-color)',
                          marginBottom: '0.5rem',
                          display: 'flex',
                          gap: '0.4rem',
                          alignItems: 'center',
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Nombre de nueva categoría..."
                          value={quickCategoryName}
                          onChange={(e) => setQuickCategoryName(e.target.value)}
                          style={{ flex: 1, padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          className="mini-action-btn primary"
                          onClick={handleQuickCategorySubmit}
                          disabled={catalog.isMutating || !quickCategoryName.trim()}
                        >
                          Crear y asignar
                        </button>
                      </div>
                    )}

                    <select
                      id="p-category"
                      required
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      disabled={catalog.isMutating}
                    >
                      <option value="" disabled>Selecciona una categoría</option>
                      {catalog.categories.map((c) => (
                        <option value={c.id} key={c.id}>
                          {c.name} {c.isActive ? '' : '(Inactiva)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-unit">Unidad de Venta *</label>
                    <select
                      id="p-unit"
                      required
                      value={unit}
                      onChange={(e) => setUnit(e.target.value as ProductUnit)}
                      disabled={catalog.isMutating}
                    >
                      <option value="pieza">Pieza</option>
                      <option value="maceta">Maceta</option>
                      <option value="charola">Charola</option>
                      <option value="bolsa">Bolsa</option>
                      <option value="kg">Kilogramo (kg)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección 2: Fotografía del Producto */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>📸</span>
                  <h4>Fotografía del Producto</h4>
                </div>
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: 'var(--radius-md)',
                      border: '2px dashed var(--surface-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--bg-color)',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {imagePreviewUrl ? (
                      <img
                        src={imagePreviewUrl}
                        alt="Vista previa"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '0.25rem' }}>
                        Sin foto
                      </span>
                    )}
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      style={{ display: 'none' }}
                      onChange={handleImageFileChange}
                      disabled={catalog.isMutating}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="mini-action-btn primary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={catalog.isMutating}
                      >
                        📷 {imagePreviewUrl ? 'Cambiar foto' : 'Elegir / Tomar foto'}
                      </button>
                      {imagePreviewUrl && (
                        <button
                          type="button"
                          className="mini-action-btn"
                          onClick={handleRemoveImage}
                          disabled={catalog.isMutating}
                        >
                          🗑️ Quitar
                        </button>
                      )}
                    </div>
                    <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      Formatos: JPEG, PNG, WEBP, AVIF (Máximo 5 MiB).
                    </small>
                  </div>
                </div>
              </div>

              {/* Sección 3: Guía de Cuidados Botánicos */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>☀️</span>
                  <h4>Ficha de Cuidados Botánicos</h4>
                </div>
                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-light">Tipo de Luz</label>
                    <input
                      id="p-light"
                      type="text"
                      value={lightType}
                      onChange={(e) => setLightType(e.target.value)}
                      placeholder="Ej. Sol directo / Semisombra"
                      disabled={catalog.isMutating}
                    />
                    <div className="botanical-chips-grid">
                      {['☀️ Sol directo', '⛅ Semisombra', '☁️ Sombra', '💡 Luz indirecta'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          className={`botanical-chip ${lightType === chip ? 'active' : ''}`}
                          onClick={() => setLightType(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-climate">Clima Recomendado</label>
                    <input
                      id="p-climate"
                      type="text"
                      value={recommendedClimate}
                      onChange={(e) => setRecommendedClimate(e.target.value)}
                      placeholder="Ej. Cálido / Templado"
                      disabled={catalog.isMutating}
                    />
                    <div className="botanical-chips-grid">
                      {['🌴 Cálido', '🌲 Templado', '🌵 Seco / Árido', '🌧️ Húmedo'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          className={`botanical-chip ${recommendedClimate === chip ? 'active' : ''}`}
                          onClick={() => setRecommendedClimate(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="admin-form-group form-group" style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="p-watering">Frecuencia de Riego</label>
                  <input
                    id="p-watering"
                    type="text"
                    value={wateringAdvice}
                    onChange={(e) => setWateringAdvice(e.target.value)}
                    placeholder="Ej. Riego moderado 1-2 veces por semana"
                    disabled={catalog.isMutating}
                  />
                  <div className="botanical-chips-grid">
                    {['💧 Riego frecuente (2-3 veces/sem)', '💧 Riego moderado (1 vez/sem)', '🌵 Riego escaso (cada 15 días)'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        className={`botanical-chip ${wateringAdvice === chip ? 'active' : ''}`}
                        onClick={() => setWateringAdvice(chip)}
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="admin-form-group form-group" style={{ marginTop: '0.75rem' }}>
                  <label htmlFor="p-description">Descripción o Recomendaciones</label>
                  <textarea
                    id="p-description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Detalles botánicos, tamaño estimado, cuidados especiales..."
                    disabled={catalog.isMutating}
                  />
                </div>
              </div>

              {/* Sección 4: Precios y Stock Mínimo */}
              <div className="botanical-section-card">
                <div className="botanical-section-header">
                  <span>💲</span>
                  <h4>Precios y Parámetros de Stock</h4>
                </div>
                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-price">Precio Público ($ MXN) *</label>
                    <input
                      id="p-price"
                      type="text"
                      required
                      placeholder="Ej. 150.00"
                      value={priceStr}
                      onChange={(e) => setPriceStr(e.target.value)}
                      disabled={catalog.isMutating || !canManagePrices}
                    />
                    {!canManagePrices && (
                      <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                        Requiere capacidad MANAGE_PRICES.
                      </small>
                    )}
                  </div>
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-wholesale">Precio Mayoreo ($ MXN)</label>
                    <input
                      id="p-wholesale"
                      type="text"
                      placeholder="Opcional (Ej. 120.00)"
                      value={wholesalePriceStr}
                      onChange={(e) => setWholesalePriceStr(e.target.value)}
                      disabled={catalog.isMutating || !canManagePrices}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="admin-form-group form-group">
                    <label htmlFor="p-min-stock">Existencia Mínima de Alerta *</label>
                    <input
                      id="p-min-stock"
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={minimumStock}
                      onChange={(e) => setMinimumStock(e.target.value)}
                      disabled={catalog.isMutating}
                    />
                    <small style={{ color: 'var(--text-secondary)', display: 'block', marginTop: '0.2rem' }}>
                      Alerta visual cuando el stock sea menor o igual a esta cantidad.
                    </small>
                  </div>
                  <div className="admin-form-group form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.8rem' }}>
                    <input
                      id="p-active"
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      disabled={catalog.isMutating}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    <label htmlFor="p-active" style={{ cursor: 'pointer', userSelect: 'none' }}>
                      Producto activo para venta
                    </label>
                  </div>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="retry-btn-secondary"
                  onClick={() => setIsProductModalOpen(false)}
                  disabled={catalog.isMutating}
                >
                  Cancelar
                </button>
                <button type="submit" className="catalog-action" disabled={catalog.isMutating}>
                  {catalog.isMutating ? 'Guardando…' : (editingProduct ? 'Guardar Cambios' : 'Registrar Planta')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmación de Producto Guardado */}
      {savedDialogData && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="saved-dialog-title">
          <div className="admin-modal-content" style={{ maxWidth: '500px' }}>
            <div className="admin-modal-header">
              <h3 id="saved-dialog-title">🌿 Producto Guardado</h3>
              <button type="button" className="admin-modal-close" onClick={() => setSavedDialogData(null)}>
                &times;
              </button>
            </div>

            <div style={{ padding: '1rem 0' }}>
              <p style={{ fontSize: '1.05rem', lineHeight: 1.5, margin: 0 }}>
                <strong>{savedDialogData.productName}</strong> se guardó correctamente en el catálogo{accessContext?.branch?.name ? ` para ${accessContext.branch.name}` : ''}.
              </p>
              <p style={{ marginTop: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                ¿Deseas registrar su ingreso al inventario ahora mismo?
              </p>

              {savedDialogData.imageError && (
                <div className="admin-dialog-error" style={{ marginTop: '1rem' }}>
                  <span>⚠️</span> {savedDialogData.imageError}
                  {selectedImageFile && (
                    <button
                      type="button"
                      className="mini-action-btn"
                      style={{ marginTop: '0.5rem', display: 'block' }}
                      onClick={async () => {
                        try {
                          await catalog.uploadProductImage(savedDialogData.productId, selectedImageFile, activeImageId || undefined)
                          setSavedDialogData((prev) => prev ? { ...prev, imageError: null } : null)
                        } catch (retryErr) {
                          setSavedDialogData((prev) => prev ? { ...prev, imageError: retryErr instanceof Error ? retryErr.message : 'Error al reintentar subida.' } : null)
                        }
                      }}
                      disabled={catalog.isMutating}
                    >
                      ↻ Reintentar subida de foto
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="admin-modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="retry-btn-secondary"
                onClick={() => setSavedDialogData(null)}
              >
                Quedarme aquí
              </button>
              <button
                type="button"
                className="catalog-action"
                onClick={() => {
                  const pId = savedDialogData.productId
                  setSavedDialogData(null)
                  onContinueToInventory?.(pId)
                }}
              >
                📥 Registrar ingreso al inventario
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manage Categories */}
      {isCategoryModalOpen && (
        <div className="admin-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
          <div className="admin-modal-content" style={{ maxWidth: '600px' }}>
            <div className="admin-modal-header">
              <h3 id="category-modal-title">Administrar Categorías</h3>
              <button type="button" className="admin-modal-close" onClick={() => setIsCategoryModalOpen(false)}>
                &times;
              </button>
            </div>

            {modalError && <div className="admin-dialog-error" role="alert">{modalError}</div>}

            {/* Category Form */}
            <form onSubmit={handleCategorySubmit} style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <h4>{editingCategory ? `Editar Categoría: ${editingCategory.name}` : 'Nueva Categoría'}</h4>
              <div className="form-row">
                <div className="admin-form-group form-group" style={{ flex: 2 }}>
                  <label htmlFor="c-name">Nombre *</label>
                  <input
                    id="c-name"
                    type="text"
                    required
                    maxLength={100}
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                    placeholder="Ej. Arbustos"
                    disabled={catalog.isMutating}
                  />
                </div>
                <div className="admin-form-group form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.8rem', flex: 1 }}>
                  <input
                    id="c-active"
                    type="checkbox"
                    checked={categoryIsActive}
                    onChange={(e) => setCategoryIsActive(e.target.checked)}
                    disabled={catalog.isMutating}
                    style={{ width: 'auto', margin: 0 }}
                  />
                  <label htmlFor="c-active" style={{ cursor: 'pointer', userSelect: 'none' }}>
                    Activa
                  </label>
                </div>
              </div>
              <div className="admin-form-group form-group">
                <label htmlFor="c-desc">Descripción</label>
                <textarea
                  id="c-desc"
                  rows={1}
                  value={categoryDescription}
                  onChange={(e) => setCategoryDescription(e.target.value)}
                  placeholder="Descripción de la categoría..."
                  disabled={catalog.isMutating}
                />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                {editingCategory && (
                  <button
                    type="button"
                    className="retry-btn-secondary"
                    onClick={() => {
                      setEditingCategory(null)
                      setCategoryName('')
                      setCategoryDescription('')
                      setCategoryIsActive(true)
                    }}
                    disabled={catalog.isMutating}
                  >
                    Descartar edición
                  </button>
                )}
                <button type="submit" className="catalog-action" disabled={catalog.isMutating}>
                  {catalog.isMutating ? 'Guardando…' : editingCategory ? 'Actualizar' : 'Agregar'}
                </button>
              </div>
            </form>

            {/* Categories List */}
            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              <table className="db-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Descripción</th>
                    <th>Estado</th>
                    <th>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.categories.map((c) => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 'bold' }}>{c.name}</td>
                      <td>{c.description || <span style={{ color: 'var(--text-secondary)' }}>-</span>}</td>
                      <td>{c.isActive ? '🟢 Activa' : '🔴 Inactiva'}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-action-btn secondary"
                          onClick={() => handleEditCategory(c)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

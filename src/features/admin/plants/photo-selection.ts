import { BackendHttpError } from '../../../lib/backend-http'

export function selectedPhotoError(file: File): string | null {
  if (!file.size) return 'La fotografía está vacía. Elige otra imagen.'
  if (file.size > 5 * 1024 * 1024) return 'La fotografía supera 5 MiB. Elige una imagen más pequeña.'
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'No se reconoció un formato compatible. Elige una fotografía JPEG, PNG o WEBP.'
  return null
}

export function photoSaveError(error: unknown): string {
  if (error instanceof BackendHttpError) {
    if (error.status === 401 || error.status === 403) return error.message
    if (error.code === 'CATALOGING_EDIT_CONFLICT') return 'La ficha cambió. Consulta la fotografía guardada antes de reintentar; tu selección se conserva.'
    if (['INVALID_IMAGE', 'IMAGE_TYPE_REQUIRED'].includes(error.code)) return 'El servidor rechazó la imagen. Elige una fotografía JPEG, PNG o WEBP válida.'
    if (error.code === 'BODY_TOO_LARGE') return 'El servidor rechazó el tamaño de la fotografía. Elige una imagen de hasta 5 MiB.'
  }
  return 'No se confirmó el guardado de la fotografía. Tu selección se conserva; consulta la fotografía guardada antes de reintentar.'
}

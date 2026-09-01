/**
 * Reproduce el sonido de confirmación de cobro en caja.
 * Manejo seguro para evitar bloqueos por políticas de autoplay o entornos sin Audio.
 */
export function playCashierSuccessSound(soundPath: string = '/sounds/cash-register.mp3'): void {
  const AudioConstructor = typeof window !== 'undefined' && typeof window.Audio !== 'undefined'
    ? window.Audio
    : (typeof Audio !== 'undefined' ? Audio : null)

  if (!AudioConstructor) {
    return
  }

  try {
    const audio = new AudioConstructor(soundPath)
    audio.volume = 0.75
    const playPromise = audio.play()
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch((error: unknown) => {
        console.warn('No se pudo reproducir el sonido de confirmación de cobro:', error)
      })
    }
  } catch (error) {
    console.warn('Error al inicializar el audio de caja:', error)
  }
}

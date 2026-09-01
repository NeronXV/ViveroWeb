import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { playCashierSuccessSound } from './cashier-sound'

describe('cashier-sound', () => {
  const originalAudio = globalThis.Audio

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.Audio = originalAudio
  })

  it('no lanza error cuando Audio no esta definido', () => {
    // Simular entorno sin soporte de Audio
    Object.defineProperty(globalThis, 'Audio', {
      value: undefined,
      writable: true,
      configurable: true,
    })

    expect(() => playCashierSuccessSound()).not.toThrow()
  })

  it('instancia Audio con la ruta por defecto y ejecuta play', () => {
    const playMock = vi.fn().mockReturnValue(Promise.resolve())
    const audioConstructorMock = vi.fn().mockImplementation(function (this: { play: typeof playMock; volume: number }) {
      this.play = playMock
      this.volume = 1
    })

    Object.defineProperty(globalThis, 'Audio', {
      value: audioConstructorMock,
      writable: true,
      configurable: true,
    })

    playCashierSuccessSound()

    expect(audioConstructorMock).toHaveBeenCalledWith('/sounds/cash-register.mp3')
    expect(playMock).toHaveBeenCalledTimes(1)
  })

  it('captura el rechazo de play sin lanzar excepcion', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rejection = Promise.reject(new Error('Autoplay blocked'))
    const playMock = vi.fn().mockReturnValue(rejection)

    const audioConstructorMock = vi.fn().mockImplementation(function (this: { play: typeof playMock; volume: number }) {
      this.play = playMock
      this.volume = 1
    })

    Object.defineProperty(globalThis, 'Audio', {
      value: audioConstructorMock,
      writable: true,
      configurable: true,
    })

    playCashierSuccessSound()

    try {
      await rejection
    } catch {
      // Rejection capturado
    }

    expect(playMock).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

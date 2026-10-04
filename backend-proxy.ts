export function backendProxyTarget(value: string | undefined): string {
  const target = value || 'http://127.0.0.1:3001'
  const match = /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::([1-9][0-9]{0,4}))?$/.exec(target)
  if (!match || (match[1] && Number(match[1]) > 65535)) {
    throw new Error('BACKEND_PROXY_TARGET debe ser un origen HTTP local sin credenciales ni ruta')
  }
  return target
}

import { describe, it, expect } from 'vitest'
import { backendProxyTarget } from './backend-proxy'

describe('backend development proxy', () => {
  it('uses explicit loopback origins without credentials', () => {
    expect(backendProxyTarget(undefined)).toBe('http://127.0.0.1:3001')
    expect(backendProxyTarget('http://localhost:33001')).toBe('http://localhost:33001')
    for (const value of ['https://example.invalid', 'http://127.0.0.1:3001/api', 'http://user:pass@localhost:3001', 'http://localhost:3001/', 'http://localhost:3001?x=1', '//localhost:3001']) {
      expect(() => backendProxyTarget(value)).toThrow()
    }
  })
})

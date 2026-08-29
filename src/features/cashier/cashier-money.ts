export class CashierMoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CashierMoneyError'
  }
}

const DECIMAL_PESOS_PATTERN = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/

export function parsePesosToCents(value: string): number {
  const match = DECIMAL_PESOS_PATTERN.exec(value)
  if (!match) {
    throw new CashierMoneyError('Usa pesos con máximo dos decimales, sin comas, signos ni exponentes.')
  }

  const whole = BigInt(match[1])
  const fraction = BigInt((match[2] ?? '').padEnd(2, '0') || '0')
  const cents = whole * 100n + fraction
  if (cents <= 0n || cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new CashierMoneyError('La cantidad está fuera del rango permitido.')
  }
  return Number(cents)
}

export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return '—'
  const whole = Math.floor(cents / 100)
  const fraction = String(cents % 100).padStart(2, '0')
  return `${whole}.${fraction}`
}

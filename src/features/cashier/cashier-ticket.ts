import type { CashierPaymentMethod, CashierPaymentResultResponse, CashierSaleDetailItem } from './cashier-types'

export interface CashierTicketModel {
  folio: string
  saleCreatedAt: string
  paidAt: string
  branchName: string
  createdByLabel: string | null
  items: CashierSaleDetailItem[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  method: CashierPaymentMethod
  amountReceivedCents: number | null
  changeCents: number | null
  reference: string | null
}

export const PAYMENT_METHOD_LABELS: Record<CashierPaymentMethod, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta bancaria',
  TRANSFER: 'Transferencia',
}

export function buildCashierTicket(result: CashierPaymentResultResponse): CashierTicketModel | null {
  if (result.status !== 'SUCCEEDED') return null
  if (!result.sale || !result.items || !result.branch || !result.payment) {
    throw new Error('El resultado exitoso no contiene el comprobante autoritativo completo.')
  }

  const subtotalCents = result.items.reduce((total, item) => total + item.lineTotalCents, 0)
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < result.sale.totalCents) {
    throw new Error('Las partidas autoritativas no son coherentes con el total pagado.')
  }

  return {
    folio: result.sale.folio,
    saleCreatedAt: result.sale.createdAt,
    paidAt: result.payment.createdAt,
    branchName: result.branch.name,
    createdByLabel: result.sale.createdByLabel,
    items: result.items.map(({ id, productName, quantity, unitPriceCents, lineTotalCents }) => ({
      id,
      productName,
      quantity,
      unitPriceCents,
      lineTotalCents,
    })),
    subtotalCents,
    discountCents: subtotalCents - result.sale.totalCents,
    totalCents: result.sale.totalCents,
    method: result.payment.method,
    amountReceivedCents: result.payment.amountReceivedCents,
    changeCents: result.payment.changeCents,
    reference: result.payment.reference,
  }
}

export function requestCashierTicketPrint(
  print: () => void,
  body: Pick<HTMLElement, 'classList'>,
): void {
  body.classList.add('print-cashier-ticket')
  try {
    print()
  } finally {
    body.classList.remove('print-cashier-ticket')
  }
}

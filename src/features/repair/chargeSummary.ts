import type { RepairCharge } from '../../types/repair'

export interface ChargeSummaryItem {
  id: string
  label: string
  amount?: number
}

export function buildChargeSummaryItems(charges: RepairCharge[]): ChargeSummaryItem[] {
  return charges.flatMap((charge) => {
    if (charge.kind === 'inspection' && charge.amount === 0) {
      return []
    }

    if (charge.kind === 'shipping' && charge.amount === 0) {
      return [{ id: charge.id, label: '客人自行取回' }]
    }

    return [{ id: charge.id, label: charge.label, amount: charge.amount }]
  })
}

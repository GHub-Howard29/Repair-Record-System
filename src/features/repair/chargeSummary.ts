import type { RepairCharge } from '../../types/repair'

export interface ChargeSummaryItem {
  id: string
  label: string
  amount: number | string
}

export function buildChargeSummaryItems(charges: RepairCharge[]): ChargeSummaryItem[] {
  const parts = charges
    .filter((charge) => charge.kind === 'part')
    .map((charge) => ({ id: charge.id, label: charge.label, amount: charge.amount }))
  const inspection = charges
    .filter((charge) => charge.kind === 'inspection' && charge.amount !== 0)
    .map((charge) => ({ id: charge.id, label: charge.label, amount: charge.amount }))
  const shipping = charges
    .filter((charge) => charge.kind === 'shipping')
    .map((charge) => ({
      id: charge.id,
      label: charge.label,
      amount: charge.amount === 0 ? '客人自行取回' : charge.amount,
    }))

  return [...parts, ...inspection, ...shipping]
}

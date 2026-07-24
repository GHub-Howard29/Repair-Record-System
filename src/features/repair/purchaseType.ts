import type { PurchaseType } from '../../types/repair'

const purchaseTypeLabels: Record<PurchaseType, string> = {
  customer: '客人',
  online: '網購',
  demo: '展示機',
  '': '未選擇',
}

export function getPurchaseTypeLabel(purchaseType: PurchaseType): string {
  return purchaseTypeLabels[purchaseType]
}

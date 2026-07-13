export type PurchaseType = 'customer' | 'online' | 'demo' | ''

export type SyncStatus = 'local' | 'pending' | 'synced' | 'failed'

export interface RepairCharge {
  id: string
  label: string
  amount: number
  kind: 'inspection' | 'shipping' | 'part'
}

export interface RepairAttachment {
  id: string
  label: string
  fileName: string
  size: number
  mimeType: string
  compressed: boolean
  previewUrl?: string
  syncStatus: SyncStatus
  createdAt: string
}

export interface RepairRecord {
  id: string
  receivedDate: string
  returnLocation: string
  customerName: string
  serialNumber: string
  shippedDate: string
  purchaseType: PurchaseType
  repairDate: string
  faultCategory: string
  faultParts: string[]
  repairContent: string
  note: string
  returnedDate: string
  charges: RepairCharge[]
  attachments: RepairAttachment[]
  textSyncStatus: SyncStatus
  createdAt: string
  updatedAt: string
}

export interface RepairFormValues {
  receivedDate: string
  returnLocation: string
  customerName: string
  serialNumber: string
  shippedDate: string
  purchaseType: PurchaseType
  repairDate: string
  faultCategory: string
  faultPartsText: string
  repairContent: string
  note: string
  returnedDate: string
  inspectionFee: number
  shippingFee: number
  partChargeAmounts: Record<string, number>
}

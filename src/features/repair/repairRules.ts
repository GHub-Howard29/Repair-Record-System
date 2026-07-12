import type { RepairCharge, RepairFormValues, RepairRecord } from '../../types/repair'
import { appendWarrantyNote, isUnderWarranty } from '../warranty/warranty'

const baseCharges: RepairCharge[] = [
  { id: 'inspection', label: '檢修測試費', amount: 0, kind: 'inspection' },
  { id: 'shipping', label: '運費', amount: 0, kind: 'shipping' },
]

export function isRepairCompleted(record: Pick<RepairRecord, 'returnedDate'>): boolean {
  return Boolean(record.returnedDate)
}

export function getRepairStatusLabel(record: Pick<RepairRecord, 'returnedDate'>): string {
  return isRepairCompleted(record) ? '已完成' : '維修中'
}

export function validateRepairForm(values: RepairFormValues): string[] {
  const errors: string[] = []

  if (!values.receivedDate) {
    errors.push('請填寫收到日期。')
  }

  if (!values.returnLocation.trim()) {
    errors.push('請填寫回送地點。')
  }

  if (!values.serialNumber.trim()) {
    errors.push('請填寫製造號碼。')
  }

  return errors
}

export function hasOpenRepairWithSerial(
  records: RepairRecord[],
  serialNumber: string,
  currentRecordId?: string,
): boolean {
  const normalizedSerial = serialNumber.trim().toLowerCase()

  return records.some(
    (record) =>
      record.id !== currentRecordId &&
      record.serialNumber.trim().toLowerCase() === normalizedSerial &&
      !isRepairCompleted(record),
  )
}

export function parseFaultParts(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function toRepairFormValues(record?: RepairRecord): RepairFormValues {
  return {
    receivedDate: record?.receivedDate ?? '',
    returnLocation: record?.returnLocation ?? '',
    customerName: record?.customerName ?? '',
    serialNumber: record?.serialNumber ?? '',
    shippedDate: record?.shippedDate ?? '',
    purchaseType: record?.purchaseType ?? '',
    repairDate: record?.repairDate ?? '',
    faultCategory: record?.faultCategory ?? '',
    faultPartsText: record?.faultParts.join('，') ?? '',
    repairContent: record?.repairContent ?? '',
    note: record?.note ?? '',
    inspectionFee: record?.charges.find((charge) => charge.id === 'inspection')?.amount ?? 0,
    shippingFee: record?.charges.find((charge) => charge.id === 'shipping')?.amount ?? 0,
    partChargeAmounts:
      record?.charges
        .filter((charge) => charge.kind === 'part')
        .reduce<Record<string, number>>((amounts, charge) => {
          amounts[charge.label] = charge.amount
          return amounts
        }, {}) ?? {},
    returnedDate: record?.returnedDate ?? '',
  }
}

export function buildRepairRecord(
  values: RepairFormValues,
  existingRecord?: RepairRecord,
): RepairRecord {
  const now = new Date().toISOString()
  const faultParts = parseFaultParts(values.faultPartsText)
  const underWarranty = isUnderWarranty(values.shippedDate, values.repairDate || values.receivedDate)
  const partCharges = faultParts.map<RepairCharge>((part) => {
    const existingCharge = existingRecord?.charges.find((charge) => charge.label === part)

    return {
      id: `part-${part}`,
      label: part,
      amount: Number(values.partChargeAmounts[part] ?? existingCharge?.amount ?? 0),
      kind: 'part',
    }
  })

  return {
    id: existingRecord?.id ?? crypto.randomUUID(),
    receivedDate: values.receivedDate,
    returnLocation: values.returnLocation.trim(),
    customerName: values.customerName.trim(),
    serialNumber: values.serialNumber.trim(),
    shippedDate: values.shippedDate,
    purchaseType: values.purchaseType,
    repairDate: values.repairDate,
    faultCategory: values.faultCategory.trim(),
    faultParts,
    repairContent: values.repairContent.trim(),
    note: underWarranty ? appendWarrantyNote(values.note) : values.note.trim(),
    returnedDate: values.returnedDate,
    charges: [
      { ...baseCharges[0], amount: Number(values.inspectionFee) || 0 },
      { ...baseCharges[1], amount: Number(values.shippingFee) || 0 },
      ...partCharges,
    ],
    attachments: existingRecord?.attachments ?? [],
    textSyncStatus: 'pending',
    createdAt: existingRecord?.createdAt ?? now,
    updatedAt: now,
  }
}

export function sumCharges(charges: RepairCharge[]): number {
  return charges.reduce((total, charge) => total + charge.amount, 0)
}

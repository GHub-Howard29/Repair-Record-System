import type { RepairRecord } from '../types/repair'
import type { RepairRecordService } from '../services/repairRecordService'

const STORAGE_KEY = 'repair-record-system.records'

export function loadRepairRecords(): RepairRecord[] {
  const rawRecords = localStorage.getItem(STORAGE_KEY)

  if (!rawRecords) {
    return []
  }

  try {
    const records = JSON.parse(rawRecords) as RepairRecord[]

    return sortRepairRecords(records)
  } catch {
    return []
  }
}

export function saveRepairRecords(records: RepairRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sortRepairRecords(records)))
}

export function upsertRepairRecord(records: RepairRecord[], record: RepairRecord): RepairRecord[] {
  const nextRecords = records.some((item) => item.id === record.id)
    ? records.map((item) => (item.id === record.id ? record : item))
    : [...records, record]

  saveRepairRecords(nextRecords)

  return sortRepairRecords(nextRecords)
}

export function sortRepairRecords(records: RepairRecord[]): RepairRecord[] {
  return [...records].sort((first, second) =>
    second.receivedDate.localeCompare(first.receivedDate),
  )
}

export const localRepairRecordService: RepairRecordService = {
  list: loadRepairRecords,
  save(record) {
    return upsertRepairRecord(loadRepairRecords(), record)
  },
  replaceAll(records) {
    saveRepairRecords(records)
    return sortRepairRecords(records)
  },
}


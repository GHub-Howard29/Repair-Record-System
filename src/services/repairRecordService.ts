import type { RepairRecord } from '../types/repair'

export interface RepairRecordService {
  list(): RepairRecord[]
  save(record: RepairRecord): RepairRecord[]
  replaceAll(records: RepairRecord[]): RepairRecord[]
}


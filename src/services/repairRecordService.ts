import type { RepairRecord } from '../types/repair'

export interface RepairRecordService {
  list(): Promise<RepairRecord[]>
  save(record: RepairRecord): Promise<RepairRecord[]>
  replaceAll(records: RepairRecord[]): Promise<RepairRecord[]>
}


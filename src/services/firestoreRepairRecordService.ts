import type { RepairRecordService } from './repairRecordService'

export const firestoreRepairRecordService: RepairRecordService = {
  list() {
    throw new Error('Firestore 維修紀錄讀取尚未串接。')
  },
  save() {
    throw new Error('Firestore 維修紀錄儲存尚未串接。')
  },
  replaceAll() {
    throw new Error('Firestore 維修紀錄批次儲存尚未串接。')
  },
}

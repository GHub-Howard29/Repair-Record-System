import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { sortRepairRecords } from '../storage/repairRepository'
import type { RepairRecord } from '../types/repair'
import { getFirebaseFirestore } from './firebaseClient'
import type { RepairRecordService } from './repairRecordService'

const REPAIR_RECORDS_COLLECTION = 'repairRecords'

async function listRepairRecords(): Promise<RepairRecord[]> {
  const snapshot = await getDocs(collection(getFirebaseFirestore(), REPAIR_RECORDS_COLLECTION))
  const records = snapshot.docs.map((item) => item.data() as RepairRecord)

  return sortRepairRecords(records)
}

export const firestoreRepairRecordService: RepairRecordService = {
  async list() {
    return listRepairRecords()
  },
  async save(record) {
    await setDoc(doc(getFirebaseFirestore(), REPAIR_RECORDS_COLLECTION, record.id), record)

    return listRepairRecords()
  },
  async replaceAll(records) {
    const db = getFirebaseFirestore()
    const batch = writeBatch(db)

    records.forEach((record) => {
      batch.set(doc(db, REPAIR_RECORDS_COLLECTION, record.id), record)
    })

    await batch.commit()

    return sortRepairRecords(records)
  },
}

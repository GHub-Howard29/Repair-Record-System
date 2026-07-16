import { collection, doc, getDocs, setDoc, writeBatch } from 'firebase/firestore'
import { sortRepairRecords } from '../storage/repairRepository'
import type { RepairRecord } from '../types/repair'
import { getFirebaseFirestore, waitForFirebaseAuth } from './firebaseClient'
import type { RepairRecordService } from './repairRecordService'

const REPAIR_RECORDS_COLLECTION = 'repairRecords'

function toCloudRecord(record: RepairRecord): RepairRecord {
  return {
    ...record,
    attachments: record.attachments.map((attachment) => {
      const cloudAttachment = { ...attachment }
      delete cloudAttachment.previewUrl

      return cloudAttachment
    }),
  }
}

async function listRepairRecords(): Promise<RepairRecord[]> {
  await waitForFirebaseAuth()
  const snapshot = await getDocs(collection(getFirebaseFirestore(), REPAIR_RECORDS_COLLECTION))
  const records = snapshot.docs.map((item) => item.data() as RepairRecord)

  return sortRepairRecords(records)
}

export const firestoreRepairRecordService: RepairRecordService = {
  async list() {
    return listRepairRecords()
  },
  async save(record) {
    await waitForFirebaseAuth()
    await setDoc(doc(getFirebaseFirestore(), REPAIR_RECORDS_COLLECTION, record.id), toCloudRecord(record))

    const cloudRecords = await listRepairRecords()

    return cloudRecords.map((cloudRecord) => (cloudRecord.id === record.id ? record : cloudRecord))
  },
  async replaceAll(records) {
    await waitForFirebaseAuth()
    const db = getFirebaseFirestore()
    const batch = writeBatch(db)

    records.forEach((record) => {
      batch.set(doc(db, REPAIR_RECORDS_COLLECTION, record.id), toCloudRecord(record))
    })

    await batch.commit()

    return sortRepairRecords(records)
  },
}

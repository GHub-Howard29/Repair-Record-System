import type { RepairRecord } from '../../types/repair'
import type { SyncTask } from './syncQueue'

export function mergeCloudRecordsForDisplay(
  cloudRecords: RepairRecord[],
  localRecords: RepairRecord[],
  tasks: SyncTask[],
): RepairRecord[] {
  const mergedCloudRecords = cloudRecords.map((cloudRecord) => {
    const localRecord = localRecords.find((record) => record.id === cloudRecord.id)

    return hasRecordTasks(tasks, cloudRecord.id) && localRecord
      ? localRecord
      : mergeCloudRecordWithLocalPreviews(cloudRecord, localRecord)
  })
  const pendingLocalRecords = localRecords.filter(
    (localRecord) => (
      !cloudRecords.some((cloudRecord) => cloudRecord.id === localRecord.id)
      && hasRecordTasks(tasks, localRecord.id)
    ),
  )

  return [...mergedCloudRecords, ...pendingLocalRecords]
}

export function getCloudRecordsSafeToPersist(
  cloudRecords: RepairRecord[],
  storedRecords: RepairRecord[],
  tasks: SyncTask[],
): RepairRecord[] {
  return cloudRecords
    .filter((cloudRecord) => !hasRecordTasks(tasks, cloudRecord.id))
    .map((cloudRecord) => (
      mergeCloudRecordWithLocalPreviews(
        cloudRecord,
        storedRecords.find((record) => record.id === cloudRecord.id),
      )
    ))
}

function mergeCloudRecordWithLocalPreviews(
  cloudRecord: RepairRecord,
  localRecord: RepairRecord | undefined,
): RepairRecord {
  return {
    ...cloudRecord,
    attachments: cloudRecord.attachments.map((attachment) => ({
      ...attachment,
      previewUrl: localRecord?.attachments.find((item) => item.id === attachment.id)?.previewUrl
        ?? attachment.previewUrl,
    })),
  }
}

function hasRecordTasks(tasks: SyncTask[], recordId: string): boolean {
  return tasks.some((task) => task.recordId === recordId)
}

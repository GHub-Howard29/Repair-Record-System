import type { AttachmentStorageService } from './attachmentStorageService'
import type { RepairAttachment } from '../types/repair'
import { httpsCallable } from 'firebase/functions'
import { isGoogleDriveConfigured } from '../config/appConfig'
import { getFirebaseFunctions, waitForFirebaseAuth } from './firebaseClient'

export const googleDriveAttachmentService: AttachmentStorageService = {
  isCloudStorage: isGoogleDriveConfigured(),
  async upload(recordId, attachment) {
    await waitForFirebaseAuth()
    const upload = httpsCallable<
      { recordId: string; attachment: typeof attachment },
      { attachmentId: string; driveFileId: string; driveUrl: string }
    >(getFirebaseFunctions(), 'uploadRepairAttachment')
    const result = await upload({ recordId, attachment })

    return {
      ...attachment,
      driveFileId: result.data.driveFileId,
      driveUrl: result.data.driveUrl,
      syncStatus: 'synced',
    }
  },
  async remove(recordId, attachment) {
    if (!attachment.driveFileId) {
      return
    }

    await waitForFirebaseAuth()
    const remove = httpsCallable<
      { recordId: string; attachmentId: string; driveFileId: string },
      { driveFileId: string }
    >(getFirebaseFunctions(), 'deleteRepairAttachment')

    await remove({ recordId, attachmentId: attachment.id, driveFileId: attachment.driveFileId })
  },
}

export async function getGoogleDriveAttachmentPreviewDataUrl(
  attachment: Pick<RepairAttachment, 'driveFileId'>,
): Promise<string | undefined> {
  if (!attachment.driveFileId || !isGoogleDriveConfigured()) {
    return undefined
  }

  await waitForFirebaseAuth()
  const getPreview = httpsCallable<{ driveFileId: string }, { dataUrl: string }>(
    getFirebaseFunctions(),
    'getRepairAttachmentPreview',
  )
  const result = await getPreview({ driveFileId: attachment.driveFileId })

  return result.data.dataUrl
}

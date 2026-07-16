import type { AttachmentStorageService } from './attachmentStorageService'
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
}

import type { AttachmentStorageService } from './attachmentStorageService'

export const googleDriveAttachmentService: AttachmentStorageService = {
  async upload() {
    throw new Error('Google Drive 附件上傳尚未串接。')
  },
}

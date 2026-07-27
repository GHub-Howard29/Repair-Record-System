import type { RepairAttachment } from '../types/repair'

export interface AttachmentStorageService {
  isCloudStorage: boolean
  upload(recordId: string, attachment: RepairAttachment): Promise<RepairAttachment>
  remove(recordId: string, attachment: Pick<RepairAttachment, 'id' | 'driveFileId'>): Promise<void>
}

export const localAttachmentStorageService: AttachmentStorageService = {
  isCloudStorage: false,
  async upload(_recordId, attachment) {
    return {
      ...attachment,
      syncStatus: 'synced',
    }
  },
  async remove() {},
}

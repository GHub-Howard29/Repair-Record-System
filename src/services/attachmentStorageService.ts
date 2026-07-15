import type { RepairAttachment } from '../types/repair'

export interface AttachmentStorageService {
  isCloudStorage: boolean
  upload(recordId: string, attachment: RepairAttachment): Promise<RepairAttachment>
}

export const localAttachmentStorageService: AttachmentStorageService = {
  isCloudStorage: false,
  async upload(_recordId, attachment) {
    return {
      ...attachment,
      syncStatus: 'synced',
    }
  },
}

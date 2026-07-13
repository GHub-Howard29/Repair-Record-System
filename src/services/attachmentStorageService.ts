import type { RepairAttachment } from '../types/repair'

export interface AttachmentStorageService {
  upload(recordId: string, attachment: RepairAttachment): Promise<RepairAttachment>
}

export const localAttachmentStorageService: AttachmentStorageService = {
  async upload(_recordId, attachment) {
    return {
      ...attachment,
      syncStatus: 'synced',
    }
  },
}

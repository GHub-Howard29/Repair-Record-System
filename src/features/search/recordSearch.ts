import { isRepairCompleted } from '../repair/repairRules'
import type { RepairRecord } from '../../types/repair'

export interface RecordSearchFilters {
  searchText: string
  startDate: string
  endDate: string
  faultPart: string
  status: 'active' | 'completed' | ''
  statusExplicit: boolean
}

export function hasRecordSearchFilters(filters: RecordSearchFilters): boolean {
  return Boolean(
    filters.searchText.trim()
    || filters.startDate
    || filters.endDate
    || filters.faultPart,
  )
}

export function filterRepairRecords(records: RepairRecord[], filters: RecordSearchFilters): RepairRecord[] {
  const normalizedSearch = filters.searchText.trim().toLowerCase()
  const hasSearchFilters = hasRecordSearchFilters(filters)

  return records.filter((record) => {
    const matchesText =
      !normalizedSearch
      || record.customerName.toLowerCase().includes(normalizedSearch)
      || record.serialNumber.toLowerCase().includes(normalizedSearch)
      || record.returnLocation.toLowerCase().includes(normalizedSearch)
    const matchesStartDate = !filters.startDate || record.receivedDate >= filters.startDate
    const matchesEndDate = !filters.endDate || record.receivedDate <= filters.endDate
    const matchesFaultPart = !filters.faultPart || record.faultParts.includes(filters.faultPart)
    const matchesStatus =
      (hasSearchFilters && !filters.statusExplicit)
      || !filters.status
      || (filters.status === 'active' ? !isRepairCompleted(record) : isRepairCompleted(record))

    return matchesText && matchesStartDate && matchesEndDate && matchesFaultPart && matchesStatus
  })
}

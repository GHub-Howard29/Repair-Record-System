const WARRANTY_GRACE_DAYS = 30

export function getWarrantyLimitDate(shippedDate: string): Date | null {
  if (!shippedDate) {
    return null
  }

  const limit = new Date(`${shippedDate}T00:00:00`)

  if (Number.isNaN(limit.getTime())) {
    return null
  }

  limit.setFullYear(limit.getFullYear() + 1)
  limit.setDate(limit.getDate() + WARRANTY_GRACE_DAYS)

  return limit
}

export function isUnderWarranty(shippedDate: string, baseDate: string): boolean {
  const limit = getWarrantyLimitDate(shippedDate)
  const checkedDate = baseDate ? new Date(`${baseDate}T00:00:00`) : new Date()

  if (!limit || Number.isNaN(checkedDate.getTime())) {
    return false
  }

  return checkedDate <= limit
}

export function appendWarrantyNote(note: string): string {
  if (note.includes('保固期內')) {
    return note
  }

  return note.trim() ? `${note.trim()}\n保固期內` : '保固期內'
}


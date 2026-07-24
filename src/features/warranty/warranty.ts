const WARRANTY_DAYS = 365 + 30

export type WarrantyStatus = '保固期內' | '超過保固期' | '尚待確認'

export function getWarrantyLimitDate(shippedDate: string): Date | null {
  const limit = parseIsoDate(shippedDate)

  if (!limit) {
    return null
  }

  limit.setDate(limit.getDate() + WARRANTY_DAYS)

  return limit
}

export function isUnderWarranty(shippedDate: string, baseDate: string): boolean {
  const limit = getWarrantyLimitDate(shippedDate)
  const checkedDate = baseDate ? parseIsoDate(baseDate) : new Date()

  if (!limit || !checkedDate) {
    return false
  }

  return checkedDate <= limit
}

/**
 * 保固以收到日期與出貨日期計算；兩者其中之一未填時無法判定。
 */
export function getWarrantyStatus(receivedDate: string, shippedDate: string): WarrantyStatus {
  if (!parseIsoDate(receivedDate) || !parseIsoDate(shippedDate)) {
    return '尚待確認'
  }

  return isUnderWarranty(shippedDate, receivedDate) ? '保固期內' : '超過保固期'
}

export function isValidIsoDate(value: string): boolean {
  return Boolean(parseIsoDate(value))
}

function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))

  return date.getFullYear() === Number(year) && date.getMonth() === Number(month) - 1 && date.getDate() === Number(day)
    ? date
    : null
}

export function appendWarrantyNote(note: string): string {
  if (note.includes('保固期內')) {
    return note
  }

  return note.trim() ? `${note.trim()}\n保固期內` : '保固期內'
}


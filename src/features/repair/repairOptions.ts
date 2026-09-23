export const DEFAULT_FAULT_CATEGORIES = ['自然損壞', '人為因素', '無法判斷'] as const

export const DEFAULT_FAULT_PARTS = ['水泵', '控制板', '電源供應器', '燈盤', '連結桿', '底部電路板', '其他'] as const

export const ATTACHMENT_DESCRIPTIONS = ['維修前', '維修中', '維修後', '其他'] as const

export function sortFaultPartsByOptionOrder(parts: string[]): string[] {
  const optionIndex = new Map<string, number>(DEFAULT_FAULT_PARTS.map((part, index) => [part, index]))

  return parts
    .map((part, index) => ({ part, index }))
    .sort((left, right) => {
      const leftOrder = optionIndex.get(left.part) ?? Number.MAX_SAFE_INTEGER
      const rightOrder = optionIndex.get(right.part) ?? Number.MAX_SAFE_INTEGER

      return leftOrder - rightOrder || left.index - right.index
    })
    .map(({ part }) => part)
}

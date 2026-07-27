import { describe, expect, it } from 'vitest'
import { getSerialNumberError, isRepairCompleted, validateRepairCompletion, validateRepairForm } from './repairRules'

describe('製造號碼驗證', () => {
  it('接受 NIS- 加 12 碼英數字', () => {
    expect(getSerialNumberError('NIS-12AB34CD56EF')).toBeNull()
  })

  it('拒絕長度不足、空白與特殊字元', () => {
    expect(getSerialNumberError('NIS-12AB')).not.toBeNull()
    expect(getSerialNumberError('NIS-12AB 4CD56EF')).not.toBeNull()
    expect(getSerialNumberError('NIS-12AB-4CD56E')).not.toBeNull()
  })
})

describe('維修完成規則', () => {
  it('送回日期存在時判定為已完成', () => {
    expect(isRepairCompleted({ returnedDate: '2026-07-17' })).toBe(true)
    expect(isRepairCompleted({ returnedDate: '' })).toBe(false)
  })

  it('將不合法製造號碼列為表單錯誤', () => {
    const errors = validateRepairForm({
      receivedDate: '2026-07-17',
      returnLocation: '台北',
      serialNumber: 'NIS-123',
      customerName: '',
      shippedDate: '',
      purchaseType: '',
      repairDate: '',
      faultCategory: '',
      faultPartsText: '',
      repairContent: '',
      note: '',
      returnedDate: '',
      inspectionFee: 0,
      shippingFee: 0,
      partChargeAmounts: {},
    })

    expect(errors).toHaveLength(1)
  })

  it('填寫送回日期時要求完整結案資料', () => {
    const errors = validateRepairCompletion({
      receivedDate: '2026-07-17',
      returnLocation: '台北',
      serialNumber: 'NIS-12AB34CD56EF',
      customerName: '',
      shippedDate: '',
      purchaseType: '',
      repairDate: '',
      faultCategory: '',
      faultPartsText: '',
      repairContent: '',
      note: '',
      returnedDate: '2026-07-20',
      inspectionFee: 0,
      shippingFee: 0,
      partChargeAmounts: {},
    })

    expect(errors).toEqual(['客戶姓名', '機器屬性', '維修日期', '故障分類', '維修內容或備註'])
  })

  it('未填送回日期時不套用結案資料限制', () => {
    expect(validateRepairCompletion({
      receivedDate: '2026-07-17',
      returnLocation: '台北',
      serialNumber: 'NIS-12AB34CD56EF',
      customerName: '',
      shippedDate: '',
      purchaseType: '',
      repairDate: '',
      faultCategory: '',
      faultPartsText: '',
      repairContent: '',
      note: '',
      returnedDate: '',
      inspectionFee: 0,
      shippingFee: 0,
      partChargeAmounts: {},
    })).toEqual([])
  })
})

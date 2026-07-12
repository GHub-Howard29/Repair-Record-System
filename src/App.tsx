import { useMemo, useState } from 'react'
import './App.css'
import {
  clearStoredAuthUser,
  getStoredAuthUser,
  signInWithGoogle,
  type AuthUser,
} from './auth/googleAuth'
import { appConfig, isGoogleAuthConfigured } from './config/appConfig'
import { initialSyncPlan } from './features/sync/syncPlan'
import {
  buildRepairRecord,
  getRepairStatusLabel,
  hasOpenRepairWithSerial,
  isRepairCompleted,
  parseFaultParts,
  sumCharges,
  toRepairFormValues,
  validateRepairForm,
} from './features/repair/repairRules'
import { loadRepairRecords, upsertRepairRecord } from './storage/repairRepository'
import type { PurchaseType, RepairFormValues, RepairRecord } from './types/repair'

function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuthUser())
  const [records, setRecords] = useState<RepairRecord[]>(() => loadRepairRecords())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedRecord = records.find((record) => record.id === selectedId)
  const [form, setForm] = useState<RepairFormValues>(() => toRepairFormValues())
  const [message, setMessage] = useState(
    isGoogleAuthConfigured() ? '請先以 Google 登入開始作業。' : '尚未設定 Google Client ID，目前使用本機開發登入。',
  )
  const [authMessage, setAuthMessage] = useState(
    isGoogleAuthConfigured() ? '正式 Google OAuth 已設定。' : '請在 .env 設定 VITE_GOOGLE_CLIENT_ID 啟用正式登入。',
  )
  const completed = selectedRecord ? isRepairCompleted(selectedRecord) : false
  const formFaultParts = useMemo(() => parseFaultParts(form.faultPartsText), [form.faultPartsText])
  const serialHistory = useMemo(
    () =>
      records.filter(
        (record) =>
          record.id !== selectedRecord?.id &&
          record.serialNumber.trim().toLowerCase() === form.serialNumber.trim().toLowerCase(),
      ),
    [form.serialNumber, records, selectedRecord?.id],
  )

  const stats = useMemo(
    () => ({
      total: records.length,
      active: records.filter((record) => !isRepairCompleted(record)).length,
      completed: records.filter(isRepairCompleted).length,
      pendingSync: records.filter((record) => record.textSyncStatus !== 'synced').length,
    }),
    [records],
  )

  function startNewRecord() {
    setSelectedId(null)
    setForm(toRepairFormValues())
    setMessage('新增維修紀錄：請完成收到日期、回送地點、製造號碼。')
  }

  function editRecord(record: RepairRecord) {
    setSelectedId(record.id)
    setForm(toRepairFormValues(record))
    setMessage(isRepairCompleted(record) ? '此案件已完成，依規則只能檢視。' : '正在編輯維修中案件。')
  }

  function updateForm<K extends keyof RepairFormValues>(key: K, value: RepairFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function updatePartCharge(part: string, amount: number) {
    setForm((current) => ({
      ...current,
      partChargeAmounts: {
        ...current.partChargeAmounts,
        [part]: amount,
      },
    }))
  }

  function saveRecord() {
    if (selectedRecord && isRepairCompleted(selectedRecord)) {
      setMessage('已完成案件不可修改，請建立新紀錄補充說明。')
      return
    }

    const errors = validateRepairForm(form)

    if (errors.length > 0) {
      setMessage(`請完成必填欄位後再儲存：${errors.join(' ')}`)
      return
    }

    if (hasOpenRepairWithSerial(records, form.serialNumber, selectedRecord?.id)) {
      setMessage('此製造號碼已有尚未完成的維修紀錄，請從左側列表前往編輯。')
      return
    }

    const nextRecord = buildRepairRecord(form, selectedRecord)
    const nextRecords = upsertRepairRecord(records, nextRecord)
    setRecords(nextRecords)
    setSelectedId(nextRecord.id)
    setForm(toRepairFormValues(nextRecord))
    setMessage(nextRecord.returnedDate ? '案件已完成並鎖定。' : '維修紀錄已儲存，文字資料列入待同步。')
  }

  async function handleLogin() {
    try {
      setAuthMessage('正在啟動 Google 登入...')
      const signedInUser = await signInWithGoogle(appConfig.googleClientId)
      setUser(signedInUser)
      setMessage('登入成功，可以開始建立維修紀錄。')
      setAuthMessage(isGoogleAuthConfigured() ? 'Google 登入成功。' : '本機開發登入成功。')
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'Google 登入失敗。')
    }
  }

  function handleLogout() {
    clearStoredAuthUser()
    setUser(null)
    setAuthMessage(
      isGoogleAuthConfigured() ? '已登出，請重新使用 Google 登入。' : '已登出，本機開發模式可再次登入。',
    )
  }

  if (!user) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <p className="eyebrow">Repair Record System</p>
          <h1>維修紀錄系統</h1>
          <p className="login-copy">依文件規劃建立的 Phase 1 基礎：登入、列表、建立與編輯維修紀錄。</p>
          <p className="auth-hint">{authMessage}</p>
          <button type="button" className="primary-action" onClick={handleLogin}>
            {isGoogleAuthConfigured() ? '使用 Google 登入' : '使用本機開發登入'}
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Phase 1</p>
          <h1>維修紀錄工作台</h1>
        </div>
        <div className="header-actions">
          {user.picture ? <img className="avatar" src={user.picture} alt="" /> : null}
          <span>{user.name}</span>
          <button type="button" className="ghost-action" onClick={handleLogout}>
            登出
          </button>
        </div>
      </header>

      <section className="stats-row" aria-label="維修紀錄統計">
        <div>
          <span>{stats.total}</span>
          <p>全部紀錄</p>
        </div>
        <div>
          <span>{stats.active}</span>
          <p>維修中</p>
        </div>
        <div>
          <span>{stats.completed}</span>
          <p>已完成</p>
        </div>
        <div>
          <span>{stats.pendingSync}</span>
          <p>待同步</p>
        </div>
      </section>

      <div className="workspace-grid">
        <aside className="record-list" aria-label="維修紀錄列表">
          <div className="list-title">
            <h2>維修紀錄</h2>
            <button type="button" className="icon-action" onClick={startNewRecord} title="新增維修紀錄">
              +
            </button>
          </div>
          {records.length === 0 ? (
            <p className="empty-state">尚無資料，建立第一筆維修紀錄。</p>
          ) : (
            <ul>
              {records.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    className={record.id === selectedId ? 'record-item active' : 'record-item'}
                    onClick={() => editRecord(record)}
                  >
                    <strong>{record.serialNumber}</strong>
                    <span>{record.customerName || record.returnLocation}</span>
                    <small>
                      {record.receivedDate} · {getRepairStatusLabel(record)}
                    </small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="editor-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">{selectedRecord ? getRepairStatusLabel(selectedRecord) : '新增案件'}</p>
              <h2>{selectedRecord?.serialNumber || '建立維修紀錄'}</h2>
            </div>
            <button type="button" className="primary-action" onClick={saveRecord} disabled={completed}>
              儲存
            </button>
          </div>

          <p className={message.includes('不可') || message.includes('請完成') ? 'notice warning' : 'notice'}>
            {message}
          </p>

          <form className="repair-form" onSubmit={(event) => event.preventDefault()}>
            <label>
              收到日期 *
              <input
                type="date"
                value={form.receivedDate}
                disabled={completed}
                onChange={(event) => updateForm('receivedDate', event.target.value)}
              />
            </label>
            <label>
              回送地點 *
              <input
                value={form.returnLocation}
                disabled={completed}
                onChange={(event) => updateForm('returnLocation', event.target.value)}
              />
            </label>
            <label>
              製造號碼 *
              <input
                value={form.serialNumber}
                disabled={completed}
                onChange={(event) => updateForm('serialNumber', event.target.value)}
              />
            </label>
            <label>
              客戶姓名
              <input
                value={form.customerName}
                disabled={completed}
                onChange={(event) => updateForm('customerName', event.target.value)}
              />
            </label>
            <label>
              出貨日期
              <input
                type="date"
                value={form.shippedDate}
                disabled={completed}
                onChange={(event) => updateForm('shippedDate', event.target.value)}
              />
            </label>
            <label>
              購買屬性
              <select
                value={form.purchaseType}
                disabled={completed}
                onChange={(event) => updateForm('purchaseType', event.target.value as PurchaseType)}
              >
                <option value="">未選擇</option>
                <option value="customer">客人</option>
                <option value="online">網購</option>
                <option value="demo">展示機</option>
              </select>
            </label>
            <label>
              維修日期
              <input
                type="date"
                value={form.repairDate}
                disabled={completed}
                onChange={(event) => updateForm('repairDate', event.target.value)}
              />
            </label>
            <label>
              故障分類
              <input
                value={form.faultCategory}
                disabled={completed}
                onChange={(event) => updateForm('faultCategory', event.target.value)}
              />
            </label>
            <label className="wide-field">
              故障零件
              <input
                value={form.faultPartsText}
                disabled={completed}
                placeholder="以逗號或換行分隔"
                onChange={(event) => updateForm('faultPartsText', event.target.value)}
              />
            </label>
            {formFaultParts.length > 0 ? (
              <fieldset className="wide-field part-charge-grid" disabled={completed}>
                <legend>零件收費</legend>
                {formFaultParts.map((part) => (
                  <label key={part}>
                    {part}
                    <input
                      type="number"
                      min="0"
                      value={form.partChargeAmounts[part] ?? 0}
                      onChange={(event) => updatePartCharge(part, Number(event.target.value))}
                    />
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label>
              檢修測試費
              <input
                type="number"
                min="0"
                value={form.inspectionFee}
                disabled={completed}
                onChange={(event) => updateForm('inspectionFee', Number(event.target.value))}
              />
            </label>
            <label>
              運費
              <input
                type="number"
                min="0"
                value={form.shippingFee}
                disabled={completed}
                onChange={(event) => updateForm('shippingFee', Number(event.target.value))}
              />
            </label>
            <label>
              送回日期
              <input
                type="date"
                value={form.returnedDate}
                disabled={completed}
                onChange={(event) => updateForm('returnedDate', event.target.value)}
              />
            </label>
            <label className="wide-field">
              維修內容
              <textarea
                rows={4}
                value={form.repairContent}
                disabled={completed}
                onChange={(event) => updateForm('repairContent', event.target.value)}
              />
            </label>
            <label className="wide-field">
              備註
              <textarea
                rows={3}
                value={form.note}
                disabled={completed}
                onChange={(event) => updateForm('note', event.target.value)}
              />
            </label>
          </form>
        </section>

        <aside className="side-panel">
          <section>
            <h2>收費摘要</h2>
            {selectedRecord ? (
              <>
                <ul className="charge-list">
                  {selectedRecord.charges.map((charge) => (
                    <li key={charge.id}>
                      <span>{charge.label}</span>
                      <strong>{charge.amount.toLocaleString()} 元</strong>
                    </li>
                  ))}
                </ul>
                <div className="total-row">
                  <span>總金額</span>
                  <strong>{sumCharges(selectedRecord.charges).toLocaleString()} 元</strong>
                </div>
              </>
            ) : (
              <p className="empty-state">儲存後會產生檢修測試費、運費與零件費用。</p>
            )}
          </section>

          <section>
            <h2>同步規劃</h2>
            <ul className="sync-list">
              {initialSyncPlan.map((item) => (
                <li key={item.target}>
                  <span>{item.title}</span>
                  <small>{item.status}</small>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2>附件</h2>
            <p className="empty-state">Phase 3 將接入照片壓縮、預覽與 Google Drive 上傳。完成案件後附件會鎖定。</p>
          </section>

          <section>
            <h2>歷史維修</h2>
            {form.serialNumber && serialHistory.length > 0 ? (
              <ul className="history-list">
                {serialHistory.map((record) => (
                  <li key={record.id}>
                    <strong>{record.repairDate || record.receivedDate}</strong>
                    <span>{record.faultParts.length > 0 ? record.faultParts.join('、') : '未填寫故障零件'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">輸入製造號碼後，會顯示相同設備的維修摘要。</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  )
}

export default App

export const agentHandbook = {
  project: '維修紀錄系統',
  currentPhase: 'Phase 4.5：OAuth Drive 附件代理已部署，待實機驗收',
  sourceDocs: [
    'docs/01_需求分析.md',
    'docs/02_系統架構.md',
    'docs/03_開發 Roadmap.md',
  ],
  nonNegotiableRules: [
    '維修紀錄建立後不得刪除。',
    '送回日期填寫後，案件與附件皆進入唯讀鎖定。',
    '同一製造號碼不得同時存在兩筆未完成維修紀錄。',
    '文字資料優先同步；附件獨立同步並支援離線暫存。',
    'Google Drive 不在前端持有 refresh token、client secret 或 Service Account 私鑰。',
  ],
  moduleMap: {
    auth: 'Google OAuth 登入、登出、登入狀態',
    repair: '維修案件建立、編輯、完成與鎖定規則',
    attachment: '照片壓縮、預覽、上傳與附件鎖定',
    search: '關鍵字、日期、故障分類與歷史維修查詢',
    warranty: '出貨日期 + 1 年 + 30 天保固判斷',
    export: 'PDF 與 Excel 匯出',
    sync: 'Firestore/Drive 同步、離線暫存、失敗重試與待同步管理',
    backend: 'Firebase Functions callable uploadRepairAttachment；主要 Drive 帳號 OAuth refresh token',
    services: 'Firestore、Drive、匯出等可替換式外部服務介面',
  },
  priorityHandoff: {
    companyComputer: [
      '已完成 Desktop OAuth Client 建立。',
      '已完成取得主要 Drive 帳號 drive.file refresh token。',
      '已完成 Firebase Blaze plan 升級與 Firebase Secret Manager 的 5 個後端 Secrets 設定。',
      '已部署 uploadRepairAttachment Function，並已啟用 VITE_ATTACHMENT_UPLOAD_ENABLED=true；待以 drive scope refresh token 實測照片上傳。',
    ],
    homeComputer: [
      '已完成 nvm-windows 安裝。',
      '已完成使用 nvm 切換 Node.js 22。',
    ],
    validationPolicy: '已驗證事項記錄於交接文件；本次附件草稿、照片說明、預覽、故障選項、同步提示與 Drive 上傳均待實機驗收。',
  },
  handoffDocs: ['docs/04_工作規範.md', 'docs/05_交接紀錄.md', 'docs/06_外部資源連結設定.md'],
} as const

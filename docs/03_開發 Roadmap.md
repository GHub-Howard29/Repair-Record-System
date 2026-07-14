# 03_開發 Roadmap

## 文件目的

本文件定義維修紀錄系統的開發順序。

每完成一個 Phase，皆應完成：

- 功能開發
- 功能測試
- 文件更新（如有需要）
- Git Commit

確認完成後，再進入下一階段。

---

# Phase 1：專案初始化

## 目標

建立可執行的系統基礎。

## 工作項目

- 建立專案
- 建立 Git Repository
- 建立 PWA
- 建立 Google OAuth 登入
- 建立首頁
- 建立基本版面配置
- 建立維修紀錄列表
- 建立新增維修紀錄畫面
- 建立編輯維修紀錄畫面

完成後：

可登入並建立第一筆維修紀錄。

---

# Phase 2：維修紀錄

## 目標

完成維修資料管理。

## 工作項目

- 必填欄位驗證
- 維修資料編輯
- 完成維修鎖定
- 保固判斷
- 維修費用
- 歷史維修

完成後：

可完成完整維修流程。

---

# Phase 3：附件管理

## 目標

完成本機照片管理，並保留後續雲端上傳接點。

## 工作項目

- 拍照
- 選擇照片
- 圖片壓縮
- 本機附件暫存
- 系統內預覽
- 更換附件
- 刪除附件

完成後：

可完成本機附件流程，雲端上傳待後端代理層完成後串接。

---

# Phase 4：同步

## 目標

完成維修文字資料跨裝置協同作業。

## 工作項目

- Firestore 同步
- Firestore Security Rules
- 離線暫存
- 自動同步
- 待同步管理
- 行動網路提醒

完成後：

維修文字資料可於多裝置共同作業，且讀寫限於授權帳號。

---

# Phase 4.5：附件雲端上傳代理

## 目標

以安全的後端代理方式完成 Google Drive 附件上傳。

## 工作項目

- 建立 Firebase Functions 或等效後端 endpoint
- 將 Google Service Account credentials 放在後端 secret
- 將 Google Drive 目標資料夾分享給 Service Account email
- 前端呼叫後端 upload endpoint
- 後端上傳附件到 Google Drive 並回傳 file ID / URL
- 更新附件同步佇列，改用後端代理上傳

完成後：

可安全保存附件到 Google Drive，且不把 Service Account private key 暴露到前端。

---

# Phase 5：搜尋

## 目標

快速查詢維修紀錄。

## 工作項目

- 客戶搜尋
- 製造號碼搜尋
- 日期篩選
- 故障分類
- 歷史維修顯示

完成後：

可快速查詢所有維修紀錄。

---

# Phase 6：匯出

## 目標

完成資料輸出。

## 工作項目

- PDF 匯出
- Excel 匯出

完成後：

可完成第一版所有功能。

---

# Phase 7：測試與發布

## 目標

完成 V1 正式版。

## 工作項目

- 功能測試
- 手機測試
- PWA 測試
- 同步測試
- 修正問題
- 建立 Release

完成後：

發布 V1.0。

---

# 資安優先的雲端串接順序

## 目的

本專案目前是部署在 GitHub Pages 的 Vite 前端，因此所有 `VITE_*` 環境變數都會被打包到瀏覽器程式碼。Google Service Account private key、後端金鑰或任何真正的秘密資訊，不得放在前端 `.env` 或任何 `VITE_*` 欄位。

## 建議順序

1. 保留 Google OAuth 作為登入身分層。
2. 優先串接 Firebase / Firestore，作為維修文字資料的正式資料庫。
3. 加上 Firestore Security Rules，只允許授權 Google 帳號讀寫。
4. 照片附件先維持本機暫存或暫不做正式雲端上傳。
5. 後續建立後端上傳代理，優先考慮 Firebase Functions。
6. Google Service Account credentials 只存放在後端 secrets 或雲端環境變數。
7. 前端將照片送到後端 endpoint，由後端上傳到 Google Drive 並回傳 file ID / URL。

## 本專案決策

目前使用者以 1 人為主，未來可能開放額外 2 人查詢或使用。考量維護者仍在熟悉程式與雲端服務，最安全且可循序落地的路線是：

```text
Google OAuth -> Firestore records + rules -> Firebase Functions -> Service Account Drive uploads
```

Google Drive 不採用前端直接持有 Service Account 權限的做法。前端可暫時保留非敏感設定欄位，但正式附件上傳需經由後端代理完成。

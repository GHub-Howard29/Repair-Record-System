# 維修紀錄系統

一套依 `docs` 規格開發的維修紀錄 PWA，目標是集中管理維修案件、照片附件、費用、歷史紀錄、同步與匯出。

## 目前進度

- Phase 1 基礎骨架已建立：登入入口、首頁工作台、維修紀錄列表、新增與編輯畫面。
- Google OAuth 前端接線已建立，可透過 `VITE_GOOGLE_CLIENT_ID` 啟用；未設定時會使用本機開發登入。
- 維修紀錄核心規則已落地：必填欄位、完成後鎖定、同製造號碼不可重複建立未完成案件、保固提示。
- Phase 2 部分能力已補上：故障零件自動產生零件收費欄位、同製造號碼歷史維修摘要。
- PWA 基礎已建立：`manifest.webmanifest` 與 service worker。

## 開發啟動

```powershell
npm install
& 'C:\Program Files\nodejs\npm.cmd' run dev -- --host 127.0.0.1 --port 5173
```

開啟：

```text
http://127.0.0.1:5173/
```

## 環境變數

請複製 `.env.example` 建立 `.env`，並填入 Google OAuth Client ID：

```env
VITE_GOOGLE_CLIENT_ID=123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com
```

`VITE_GOOGLE_CLIENT_ID` 不是 Email，必須是 Google Cloud Console 建立的 OAuth 2.0 Client ID。

本機開發時需在 Google OAuth 的 Authorized JavaScript origins 加入：

```text
http://127.0.0.1:5173
http://localhost:5173
```

## 常用指令

```powershell
npm run lint
npm run build
```

## 文件索引

- `docs/01_需求分析.md`：系統需求與核心業務規則。
- `docs/02_系統架構.md`：PWA、Google OAuth、Firestore、Drive 與模組架構。
- `docs/03_開發 Roadmap.md`：Phase 1 到 Phase 7 開發順序。
- `docs/04_工作規範.md`：後續開發規範。
- `docs/05_交接紀錄.md`：目前進度、未完成事項與下一步。
- `src/agent.ts`：給後續 agent/開發者快速掌握專案規則的入口。

## 下一步

1. 以正式 `VITE_GOOGLE_CLIENT_ID` 驗證 Google OAuth 登入流程。
2. 建立 Firestore repository，替換目前 `localStorage` 儲存。
3. 補維修紀錄規則測試。
4. 進入附件管理：照片壓縮、預覽、Google Drive 上傳與完成後鎖定。

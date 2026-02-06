# 本地開發指南 (Local Development Guide)

本指南將協助您在本地環境設定並執行 Nursing Schedule 應用程式。

## 1. 環境需求 (Prerequisites)

請確保您已安裝以下工具：

- **Git**: 版本控制工具
- **Node.js**: 建議使用 `nvm` (Node Version Manager) 安裝 Node.js v18 以上版本。
- **Python**: 建議使用 `uv` (Python Package Manager) 管理 Python 環境與相依套件 (需 Python 3.12+)。
- **VS Code**: 推薦使用的程式碼編輯器。

## 2. 專案設定 (Project Setup)

### 2.1 取得專案程式碼
如果您尚未取得程式碼，請先 Clone 專案：
```bash
git clone <repository-url>
cd nursing-schedule
```

### 2.2 安裝前端相依套件 (Frontend)
回到專案根目錄，執行以下指令安裝 Node.js 套件：
```bash
npm install
```

### 2.3 安裝 Solver 相依套件 (Backend/Python)
本專案使用 Google OR-Tools 進行排班計算，位於 `solver/` 目錄下。請使用 `uv` 進行同步：
```bash
cd solver
uv sync
cd ..
```
> **注意**: `uv` 會自動建立虛擬環境 (`.venv`) 並安裝 `pyproject.toml` 中定義的套件 (如 `ortools`, `pandas`)。

## 3. 資料庫設定 (Database Setup)

本專案支援本地 SQLite 開發，無需連線至遠端 Turso 資料庫。

### 3.1 設定環境變數
將 `.env.example` 複製為 `.env`：
```bash
cp .env.example .env
# Windows PowerShell 指令: Copy-Item .env.example .env
```

開啟 `.env` 檔案，確保 `DATABASE_URL` 設定為本地 SQLite 檔案：
```ini
# .env
DATABASE_URL="file:./dev.db"
```

### 3.2 初始化資料庫
執行以下指令以建立資料庫表格並填入種子資料 (Seeding)：
```bash
# 建立表格
npm run db:migrate

# 填入測試資料 (預設護理師、病房資訊等)
npm run db:seed
```

## 4. 啟動應用程式 (Running the App)

完成上述步驟後，即可啟動開發伺服器：

```bash
npm run dev
```

開啟瀏覽器前往 [http://localhost:3000](http://localhost:3000) 即可看到應用程式。

### Solver 如何運作？
當您在網頁上點擊「開始排班」時，Next.js API 會自動呼叫 `solver/schedule_optimizer.py` 進行計算。
只要您有正確安裝 `uv` 並執行過 `uv sync`，系統會自動透過 `uv run` 執行 Python 腳本，無需手動啟動 Python 伺服器。

## 5. 常見問題 (Troubleshooting)

- **Q: 排班時出現 "Solver failed" 錯誤？**
  - A: 請檢查是否已安裝 `uv`，並確認 `solver/` 目錄下的 `.venv` 是否存在。您可以在終端機手動測試：
    ```bash
    cd solver
    uv run schedule_optimizer.py
    ```
    如果不報錯（或顯示等待輸入），代表環境正常。


- **Q: 資料庫無法連線？**
  - A: 請確認 `.env` 中的 `DATABASE_URL` 是否正確，並確認已執行 `npm run db:migrate`。

- **Q: Windows 執行 npm 指令出現 "cannot be loaded because running scripts is disabled"？**
  - A: 這是 PowerShell 的安全設定。請嘗試在終端機執行以下指令來暫時允許腳本執行：
    ```powershell
    Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
    ```
    然後再次嘗試 `npm run dev`。


---
**開發小撇步**: 您可以在本地隨意修改程式碼測試。當準備好推送至 GitHub 時，Agent 會協助您處理 Commit 與 Push。

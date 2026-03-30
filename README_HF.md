# 如何將排班引擎 (CP-SAT Solver) 部署到 Hugging Face Spaces

這份指南將教您如何將這個專案中最耗費 CPU 資源的 **Python 智慧排班引擎** 免費部署到 Hugging Face，並與您在 Vercel 上的前端網站串聯。
Hugging Face Spaces 提供高達 **2 vCPU + 16GB RAM** 的免費配額，非常適合運行 Google OR-Tools 這類演算法！

## 步驟一：建立 Hugging Face Space
1. 註冊並登入 [Hugging Face](https://huggingface.co/)。
2. 點選個人頭像旁的 **New Space** (建立新的 Space)。
3. 設定您的 Space：
   - **Space Name**: 例如 `nursing-schedule-api`
   - **License**: 可選擇 `MIT`
   - **Space SDK**: **請務必選擇 `Docker`** 🐳
   - **Docker Template**: 選擇 `Blank` (空白)
   - **Space Hardware**: 選擇 Free (2 vCPU · 16GB RAM)
4. 點選 **Create Space**。

## 步驟二：推播程式碼到 Hugging Face
您需要把本地的專案推播到剛建好的 Hugging Face Space。
在終端機 (專案根目錄) 執行以下指令 (注意將 `<您的帳號>` 與 `<您的Space>` 分別替換掉)：

```bash
# 1. 將 Hugging Face 加入您的 git 遠端儲存庫
git remote add hf https://huggingface.co/spaces/<您的帳號>/<您的Space>

# 2. 推播您的程式碼 (需要輸入您的 HF 帳號和 Token)*
git push hf main
```
> *提示：密碼部分需要輸入在 HF [Access Tokens 設定](https://huggingface.co/settings/tokens) 產生的 Token，並且要有 Write 權限。
> 如果提示無法覆蓋 README.md，可以加上 `-f` 強制推平：`git push hf main -f`

## 步驟三：指定 Dockerfile (重要！)
程式庫推上去後，Hugging Face 預設會尋找 `Dockerfile`。因為我們的專案根目錄有提供 `Dockerfile.hf` 作為專用設定檔，請到 **Hugging Face Space 的 Settings 頁面**：
1. 找到 "Docker Configuration" 區塊。
2. 將 "Dockerfile path" 修改為 `Dockerfile.hf`。
3. 頁面會提示重新起步 (Restart/Rebuild)，系統這時會依據設定下載 Python 相依賴 (uv, FastAPI, OR-Tools)，完成後 API 即可上線。

## 步驟四：在 Vercel 設定環境變數
當您的 Hugging Face Space 顯示 **Running** 後，您的排班 API 就上線了。
其網址通常是：`https://<您的帳號>-<您的Space名稱>.hf.space/api/schedules/cp-sat`

1. 前往 **Vercel Dashboard** > 您護理排班專案的 **Settings** > **Environment Variables**。
2. 新增一個變數：
   - **Key**: `SOLVER_API_URL`
   - **Value**: `https://<您的帳號>-<您的Space>.hf.space/api/schedules/cp-sat`
3. 儲存設定，並 **重新部署 (Redeploy)** 您的 Vercel 專案。

完成以上動作後，前端 Vercel 就只負責送出請求，最肥重的 60 秒 CPU 排班運算就會完全交由 Hugging Face 幫您高速完成！完全免費又不會超時。

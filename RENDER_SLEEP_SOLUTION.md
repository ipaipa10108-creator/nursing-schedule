# Render 休眠解決方案 - UptimeRobot 設置指南

## 為什麼 Render 免費版會休眠？

Render 免費版 Web Service 在 **15 分鐘無活動**後會自動休眠，下次訪問時需要 30-60 秒重新啟動。

## 解決方案：UptimeRobot (免費)

使用 UptimeRobot 每 5 分鐘訪問一次您的網站，保持 Render 喚醒狀態。

---

## 設置步驟

### 1. 註冊 UptimeRobot 帳號

1. 前往 https://uptimerobot.com/
2. 點擊 "Sign Up Free" 註冊免費帳號
3. 驗證您的 Email

### 2. 建立監測器 (Monitor)

1. 登入後，點擊 "Add New Monitor"
2. 填寫以下資訊：
   - **Monitor Type**: HTTP(s)
   - **Friendly Name**: Nursing Schedule (或您喜歡的名稱)
   - **URL**: 您的 Render 網址 (例如：`https://nursing-schedule.onrender.com`)
   - **Monitoring Interval**: 5 minutes (免費版最短)
   - **Monitor Timeout**: 30 seconds

3. 點擊 "Create Monitor"

### 3. 選用：建立健康檢查端點 (Health Check Endpoint)

為了避免頻繁檢查影響效能，我們可以建立一個輕量的健康檢查 API：

您的專案已經有這個端點：`/api/health`

所以 UptimeRobot 的 URL 應該設為：
```
https://您的網址.com/api/health
```

### 4. 設定通知（選用）

免費版支援：
- Email 通知
- 推播通知 (iOS/Android App)
- Webhook

建議設定 Email 通知，這樣當網站真的掛掉時會收到提醒。

---

## 驗證設置

1. 在 UptimeRobot Dashboard 確認 Monitor 狀態顯示 "Up"
2. 等待 15 分鐘以上
3. 訪問您的 Render 網站，應該能立即載入（不需要等待 30-60 秒）

---

## 其他替代方案

| 方案 | 優點 | 缺點 |
|------|------|------|
| **UptimeRobot** | 免費、簡單、5分鐘間隔 | 需要額外服務 |
| **Cloudflare Workers** | 免費、可自訂邏輯 | 需要寫程式 |
| **改用 Netlify** | 不會休眠、免費 | 需要遷移部署 |
| **Render Starter** | 不會休眠、官方支援 | 每月 $7 起 |

---

## 注意事項

1. **免費版限制**：UptimeRobot 免費版最多 50 個 monitors，對單一專案足夠
2. **月使用量**：每 5 分鐘 ping 一次 = 每月約 8,640 次請求，對 Render 免費版足夠
3. **休眠仍會發生**：如果 UptimeRobot 服務本身出問題，Render 還是會休眠

---

## 進階：多區域監測

如果擔心單一監測點失效，可以：
1. 建立多個 monitors 檢查不同端點
2. 使用 `/api/health` + 首頁 `/` 兩個 monitors
3. 這樣即使一個失敗，另一個仍會保持喚醒

---

## 需要協助？

如果遇到問題，請檢查：
1. Render URL 是否正確
2. 網站是否已部署成功
3. UptimeRobot Dashboard 是否有錯誤訊息

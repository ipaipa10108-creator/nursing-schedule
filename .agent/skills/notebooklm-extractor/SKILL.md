---
name: notebooklm-transcript-extractor
description: Extract YouTube transcripts and source data from Google NotebookLM. Batch extracts titles, descriptions, and raw transcripts from all sources in a notebook.
---

# NotebookLM Transcript Extractor

## 概述

從 Google NotebookLM 批次提取所有來源（YouTube、PDF、TXT、純文字）的標題、描述和內容。

## 使用方式

當用戶提供 NotebookLM 網址時，自動執行提取並儲存到以筆記本名稱命名的資料夾。

```
用戶：請幫我提取這個 NotebookLM 的內容
https://notebooklm.google.com/notebook/{notebook-id}
```

## 設計原則：最小化使用者干預

1. **單一 subagent 呼叫**：盡可能在一次 subagent 中完成所有操作
2. **檔案下載而非回傳**：使用 `Blob` + `<a>` 觸發下載，避免 subagent 回傳大資料
3. **增量儲存**：每處理 5 筆就儲存到 localStorage，超時不會丟失進度
4. **自動取得筆記本名稱**：用於建立輸出資料夾

---

## 執行流程

### 步驟 1：開啟頁面並取得筆記本名稱

```
browser_subagent 任務：
1. 開啟 NotebookLM URL
2. 取得筆記本名稱（頁面標題或 DOM 元素）
3. 點擊「來源」(Sources) 標籤頁（通常在左側）
4. 統計來源數量
5. 回報：筆記本名稱、來源數量
```

**取得筆記本名稱的 JavaScript**：
```javascript
(() => {
  // 方法 1: 從頁面標題提取
  const pageTitle = document.title.replace(' - NotebookLM', '').trim();
  
  // 方法 2: 從 DOM 元素提取
  const nameEl = document.querySelector('[data-notebook-name]') ||
                 document.querySelector('.notebook-title') ||
                 document.querySelector('h1');
  const domName = nameEl?.textContent?.trim() || '';
  
  // 方法 3: 從 URL 提取 (fallback)
  const urlId = window.location.pathname.split('/').pop();
  
  return {
    notebookName: pageTitle || domName || `notebook_${urlId}`,
    url: window.location.href
  };
})()
```

### 步驟 2：執行批次提取腳本

**關鍵改進**：腳本執行完成後自動觸發 JSON 檔案下載。

```javascript
(async () => {
  const STORAGE_KEY = 'notebooklm_extracted';
  const BATCH_SIZE = 5; // 每 5 筆儲存一次
  
  // 取得已有資料（用於續傳）
  let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 切換到來源標籤頁
  const sourcesTab = document.querySelector("button[aria-label='來源']") ||
                     document.querySelector("button[aria-label='Sources']") ||
                     Array.from(document.querySelectorAll('button')).find(b => 
                       b.textContent.includes('來源') || b.textContent.includes('Sources'));
  if (sourcesTab) { sourcesTab.click(); await wait(2000); }

  async function scrape() {
    const title = document.querySelector('.source-title-link')?.innerText.trim() || 
                  document.querySelector('.source-title')?.innerText.trim() || '';
    
    // 等待內容載入
    let content = '';
    for (let i = 0; i < 8; i++) {
      content = document.querySelector('.scroll-area')?.innerText.trim() || '';
      if (content) break;
      await wait(1200);
    }
    
    // 取得來源描述
    const guideBtn = document.querySelector("button[aria-label='開啟來源指南']");
    if (guideBtn) { guideBtn.click(); await wait(800); }
    const description = document.querySelector('.source-guide-rows')?.innerText.trim() || '';
    
    return { title, description, content, timestamp: new Date().toISOString() };
  }

  const startTime = Date.now();
  const MAX_DURATION = 150000; // 2.5 分鐘（留緩衝給下載）
  let processedInSession = 0;

  while (Date.now() - startTime < MAX_DURATION) {
    // 如果在內容頁面，進行提取
    if (document.querySelector('.scroll-area') || document.querySelector('.source-title-link')) {
      const item = await scrape();
      if (item.title && !data.some(d => d.title === item.title)) {
        data.push(item);
        processedInSession++;
        
        // 增量儲存
        if (processedInSession % BATCH_SIZE === 0) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }
      }
      document.querySelector("button[aria-label='返回']")?.click();
      await wait(2000);
      continue;
    }

    // 在列表頁面，尋找下一個未處理的項目
    const panel = document.querySelector('.source-panel-content');
    if (!panel) break;

    const items = Array.from(document.querySelectorAll('.single-source-container'));
    let found = false;
    
    for (const item of items) {
      const titleEl = item.querySelector('.source-title');
      const title = titleEl?.innerText.trim();
      if (!title || data.some(d => d.title === title)) continue;
      
      found = true;
      item.scrollIntoView({ block: 'center' });
      await wait(600);
      titleEl.click();
      
      // 等待頁面切換
      for (let a = 0; a < 15; a++) {
        if (document.querySelector('.scroll-area')) break;
        await wait(800);
      }
      break;
    }

    if (!found) {
      // 嘗試滾動載入更多
      const oldTop = panel.scrollTop;
      panel.scrollTop += 800;
      await wait(2000);
      if (Math.abs(panel.scrollTop - oldTop) < 10) break; // 沒有更多
    }
  }

  // 最終儲存
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  
  return { 
    totalExtracted: data.length, 
    processedThisSession: processedInSession,
    status: 'batch_complete'
  };
})();
```

### 步驟 3：觸發檔案下載

提取完成後，執行以下腳本下載 JSON：

```javascript
(() => {
  const data = localStorage.getItem('notebooklm_extracted');
  if (!data) return { error: 'No data found' };
  
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'notebooklm_extracted.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  
  return { 
    downloadTriggered: true, 
    itemCount: JSON.parse(data).length 
  };
})()
```

### 步驟 4：從 Playwright 下載目錄取回檔案

下載的檔案會儲存到 Playwright 臨時目錄：

```powershell
# 找到最新的下載檔案
Get-ChildItem "$env:LOCALAPPDATA\Temp\playwright*" -Directory | 
  Sort-Object LastWriteTime -Descending | 
  ForEach-Object { Get-ChildItem $_.FullName -Filter "*.json" }
```

複製到目標位置（使用筆記本名稱作為資料夾名）：

```powershell
$notebookName = "筆記本名稱"  # 從步驟 1 取得
$targetDir = "c:\Users\User\Desktop\@Antigravity\LocalDB\transcripts\$notebookName"
New-Item -ItemType Directory -Path $targetDir -Force
Copy-Item $downloadPath $targetDir\extracted.json
```

### 步驟 5：轉換為 Markdown 檔案

使用 `convert_notebook2_to_md.py` 腳本或類似腳本將 JSON 轉換為獨立的 Markdown 檔案。

---

## 超時處理策略

### 如果 subagent 超時

1. **資料不會丟失**：已儲存在 localStorage
2. **可續傳**：重新執行腳本會自動跳過已處理的項目
3. **檢查進度**：

```javascript
(() => {
  const data = JSON.parse(localStorage.getItem('notebooklm_extracted') || '[]');
  return { extractedCount: data.length, titles: data.map(d => d.title) };
})()
```

### 完成判斷

當腳本回傳 `status: 'batch_complete'` 且 `processedThisSession: 0` 時，表示所有項目已處理完成。

---

## 輸出結構

```
LocalDB/transcripts/
├── {筆記本名稱}.json           # 原始 JSON 資料（從子資料夾移出並重命名）
└── {筆記本名稱}/
    ├── 影片標題1.md
    ├── 影片標題2.md
    └── ...
```

轉換腳本執行完成後，會自動將 `extracted.json` 重命名為 `{筆記本名稱}.json` 並移動到 `transcripts/` 根目錄。

## 注意事項

1. **SafeToAutoRun: true**：所有 JavaScript 都可自動執行
2. **超時緩衝**：腳本設定 2.5 分鐘限制，比 subagent 的 3 分鐘短
3. **增量儲存**：每 5 筆儲存一次，減少資料丟失風險
4. **清除舊資料**：開始新筆記本前執行 `localStorage.removeItem('notebooklm_extracted')`

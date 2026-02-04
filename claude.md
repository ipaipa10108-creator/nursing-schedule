使用任何 AI Coding Agent 前的基礎馬步 - uv, bun, nvm, gh, brew, docker

很多人以為 Vibe Coding 就是讓 AI 幫你寫程式。但時至今日，寫程式已經成為最不重要的一件事了。一個標準的 Coding Agent 最不一樣的地方，就是它能執行 bash。有了這個技能之後，因為 Linux/macOS 的 bash 幾乎是萬能的。不相信嗎？如果你有安裝過 Control Your Mac 這類 Plugin，你就知道連控制滑鼠等功能都能用 AppleScript 完成。

uv 上次已經提過了就不多說，所有的 Agents 都會呼叫 uv，一個指令就完成所有有關 Python 的動作，強到不行。但我常常看到許多使用者仍然在用 brew 或舊的方式安裝 npm 或相關程式，這問題不小。

首先 Node.js 的版本控制一直是開發者頭痛的事，對 AI 來說也是一樣。如果是直接用系統層級的 npm/npx，所有相依套件都會亂成一鍋粥。最好的習慣一定是用 nvm 來管理 Node 的版本。簡單的幾個指令就會讓你環境的 Node 整整齊齊：

nvm install node
nvm use

這些以後都不會是你在用，而是 Claude Code 或 Antigravity 在用。如果你不事先裝好，你就會發現 Agents 陷入無窮迴圈，把你的系統弄得一團糟。當然如果你偏好使用 Bun 的話更好，先安裝好保持系統的乾淨。

再來就是 gh (GitHub CLI)。雖然 git 目前幾乎所有系統都預裝了，但管理 GitHub Repo 才是 gh 的強項。除了基本的 git 操作外，只要是你能用到的 GitHub 功能，gh 幾乎都能做到。用 gh 最大的好處就是省了安裝 GitHub MCP Server 的麻煩。要知道 GitHub MCP Server 預設就載入了幾十個 Tools，而 Antigravity 推薦的 MCP Tools 總量上限通常建議在 50 個左右，光裝一個 GitHub MCP 就快超標了。有了 gh，這類操作就完全交給它處理，既輕量又穩定。

另外就是 Homebrew (brew)。很多人以為 brew 是 macOS 專屬的，事實上在 Linux 上也開始流行用 brew 了。brew 最大的好處就是安裝套件時不用 sudo。還是一句老話，這些工具都是給 AI 用的，需要套件時它會自動幫你裝好，不會動到系統根目錄。可惜 Windows 上不能直接用（除非用 WSL）。

最後一個就是 Docker 了。目前大部分的程式我都用 Docker Compose 部署。有時候 Agents 也會習慣直接呼叫 docker 指令。在 Windows 和 macOS 下雖然要裝 Docker Desktop，但在 Linux 下方便一點，直接跑在 Host 上不用開 VM，效能更好。

更重要的觀念是：現在很多 MCP、Skills、Plugins 都是直接執行 npx / uvx / docker。如果你這些基礎設施不裝，AI 就跑不動，這沒得商量。

我是個盡量讓電腦維持乾淨整潔的成癮者，如果系統中有一堆不知道哪來的垃圾檔案，我晚上會睡不著。我親眼看過 AI 為了安裝一個 ffmpeg，不知從哪弄來一堆奇怪的 libs 把系統搞掛。但如果預先安裝了上面的各個工具，AI 就會又乖又整齊，而且不會亂試一堆有的沒的。

當然，你在每一個 Agent 的最原始設定（家目錄的 CLAUDE.md、gemini.md 或是 Cursor Rules）都要針對每一個環境先立好規矩：

- 和 Python 有關的操作一律用 uv，不要用 base 環境或 pip 弄髒我的電腦。
- 和 JS/TS 有關的操作一律用我指定的 nvm/npm/npx。
- 我系統有安裝 brew，不要用其它的方式（如 apt/yum）安裝必要的套件。
- 需要 docker 時我也有裝，不要試著自己重新安裝 runtime。

同場加映還有 gcloud，如果你的生活充滿了 Google 的服務，這個也一定要安裝上。

這樣子你的 AI 會好用很多，電腦也乾乾淨淨、清清爽爽。

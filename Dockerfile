# Python 3.12 官方映像
FROM python:3.12-slim

# 安裝 FastAPI 以及 OR-Tools 需要的一些系統套件 (如有需要)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 安裝 uv
RUN pip install uv

WORKDIR /app

# 先複製依賴設定
COPY pyproject.toml uv.lock ./

# 安裝依賴 (使用 --system 讓全域都可以使用套件)
RUN uv sync --system

# 複製專案代碼 (排班演算法主要在 solver 內)
COPY . /app/

# 設定環境變數
ENV PYTHONUNBUFFERED=1
ENV PORT=7860

# 開放 Hugging Face 預設的 7860 埠
EXPOSE 7860

# 使用 Uvicorn 啟動 FastAPI 服務
CMD ["uvicorn", "solver.app:app", "--host", "0.0.0.0", "--port", "7860"]

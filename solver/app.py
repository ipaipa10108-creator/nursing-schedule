import os
import sys
import logging
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

# 確保可以 import 同目錄下的 schedule_optimizer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    from schedule_optimizer import solve_schedule
except ImportError:
    # 支援在根目錄啟動的情況
    from solver.schedule_optimizer import solve_schedule

app = FastAPI(title="Nursing Schedule Solver API")

# 允許跨網域請求 (如果在 Vercel frontend 直連需要)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/api/schedules/cp-sat")
async def optimize_schedule(request: Request):
    """
    接收 JSON 並利用 Google OR-Tools 計算班表
    """
    try:
        data = await request.json()
        result = solve_schedule(data)
        
        # 若發生沒有錯誤但無解的狀況，確保回傳 422
        if not result.get("success"):
            return JSONResponse(content=result, status_code=422)
            
        return JSONResponse(content=result)
        
    except Exception as e:
        logging.exception("Solver API Failed")
        return JSONResponse(
            content={"success": False, "error": str(e)}, 
            status_code=500
        )

@app.get("/api/health")
def health_check():
    """給 UptimeRobot 或其他監控服務確認存活用的 API"""
    return {"status": "ok", "service": "cp-sat-solver"}

if __name__ == "__main__":
    import uvicorn
    # 本地測試使用
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)

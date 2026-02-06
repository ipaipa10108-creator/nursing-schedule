
import sys
import json
import logging
from calendar import monthrange
from ortools.sat.python import cp_model

# 設定日誌
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def solve_schedule(data):
    """
    使用 CP-SAT 求解護理排班問題
    遵循台灣勞基法與醫療現場慣例
    """
    try:
        # 1. 解析輸入資料
        nurses = data['nurses']
        shift_types = data['shiftTypes']
        year = data['year']
        month = data['month'] + 1  # JS 0-indexed 轉 Python 1-indexed
        ward_config = data.get('wardConfig', {})
        constraints_config = data.get('constraints', {})
        pre_assigned = data.get('preAssigned', [])
        
        # 取得月份天數
        num_days = monthrange(year, month)[1]
        num_nurses = len(nurses)
        all_days = range(num_days)
        all_nurses = range(num_nurses)
        
        # 建立班別對應表
        # 假設班別代碼: D(白), E(小), N(大), O(休)
        # 這裡我們只處理需要排班的工作班別，休假視為不排班
        working_shifts = [s for s in shift_types if s['code'] in ['D', 'E', 'N']]
        num_working_shifts = len(working_shifts)
        
        shift_code_map = {s['code']: i for i, s in enumerate(working_shifts)}
        rev_shift_map = {i: s for i, s in enumerate(working_shifts)}
        
        # 取得各班別索引 (若不存在則為 -1)
        idx_d = shift_code_map.get('D', -1)
        idx_e = shift_code_map.get('E', -1)
        idx_n = shift_code_map.get('N', -1)
        
        # 2. 建立 CP-SAT 模型
        model = cp_model.CpModel()
        
        # 決策變數: shifts[(n, d, s)]
        # n: 護理師索引, d: 日期索引, s: 班別索引 (0:D, 1:E, 2:N)
        shifts = {}
        for n in all_nurses:
            for d in all_days:
                for s in range(num_working_shifts):
                    shifts[(n, d, s)] = model.NewBoolVar(f'shift_n{n}_d{d}_s{s}')

        # 建立護理師 ID 到索引的映射，供後續使用
        nurse_id_map = {n['id']: i for i, n in enumerate(nurses)}

        # ==========================================
        # 硬限制 (Hard Constraints)
        # ==========================================

        # (0) 特定人員禁止特定班別 (Forbidden Shifts)
        # e.g. Nurse A cannot work Night ('N')
        nurse_forbidden_shifts = data.get('nurseForbiddenShifts', {})
        # Format: { "nurse_id": ["N", "D"], ... }
        
        for n_id, forbidden_codes in nurse_forbidden_shifts.items():
            n_idx = nurse_id_map.get(n_id)
            if n_idx is None: continue
            
            for code in forbidden_codes:
                s_idx = shift_code_map.get(code)
                if s_idx is not None:
                    # Apply to all days
                    for d in all_days:
                        model.Add(shifts[(n_idx, d, s_idx)] == 0)

        # (1) 每日每人最多只能上一個班 (不能同時上白班又上小夜)
        # 隱含意: 若 sum 為 0，代表當天休假 (Off)
        for n in all_nurses:
            for d in all_days:
                model.Add(sum(shifts[(n, d, s)] for s in range(num_working_shifts)) <= 1)

        # (2) 預排班表與請假 (Pre-assigned)
        # 這是絕對限制，如同事已請假或預約特定班別
        
        for p in pre_assigned:
            n_idx = nurse_id_map.get(p['nurseId'])
            if n_idx is None: continue
            
            try:
                # 解析日期 "YYYY-MM-DD"
                p_date = int(p['date'].split('-')[2]) - 1
                if p_date < 0 or p_date >= num_days: continue
                
                target_code = p['shiftCode']
                
                if target_code in shift_code_map:
                    # 指定必須上某班
                    s_idx = shift_code_map[target_code]
                    model.Add(shifts[(n_idx, p_date, s_idx)] == 1)
                else:
                    # 若為 'O' 或其他非工作班別，代表當天不能排任何工作班
                    # 也就是 sum(shifts) == 0
                    model.Add(sum(shifts[(n_idx, p_date, s)] for s in range(num_working_shifts)) == 0)
            except Exception as e:
                logger.warning(f"Error processing pre-assign: {e}")
                continue

        # (3) 勞基法第 34 條：輪班間隔 11 小時
        # 禁止: E(前日) -> D(今日) (間隔 8 小時)
        # 禁止: N(前日) -> E(今日) (間隔 8 小時)
        # 禁止: N(前日) -> D(今日) (間隔 0 小時)
        if constraints_config.get('minShiftInterval11h', True):
            for n in all_nurses:
                for d in range(num_days - 1):
                    # E -> D
                    if idx_e != -1 and idx_d != -1:
                        model.Add(shifts[(n, d, idx_e)] + shifts[(n, d + 1, idx_d)] <= 1)
                    # N -> E
                    if idx_n != -1 and idx_e != -1:
                        model.Add(shifts[(n, d, idx_n)] + shifts[(n, d + 1, idx_e)] <= 1)
                    # N -> D
                    if idx_n != -1 and idx_d != -1:
                        model.Add(shifts[(n, d, idx_n)] + shifts[(n, d + 1, idx_d)] <= 1)

        # 每日最低人力需求 (Daily Demand)
        # 從 Ward Config 讀取，若無則依賴輸入的 constraints
        min_nurses_d = ward_config.get('minNursesDay', 0)
        min_nurses_e = ward_config.get('minNursesEvening', 0)
        min_nurses_n = ward_config.get('minNursesNight', 0)

        # 每日最高人力需求 (Maximum Capacity) - 避免人力過剩
        max_nurses_d = ward_config.get('maxNursesDay', num_nurses)
        max_nurses_e = ward_config.get('maxNursesEvening', num_nurses)
        max_nurses_n = ward_config.get('maxNursesNight', num_nurses)

        for d in all_days:
            if idx_d != -1:
                # Min constraint
                model.Add(sum(shifts[(n, d, idx_d)] for n in all_nurses) >= min_nurses_d)
                # Max constraint
                model.Add(sum(shifts[(n, d, idx_d)] for n in all_nurses) <= max_nurses_d)
                
            if idx_e != -1:
                model.Add(sum(shifts[(n, d, idx_e)] for n in all_nurses) >= min_nurses_e)
                model.Add(sum(shifts[(n, d, idx_e)] for n in all_nurses) <= max_nurses_e)
                
            if idx_n != -1:
                model.Add(sum(shifts[(n, d, idx_n)] for n in all_nurses) >= min_nurses_n)
                model.Add(sum(shifts[(n, d, idx_n)] for n in all_nurses) <= max_nurses_n)

        # (5) 資深人員 (N2+) 覆蓋率 (Skill Mix)
        # 每一班至少要有一位 N2 以上的人員
        min_senior = constraints_config.get('minSeniorCount', 1)
        senior_levels = ['N2', 'N3', 'N4']
        senior_indices = [i for i, n in enumerate(nurses) if n.get('level') in senior_levels]
        
        if senior_indices:
            for d in all_days:
                for s in range(num_working_shifts):
                    model.Add(sum(shifts[(n, d, s)] for n in senior_indices) >= min_senior)

        # (6) 月排班天數限制 (Workload)
        # 勞基法每7日應有2日之休息(例假/休息日)，即四週至少8天假
        # 換算月工作天數上限：30天 - 8天 = 22天左右，通常設 max 22-23
        # 這裡從 Ward Config 讀取
        min_work_days = ward_config.get('minWorkingDays', 15)
        max_work_days = ward_config.get('maxWorkingDays', 23)

        for n in all_nurses:
            # 計算該護理師總上班天數
            total_worked = sum(shifts[(n, d, s)] for d in all_days for s in range(num_working_shifts))
            
            # 硬限制或軟限制？為了求解可行性，建議作為硬限制，除非極端缺人
            # 這裡設為 Relaxed Hard Constraints (如有必要可轉軟限制)
            model.Add(total_worked >= min_work_days)
            model.Add(total_worked <= max_work_days)

        # ==========================================
        # 軟限制與目標函數 (Soft Constraints & Objective)
        # ==========================================
        obj_terms = []
        
        # ==========================================
        # 軟限制與目標函數 (Soft Constraints & Objective)
        # ==========================================
        obj_terms = []
        
        # (A) 避免花花班 (Flower Pattern) - Weight: 20
        # 定義：頻繁的班別切換，如 D -> N -> D
        weight_flower = 20
        if constraints_config.get('avoidFlowerPattern', True) and idx_d != -1 and idx_n != -1:
            for n in all_nurses:
                for d in range(num_days - 1):
                    # 懲罰 D -> N
                    is_dn = model.NewBoolVar(f'is_dn_{n}_{d}')
                    model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] == 2).OnlyEnforceIf(is_dn)
                    model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] < 2).OnlyEnforceIf(is_dn.Not())
                    obj_terms.append(is_dn * -weight_flower)

            # 懲罰 D -> N -> D (三日邏輯)
            if num_days >= 3:
                for n in all_nurses:
                    for d in range(num_days - 2):
                         is_dnd = model.NewBoolVar(f'is_dnd_{n}_{d}')
                         # 條件: D(d) AND N(d+1) AND D(d+2)
                         # Sum = 3
                         model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] + shifts[(n, d+2, idx_d)] == 3).OnlyEnforceIf(is_dnd)
                         model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] + shifts[(n, d+2, idx_d)] < 3).OnlyEnforceIf(is_dnd.Not())
                         obj_terms.append(is_dnd * -(weight_flower * 2))

        # (B) 均勻分配班次 (Fairness) - Workload Balance
        # 策略：Minimize(max_worked - min_worked)
        # 讓大家的工作天數盡量接近
        
        work_days_per_nurse = []
        for n in all_nurses:
            total_worked = sum(shifts[(n, d, s)] for d in all_days for s in range(num_working_shifts))
            work_days_per_nurse.append(total_worked)

        # 定義 max_shifts 和 min_shifts 變數
        max_shifts = model.NewIntVar(0, num_days, 'max_shifts')
        min_shifts = model.NewIntVar(0, num_days, 'min_shifts')
        
        model.AddMaxEquality(max_shifts, work_days_per_nurse)
        model.AddMinEquality(min_shifts, work_days_per_nurse)
        
        # 懲罰差距: Weight 50 (比花花班高，確保公平)
        model.Add(max_shifts - min_shifts <= 5)
        obj_terms.append((max_shifts - min_shifts) * -50)
        
        # (C) 優先排休 (Maximize Holidays)
        # 使用者需求：若有多餘人力時應該以放假為主
        # 策略：Minimize(Total Shifts) -> Maximize(Holidays)
        # 在滿足 MinNurses 與 MinWorkingDays 的前提下，盡量減少不必要的班
        # 係數設為 1，做為最後的 Tie-breaker，不影響公平性與花花班
        total_shifts_all = sum(work_days_per_nurse)
        obj_terms.append(total_shifts_all * -1)

        # (D) 連續上班天數限制
        # 每人最多連續上班 6 天 (或是 7 天，看 30-1 條變形工時)
        max_consecutive_days = 6
        
        # 實作: 滑動視窗，連續 7 天的總工作日數 <= 6
        for n in all_nurses:
            for d in range(num_days - max_consecutive_days):
                # 視窗大小: max_consecutive_days + 1
                window_size = max_consecutive_days + 1
                window_shifts = [shifts[(n, d + k, s)] for k in range(window_size) for s in range(num_working_shifts)]
                model.Add(sum(window_shifts) <= max_consecutive_days)

        # 求解 Maximization
        model.Maximize(sum(obj_terms))
        
        solver = cp_model.CpSolver()
        # 設定求解參數
        solver.parameters.max_time_in_seconds = 60.0
        solver.parameters.num_search_workers = 8 # 平行運算
        solver.parameters.log_search_progress = False 

        status = solver.Solve(model)

        if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
            result_schedules = []
            for n in all_nurses:
                for d in all_days:
                    # 預設為 Off
                    current_shift_code = None
                    current_shift_id = None
                    
                    for s in range(num_working_shifts):
                        if solver.BooleanValue(shifts[(n, d, s)]):
                            current_shift_code = rev_shift_map[s]['code']
                            current_shift_id = rev_shift_map[s]['id']
                            break
                    
                    # 只有有排班才加入結果，Off 不需回傳 (或者回傳 ShiftType 'Off' 若有)
                    # 這裡是回傳排班紀錄
                    if current_shift_code:
                         date_str = f"{year}-{month:02d}-{d+1:02d}"
                         result_schedules.append({
                             'date': date_str,
                             'nurseId': nurses[n]['id'],
                             'shiftTypeId': current_shift_id,
                             'shiftCode': current_shift_code
                         })

            return {
                "success": True,
                "status": solver.StatusName(status),
                "schedules": result_schedules
            }
        else:
            return {
                "success": False,
                "error": f"無可行解 (Status: {solver.StatusName(status)})",
                "details": "可能原因：人力不足無法滿足最低需求，或是預假過多導致無法排班。"
            }

    except Exception as e:
        logger.exception("Solver 發生錯誤")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    # 從 stdin 讀取 JSON
    input_str = sys.stdin.read()
    if not input_str:
        print(json.dumps({"success": False, "error": "No input provided"}))
        sys.exit(1)
        
    try:
        data = json.loads(input_str)
        result = solve_schedule(data)
        print(json.dumps(result))
    except json.JSONDecodeError:
        print(json.dumps({"success": False, "error": "Invalid JSON"}))

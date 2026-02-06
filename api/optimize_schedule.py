from http.server import BaseHTTPRequestHandler
import json
import logging
from calendar import monthrange
from ortools.sat.python import cp_model

# Config Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def solve_schedule(data):
    """
    CP-SAT Solver Logic (Directly ported for Serverless execution)
    """
    try:
        # 1. Parse Data
        nurses = data.get('nurses', [])
        shift_types = data.get('shiftTypes', [])
        year = data.get('year')
        month = data.get('month') + 1  # JS 0-indexed to Python 1-indexed
        ward_config = data.get('wardConfig', {})
        constraints_config = data.get('constraints', {})
        pre_assigned = data.get('preAssigned', [])
        
        # Basic Validation
        if not nurses or not shift_types or year is None or month is None:
            return {"success": False, "error": "Missing required data (nurses, shiftTypes, year, month)"}

        # Calculations
        num_days = monthrange(year, month)[1]
        num_nurses = len(nurses)
        all_days = range(num_days)
        all_nurses = range(num_nurses)
        
        # Shift Mapping (D, E, N only)
        working_shifts = [s for s in shift_types if s['code'] in ['D', 'E', 'N']]
        num_working_shifts = len(working_shifts)
        
        shift_code_map = {s['code']: i for i, s in enumerate(working_shifts)}
        rev_shift_map = {i: s for i, s in enumerate(working_shifts)}
        
        idx_d = shift_code_map.get('D', -1)
        idx_e = shift_code_map.get('E', -1)
        idx_n = shift_code_map.get('N', -1)
        
        # 2. Build Model
        model = cp_model.CpModel()
        shifts = {}

        # Decision Variables
        for n in all_nurses:
            for d in all_days:
                for s in range(num_working_shifts):
                    shifts[(n, d, s)] = model.NewBoolVar(f'shift_n{n}_d{d}_s{s}')

        nurse_id_map = {n['id']: i for i, n in enumerate(nurses)}

        # --- Hard Constraints ---

        # (0) Forbidden Shifts
        nurse_forbidden_shifts = data.get('nurseForbiddenShifts', {})
        for n_id, forbidden_codes in nurse_forbidden_shifts.items():
            n_idx = nurse_id_map.get(n_id)
            if n_idx is None: continue
            for code in forbidden_codes:
                s_idx = shift_code_map.get(code)
                if s_idx is not None:
                    for d in all_days:
                        model.Add(shifts[(n_idx, d, s_idx)] == 0)

        # (1) Max 1 shift per day
        for n in all_nurses:
            for d in all_days:
                model.Add(sum(shifts[(n, d, s)] for s in range(num_working_shifts)) <= 1)

        # (2) Pre-assigned
        for p in pre_assigned:
            n_idx = nurse_id_map.get(p['nurseId'])
            if n_idx is None: continue
            try:
                # Format "YYYY-MM-DD"
                p_date = int(p['date'].split('-')[2]) - 1
                if p_date < 0 or p_date >= num_days: continue
                
                target_code = p['shiftCode']
                if target_code in shift_code_map:
                    s_idx = shift_code_map[target_code]
                    model.Add(shifts[(n_idx, p_date, s_idx)] == 1)
                else:
                    # Off or non-working
                    model.Add(sum(shifts[(n_idx, p_date, s)] for s in range(num_working_shifts)) == 0)
            except Exception as e:
                logger.warning(f"Error processing pre-assign: {e}")
                continue

        # (3) Min Interval 11h
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

        # (4) Daily Demand (Min/Max)
        min_nurses_d = ward_config.get('minNursesDay', 0)
        min_nurses_e = ward_config.get('minNursesEvening', 0)
        min_nurses_n = ward_config.get('minNursesNight', 0)
        max_nurses_d = ward_config.get('maxNursesDay', num_nurses)
        max_nurses_e = ward_config.get('maxNursesEvening', num_nurses)
        max_nurses_n = ward_config.get('maxNursesNight', num_nurses)

        for d in all_days:
            if idx_d != -1:
                model.Add(sum(shifts[(n, d, idx_d)] for n in all_nurses) >= min_nurses_d)
                model.Add(sum(shifts[(n, d, idx_d)] for n in all_nurses) <= max_nurses_d)
            if idx_e != -1:
                model.Add(sum(shifts[(n, d, idx_e)] for n in all_nurses) >= min_nurses_e)
                model.Add(sum(shifts[(n, d, idx_e)] for n in all_nurses) <= max_nurses_e)
            if idx_n != -1:
                model.Add(sum(shifts[(n, d, idx_n)] for n in all_nurses) >= min_nurses_n)
                model.Add(sum(shifts[(n, d, idx_n)] for n in all_nurses) <= max_nurses_n)

        # (5) Senior Cover
        min_senior = constraints_config.get('minSeniorCount', 1)
        senior_levels = ['N2', 'N3', 'N4']
        senior_indices = [i for i, n in enumerate(nurses) if n.get('level') in senior_levels]
        
        if senior_indices:
            for d in all_days:
                for s in range(num_working_shifts):
                    model.Add(sum(shifts[(n, d, s)] for n in senior_indices) >= min_senior)

        # (6) Workload (Min/Max days)
        min_work_days = ward_config.get('minWorkingDays', 15)
        max_work_days = ward_config.get('maxWorkingDays', 23)

        for n in all_nurses:
            total_worked = sum(shifts[(n, d, s)] for d in all_days for s in range(num_working_shifts))
            model.Add(total_worked >= min_work_days)
            model.Add(total_worked <= max_work_days)

        # --- Soft Constraints & Objective ---
        obj_terms = []

        # (A) Flower Pattern
        weight_flower = 20
        if constraints_config.get('avoidFlowerPattern', True) and idx_d != -1 and idx_n != -1:
            for n in all_nurses:
                # D -> N check
                for d in range(num_days - 1):
                    is_dn = model.NewBoolVar(f'is_dn_{n}_{d}')
                    model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] == 2).OnlyEnforceIf(is_dn)
                    model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] < 2).OnlyEnforceIf(is_dn.Not())
                    obj_terms.append(is_dn * -weight_flower)
                
                # D -> N -> D check
                if num_days >= 3:
                     for d in range(num_days - 2):
                         is_dnd = model.NewBoolVar(f'is_dnd_{n}_{d}')
                         model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] + shifts[(n, d+2, idx_d)] == 3).OnlyEnforceIf(is_dnd)
                         model.Add(shifts[(n, d, idx_d)] + shifts[(n, d+1, idx_n)] + shifts[(n, d+2, idx_d)] < 3).OnlyEnforceIf(is_dnd.Not())
                         obj_terms.append(is_dnd * -(weight_flower * 2))

        # (B) Fairness
        work_days_per_nurse = []
        for n in all_nurses:
            total = sum(shifts[(n, d, s)] for d in all_days for s in range(num_working_shifts))
            work_days_per_nurse.append(total)

        max_shifts = model.NewIntVar(0, num_days, 'max_shifts')
        min_shifts = model.NewIntVar(0, num_days, 'min_shifts')
        model.AddMaxEquality(max_shifts, work_days_per_nurse)
        model.AddMinEquality(min_shifts, work_days_per_nurse)
        
        model.Add(max_shifts - min_shifts <= 5)
        obj_terms.append((max_shifts - min_shifts) * -50)

        # (C) Minimize Total Shifts (Maximize Holidays)
        total_shifts_all = sum(work_days_per_nurse)
        obj_terms.append(total_shifts_all * -1)

        # (D) Consecutive Days <= 6
        max_consecutive = 6
        for n in all_nurses:
            for d in range(num_days - max_consecutive):
                window_size = max_consecutive + 1
                window_shifts = [shifts[(n, d + k, s)] for k in range(window_size) for s in range(num_working_shifts)]
                model.Add(sum(window_shifts) <= max_consecutive)

        # Solve
        model.Maximize(sum(obj_terms))
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = 10.0 # Fast response for serverless
        solver.parameters.num_search_workers = 4

        status = solver.Solve(model)

        if status in [cp_model.OPTIMAL, cp_model.FEASIBLE]:
            result_schedules = []
            for n in all_nurses:
                for d in all_days:
                    current_shift_code = None
                    current_shift_id = None
                    for s in range(num_working_shifts):
                        if solver.BooleanValue(shifts[(n, d, s)]):
                            current_shift_code = rev_shift_map[s]['code']
                            current_shift_id = rev_shift_map[s]['id']
                            break
                    
                    if current_shift_code:
                        date_str = f"{year}-{month:02d}-{d+1:02d}"
                        result_schedules.append({
                             'date': date_str,
                             'nurseId': nurses[n]['id'],
                             'shiftTypeId': current_shift_id,
                             'shiftCode': current_shift_code
                        })
            return {"success": True, "schedules": result_schedules}
        else:
            return {"success": False, "error": f"Infeasible (Status: {solver.StatusName(status)})"}

    except Exception as e:
        logger.exception("Solver Error")
        return {"success": False, "error": str(e)}

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        
        try:
            data = json.loads(body)
            result = solve_schedule(data)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode('utf-8'))
            
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": "Invalid JSON"}).encode('utf-8'))
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))

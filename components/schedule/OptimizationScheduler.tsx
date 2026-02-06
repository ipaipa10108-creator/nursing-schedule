'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles, Settings, AlertTriangle, Save } from 'lucide-react';

interface Nurse {
  id: string;
  name: string;
  level: string;
  specialStatus?: string;
}

interface ShiftType {
  id: string;
  name: string;
  code: string;
}

interface Schedule {
  id: string;
  date: string;
  nurse: { id: string };
  shiftType: { code: string };
}

interface OptimizationSchedulerProps {
  nurses: Nurse[];
  shiftTypes: ShiftType[];
  year: number;
  month: number;
  schedules: Schedule[]; // Existing schedules
  onScheduleCreated: () => void;
}

export default function OptimizationScheduler({
  nurses,
  shiftTypes,
  year,
  month,
  schedules,
  onScheduleCreated,
}: OptimizationSchedulerProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Constraint State
  type Constraints = {
    minShiftInterval11h: boolean;
    max4WeekHours: boolean;
    avoidFlowerPattern: boolean;
    maxWeeklyShiftChanges: number;
    seniorNurseCoverage: boolean;
    equalShiftDistribution: boolean;
    minWorkingDays: number;
    minSeniorCount: number;
    // New Constraints
    minNursesDay: number;
    minNursesEvening: number;
    minNursesNight: number;
    maxNursesDay: number;
    maxNursesEvening: number;
    maxNursesNight: number;
  };

  const [constraints, setConstraints] = useState<Constraints>({
    minShiftInterval11h: true,
    max4WeekHours: true,
    avoidFlowerPattern: true,
    maxWeeklyShiftChanges: 2,
    seniorNurseCoverage: true,
    equalShiftDistribution: true,
    minWorkingDays: 20,
    minSeniorCount: 1,
    minNursesDay: 7,
    minNursesEvening: 7,
    minNursesNight: 4,
    maxNursesDay: 15,
    maxNursesEvening: 12,
    maxNursesNight: 10,
  });

  // Personnel Settings State
  type PersonnelSetting = {
    forbiddenShifts: string[];
    leavesRaw: string; // "1, 2, 5-10"
  };
  const [personnelSettings, setPersonnelSettings] = useState<Record<string, PersonnelSetting>>({});

  // Auto-configure forbidden shifts based on status
  useEffect(() => {
    if (nurses.length > 0) {
      setPersonnelSettings(prev => {
        const newSettings = { ...prev };
        let changed = false;
        nurses.forEach(nurse => {
          // Only auto-set if not already set (to preserve user manual overrides if they uncheck it)
          if (!prev[nurse.id]) {
            const forbidden: string[] = [];
            // Check for pregnancy or nursing status
            if (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing') {
              forbidden.push('N');
            }
            // Add other auto-rules here if needed

            if (forbidden.length > 0) {
              newSettings[nurse.id] = { forbiddenShifts: forbidden, leavesRaw: '' };
              changed = true;
            }
          }
        });
        return changed ? newSettings : prev;
      });
    }
  }, [nurses]);

  const toggleForbiddenShift = (nurseId: string, shiftCode: string) => {
    setPersonnelSettings(prev => {
      const current = prev[nurseId] || { forbiddenShifts: [], leavesRaw: '' };
      const shifts = current.forbiddenShifts.includes(shiftCode)
        ? current.forbiddenShifts.filter(s => s !== shiftCode)
        : [...current.forbiddenShifts, shiftCode];
      return { ...prev, [nurseId]: { ...current, forbiddenShifts: shifts } };
    });
  };

  const handleLeaveChange = (nurseId: string, value: string) => {
    setPersonnelSettings(prev => {
      const current = prev[nurseId] || { forbiddenShifts: [], leavesRaw: '' };
      return { ...prev, [nurseId]: { ...current, leavesRaw: value } };
    });
  };

  const parseLeaves = (raw: string): number[] => {
    if (!raw) return [];
    const days = new Set<number>();
    const parts = raw.split(/[,，\s]+/);
    parts.forEach(p => {
      if (p.includes('-')) {
        const [start, end] = p.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) days.add(i);
        }
      } else {
        const d = Number(p);
        if (!isNaN(d) && d > 0) days.add(d);
      }
    });
    return Array.from(days);
  };

  // Fetch Ward Settings on mount
  useEffect(() => {
    fetch('/api/ward/settings')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.ward) {
          setConstraints(prev => ({
            ...prev,
            minWorkingDays: data.ward.minWorkingDays || 20,
            minNursesDay: data.ward.minNursesDay || 7,
            minNursesEvening: data.ward.minNursesEvening || 7,
            minNursesNight: data.ward.minNursesNight || 4,
            maxNursesDay: data.ward.maxNursesDay || 15,
            maxNursesEvening: data.ward.maxNursesEvening || 12,
            maxNursesNight: data.ward.maxNursesNight || 10,
          }));
        }
      })
      .catch(err => console.error("Failed to load ward settings", err));
  }, []);

  const handleConstraintChange = (key: keyof typeof constraints, value: any) => {
    setConstraints(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      // 1. Fetch current settings first to avoid overwriting other fields (like name, beds)
      const fetchRes = await fetch('/api/ward/settings');
      const fetchData = await fetchRes.json();

      let baseSettings = {};
      if (fetchData.success && fetchData.ward) {
        baseSettings = fetchData.ward;
      }

      // 2. Merge with current constraints
      const updatedSettings = {
        ...baseSettings,
        minNursesDay: constraints.minNursesDay,
        minNursesEvening: constraints.minNursesEvening,
        minNursesNight: constraints.minNursesNight,
        maxNursesDay: constraints.maxNursesDay,
        maxNursesEvening: constraints.maxNursesEvening,
        maxNursesNight: constraints.maxNursesNight,
        minWorkingDays: constraints.minWorkingDays,
      };

      // 3. Save
      const saveRes = await fetch('/api/ward/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });

      const saveData = await saveRes.json();
      if (saveData.success) {
        alert('設定已儲存！');
      } else {
        alert('儲存失敗: ' + (saveData.error || '不明錯誤'));
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('儲存過程中發生錯誤');
    } finally {
      setSaving(false);
    }
  };

  const handleOptimize = async () => {
    setLoading(true);
    try {
      // Construct the request body
      // Format existing schedules as pre-assigned
      const preAssigned = schedules.map(s => ({
        nurseId: s.nurse.id,
        date: s.date.split('T')[0], // Ensure YYYY-MM-DD
        shiftCode: s.shiftType.code
      }));

      // Process Personnel Settings
      const nurseForbiddenShifts: Record<string, string[]> = {};
      const vacationRequests: { nurseId: string; dates: number[] }[] = [];

      Object.entries(personnelSettings).forEach(([nurseId, settings]) => {
        if (settings.forbiddenShifts.length > 0) {
          nurseForbiddenShifts[nurseId] = settings.forbiddenShifts;
        }
        const dates = parseLeaves(settings.leavesRaw);
        if (dates.length > 0) {
          vacationRequests.push({ nurseId, dates });
        }
      });

      const payload = {
        nurses,
        shiftTypes,
        year,
        month,
        constraints,
        preAssigned,
        nurseForbiddenShifts,
        vacationRequests
      };

      const response = await fetch('/api/schedules/cp-sat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        alert(`最佳化完成！\n狀態: ${result.status}\n已產生 ${result.schedules.length} 筆排班資料`);
        if (result.schedules && result.schedules.length > 0) {
          // Bulk save the results
          const saveRes = await fetch('/api/schedules/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedules: result.schedules })
          });

          if (saveRes.ok) {
            onScheduleCreated();
            alert(`已成功排班！共產生 ${result.schedules.length} 筆班表。`);
          } else {
            console.error("Bulk save failed");
            alert("排班成功，但儲存失敗，請檢查後端日誌。");
          }
        }
      } else {
        alert(`運算失敗: ${result.error}`);
      }
    } catch (error) {
      console.error('Optimization error:', error);
      alert('Optimization failed to execute');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full border-indigo-200">
      <CardHeader className="bg-indigo-50">
        <CardTitle className="flex items-center gap-2 text-indigo-900">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          智慧排班 (Optimization)
          <span className="text-xs font-normal text-indigo-600 bg-indigo-100 px-2 py-1 rounded-full border border-indigo-200">
            CP-SAT Solver
          </span>
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSaveSettings}
          disabled={saving}
          className="border-indigo-200 text-indigo-700 hover:bg-indigo-100"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
          儲存設定
        </Button>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">

        {/* Info Section */}
        <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3 border border-blue-100">
          <Settings className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 space-y-1">
            <p className="font-medium">參數設定說明</p>
            <p>系統將使用 Google OR-Tools (CP-SAT) 進行運算。</p>
            <p>硬限制 (Hard Constraints) 為必須遵守的規則，若無法滿足將回傳無解。</p>
            <p>軟限制 (Soft Constraints) 為盡量滿足的目標，系統會尋找扣分最少的最佳解。</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Hard Constraints */}
          <div className="space-y-4 border p-4 rounded-lg bg-red-50/30">
            <h3 className="font-semibold text-red-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              法規限制 (Hard Constraints)
            </h3>

            <div className="flex items-start space-x-3 p-2 hover:bg-white rounded transition-colors">
              <Checkbox
                id="minShiftInterval11h"
                checked={constraints.minShiftInterval11h}
                onCheckedChange={(c) => handleConstraintChange('minShiftInterval11h', c)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="minShiftInterval11h" className="font-medium cursor-pointer">
                  勞基法 34條: 輪班間隔 11 小時
                </Label>
                <p className="text-xs text-gray-500">
                  強制禁止 N-E (間隔8hr) 等短於11小時的換班。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2 hover:bg-white rounded transition-colors">
              <Checkbox
                id="max4WeekHours"
                checked={constraints.max4WeekHours}
                onCheckedChange={(c) => handleConstraintChange('max4WeekHours', c)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="max4WeekHours" className="font-medium cursor-pointer">
                  勞基法 30-1條: 四週變形工時
                </Label>
                <p className="text-xs text-gray-500">
                  4週內正常工時上限 160hr，且每2週至少2日例假，4週內至少8日休假。
                </p>
              </div>
            </div>
          </div>

          {/* Soft Constraints */}
          <div className="space-y-4 border p-4 rounded-lg bg-green-50/30">
            <h3 className="font-semibold text-green-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              排班品質 (Soft Constraints)
            </h3>

            <div className="flex items-start space-x-3 p-2 hover:bg-white rounded transition-colors">
              <Checkbox
                id="avoidFlowerPattern"
                checked={constraints.avoidFlowerPattern}
                onCheckedChange={(c) => handleConstraintChange('avoidFlowerPattern', c)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="avoidFlowerPattern" className="font-medium cursor-pointer">
                  避免花花班 (Avoid Flower Pattern)
                </Label>
                <p className="text-xs text-gray-500">
                  減少 D-N-D 或頻繁跳班。
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 p-2 hover:bg-white rounded transition-colors">
              <div className="grid gap-1.5 leading-none flex-1">
                <Label htmlFor="maxWeeklyShiftChanges" className="font-medium">
                  每週最大換班次數
                </Label>
                <p className="text-xs text-gray-500">
                  建議每週不超過 2 次換班以維持生理時鐘。
                </p>
              </div>
              <Input
                id="maxWeeklyShiftChanges"
                type="number"
                className="w-20"
                value={constraints.maxWeeklyShiftChanges}
                onChange={(e) => handleConstraintChange('maxWeeklyShiftChanges', parseInt(e.target.value))}
                min={1}
                max={7}
              />
            </div>

            <div className="flex items-start space-x-3 p-2 hover:bg-white rounded transition-colors">
              <Checkbox
                id="seniorNurseCoverage"
                checked={constraints.seniorNurseCoverage}
                onCheckedChange={(c) => handleConstraintChange('seniorNurseCoverage', c)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="seniorNurseCoverage" className="font-medium cursor-pointer">
                  資深人員 (N2+) 覆蓋率
                </Label>
                <p className="text-xs text-gray-500">
                  每班盡量至少安排一位資深人員。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-2 hover:bg-white rounded transition-colors">
              <Checkbox
                id="equalShiftDistribution"
                checked={constraints.equalShiftDistribution}
                onCheckedChange={(c) => handleConstraintChange('equalShiftDistribution', c)}
              />
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="equalShiftDistribution" className="font-medium cursor-pointer">
                  班別數量均衡
                </Label>
                <p className="text-xs text-gray-500">
                  盡量讓每位護理師的 D/E/N 班數均勻分配。
                </p>
              </div>
            </div>
          </div>

          {/* Numeric Constraints */}
          <div className="space-y-4 border p-4 rounded-lg bg-blue-50/30">
            <h3 className="font-semibold text-blue-900 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              排班參數 (Parameters)
            </h3>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="minNursesDay" className="font-medium">
                  日班最低人數
                </Label>
                <p className="text-xs text-gray-500">
                  日班人力下限 (預設 7)
                </p>
              </div>
              <Input
                id="minNursesDay"
                type="number"
                className="w-20"
                value={constraints.minNursesDay}
                onChange={(e) => handleConstraintChange('minNursesDay', parseInt(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="maxNursesDay" className="font-medium">
                  日班最高人數
                </Label>
                <p className="text-xs text-gray-500">
                  日班人力上限 (例如 15)
                </p>
              </div>
              <Input
                id="maxNursesDay"
                type="number"
                className="w-20"
                value={constraints.maxNursesDay}
                onChange={(e) => handleConstraintChange('maxNursesDay', parseInt(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="minNursesEvening" className="font-medium">
                  小夜班最低人數
                </Label>
                <p className="text-xs text-gray-500">
                  小夜班人力下限 (預設 7)
                </p>
              </div>
              <Input
                id="minNursesEvening"
                type="number"
                className="w-20"
                value={constraints.minNursesEvening}
                onChange={(e) => handleConstraintChange('minNursesEvening', parseInt(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="maxNursesEvening" className="font-medium">
                  小夜班最高人數
                </Label>
                <p className="text-xs text-gray-500">
                  小夜班人力上限 (例如 12)
                </p>
              </div>
              <Input
                id="maxNursesEvening"
                type="number"
                className="w-20"
                value={constraints.maxNursesEvening}
                onChange={(e) => handleConstraintChange('maxNursesEvening', parseInt(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="minNursesNight" className="font-medium">
                  大夜班最低人數
                </Label>
                <p className="text-xs text-gray-500">
                  大夜班人力下限 (預設 4)
                </p>
              </div>
              <Input
                id="minNursesNight"
                type="number"
                className="w-20"
                value={constraints.minNursesNight}
                onChange={(e) => handleConstraintChange('minNursesNight', parseInt(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="maxNursesNight" className="font-medium">
                  大夜班最高人數
                </Label>
                <p className="text-xs text-gray-500">
                  大夜班人力上限 (例如 10)
                </p>
              </div>
              <Input
                id="maxNursesNight"
                type="number"
                className="w-20"
                value={constraints.maxNursesNight}
                onChange={(e) => handleConstraintChange('maxNursesNight', parseInt(e.target.value))}
                min={1}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="minWorkingDays" className="font-medium">
                  最低上班天數
                </Label>
                <p className="text-xs text-gray-500">
                  每人每月建議至少上班天數 (預設 20)
                </p>
              </div>
              <Input
                id="minWorkingDays"
                type="number"
                className="w-20"
                value={constraints.minWorkingDays}
                onChange={(e) => handleConstraintChange('minWorkingDays', parseInt(e.target.value))}
                min={1}
                max={31}
              />
            </div>

            <div className="flex items-center justify-between p-2">
              <div className="grid gap-1.5 leading-none">
                <Label htmlFor="minSeniorCount" className="font-medium">
                  每班最低 N2+ 人數
                </Label>
                <p className="text-xs text-gray-500">
                  確保值班品質 (預設 1)
                </p>
              </div>
              <Input
                id="minSeniorCount"
                type="number"
                className="w-20"
                value={constraints.minSeniorCount}
                onChange={(e) => handleConstraintChange('minSeniorCount', parseInt(e.target.value))}
                min={0}
                max={5}
              />
            </div>
          </div>

          {/* Individual Personnel Settings */}
          <div className="space-y-4 border p-4 rounded-lg bg-orange-50/30 md:col-span-2">
            <h3 className="font-semibold text-orange-900 flex items-center gap-2">
              <span className="flex items-center justify-center w-4 h-4 rounded-full border border-orange-600 text-[10px] font-bold text-orange-600">P</span>
              個別護理師設定 (Personnel Constraints)
            </h3>

            <div className="rounded-md border bg-white">
              <div className="grid grid-cols-12 gap-2 p-3 bg-gray-50 border-b text-xs font-medium text-gray-500">
                <div className="col-span-3">護理師 (Nurse)</div>
                <div className="col-span-4">禁止班別 (Forbidden Shifts)</div>
                <div className="col-span-5">指定休假日期 (Leave Dates) - 請輸入日 (例如: 1, 5, 20)</div>
              </div>

              <div className="max-h-60 overflow-y-auto">
                {nurses.map((nurse) => (
                  <div key={nurse.id} className="grid grid-cols-12 gap-2 p-3 border-b last:border-0 hover:bg-gray-50/50 items-center">
                    <div className="col-span-3 font-medium text-sm flex flex-col">
                      <span>{nurse.name}</span>
                      <span className="text-[10px] text-gray-400">{nurse.level}</span>
                    </div>

                    <div className="col-span-4 flex gap-2">
                      {['D', 'E', 'N'].map((code) => {
                        const isForbidden = personnelSettings[nurse.id]?.forbiddenShifts?.includes(code);
                        return (
                          <Button
                            key={code}
                            variant={isForbidden ? "destructive" : "outline"}
                            size="sm"
                            className={`h-7 px-2 text-xs ${isForbidden ? 'opacity-90' : 'text-gray-500'}`}
                            onClick={() => toggleForbiddenShift(nurse.id, code)}
                          >
                            {isForbidden ? `禁止 ${code}` : code}
                          </Button>
                        );
                      })}
                    </div>

                    <div className="col-span-5">
                      <Input
                        placeholder="例: 1, 5, 20-22"
                        className="h-8 text-xs"
                        value={personnelSettings[nurse.id]?.leavesRaw || ''}
                        onChange={(e) => handleLeaveChange(nurse.id, e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              * 禁止班別: 該護理師整個月都不能上該班別。 <br />
              * 指定休假: 輸入日期數字，多日用逗號分隔 (如 1, 3, 5) 或範圍 (如 10-15)。
            </p>
          </div>

        </div>

        <div className="pt-6 border-t">
          <Button
            className="w-full h-12 text-lg bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all active:scale-[0.99]"
            onClick={handleOptimize}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                正在進行最佳化運算... (Solving)
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                開始最佳化排班 (Run Optimization)
              </>
            )}
          </Button>
          <p className="text-center text-xs text-gray-500 mt-2">
            運算約需 1-3 分鐘，請勿關閉視窗。
          </p>
        </div>

      </CardContent>
    </Card >
  );
}

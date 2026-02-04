'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar, Loader2, Trash2, RotateCcw, Users, Sparkles } from 'lucide-react';

interface Nurse {
  id: string;
  name: string;
  employeeId: string;
  level: string;
  specialStatus: string;
  annualLeave: number;
  isActive?: boolean;
}

interface ShiftType {
  id: string;
  name: string;
  code: string;
}

interface ExistingSchedule {
  id: string;
  date: string;
  nurse: {
    id: string;
    name: string;
  };
  shiftType: {
    code: string;
    name: string;
  };
}

interface LeavePrioritySchedulerProps {
  nurses: Nurse[];
  shiftTypes: ShiftType[];
  year: number;
  month: number;
  onScheduleCreated: () => void;
}

export default function LeavePriorityScheduler({
  nurses,
  shiftTypes,
  year,
  month,
  onScheduleCreated,
}: LeavePrioritySchedulerProps) {
  const [selectedNurse, setSelectedNurse] = useState('');
  const [leaveDates, setLeaveDates] = useState<number[]>([]);
  const [preferredShifts, setPreferredShifts] = useState<string[]>(['D', 'E']);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [existingSchedules, setExistingSchedules] = useState<ExistingSchedule[]>([]);
  const [loadingSchedules, setLoadingSchedules] = useState(false);
  
  // New scheduling options
  const [schedulingMode, setSchedulingMode] = useState<'single' | 'auto'>('single'); // 'single' for specific nurse, 'auto' for all nurses
  const [priorityOption, setPriorityOption] = useState<'fixed' | 'rotating'>('fixed'); // 'fixed' = 固定班, 'rotating' = 花班

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const dateArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // Fetch existing schedules when nurse is selected
  useEffect(() => {
    if (selectedNurse) {
      fetchExistingSchedules();
    } else {
      setExistingSchedules([]);
      setLeaveDates([]);
    }
  }, [selectedNurse, year, month]);

  async function fetchExistingSchedules() {
    if (!selectedNurse) return;
    
    setLoadingSchedules(true);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/schedules?month=${monthStr}`);
      const data = await response.json();
      
      if (data.success) {
        setExistingSchedules(data.data);
      }
    } catch (error) {
      console.error('Error fetching schedules:', error);
    } finally {
      setLoadingSchedules(false);
    }
  }

  function toggleLeaveDate(date: number) {
    setLeaveDates(prev =>
      prev.includes(date)
        ? prev.filter(d => d !== date)
        : [...prev, date]
    );
  }

  function clearAllLeaveDates() {
    if (confirm('確定要清空所有已選擇的假期嗎？')) {
      setLeaveDates([]);
    }
  }

  async function clearAllSchedules() {
    if (!selectedNurse) {
      alert('請先選擇護理師');
      return;
    }
    
    if (!confirm(`確定要清空 ${selectedNurseData?.name} ${year}年${month + 1}月的所有班表嗎？`)) {
      return;
    }

    setClearing(true);
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/schedules/clear?month=${monthStr}&nurseId=${selectedNurse}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`已清空 ${data.count} 個班表`);
        setExistingSchedules([]);
        onScheduleCreated();
      } else {
        alert(data.error || '清空失敗');
      }
    } catch (error) {
      console.error('Error clearing schedules:', error);
      alert('清空過程中發生錯誤');
    } finally {
      setClearing(false);
    }
  }

  async function handleAutoSchedule() {
    setLoading(true);
    try {
      let response;
      
      if (schedulingMode === 'single' && selectedNurse) {
        // Single nurse mode - use existing API
        response = await fetch('/api/schedules/auto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nurseId: selectedNurse,
            year,
            month,
            leaveDates,
            preferredShifts,
          }),
        });
      } else {
        // Auto mode for all nurses - use new API
        response = await fetch('/api/schedules/leave-priority', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year,
            month,
            mode: priorityOption, // 'fixed' or 'rotating'
            nursePreferences: selectedNurse ? [{
              nurseId: selectedNurse,
              leaveDates,
              preferredShifts
            }] : null,
          }),
        });
      }

      const data = await response.json();
      setResult(data);

      if (data.success) {
        const msg = schedulingMode === 'single' 
          ? `自動排班完成！共建立 ${data.created} 個班表`
          : `全自動排班完成！\n總計: ${data.totalScheduled} 個班表\n已安排護理師: ${data.nurseCount} 人\n符合N2要求: ${data.meetsN2Requirement ? '是' : '否'}`;
        alert(msg);
        onScheduleCreated();
        if (selectedNurse) fetchExistingSchedules();
      } else {
        alert(data.error || '自動排班失敗');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('排班過程中發生錯誤');
    } finally {
      setLoading(false);
    }
  }

  const selectedNurseData = nurses.find(n => n.id === selectedNurse);
  
  // Calculate leave days excluding weekends
  function countWeekdayLeaves(dates: number[]) {
    return dates.filter(date => {
      const dayOfWeek = new Date(year, month, date).getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6;
    }).length;
  }
  
  const weekdayLeaveCount = countWeekdayLeaves(leaveDates);
  
  // Calculate remaining leave
  const remainingLeave = selectedNurseData 
    ? Math.max(0, selectedNurseData.annualLeave - weekdayLeaveCount)
    : 0;
  
  // Calculate scheduled days for selected nurse
  const scheduledDaysCount = selectedNurse 
    ? existingSchedules.filter(s => s.nurse.id === selectedNurse).length 
    : 0;
  const overflowLeave = scheduledDaysCount < 8 ? 8 - scheduledDaysCount : 0;
  
  const leaveUsagePercent = selectedNurseData 
    ? Math.min(100, (weekdayLeaveCount / selectedNurseData.annualLeave) * 100)
    : 0;

  // Check if a date has existing schedule
  function hasExistingSchedule(date: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return existingSchedules.find(s => s.date.startsWith(dateStr));
  }

  // Get shift color
  function getShiftColor(code: string) {
    const colors: Record<string, string> = {
      D: 'bg-blue-500',
      E: 'bg-orange-500',
      N: 'bg-purple-500',
    };
    return colors[code] || 'bg-gray-500';
  }

  // Get nurse level priority (for N2+ check)
  function getNurseLevelPriority(level: string): number {
    const priorities: Record<string, number> = {
      'N0': 0,
      'N1': 1,
      'N2': 2,
      'N3': 3,
      'N4': 4,
    };
    return priorities[level] || 0;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          假期優先排班模式
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scheduling Mode Selection */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <label className="text-sm font-medium mb-3 block flex items-center gap-2">
            <Users className="w-4 h-4" />
            排班模式選擇
          </label>
          <div className="space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="schedulingMode"
                value="single"
                checked={schedulingMode === 'single'}
                onChange={() => setSchedulingMode('single')}
                className="mt-1"
              />
              <div>
                <span className="font-medium">特定護理師排班</span>
                <p className="text-xs text-gray-600">選擇特定護理師，標記假期後自動安排</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="radio"
                name="schedulingMode"
                value="auto"
                checked={schedulingMode === 'auto'}
                onChange={() => setSchedulingMode('auto')}
                className="mt-1"
              />
              <div>
                <span className="font-medium">全系統自動排班</span>
                <p className="text-xs text-gray-600">依勞動條件自動為所有人員排班（24小時間隔、每班N2+、月休8天）</p>
              </div>
            </label>
          </div>
        </div>

        {/* Priority Options - Only show in auto mode */}
        {schedulingMode === 'auto' && (
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <label className="text-sm font-medium mb-3 block flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              排班優先辦法
            </label>
            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="priorityOption"
                  value="fixed"
                  checked={priorityOption === 'fixed'}
                  onChange={() => setPriorityOption('fixed')}
                  className="mt-1"
                />
                <div>
                  <span className="font-medium">固定班別優先</span>
                  <p className="text-xs text-gray-600">當月盡量讓每人穩定在某一固定班別，減少輪調</p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="priorityOption"
                  value="rotating"
                  checked={priorityOption === 'rotating'}
                  onChange={() => setPriorityOption('rotating')}
                  className="mt-1"
                />
                <div>
                  <span className="font-medium">花班輪調</span>
                  <p className="text-xs text-gray-600">依花班安排，每人輪流上不同班別</p>
                </div>
              </label>
            </div>
          </div>
        )}

        {/* Select Nurse - Only show in single mode */}
        {schedulingMode === 'single' && (
          <div>
            <label className="text-sm font-medium mb-2 block">選擇護理師</label>
            <Select value={selectedNurse} onValueChange={setSelectedNurse}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="選擇要排班的護理師" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {/* Available Nurses */}
                <SelectGroup>
                  <SelectLabel className="text-green-700 bg-green-50 font-semibold">
                    ✓ 可排班人員
                  </SelectLabel>
                  {nurses.filter(n => {
                    if (!n.isActive) return false;
                    const scheduledDays = existingSchedules.filter(s => s.nurse.id === n.id).length;
                    return scheduledDays === 0;
                  }).map(nurse => (
                    <SelectItem key={nurse.id} value={nurse.id}>
                      <span className="text-green-700">{nurse.name} ({nurse.level})</span>
                      <span className="text-gray-500"> - 特休: {nurse.annualLeave}天</span>
                      {nurse.specialStatus !== 'none' && <span> 🚫</span>}
                    </SelectItem>
                  ))}
                </SelectGroup>
                
                {/* Scheduled Nurses */}
                {nurses.filter(n => {
                  if (!n.isActive) return false;
                  const scheduledDays = existingSchedules.filter(s => s.nurse.id === n.id).length;
                  return scheduledDays > 0;
                }).length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-gray-500 bg-gray-100 font-semibold border-t mt-1">
                      ✗ 已有班表人員
                    </SelectLabel>
                    {nurses.filter(n => {
                      if (!n.isActive) return false;
                      const scheduledDays = existingSchedules.filter(s => s.nurse.id === n.id).length;
                      return scheduledDays > 0;
                    }).map(nurse => {
                      const nurseSchedules = existingSchedules.filter(s => s.nurse.id === nurse.id);
                      return (
                        <SelectItem 
                          key={nurse.id} 
                          value={nurse.id}
                          className="opacity-70"
                        >
                          <span className="text-gray-500">{nurse.name} ({nurse.level})</span>
                          <span className="text-orange-600 text-xs"> (已排{nurseSchedules.length}天班)</span>
                        </SelectItem>
                      );
                    })}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Leave Calendar - Show for single mode or with specific nurse in auto mode */}
        {(schedulingMode === 'single' || selectedNurse) && (
          <>
            {selectedNurse && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-medium">標記假期日期（週六日為灰色，不計入特休）</label>
                  <div className="flex gap-2">
                    <button
                      onClick={clearAllLeaveDates}
                      className="text-xs text-red-600 hover:text-red-800 flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      清空假期
                    </button>
                  </div>
                </div>

                {/* Annual Leave Info */}
                {selectedNurseData && (
                  <div className="mb-3 p-3 bg-white rounded border">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{selectedNurseData.name}</span>
                        <span className="text-sm text-gray-500 ml-2">({selectedNurseData.level})</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm">
                          特休: <span className="font-bold">{selectedNurseData.annualLeave}天</span>
                          {overflowLeave > 0 && (
                            <span className="text-orange-600 ml-2">溢假: {overflowLeave}天</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Leave usage progress */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span>假期使用: {weekdayLeaveCount}天 (週六日{leaveDates.length - weekdayLeaveCount}天不計)</span>
                        <span>{Math.round(leaveUsagePercent)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            leaveUsagePercent > 100 ? 'bg-red-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, leaveUsagePercent)}%` }}
                        />
                      </div>
                      {leaveUsagePercent > 100 && (
                        <p className="text-xs text-red-600 mt-1">⚠️ 假期天數超過特休額度</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Calendar Grid */}
                <div className="grid grid-cols-7 gap-1">
                  {weekDays.map(day => (
                    <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                      {day}
                    </div>
                  ))}
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="p-1" />
                  ))}
                  {dateArray.map(date => {
                    const isLeave = leaveDates.includes(date);
                    const existing = hasExistingSchedule(date);
                    const dayOfWeek = new Date(year, month, date).getDay();
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                    return (
                      <button
                        key={date}
                        onClick={() => toggleLeaveDate(date)}
                        className={`p-2 text-sm rounded border transition-colors relative ${
                          isLeave
                            ? 'bg-red-100 border-red-300 text-red-700'
                            : isWeekend
                              ? 'bg-gray-100 border-gray-200 text-gray-500'
                              : existing
                                ? 'bg-green-50 border-green-200'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="font-medium">{date}</div>
                        {isWeekend && <div className="text-xs">休</div>}
                        {existing && (
                          <div className={`absolute top-0.5 right-0.5 w-2 h-2 rounded-full ${getShiftColor(existing.shiftType.code)}`} />
                        )}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  💡 點擊日期標記為假期。紅點表示已有班表。週六日標記為假期不計入特休。
                </p>
              </div>
            )}

            {/* Preferred Shifts - Only for single mode */}
            {schedulingMode === 'single' && selectedNurse && (
              <div>
                <label className="text-sm font-medium mb-2 block">偏好班別</label>
                <div className="flex gap-4">
                  {shiftTypes.filter(st => st.code !== 'N' || 
                    !(selectedNurseData?.specialStatus === 'pregnant' || selectedNurseData?.specialStatus === 'nursing')
                  ).map(shift => (
                    <label key={shift.id} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={preferredShifts.includes(shift.code)}
                        onCheckedChange={() => {
                          setPreferredShifts(prev =>
                            prev.includes(shift.code)
                              ? prev.filter(c => c !== shift.code)
                              : [...prev, shift.code]
                          );
                        }}
                      />
                      <span className="text-sm">{shift.name} ({shift.code})</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Auto Mode Info */}
        {schedulingMode === 'auto' && (
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h4 className="font-medium text-green-800 mb-2">🤖 全自動排班說明</h4>
            <ul className="text-sm text-green-700 space-y-1 list-disc list-inside">
              <li>系統將為所有活躍護理師自動排班</li>
              <li>遵守24小時間隔規定（同一人相鄰班次至少間隔24小時）</li>
              <li>每班至少安排一位N2(含)以上資深護理師</li>
              <li>盡量滿足每人月休8天（有特休者可超過）</li>
              <li>孕婦/哺乳人員自動排除大夜班</li>
              {priorityOption === 'fixed' && <li>✨ 優先固定班：每人盡量固定在同一班別</li>}
              {priorityOption === 'rotating' && <li>✨ 花班輪調：依輪班制安排不同班別</li>}
            </ul>
            <p className="text-xs text-gray-600 mt-2">
              💡 如需為特定人員標記假期，請先選擇「特定護理師排班」模式
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleAutoSchedule}
            disabled={loading || (schedulingMode === 'single' && !selectedNurse)}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                排班中...
              </>
            ) : schedulingMode === 'auto' ? (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                開始全自動排班
              </>
            ) : (
              '開始自動排班'
            )}
          </Button>
          
          {schedulingMode === 'single' && selectedNurse && (
            <Button
              onClick={clearAllSchedules}
              disabled={clearing}
              variant="outline"
              className="text-red-600 border-red-300 hover:bg-red-50"
            >
              {clearing ? (
                <RotateCcw className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </Button>
          )}
        </div>

        {/* Result */}
        {result && (
          <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {result.success ? (
              <>
                <p className="font-bold text-lg mb-2">
                  {schedulingMode === 'auto' ? '✅ 全自動排班完成' : '✅ 自動排班完成'}
                </p>
                {schedulingMode === 'single' ? (
                  <div className="text-sm space-y-1">
                    <p>共建立 {result.created} 個班表</p>
                    {result.errors > 0 && <p className="text-orange-600">失敗: {result.errors} 天</p>}
                    {result.warnings > 0 && <p className="text-yellow-600">警告: {result.warnings} 項</p>}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* 基本统计 */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="bg-white p-2 rounded border">
                        <p className="text-gray-600">總班表數</p>
                        <p className="text-xl font-bold">{result.totalScheduled}</p>
                      </div>
                      <div className="bg-white p-2 rounded border">
                        <p className="text-gray-600">參與護理師</p>
                        <p className="text-xl font-bold">{result.nurseCount} 人</p>
                      </div>
                      <div className="bg-white p-2 rounded border">
                        <p className="text-gray-600">平均班數</p>
                        <p className="text-xl font-bold">{result.avgDaysPerNurse?.toFixed(1)} 天</p>
                      </div>
                      <div className={`p-2 rounded border ${result.overtimeCount > 0 ? 'bg-red-100 border-red-300' : 'bg-white'}`}>
                        <p className="text-gray-600">加班人數</p>
                        <p className={`text-xl font-bold ${result.overtimeCount > 0 ? 'text-red-600' : ''}`}>
                          {result.overtimeCount || 0} 人
                        </p>
                      </div>
                    </div>

                    {/* 护病比详情 */}
                    {result.avgActualRatios && (
                      <div className="bg-white p-3 rounded border">
                        <p className="font-medium mb-2">📊 實際護病比（精確數字）</p>
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div className="text-center p-2 bg-blue-50 rounded">
                            <p className="text-blue-700 font-medium">日班</p>
                            <p className="text-lg font-bold">1:{result.avgActualRatios.D?.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              目標: 1:{result.targetRequirements?.D > 0 ? Math.floor(30/result.targetRequirements.D) : 5}
                            </p>
                          </div>
                          <div className="text-center p-2 bg-orange-50 rounded">
                            <p className="text-orange-700 font-medium">小夜班</p>
                            <p className="text-lg font-bold">1:{result.avgActualRatios.E?.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              目標: 1:{result.targetRequirements?.E > 0 ? Math.floor(30/result.targetRequirements.E) : 5}
                            </p>
                          </div>
                          <div className="text-center p-2 bg-purple-50 rounded">
                            <p className="text-purple-700 font-medium">大夜班</p>
                            <p className="text-lg font-bold">1:{result.avgActualRatios.N?.toFixed(2)}</p>
                            <p className="text-xs text-gray-500">
                              目標: 1:{result.targetRequirements?.N > 0 ? Math.floor(30/result.targetRequirements.N) : 6}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 班次分布 */}
                    {result.shiftDistribution && (
                      <div className="bg-white p-3 rounded border">
                        <p className="font-medium mb-2">📅 班別分布</p>
                        <div className="flex gap-4 text-sm">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">日班: {result.shiftDistribution.D} 班次</span>
                          <span className="px-2 py-1 bg-orange-100 text-orange-800 rounded">小夜班: {result.shiftDistribution.E} 班次</span>
                          <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">大夜班: {result.shiftDistribution.N} 班次</span>
                        </div>
                      </div>
                    )}

                    {/* 警告信息 */}
                    {(result.daysWithGaps > 0 || result.shiftsWithoutSenior > 0) && (
                      <div className="bg-yellow-50 border border-yellow-300 p-3 rounded">
                        <p className="font-medium text-yellow-800 mb-1">⚠️ 需要注意的問題</p>
                        {result.daysWithGaps > 0 && (
                          <p className="text-sm text-yellow-700">
                            • {result.daysWithGaps} 天有護病比缺口，總缺 {result.totalGaps} 人次
                          </p>
                        )}
                        
                        {/* 詳細缺 N2+ 信息 */}
                        {result.missingN2Details && result.missingN2Details.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-red-700 font-medium mb-1">
                              • 缺 N2+ 資深護理師詳細：
                            </p>
                            <div className="space-y-1 text-xs">
                              {result.missingN2Details.slice(0, 5).map((detail: any, idx: number) => (
                                <div key={idx} className="flex items-center gap-2 bg-white p-1.5 rounded border border-red-200">
                                  <span className="font-bold text-red-600">{detail.date}日</span>
                                  <span className={`px-1.5 py-0.5 rounded text-xs ${
                                    detail.shiftCode === 'D' ? 'bg-blue-100 text-blue-700' :
                                    detail.shiftCode === 'E' ? 'bg-orange-100 text-orange-700' :
                                    'bg-purple-100 text-purple-700'
                                  }`}>
                                    {detail.shiftName}
                                  </span>
                                  <span className="text-gray-500">({detail.timeRange})</span>
                                  <span className="text-gray-600">- 現有 {detail.actualCount} 人</span>
                                </div>
                              ))}
                              {result.missingN2Details.length > 5 && (
                                <p className="text-xs text-gray-500">
                                  ...還有 {result.missingN2Details.length - 5} 個班次缺 N2+
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* 建議調派人員 */}
                        {result.availableSeniors && result.availableSeniors.length > 0 && (
                          <div className="mt-2">
                            <p className="text-sm text-green-700 font-medium mb-1">
                              💡 建議調派以下資深護理師補足：
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {result.availableSeniors.slice(0, 8).map((nurse: any, idx: number) => (
                                <span key={idx} className="inline-block px-2 py-1 bg-green-100 text-green-800 text-xs rounded border border-green-300">
                                  {nurse.name} {nurse.level}
                                </span>
                              ))}
                              {result.availableSeniors.length > 8 && (
                                <span className="text-xs text-gray-500">...等 {result.availableSeniors.length} 人</span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        <p className="text-xs text-gray-600 mt-2">
                          建議：優先調派上述資深護理師至缺 N2+ 的班次，或適度調整護病比設定
                        </p>
                      </div>
                    )}

                    {/* 加班人员列表 */}
                    {result.overtimeCount > 0 && result.dailyStatus && (
                      <div className="bg-red-50 border border-red-200 p-3 rounded">
                        <p className="font-medium text-red-800 mb-2">🔥 加班人員（紅色標記）</p>
                        <div className="text-sm space-y-1">
                          {Array.from(new Set(
                            result.dailyStatus.flatMap((d: any) => d.overtimeNurses || [])
                          )).slice(0, 10).map((name: any, idx: number) => (
                            <span key={idx} className="inline-block px-2 py-1 bg-red-200 text-red-900 rounded mr-2 mb-1">
                              {name}
                            </span>
                          ))}
                          {result.overtimeCount > 10 && (
                            <span className="text-xs text-gray-600">...還有 {result.overtimeCount - 10} 人</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-600 mt-2">
                          這些人員超過基準 8天+特休，將以紅色背景顯示在班表中
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p>❌ {result.error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

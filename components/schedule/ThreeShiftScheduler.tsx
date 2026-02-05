'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Calendar, Loader2, Users, Clock, AlertCircle, Scroll } from 'lucide-react';

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
  startTime: string;
  endTime: string;
}

interface ThreeShiftSchedulerProps {
  nurses: Nurse[];
  shiftTypes: ShiftType[];
  year: number;
  month: number;
  onScheduleCreated: () => void;
}

export default function ThreeShiftScheduler({
  nurses,
  shiftTypes,
  year,
  month,
  onScheduleCreated,
}: ThreeShiftSchedulerProps) {
  const [selectedNursesByShift, setSelectedNursesByShift] = useState<Record<string, string[]>>({
    D: [],
    E: [],
    N: [],
  });
  const [nurseVacationDates, setNurseVacationDates] = useState<Record<string, number[]>>({});
  const [selectedVacationNurse, setSelectedVacationNurse] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [duplicateNurses, setDuplicateNurses] = useState<string[]>([]);
  const [syncScroll, setSyncScroll] = useState(true); // 預設開啟同步捲動

  // Refs for scrollable containers
  const dayShiftRef = useRef<HTMLDivElement>(null);
  const eveningShiftRef = useRef<HTMLDivElement>(null);
  const nightShiftRef = useRef<HTMLDivElement>(null);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const dateArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  // Toggle nurse selection for a shift
  function toggleNurseForShift(shiftCode: string, nurseId: string) {
    setSelectedNursesByShift(prev => {
      const currentNurses = prev[shiftCode] || [];
      const newNurses = currentNurses.includes(nurseId)
        ? currentNurses.filter(id => id !== nurseId)
        : [...currentNurses, nurseId];

      return {
        ...prev,
        [shiftCode]: newNurses
      };
    });

    // Check for duplicates after update
    setTimeout(() => checkForDuplicates(), 0);
  }

  // Check for duplicate nurse selections across shifts
  function checkForDuplicates() {
    const allSelected = new Map<string, string[]>();

    Object.entries(selectedNursesByShift).forEach(([shiftCode, nurseIds]) => {
      nurseIds.forEach(nurseId => {
        if (!allSelected.has(nurseId)) {
          allSelected.set(nurseId, []);
        }
        allSelected.get(nurseId)!.push(shiftCode);
      });
    });

    const duplicates = Array.from(allSelected.entries())
      .filter(([_, shifts]) => shifts.length > 1)
      .map(([nurseId, _]) => nurseId);

    setDuplicateNurses(duplicates);
  }

  // Get all active nurses (for display alignment across all shifts)
  function getAllActiveNurses() {
    return nurses.filter(nurse => nurse.isActive);
  }

  // Check if a nurse can take a specific shift
  function canNurseTakeShift(nurse: Nurse, shiftCode: string) {
    // Pregnant/nursing nurses cannot take night shift
    if (shiftCode === 'N' &&
      (nurse.specialStatus === 'pregnant' || nurse.specialStatus === 'nursing')) {
      return false;
    }
    return true;
  }

  // Get nurses selected in other shifts (for duplicate checking)
  function getNursesInOtherShifts(currentShiftCode: string) {
    const otherShifts = Object.entries(selectedNursesByShift)
      .filter(([code, _]) => code !== currentShiftCode);

    const nurseSet = new Set<string>();
    otherShifts.forEach(([_, nurseIds]) => {
      nurseIds.forEach(id => nurseSet.add(id));
    });

    return nurseSet;
  }

  // Toggle vacation date for a nurse
  function toggleVacationDate(nurseId: string, date: number) {
    setNurseVacationDates(prev => {
      const currentDates = prev[nurseId] || [];
      const newDates = currentDates.includes(date)
        ? currentDates.filter(d => d !== date)
        : [...currentDates, date];

      return {
        ...prev,
        [nurseId]: newDates
      };
    });
  }

  // Check if a nurse is selected in multiple shifts
  function getNurseDuplicateShifts(nurseId: string) {
    const shifts: string[] = [];
    Object.entries(selectedNursesByShift).forEach(([shiftCode, nurseIds]) => {
      if (nurseIds.includes(nurseId)) {
        shifts.push(shiftCode);
      }
    });
    return shifts;
  }

  // Sync scroll across all three shift columns
  function handleScroll(source: 'D' | 'E' | 'N') {
    if (!syncScroll) return;

    const sourceRef = source === 'D' ? dayShiftRef : source === 'E' ? eveningShiftRef : nightShiftRef;
    const scrollTop = sourceRef.current?.scrollTop || 0;

    // Sync other columns
    if (source !== 'D' && dayShiftRef.current) {
      dayShiftRef.current.scrollTop = scrollTop;
    }
    if (source !== 'E' && eveningShiftRef.current) {
      eveningShiftRef.current.scrollTop = scrollTop;
    }
    if (source !== 'N' && nightShiftRef.current) {
      nightShiftRef.current.scrollTop = scrollTop;
    }
  }

  async function handleThreeShiftSchedule() {
    // Validate: need at least one nurse per shift
    const hasD = selectedNursesByShift.D && selectedNursesByShift.D.length > 0;
    const hasE = selectedNursesByShift.E && selectedNursesByShift.E.length > 0;
    const hasN = selectedNursesByShift.N && selectedNursesByShift.N.length > 0;

    if (!hasD && !hasE && !hasN) {
      alert('請至少為一個班別選擇護理師');
      return;
    }

    // Check for duplicates
    if (duplicateNurses.length > 0) {
      const nurseNames = duplicateNurses.map(id => nurses.find(n => n.id === id)?.name).join(', ');
      if (!confirm(`${nurseNames} 被重複選擇在多個班別中。這可能導致排班衝突。是否繼續？`)) {
        return;
      }
    }

    setLoading(true);
    try {
      // Prepare vacation requests
      const vacationRequests = Object.entries(nurseVacationDates)
        .filter(([_, dates]) => dates.length > 0)
        .map(([nurseId, dates]) => ({
          nurseId,
          dates
        }));

      const response = await fetch('/api/schedules/three-shift-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          shiftAssignments: selectedNursesByShift,
          vacationRequests: vacationRequests.length > 0 ? vacationRequests : null,
        }),
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        alert(`三班排班完成！\n總安排: ${data.summary?.scheduledCount} 個班表\n日班: ${data.summary?.shiftBreakdown?.D || 0} | 小夜: ${data.summary?.shiftBreakdown?.E || 0} | 大夜: ${data.summary?.shiftBreakdown?.N || 0}`);
        onScheduleCreated();
        // Reset form
        setSelectedNursesByShift({ D: [], E: [], N: [] });
        setNurseVacationDates({});
        setSelectedVacationNurse('');
        setDuplicateNurses([]);
      } else {
        alert(data.error || '排班失敗');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('排班過程中發生錯誤');
    } finally {
      setLoading(false);
    }
  }

  // Get shift info
  const shiftD = shiftTypes.find(s => s.code === 'D');
  const shiftE = shiftTypes.find(s => s.code === 'E');
  const shiftN = shiftTypes.find(s => s.code === 'N');

  // Get all nurses that are selected in any shift (for vacation selection)
  const allSelectedNurseIds = new Set(
    Object.values(selectedNursesByShift).flat()
  );
  const allSelectedNurses = Array.from(allSelectedNurseIds)
    .map(id => nurses.find(n => n.id === id))
    .filter(Boolean);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="w-5 h-5" />
          三班模式排班
          <Badge variant="outline" className="ml-2 text-xs">均衡輪班</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Duplicate Warning */}
        {duplicateNurses.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-800">
              <span className="font-medium">重複選擇警告：</span>
              以下護理師被選擇在多個班別：
              {duplicateNurses.map(id => {
                const nurse = nurses.find(n => n.id === id);
                const shifts = getNurseDuplicateShifts(id);
                return (
                  <span key={id} className="font-bold ml-1">
                    {nurse?.name}({shifts.join('+')})
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 1: Select Nurses for Each Shift - Three Column Layout */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium flex items-center gap-2">
              <Clock className="w-4 h-4" />
              步驟 1: 為各班別選擇護理師（三班並排，方便對齊檢視）
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
              <Checkbox
                checked={syncScroll}
                onCheckedChange={(checked) => setSyncScroll(checked as boolean)}
              />
              <Scroll className="w-4 h-4" />
              <span>同步捲動</span>
            </label>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Day Shift Column */}
            <Card className="border-2 border-blue-200">
              <CardHeader className="py-3 bg-blue-50">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="text-blue-700 font-bold">
                    日班 {shiftD?.startTime}-{shiftD?.endTime}
                  </span>
                  <Badge variant="outline" className="bg-white">
                    已選 {selectedNursesByShift.D?.length || 0} 人
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent
                ref={dayShiftRef}
                onScroll={() => handleScroll('D')}
                className="py-3 space-y-1 max-h-96 overflow-y-auto"
              >
                {getAllActiveNurses().map(nurse => {
                  const isSelected = selectedNursesByShift.D?.includes(nurse.id);
                  const otherShifts = getNursesInOtherShifts('D');
                  const isInOtherShift = otherShifts.has(nurse.id);
                  const canTakeShift = canNurseTakeShift(nurse, 'D');

                  return (
                    <label
                      key={`D-${nurse.id}`}
                      className={`flex items-center gap-2 p-2 rounded border transition-colors ${!canTakeShift
                        ? 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'bg-blue-50 border-blue-300 cursor-pointer'
                          : isInOtherShift
                            ? 'bg-yellow-50 border-yellow-300 cursor-pointer'
                            : 'bg-white border-gray-200 hover:bg-gray-50 cursor-pointer'
                        }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={!canTakeShift}
                        onCheckedChange={() => canTakeShift && toggleNurseForShift('D', nurse.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${!canTakeShift ? 'text-gray-500' : ''}`}>
                          {nurse.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {nurse.level}
                          {!canTakeShift && (
                            <span className="ml-1 text-red-500">(不可排班)</span>
                          )}
                          {isInOtherShift && !isSelected && canTakeShift && (
                            <span className="ml-1 text-orange-600">(已選他班)</span>
                          )}
                          {nurse.specialStatus !== 'none' && (
                            <span className="ml-1">
                              {nurse.specialStatus === 'pregnant' ? '🤰' :
                                nurse.specialStatus === 'nursing' ? '🍼' :
                                  nurse.specialStatus === 'sick' ? '🤒' : '⚠️'}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            {/* Evening Shift Column */}
            <Card className="border-2 border-orange-200">
              <CardHeader className="py-3 bg-orange-50">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="text-orange-700 font-bold">
                    小夜班 {shiftE?.startTime}-{shiftE?.endTime}
                  </span>
                  <Badge variant="outline" className="bg-white">
                    已選 {selectedNursesByShift.E?.length || 0} 人
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent
                ref={eveningShiftRef}
                onScroll={() => handleScroll('E')}
                className="py-3 space-y-1 max-h-96 overflow-y-auto"
              >
                {getAllActiveNurses().map(nurse => {
                  const isSelected = selectedNursesByShift.E?.includes(nurse.id);
                  const otherShifts = getNursesInOtherShifts('E');
                  const isInOtherShift = otherShifts.has(nurse.id);
                  const canTakeShift = canNurseTakeShift(nurse, 'E');

                  return (
                    <label
                      key={`E-${nurse.id}`}
                      className={`flex items-center gap-2 p-2 rounded border transition-colors ${!canTakeShift
                        ? 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'bg-orange-50 border-orange-300 cursor-pointer'
                          : isInOtherShift
                            ? 'bg-yellow-50 border-yellow-300 cursor-pointer'
                            : 'bg-white border-gray-200 hover:bg-gray-50 cursor-pointer'
                        }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={!canTakeShift}
                        onCheckedChange={() => canTakeShift && toggleNurseForShift('E', nurse.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${!canTakeShift ? 'text-gray-500' : ''}`}>
                          {nurse.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {nurse.level}
                          {!canTakeShift && (
                            <span className="ml-1 text-red-500">(不可排班)</span>
                          )}
                          {isInOtherShift && !isSelected && canTakeShift && (
                            <span className="ml-1 text-orange-600">(已選他班)</span>
                          )}
                          {nurse.specialStatus !== 'none' && (
                            <span className="ml-1">
                              {nurse.specialStatus === 'pregnant' ? '🤰' :
                                nurse.specialStatus === 'nursing' ? '🍼' :
                                  nurse.specialStatus === 'sick' ? '🤒' : '⚠️'}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </CardContent>
            </Card>

            {/* Night Shift Column */}
            <Card className="border-2 border-purple-200">
              <CardHeader className="py-3 bg-purple-50">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="text-purple-700 font-bold">
                    大夜班 {shiftN?.startTime}-{shiftN?.endTime}
                  </span>
                  <Badge variant="outline" className="bg-white">
                    已選 {selectedNursesByShift.N?.length || 0} 人
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent
                ref={nightShiftRef}
                onScroll={() => handleScroll('N')}
                className="py-3 space-y-1 max-h-96 overflow-y-auto"
              >
                {getAllActiveNurses().map(nurse => {
                  const isSelected = selectedNursesByShift.N?.includes(nurse.id);
                  const otherShifts = getNursesInOtherShifts('N');
                  const isInOtherShift = otherShifts.has(nurse.id);
                  const canTakeShift = canNurseTakeShift(nurse, 'N');

                  return (
                    <label
                      key={`N-${nurse.id}`}
                      className={`flex items-center gap-2 p-2 rounded border transition-colors ${!canTakeShift
                        ? 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                        : isSelected
                          ? 'bg-purple-50 border-purple-300 cursor-pointer'
                          : isInOtherShift
                            ? 'bg-yellow-50 border-yellow-300 cursor-pointer'
                            : 'bg-white border-gray-200 hover:bg-gray-50 cursor-pointer'
                        }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={!canTakeShift}
                        onCheckedChange={() => canTakeShift && toggleNurseForShift('N', nurse.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${!canTakeShift ? 'text-gray-500' : ''}`}>
                          {nurse.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {nurse.level}
                          {!canTakeShift && (
                            <span className="ml-1 text-red-500">(不可排大夜班)</span>
                          )}
                          {isInOtherShift && !isSelected && canTakeShift && (
                            <span className="ml-1 text-orange-600">(已選他班)</span>
                          )}
                          {nurse.specialStatus !== 'none' && (
                            <span className="ml-1">
                              {nurse.specialStatus === 'pregnant' ? '🤰' :
                                nurse.specialStatus === 'nursing' ? '🍼' :
                                  nurse.specialStatus === 'sick' ? '🤒' : '⚠️'}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-gray-500 mt-2">
            💡 提示：已選其他班別的護理師會標示為「已選他班」(黃色背景)，重複選擇可能導致排班衝突
          </p>
        </div>

        {/* Step 2: Vacation Requests */}
        {allSelectedNurses.length > 0 && (
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <label className="text-sm font-medium mb-3 block flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              步驟 2: 特定人員假期需求（選填）
            </label>
            <p className="text-xs text-gray-600 mb-3">
              若有人員有特定假期需求，請先選擇人員，再標記假期日期。系統會自動為其他人員輪班。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Nurse Selection */}
              <div>
                <label className="text-xs text-gray-600 mb-1 block">選擇要標記假期的人員</label>
                <select
                  value={selectedVacationNurse}
                  onChange={(e) => setSelectedVacationNurse(e.target.value)}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="">選擇人員...</option>
                  {allSelectedNurses.map(nurse => (
                    <option key={nurse!.id} value={nurse!.id}>
                      {nurse!.name} ({nurse!.level})
                      {nurseVacationDates[nurse!.id]?.length > 0 &&
                        ` - 已標記${nurseVacationDates[nurse!.id].length}天`
                      }
                    </option>
                  ))}
                </select>
              </div>

              {/* Calendar for selected nurse */}
              <div className="md:col-span-2">
                {selectedVacationNurse ? (
                  <>
                    <label className="text-xs text-gray-600 mb-1 block">
                      標記假期日期（點擊日期切換）
                    </label>
                    <div className="grid grid-cols-7 gap-1">
                      {/* Week headers */}
                      {weekDays.map(day => (
                        <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">
                          {day}
                        </div>
                      ))}
                      {/* Empty cells */}
                      {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                        <div key={`empty-${i}`} className="p-1" />
                      ))}
                      {/* Date cells */}
                      {dateArray.map(date => {
                        const isVacation = nurseVacationDates[selectedVacationNurse]?.includes(date);
                        const dayOfWeek = new Date(year, month, date).getDay();
                        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                        return (
                          <button
                            key={date}
                            onClick={() => toggleVacationDate(selectedVacationNurse, date)}
                            className={`p-1.5 text-xs rounded border ${isVacation
                              ? 'bg-red-100 border-red-300 text-red-700'
                              : isWeekend
                                ? 'bg-gray-100 border-gray-200 text-gray-600'
                                : 'bg-white border-gray-200 hover:bg-gray-50'
                              }`}
                          >
                            {date}
                          </button>
                        );
                      })}
                    </div>
                    {nurseVacationDates[selectedVacationNurse]?.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        已標記 {nurseVacationDates[selectedVacationNurse].length} 天假期
                        <button
                          onClick={() => {
                            setNurseVacationDates(prev => ({ ...prev, [selectedVacationNurse]: [] }));
                          }}
                          className="ml-2 text-red-600 hover:underline"
                        >
                          清除
                        </button>
                      </p>
                    )}
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                    請先選擇要標記假期的人員
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <Button
          onClick={handleThreeShiftSchedule}
          disabled={loading || (selectedNursesByShift.D?.length === 0 && selectedNursesByShift.E?.length === 0 && selectedNursesByShift.N?.length === 0)}
          className="w-full bg-indigo-600 hover:bg-indigo-700 h-12 text-lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              三班排班處理中...
            </>
          ) : (
            '開始三班自動排班（均衡輪班制）'
          )}
        </Button>

        {/* Result */}
        {result && (
          <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {result.success ? (
              <>
                <p className="font-bold text-lg mb-2">✅ 三班排班完成</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="bg-white p-2 rounded">
                    <p className="text-gray-600">總安排</p>
                    <p className="text-2xl font-bold">{result.summary?.scheduledCount}</p>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <p className="text-gray-600">日班</p>
                    <p className="text-2xl font-bold text-blue-600">{result.summary?.shiftBreakdown?.D || 0}</p>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <p className="text-gray-600">小夜班</p>
                    <p className="text-2xl font-bold text-orange-600">{result.summary?.shiftBreakdown?.E || 0}</p>
                  </div>
                  <div className="bg-white p-2 rounded">
                    <p className="text-gray-600">大夜班</p>
                    <p className="text-2xl font-bold text-purple-600">{result.summary?.shiftBreakdown?.N || 0}</p>
                  </div>
                </div>
                {result.dailyStats && (
                  <div className="mt-3 text-sm">
                    <p className="font-medium">📊 每日各班人數統計：</p>
                    <div className="grid grid-cols-7 gap-1 mt-1 text-xs">
                      {Object.entries(result.dailyStats).slice(0, 7).map(([date, stats]: [string, any]) => (
                        <div key={date} className="bg-white p-1 rounded text-center">
                          <div className="font-bold">{date.split('-')[2]}日</div>
                          <div className="text-blue-600">D:{stats.D || 0}</div>
                          <div className="text-orange-600">E:{stats.E || 0}</div>
                          <div className="text-purple-600">N:{stats.N || 0}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">（顯示前7天為例，所有日期均已均衡安排）</p>
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

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus, Trash2, Calendar, AlertTriangle, Printer, Home, Users, Sparkles } from 'lucide-react';
import LeavePriorityScheduler from '@/components/schedule/LeavePriorityScheduler';
import ThreeShiftScheduler from '@/components/schedule/ThreeShiftScheduler';
import OptimizationScheduler from '@/components/schedule/OptimizationScheduler';


interface Nurse {
  id: string;
  name: string;
  employeeId: string;
  level: string;
  specialStatus: string;
  isActive?: boolean;
  annualLeave: number;
  sickLeave?: number;
  personalLeave?: number;
}

interface ShiftType {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
}

interface Schedule {
  id: string;
  date: string;
  nurse: Nurse;
  shiftType: ShiftType;
  status: string;
  violations?: string;
  notes?: string;
}

export default function SchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedNurse, setSelectedNurse] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mode, setMode] = useState<'manual' | 'leave-priority' | 'three-shift' | 'optimization'>('manual');
  const [wardSettings, setWardSettings] = useState<{
    name: string;
    totalBeds: number;
    nursePatientRatio: number;
    minNursesDay: number;
    minNursesEvening: number;
    minNursesNight: number;
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Calculate required nurses per shift based on nurse-patient ratio
  const requiredNursesPerShift = wardSettings
    ? Math.ceil(wardSettings.totalBeds / wardSettings.nursePatientRatio)
    : 7; // Default fallback

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  async function fetchData() {
    try {
      setLoading(true);
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

      const [nursesRes, shiftsRes, schedulesRes, wardRes] = await Promise.all([
        fetch('/api/nurses'),
        fetch('/api/shift-types'),
        fetch(`/api/schedules?month=${monthStr}`),
        fetch('/api/ward/settings'),
      ]);

      const nursesData = await nursesRes.json();
      const shiftsData = await shiftsRes.json();
      const schedulesData = await schedulesRes.json();
      const wardData = await wardRes.json();

      if (nursesData.success) setNurses(nursesData.data);
      if (shiftsData.success) setShiftTypes(shiftsData.data);
      if (schedulesData.success) setSchedules(schedulesData.data);
      if (wardData.success) setWardSettings(wardData.ward);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  function getDaysInMonth() {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    return { daysInMonth, firstDay };
  }

  function getSchedulesForDate(date: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return schedules.filter(s => s.date.startsWith(dateStr));
  }

  // Check nurse-patient ratio and N2+ requirement for a specific date
  function getShiftCoverageStatus(date: number) {
    const daySchedules = getSchedulesForDate(date);
    const shiftTypes = ['D', 'E', 'N'] as const;

    const status: Record<string, {
      count: number;
      hasSenior: boolean;
      meetsRatio: boolean;
      nurses: string[];
    }> = {};

    shiftTypes.forEach(shiftCode => {
      const shiftSchedules = daySchedules.filter(s => s.shiftType.code === shiftCode);
      const count = shiftSchedules.length;
      const hasSenior = shiftSchedules.some(s => {
        const level = s.nurse.level;
        return level === 'N2' || level === 'N3' || level === 'N4';
      });
      const meetsRatio = count >= requiredNursesPerShift;
      const nurses = shiftSchedules.map(s => s.nurse.name);

      status[shiftCode] = { count, hasSenior, meetsRatio, nurses };
    });

    return status;
  }

  async function handleCreateSchedule() {
    if (!selectedDate || !selectedNurse || !selectedShift) return;

    // Fix: Use local date components instead of toISOString to avoid timezone issues
    const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`;

    try {
      const response = await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: dateStr,
          nurseId: selectedNurse,
          shiftTypeId: selectedShift,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSchedules([...schedules, result.data]);
        // Show warnings if any
        if (result.violations && result.violations.length > 0) {
          const warnings = result.violations.filter((v: any) => v.type === 'warning');
          if (warnings.length > 0) {
            alert('班表已建立，但有以下警告：\n' + warnings.map((w: any) => `⚠️ ${w.message}`).join('\n'));
          }
        }
        setDialogOpen(false);
        setSelectedNurse('');
        setSelectedShift('');
      } else {
        // Show validation errors
        if (result.violations && result.violations.length > 0) {
          const errors = result.violations.filter((v: any) => v.type === 'error');
          alert('無法建立班表：\n' + errors.map((e: any) => `❌ ${e.message}\n${e.details}`).join('\n\n'));
        } else {
          alert(result.error || 'Failed to create schedule');
        }
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert('Error creating schedule');
    }
  }

  async function handleDeleteSchedule(scheduleId: string) {
    if (!confirm('確定要刪除此班表嗎？')) return;

    try {
      const response = await fetch(`/api/schedules?id=${scheduleId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setSchedules(schedules.filter(s => s.id !== scheduleId));
      } else {
        alert(result.error || 'Failed to delete schedule');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Error deleting schedule');
    }
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function getShiftColor(code: string) {
    const colors: Record<string, string> = {
      D: 'bg-blue-100 text-blue-800 border-blue-200',
      E: 'bg-orange-100 text-orange-800 border-orange-200',
      N: 'bg-purple-100 text-purple-800 border-purple-200',
    };
    return colors[code] || 'bg-gray-100 text-gray-800';
  }

  async function clearAllMonthSchedules() {
    if (!confirm(`確定要清空 ${year}年${month + 1}月 的所有班表嗎？此操作無法復原！`)) {
      return;
    }

    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/schedules/clear?month=${monthStr}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        alert(`已清空 ${data.count} 個班表`);
        fetchData();
      } else {
        alert(data.error || '清空失敗');
      }
    } catch (error) {
      console.error('Error clearing schedules:', error);
      alert('清空過程中發生錯誤');
    }
  }

  async function handleConfirmSchedule(scheduleId: string, currentStatus: string) {
    const newStatus = currentStatus === 'confirmed' ? 'scheduled' : 'confirmed';
    const actionText = newStatus === 'confirmed' ? '確定' : '取消確定';

    try {
      const response = await fetch('/api/schedules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: scheduleId, status: newStatus }),
      });

      const result = await response.json();

      if (result.success) {
        setSchedules(schedules.map(s =>
          s.id === scheduleId ? { ...s, status: newStatus } : s
        ));
        alert(`已${actionText}班表`);
      } else {
        alert(result.error || '操作失敗');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('操作過程中發生錯誤');
    }
  }

  // Check if a nurse is already scheduled for the selected date
  function isNurseScheduled(nurseId: string, dateStr: string) {
    const schedule = schedules.find(s =>
      s.nurse.id === nurseId && s.date.startsWith(dateStr)
    );
    return schedule;
  }

  const { daysInMonth, firstDay } = getDaysInMonth();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  if (loading) {
    return <div className="p-8 text-center">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">班表管理</h1>
              <p className="text-gray-600 mt-1">婦癌病房 | 點擊日期進行排班</p>
            </div>
            <div className="flex items-center gap-4">
              <Button variant="outline" onClick={prevMonth}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xl font-semibold min-w-[140px] text-center">
                {year}年 {month + 1}月
              </span>
              <Button variant="outline" onClick={nextMonth}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Mode Toggle */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => window.location.href = '/'}
              className="flex items-center gap-2 text-gray-700"
            >
              <Home className="w-4 h-4" />
              回到首頁
            </Button>
            <Button
              variant={mode === 'manual' ? 'default' : 'outline'}
              onClick={() => setMode('manual')}
              className="flex items-center gap-2"
            >
              <Calendar className="w-4 h-4" />
              手動排班
            </Button>
            <Button
              variant={mode === 'leave-priority' ? 'default' : 'outline'}
              onClick={() => setMode('leave-priority')}
            >
              假期優先模式
            </Button>
            <Button
              variant={mode === 'three-shift' ? 'default' : 'outline'}
              onClick={() => setMode('three-shift')}
              className="flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              三班模式
            </Button>
            <Button
              variant={mode === 'optimization' ? 'default' : 'outline'}
              onClick={() => setMode('optimization')}
              className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 border-indigo-200"
            >
              <Sparkles className="w-4 h-4" />
              智慧排班
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = '/off-duty'}
              className="text-green-600 hover:text-green-700"
            >
              <Users className="w-4 h-4 mr-1" />
              Off人員查詢
            </Button>
            <Button
              variant="outline"
              onClick={() => window.location.href = '/schedule/print'}
              className="text-blue-600 hover:text-blue-700"
            >
              <Printer className="w-4 h-4 mr-1" />
              列印班表
            </Button>
            <Button
              variant="outline"
              onClick={clearAllMonthSchedules}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              <AlertTriangle className="w-4 h-4 mr-1" />
              清空當月
            </Button>
          </div>

          {/* Ward Settings Info */}
          {wardSettings && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-sm text-gray-600">病房：</span>
                  <span className="font-medium">{wardSettings.name}</span>
                </div>
                <div className="text-gray-300">|</div>
                <div>
                  <span className="text-sm text-gray-600">病床：</span>
                  <span className="font-medium">{wardSettings.totalBeds}床</span>
                </div>
                <div className="text-gray-300">|</div>
                <div>
                  <span className="text-sm text-gray-600">護病比：</span>
                  <span className="font-medium">1:{wardSettings.nursePatientRatio}</span>
                </div>
                <div className="text-gray-300">|</div>
                <div className="bg-blue-100 px-3 py-1 rounded">
                  <span className="text-sm text-blue-800">每班最低需求：</span>
                  <span className="font-bold text-blue-900">{requiredNursesPerShift}人</span>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                含N2+資深護理師
              </div>
            </div>
          )}
        </header>

        {mode === 'three-shift' ? (
          <ThreeShiftScheduler
            nurses={nurses}
            shiftTypes={shiftTypes}
            year={year}
            month={month}
            onScheduleCreated={fetchData}
          />
        ) : mode === 'optimization' ? (
          <OptimizationScheduler
            nurses={nurses}
            shiftTypes={shiftTypes}
            year={year}
            month={month}
            onScheduleCreated={fetchData}
          />
        ) : mode === 'leave-priority' ? (
          <LeavePriorityScheduler
            nurses={nurses}
            shiftTypes={shiftTypes}
            year={year}
            month={month}
            onScheduleCreated={fetchData}
          />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-2 mb-2">
              {weekDays.map(day => (
                <div key={day} className="text-center font-semibold py-2 text-gray-700">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`empty-${i}`} className="h-32" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, i) => {
                const date = i + 1;
                const dateSchedules = getSchedulesForDate(date);
                const isToday = new Date().toDateString() === new Date(year, month, date).toDateString();
                const coverageStatus = getShiftCoverageStatus(date);

                // Check for coverage issues
                const hasCoverageIssues = Object.values(coverageStatus).some(
                  status => !status.meetsRatio || !status.hasSenior
                );

                return (
                  <Dialog key={date} open={dialogOpen && selectedDate?.getDate() === date} onOpenChange={(open) => {
                    if (open) {
                      setSelectedDate(new Date(year, month, date));
                      setDialogOpen(true);
                    } else {
                      setDialogOpen(false);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Card className={`h-[450px] cursor-pointer hover:shadow-md transition-shadow ${isToday ? 'ring-2 ring-blue-500' : ''} ${hasCoverageIssues ? 'border-red-300' : ''}`}>
                        <CardHeader className="p-2 pb-0">
                          <CardTitle className={`text-sm ${isToday ? 'text-blue-600 font-bold' : 'text-gray-700'}`}>
                            {date}
                            {hasCoverageIssues && <span className="text-red-500 ml-1">⚠️</span>}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="p-2 pt-0">
                          <div className="space-y-1 h-[380px] overflow-y-auto">
                            {/* Show nurses by shift */}
                            {['D', 'E', 'N'].map(shiftCode => {
                              const shiftSchedules = dateSchedules.filter(s => s.shiftType.code === shiftCode);
                              if (shiftSchedules.length === 0) return null;

                              // Check if this shift has N2+ senior nurse
                              const hasSeniorNurse = shiftSchedules.some(s =>
                                s.nurse.level === 'N2' || s.nurse.level === 'N3' || s.nurse.level === 'N4'
                              );

                              // Find the leader (highest rank: N4 > N3 > N2)
                              const seniorNurses = shiftSchedules.filter(s =>
                                s.nurse.level === 'N2' || s.nurse.level === 'N3' || s.nurse.level === 'N4'
                              );

                              // Sort by level (N4 first, then N3, then N2)
                              const levelPriority: Record<string, number> = { 'N4': 4, 'N3': 3, 'N2': 2 };
                              const sortedSeniors = seniorNurses.sort((a, b) =>
                                (levelPriority[b.nurse.level] || 0) - (levelPriority[a.nurse.level] || 0)
                              );

                              const leader = sortedSeniors[0]; // Highest rank senior

                              return (
                                <div key={shiftCode} className="space-y-0.5">
                                  {/* Shift header with N2+ warning */}
                                  <div className={`text-xs font-bold flex items-center gap-1 ${shiftCode === 'D' ? 'text-blue-700' :
                                      shiftCode === 'E' ? 'text-orange-700' :
                                        'text-purple-700'
                                    }`}>
                                    {shiftCode === 'D' ? '日班' : shiftCode === 'E' ? '小夜班' : '大夜班'}
                                    <span className="text-gray-500 font-normal">({shiftSchedules.length}人)</span>
                                    {!hasSeniorNurse && (
                                      <span className="text-red-600 text-[10px] font-bold" title="缺少N2+資深護理師">⚠️缺N2+</span>
                                    )}
                                  </div>

                                  {/* Leader info (if exists) - 縮小皇冠並對齊 */}
                                  {leader && (
                                    <div className="text-xs bg-yellow-50 p-1 rounded border border-yellow-200 flex items-center justify-between">
                                      <div className="flex items-center gap-1 flex-1">
                                        <span className="text-[10px]">👑</span>
                                        <span className="font-bold truncate">{leader.nurse.name}</span>
                                        <span className="text-green-700 font-bold text-[10px]">{leader.nurse.level}</span>
                                      </div>
                                      <span className="text-[10px] text-gray-500">(Leader)</span>
                                    </div>
                                  )}

                                  {/* All nurses list (excluding leader to avoid duplication) - 對齊格式 */}
                                  <div className="space-y-0.5">
                                    {shiftSchedules
                                      .filter(schedule => !leader || schedule.nurse.id !== leader.nurse.id)
                                      .map(schedule => {
                                        const isSenior = schedule.nurse.level === 'N2' || schedule.nurse.level === 'N3' || schedule.nurse.level === 'N4';
                                        const isOvertime = schedule.notes?.includes('OVERTIME');
                                        const hasViolations = schedule.violations && JSON.parse(schedule.violations).length > 0;
                                        // 特殊狀態圖標
                                        const specialStatusMap: Record<string, string> = {
                                          'pregnant': '🤰',
                                          'nursing': '🍼',
                                          'sick': '🤒',
                                          'restricted': '⚠️'
                                        };
                                        const specialIcon = specialStatusMap[schedule.nurse.specialStatus || ''] || '';

                                        return (
                                          <div
                                            key={schedule.id}
                                            className={`text-xs flex items-center justify-between p-0.5 rounded ${isOvertime ? 'bg-red-100 text-red-800' :
                                                isSenior ? 'bg-green-50' : ''
                                              }`}
                                          >
                                            <div className="flex items-center gap-1 flex-1 min-w-0">
                                              <span className="truncate">{schedule.nurse.name}</span>
                                              {specialIcon && <span className="text-[10px]">{specialIcon}</span>}
                                            </div>
                                            <div className="flex items-center gap-1 flex-shrink-0">
                                              <span className="text-[10px] text-gray-500">{schedule.nurse.level}</span>
                                              {isOvertime && <span className="text-red-600 text-[10px]">🔥</span>}
                                              {hasViolations && <span className="text-red-500 text-[10px]">⚠️</span>}
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              );
                            })}
                            {dateSchedules.length === 0 && (
                              <div className="text-xs text-gray-400 flex items-center justify-center h-full">尚無班表</div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </DialogTrigger>

                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>
                          {year}年{month + 1}月{date}日 排班
                        </DialogTitle>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div>
                          <label className="text-sm font-medium mb-2 block">
                            選擇護理師
                            <span className="text-xs text-gray-500 ml-2">
                              (綠色=未排班，灰色=已排定)
                            </span>
                          </label>
                          <Select value={selectedNurse} onValueChange={setSelectedNurse}>
                            <SelectTrigger className={selectedNurse && isNurseScheduled(selectedNurse, `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`) ? 'bg-gray-100' : ''}>
                              <SelectValue placeholder="選擇護理師" />
                            </SelectTrigger>
                            <SelectContent className="max-h-80">
                              {/* Available Nurses Group */}
                              <SelectGroup>
                                <SelectLabel className="text-green-700 bg-green-50 font-semibold">
                                  ✓ 可排班人員
                                </SelectLabel>
                                {nurses.filter(n => {
                                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                                  return n.isActive !== false && !isNurseScheduled(n.id, dateStr);
                                }).map(nurse => (
                                  <SelectItem
                                    key={nurse.id}
                                    value={nurse.id}
                                  >
                                    <span className="text-green-700">{nurse.name} ({nurse.level})</span>
                                    {nurse.specialStatus !== 'none' && (
                                      <span> 🚫</span>
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectGroup>

                              {/* Scheduled Nurses Group */}
                              {nurses.filter(n => {
                                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                                return n.isActive !== false && isNurseScheduled(n.id, dateStr);
                              }).length > 0 && (
                                  <SelectGroup>
                                    <SelectLabel className="text-gray-500 bg-gray-100 font-semibold border-t mt-1">
                                      ✗ 已排定人員
                                    </SelectLabel>
                                    {nurses.filter(n => {
                                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                                      return n.isActive !== false && isNurseScheduled(n.id, dateStr);
                                    }).map(nurse => {
                                      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
                                      const existingSchedule = isNurseScheduled(nurse.id, dateStr);
                                      return (
                                        <SelectItem
                                          key={nurse.id}
                                          value={nurse.id}
                                          disabled
                                          className="opacity-50"
                                        >
                                          <span className="line-through text-gray-500">{nurse.name} ({nurse.level})</span>
                                          {existingSchedule && (
                                            <span className="text-orange-600 text-xs"> (已排定-{existingSchedule.shiftType.name})</span>
                                          )}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectGroup>
                                )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-2 block">選擇班別</label>
                          <Select value={selectedShift} onValueChange={setSelectedShift}>
                            <SelectTrigger>
                              <SelectValue placeholder="選擇班別" />
                            </SelectTrigger>
                            <SelectContent>
                              {shiftTypes.map(shift => (
                                <SelectItem key={shift.id} value={shift.id}>
                                  {shift.name} ({shift.startTime}-{shift.endTime})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* 护病比信息 */}
                        {wardSettings && (
                          <div className="bg-blue-50 p-3 rounded border border-blue-200">
                            <h4 className="text-sm font-medium text-blue-800 mb-2">📊 護病比狀態（實際入住約 {Math.floor(wardSettings.totalBeds * 0.6)} 人）</h4>
                            <div className="space-y-1 text-xs">
                              {['D', 'E', 'N'].map(shiftCode => {
                                const shiftSchedules = dateSchedules.filter(s => s.shiftType.code === shiftCode);
                                const count = shiftSchedules.length;
                                const target = shiftCode === 'D' ? wardSettings.minNursesDay :
                                  shiftCode === 'E' ? wardSettings.minNursesEvening :
                                    wardSettings.minNursesNight;
                                const occupancy = Math.floor(wardSettings.totalBeds * 0.6);
                                const actualRatio = count > 0 ? (occupancy / count).toFixed(2) : '0';
                                const targetRatio = (occupancy / target).toFixed(2);
                                const hasSenior = shiftSchedules.some(s =>
                                  s.nurse.level === 'N2' || s.nurse.level === 'N3' || s.nurse.level === 'N4'
                                );
                                const overtimeCount = shiftSchedules.filter(s => s.notes?.includes('OVERTIME')).length;

                                return (
                                  <div key={shiftCode} className={`flex items-center justify-between p-1.5 rounded ${count < target ? 'bg-red-100' : 'bg-white'
                                    }`}>
                                    <span className={`font-medium ${shiftCode === 'D' ? 'text-blue-600' :
                                        shiftCode === 'E' ? 'text-orange-600' :
                                          'text-purple-600'
                                      }`}>
                                      {shiftCode === 'D' ? '日班' : shiftCode === 'E' ? '小夜班' : '大夜班'}
                                    </span>
                                    <span className="text-gray-600">
                                      {count}/{target}人
                                    </span>
                                    <span className={`font-medium ${Number(actualRatio) > Number(targetRatio) ? 'text-red-600' : 'text-green-600'
                                      }`}>
                                      實際1:{actualRatio}
                                    </span>
                                    <span className="text-gray-400">
                                      (目標1:{targetRatio})
                                    </span>
                                    {!hasSenior && (
                                      <span className="text-red-600" title="缺N2+">👨‍⚕️❌</span>
                                    )}
                                    {overtimeCount > 0 && (
                                      <span className="text-red-600" title={`${overtimeCount}人加班`}>🔥{overtimeCount}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <p className="text-xs text-gray-600 mt-2">
                              💡 實際護病比高於目標表示人力不足。紅色背景表示未達目標人數。
                            </p>
                          </div>
                        )}

                        <div className="pt-2">
                          <h4 className="text-sm font-medium mb-2">👥 當日班表（顯示人名）</h4>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {dateSchedules.map(schedule => (
                              <div key={schedule.id} className={`flex items-center justify-between p-2 rounded ${schedule.status === 'confirmed' ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                                }`}>
                                <div className="flex items-center gap-2">
                                  <Badge className={getShiftColor(schedule.shiftType.code)}>
                                    {schedule.shiftType.code}
                                  </Badge>
                                  <span className={`text-sm ${schedule.notes?.includes('OVERTIME') ? 'text-red-600 font-medium' : ''}`}>
                                    {schedule.nurse.name}
                                  </span>
                                  {(schedule.nurse.level === 'N2' || schedule.nurse.level === 'N3' || schedule.nurse.level === 'N4') && (
                                    <span className="text-green-600 text-xs" title="N2+資深">👨‍⚕️</span>
                                  )}
                                  {schedule.notes?.includes('OVERTIME') && (
                                    <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-300">
                                      🔥 加班
                                    </Badge>
                                  )}
                                  {schedule.status === 'confirmed' && (
                                    <Badge variant="outline" className="text-xs bg-green-100 text-green-800 border-green-300">
                                      ✓ 已確定
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleConfirmSchedule(schedule.id, schedule.status)}
                                    className={schedule.status === 'confirmed' ? 'text-orange-600' : 'text-green-600'}
                                  >
                                    {schedule.status === 'confirmed' ? '取消確定' : '確定'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDeleteSchedule(schedule.id)}
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {dateSchedules.length === 0 && (
                              <p className="text-sm text-gray-500">尚無班表</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                          取消
                        </Button>
                        <Button
                          onClick={handleCreateSchedule}
                          disabled={!selectedNurse || !selectedShift}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          新增班表
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                );
              })}
            </div>
            <div className="mt-8 flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-800">日</Badge>
                <span>日班 07:00-15:00</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-100 text-orange-800">小</Badge>
                <span>小夜班 15:00-23:00</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-purple-100 text-purple-800">大</Badge>
                <span>大夜班 23:00-07:00</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

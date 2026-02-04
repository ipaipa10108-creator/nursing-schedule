'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react';

interface Schedule {
  id: string;
  date: string;
  nurse: {
    id: string;
    name: string;
    employeeId: string;
    level: string;
    specialStatus?: string;
  };
  shiftType: {
    code: string;
    name: string;
    startTime: string;
    endTime: string;
  };
  status: string;
  notes?: string;
}

interface WardSettings {
  name: string;
  totalBeds: number;
  nursePatientRatio: number;
  minNursesDay: number;
  minNursesEvening: number;
  minNursesNight: number;
}

export default function PrintSchedulePage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [wardSettings, setWardSettings] = useState<WardSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchData();
  }, [currentDate]);

  async function fetchData() {
    try {
      setLoading(true);
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      
      const [schedulesRes, wardRes] = await Promise.all([
        fetch(`/api/schedules?month=${monthStr}`),
        fetch('/api/ward/settings'),
      ]);
      
      const schedulesResult = await schedulesRes.json();
      const wardResult = await wardRes.json();
      
      if (schedulesResult.success) {
        setSchedules(schedulesResult.data);
      }
      if (wardResult.success) {
        setWardSettings(wardResult.ward);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }

  function prevMonth() {
    setCurrentDate(new Date(year, month - 1, 1));
  }

  function nextMonth() {
    setCurrentDate(new Date(year, month + 1, 1));
  }

  function getDaysInMonth() {
    return new Date(year, month + 1, 0).getDate();
  }

  function getFirstDayOfMonth() {
    return new Date(year, month, 1).getDay();
  }

  function getSchedulesForDate(date: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return schedules
      .filter(s => s.date.startsWith(dateStr))
      .sort((a, b) => {
        const order: Record<string, number> = { 'D': 1, 'E': 2, 'N': 3 };
        return (order[a.shiftType.code] || 4) - (order[b.shiftType.code] || 4);
      });
  }

  // Get leader for a specific shift (highest rank: N4 > N3 > N2)
  function getShiftLeader(dateSchedules: Schedule[], shiftCode: string): Schedule | null {
    const shiftSchedules = dateSchedules.filter(s => s.shiftType.code === shiftCode);
    const seniorNurses = shiftSchedules.filter(s => 
      s.nurse.level === 'N2' || s.nurse.level === 'N3' || s.nurse.level === 'N4'
    );
    
    if (seniorNurses.length === 0) return null;
    
    // Sort by level (N4 first, then N3, then N2)
    const levelPriority: Record<string, number> = { 'N4': 4, 'N3': 3, 'N2': 2 };
    const sortedSeniors = seniorNurses.sort((a, b) => 
      (levelPriority[b.nurse.level] || 0) - (levelPriority[a.nurse.level] || 0)
    );
    
    return sortedSeniors[0];
  }

  // Check if nurse is in overtime
  function isOvertime(schedule: Schedule): boolean {
    return schedule.notes?.includes('OVERTIME') || false;
  }

  // Get special status emoji
  function getSpecialStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      'pregnant': '🤰',
      'nursing': '🍼',
      'sick': '🤒',
      'restricted': '⚠️',
    };
    return emojis[status] || '';
  }

  function handlePrint() {
    window.print();
  }

  const daysInMonth = getDaysInMonth();
  const firstDay = getFirstDayOfMonth();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

  if (loading) {
    return <div className="p-8 text-center">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-white p-4 md:p-8">
      {/* Print Controls - Hidden when printing */}
      <div className="print:hidden mb-6 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xl font-semibold">
            {year}年 {month + 1}月 班表
          </span>
          <Button variant="outline" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
            <Printer className="w-4 h-4 mr-2" />
            列印班表
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/schedule'}>
            返回排班
          </Button>
        </div>
      </div>

      {/* Printable Content */}
      <div className="max-w-5xl mx-auto print:max-w-none">
        {/* Header */}
        <div className="text-center mb-6 border-b-2 border-gray-800 pb-4">
          <h1 className="text-3xl font-bold mb-2">{wardSettings?.name || '婦癌病房'}護理班表</h1>
          <p className="text-xl">{year}年 {month + 1}月</p>
          
          {/* 護病比信息 */}
          {wardSettings && (
            <div className="mt-3 p-2 bg-gray-50 rounded text-sm inline-block">
              <p className="font-medium">
                病床數: {wardSettings.totalBeds}床 | 
                護病比: 1:{wardSettings.nursePatientRatio} | 
                各班需求: 日班{wardSettings.minNursesDay}人 / 小夜班{wardSettings.minNursesEvening}人 / 大夜班{wardSettings.minNursesNight}人
              </p>
              <p className="text-xs text-gray-500 mt-1">
                實際入住約 {Math.floor(wardSettings.totalBeds * 0.6)} 人 (60%入住率)
              </p>
            </div>
          )}
          
          <p className="text-sm text-gray-600 mt-2">班別說明: 日班D(07-15)、小夜班E(15-23)、大夜班N(23-07)</p>
        </div>

        {/* Calendar Grid */}
        <div className="border-2 border-gray-800">
          {/* Week Headers */}
          <div className="grid grid-cols-7 border-b-2 border-gray-800">
            {weekDays.map(day => (
              <div 
                key={day} 
                className="text-center py-2 font-bold bg-gray-100 border-r border-gray-300 last:border-r-0"
              >
                星期{day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7 auto-rows-fr">
            {/* Empty cells for days before the 1st */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div 
                key={`empty-${i}`} 
                className="border-r border-b border-gray-300 min-h-[120px] bg-gray-50"
              />
            ))}
            
            {/* Days of the month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const date = i + 1;
              const dayOfWeek = (firstDay + i) % 7;
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const dateSchedules = getSchedulesForDate(date);
              
              return (
                <div 
                  key={date}
                  className={`border-r border-b border-gray-300 min-h-[120px] p-2 ${
                    isWeekend ? 'bg-yellow-50' : 'bg-white'
                  }`}
                >
                  <div className={`font-bold text-lg mb-1 ${isWeekend ? 'text-red-600' : ''}`}>
                    {date}
                  </div>
                  <div className="space-y-1 text-sm">
                    {['D', 'E', 'N'].map(shiftCode => {
                      const shiftSchedules = dateSchedules.filter(s => s.shiftType.code === shiftCode);
                      if (shiftSchedules.length === 0) return null;
                      
                      const leader = getShiftLeader(dateSchedules, shiftCode);
                      
                      return (
                        <div key={shiftCode} className="space-y-0.5">
                          {shiftSchedules.map(schedule => {
                            const isLeader = leader && schedule.nurse.id === leader.nurse.id;
                            const isOverTime = isOvertime(schedule);
                            const specialEmoji = getSpecialStatusEmoji(schedule.nurse.specialStatus || '');
                            
                             return (
                              <div 
                                key={schedule.id} 
                                className={`p-1 rounded text-xs flex items-center justify-between ${
                                  schedule.shiftType.code === 'D' ? 'bg-blue-100' :
                                  schedule.shiftType.code === 'E' ? 'bg-orange-100' :
                                  'bg-purple-100'
                                } ${schedule.status === 'confirmed' ? 'ring-1 ring-green-500' : ''} ${isOverTime ? 'border-l-4 border-red-500' : ''}`}
                              >
                                <div className="flex items-center gap-1 flex-1 min-w-0">
                                  {isLeader && <span className="text-[10px]">👑</span>}
                                  <span className="font-bold">{schedule.shiftType.code}</span>
                                  <span className="truncate">{schedule.nurse.name}</span>
                                  {specialEmoji && <span className="text-[10px]">{specialEmoji}</span>}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <span className="text-[10px] text-gray-600">{schedule.nurse.level}</span>
                                  {isOverTime && <span className="text-red-600 text-[10px]">🔥</span>}
                                  {schedule.status === 'confirmed' && (
                                    <span className="text-green-600">✓</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {dateSchedules.length === 0 && (
                      <div className="text-gray-400 text-xs">-</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded" />
            <span>日班 D</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-orange-100 border border-orange-300 rounded" />
            <span>小夜班 E</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-100 border border-purple-300 rounded" />
            <span>大夜班 N</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px]">👑</span>
            <span>當班 Leader (N4/N3/N2最高職等)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-600 font-bold text-xs">🔥</span>
            <span>加班</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 ring-1 ring-green-500 rounded flex items-center justify-center">
              <span className="text-xs text-green-600">✓</span>
            </div>
            <span>已確定</span>
          </div>
        </div>
        
        {/* Special Status Legend */}
        <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-gray-600">
          <span>🤰 孕期</span>
          <span>🍼 哺乳期</span>
          <span>🤒 病假</span>
          <span>⚠️ 限制</span>
          <span className="text-gray-500">(圖示顯示在人名後)</span>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-400 text-sm text-gray-600">
          <div className="flex justify-between">
            <div>
              <p>製表日期: {new Date().toLocaleDateString('zh-TW')}</p>
              <p>護理長簽章: _________________</p>
            </div>
            <div className="text-right">
              <p>總計班表數: {schedules.length} 筆</p>
              <p>已確定: {schedules.filter(s => s.status === 'confirmed').length} 筆</p>
              <p className="text-red-600">
                加班人員: {schedules.filter(s => isOvertime(s)).length} 筆
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm;
          }
          
          body {
            background: white;
          }
          
          .print\:hidden {
            display: none !important;
          }
          
          .print\:max-w-none {
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}

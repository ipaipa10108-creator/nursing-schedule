'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Printer, Home, Users } from 'lucide-react';

interface OffDutyData {
  nurse: {
    id: string;
    name: string;
    employeeId: string;
    level: string;
    specialStatus: string;
  };
  scheduledDays: number;
  offDays: number;
  scheduledDates: {
    day: number;
    shiftCode: string;
    shiftName: string;
  }[];
}

export default function OffDutyPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [offData, setOffData] = useState<OffDutyData[]>([]);
  const [loading, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  useEffect(() => {
    fetchOffData();
  }, [currentDate]);

  async function fetchOffData() {
    try {
      setLoading(true);
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const response = await fetch(`/api/off-duty?month=${monthStr}`);
      const result = await response.json();
      
      if (result.success) {
        setOffData(result.data);
      }
    } catch (error) {
      console.error('Error fetching off-duty data:', error);
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

  function handlePrint() {
    window.print();
  }

  function getShiftColor(code: string) {
    const colors: Record<string, string> = {
      D: 'bg-blue-100 text-blue-800',
      E: 'bg-orange-100 text-orange-800',
      N: 'bg-purple-100 text-purple-800',
    };
    return colors[code] || 'bg-gray-100';
  }

  function getSpecialStatusText(status: string) {
    const texts: Record<string, string> = {
      none: '',
      pregnant: '🤰',
      nursing: '🍼',
      sick: '🤒',
      personal: '📋',
      bereavement: '⚰️',
      marriage: '💒',
      restricted: '⚠️',
    };
    return texts[status] || '';
  }

  if (loading) {
    return <div className="p-8 text-center">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* Controls - Hidden when printing */}
      <div className="print:hidden mb-6 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => window.location.href = '/'}>
            <Home className="w-4 h-4 mr-1" />
            回到首頁
          </Button>
          <Button variant="outline" onClick={() => window.location.href = '/schedule'}>
            班表管理
          </Button>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xl font-semibold">
            {year}年 {month + 1}月 Off 人員
          </span>
          <Button variant="outline" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        
        <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700">
          <Printer className="w-4 h-4 mr-2" />
          列印 Off 名單
        </Button>
      </div>

      {/* Printable Content */}
      <div className="max-w-7xl mx-auto print:max-w-none">
        {/* Header */}
        <div className="text-center mb-6 border-b-2 border-gray-800 pb-4 print:border-b-2">
          <h1 className="text-3xl font-bold mb-2">婦癌病房 Off 人員名單</h1>
          <p className="text-xl">{year}年 {month + 1}月</p>
          <p className="text-sm text-gray-600 mt-1">
            顯示未排班人員及 Off 天數統計
          </p>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 print:grid-cols-4">
          <Card className="bg-blue-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">總人數</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{offData.length}</p>
            </CardContent>
          </Card>
          
          <Card className="bg-green-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">完整 Off (30天)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-700">
                {offData.filter(d => d.offDays >= 30).length}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-yellow-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">部分排班 (1-15天Off)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-yellow-700">
                {offData.filter(d => d.offDays > 0 && d.offDays < 15).length}
              </p>
            </CardContent>
          </Card>
          
          <Card className="bg-red-50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">已排滿班 (0天Off)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-700">
                {offData.filter(d => d.offDays === 0).length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Off Staff List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-3">
          {offData.map((data) => (
            <Card 
              key={data.nurse.id} 
              className={`${
                data.offDays >= 20 ? 'bg-green-50 border-green-200' :
                data.offDays >= 10 ? 'bg-yellow-50 border-yellow-200' :
                data.offDays > 0 ? 'bg-orange-50 border-orange-200' :
                'bg-red-50 border-red-200'
              }`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {data.nurse.name}
                    {getSpecialStatusText(data.nurse.specialStatus) && (
                      <span>{getSpecialStatusText(data.nurse.specialStatus)}</span>
                    )}
                  </CardTitle>
                  <Badge className={
                    data.nurse.level === 'N0' ? 'bg-gray-100' :
                    data.nurse.level === 'N1' ? 'bg-blue-100 text-blue-800' :
                    data.nurse.level === 'N2' ? 'bg-green-100 text-green-800' :
                    data.nurse.level === 'N3' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-purple-100 text-purple-800'
                  }>
                    {data.nurse.level}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">{data.nurse.employeeId}</p>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-center">
                    <p className="text-xs text-gray-600">已排班</p>
                    <p className="text-2xl font-bold text-blue-600">{data.scheduledDays}</p>
                  </div>
                  <div className="text-2xl text-gray-400">/</div>
                  <div className="text-center">
                    <p className="text-xs text-gray-600">Off天數</p>
                    <p className={`text-2xl font-bold ${
                      data.offDays >= 20 ? 'text-green-600' :
                      data.offDays >= 10 ? 'text-yellow-600' :
                      data.offDays > 0 ? 'text-orange-600' :
                      'text-red-600'
                    }`}>
                      {data.offDays}
                    </p>
                  </div>
                </div>

                {/* Format: 王美琪(Off-12日) */}
                <div className="text-center py-2 bg-white rounded border border-gray-200 mb-3">
                  <p className="font-medium">
                    {data.nurse.name}(Off-{data.offDays}日)
                  </p>
                </div>

                {/* Scheduled dates */}
                {data.scheduledDates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-600 font-medium">已排班日期:</p>
                    <div className="flex flex-wrap gap-1">
                      {data.scheduledDates.map((date, idx) => (
                        <Badge 
                          key={idx} 
                          variant="outline" 
                          className={`text-xs ${getShiftColor(date.shiftCode)}`}
                        >
                          {date.day}日({date.shiftCode})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {data.scheduledDates.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    本月尚未排班
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-gray-400 text-sm text-gray-600 print:border-t">
          <div className="flex justify-between">
            <div>
              <p>製表日期: {new Date().toLocaleDateString('zh-TW')}</p>
              <p>護理長簽章: _________________</p>
            </div>
            <div className="text-right">
              <p>總計人數: {offData.length} 人</p>
              <p>平均 Off 天數: {(offData.reduce((sum, d) => sum + d.offDays, 0) / offData.length).toFixed(1)} 天</p>
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
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:max-w-none {
            max-width: none !important;
          }
          
          .print\\:grid-cols-3 {
            grid-template-columns: repeat(3, 1fr) !important;
          }
          
          .print\\:grid-cols-4 {
            grid-template-columns: repeat(4, 1fr) !important;
          }
          
          .print\\:border-b-2 {
            border-bottom-width: 2px !important;
          }
        }
      `}</style>
    </div>
  );
}

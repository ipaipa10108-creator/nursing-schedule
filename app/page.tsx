'use client';

import { useEffect, useState } from 'react';

interface Nurse {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  phone: string | null;
  level: string;
  seniority: number;
  specialStatus: string;
  annualLeave: number;
  sickLeave: number;
  personalLeave: number;
  isActive: boolean;
}

export default function Home() {
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchNurses();
  }, []);

  async function fetchNurses() {
    try {
      const response = await fetch('/api/nurses');
      const result = await response.json();
      
      if (result.success) {
        setNurses(result.data);
      } else {
        setError(result.error || 'Failed to fetch nurses');
      }
    } catch (err) {
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  }

  function getLevelColor(level: string) {
    const colors: Record<string, string> = {
      N0: 'bg-gray-100 text-gray-800',
      N1: 'bg-blue-100 text-blue-800',
      N2: 'bg-green-100 text-green-800',
      N3: 'bg-yellow-100 text-yellow-800',
      N4: 'bg-purple-100 text-purple-800',
    };
    return colors[level] || 'bg-gray-100 text-gray-800';
  }

  function getSpecialStatusText(status: string) {
    const texts: Record<string, string> = {
      none: '',
      pregnant: '🤰 孕期',
      nursing: '🍼 哺乳期',
      restricted: '⚠️ 限制',
    };
    return texts[status] || '';
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">載入中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                護理排班系統
              </h1>
              <p className="text-gray-600">
                婦癌病房 | 50床 | 20名護理人員
              </p>
            </div>
            <nav className="flex gap-2">
              <a 
                href="/" 
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                人員列表
              </a>
              <a 
                href="/schedule" 
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                班表管理
              </a>
              <a 
                href="/nurses" 
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                人員管理
              </a>
              <a 
                href="/settings" 
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                設定
              </a>
            </nav>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {nurses.map((nurse) => (
            <div
              key={nurse.id}
              className="bg-white rounded-lg shadow p-4 border border-gray-200"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg">{nurse.name}</h3>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${getLevelColor(
                    nurse.level
                  )}`}
                >
                  {nurse.level}
                </span>
              </div>
              
              <div className="space-y-2 text-sm text-gray-600">
                <p>員編: {nurse.employeeId}</p>
                <p>年資: {nurse.seniority} 年</p>
                {nurse.specialStatus !== 'none' && (
                  <p className="text-orange-600 font-medium">
                    {getSpecialStatusText(nurse.specialStatus)}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="flex justify-between text-sm">
                  <span>特休: {nurse.annualLeave}天</span>
                  <span>病假: {nurse.sickLeave}天</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-blue-50 rounded-lg">
          <h2 className="font-semibold text-blue-900 mb-2">系統統計</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">總人數:</span>{' '}
              <span className="font-medium">{nurses.length}人</span>
            </div>
            <div>
              <span className="text-gray-600">N0-N1:</span>{' '}
              <span className="font-medium">
                {nurses.filter(n => ['N0', 'N1'].includes(n.level)).length}人
              </span>
            </div>
            <div>
              <span className="text-gray-600">N2-N4:</span>{' '}
              <span className="font-medium">
                {nurses.filter(n => ['N2', 'N3', 'N4'].includes(n.level)).length}人
              </span>
            </div>
            <div>
              <span className="text-gray-600">特殊狀態:</span>{' '}
              <span className="font-medium">
                {nurses.filter(n => n.specialStatus !== 'none').length}人
              </span>
            </div>
          </div>
        </div>

        <footer className="mt-8 text-center text-sm text-gray-500">
          <p>班次設定: 日班 07:00-15:00 | 小夜班 15:00-23:00 | 大夜班 23:00-07:00</p>
          <p className="mt-1">符合台灣勞動基準法規範</p>
        </footer>
      </div>
    </div>
  );
}

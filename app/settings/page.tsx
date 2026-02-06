'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Settings, Bed, Users, Calculator, AlertCircle, Save, Home } from 'lucide-react';

interface WardSettings {
  id: string;
  name: string;
  totalBeds: number;
  nursePatientRatio: number;
  minNursesDay: number;
  minNursesEvening: number;
  minNursesNight: number;
  maxNursesDay: number;
  maxNursesEvening: number;
  maxNursesNight: number;
  minWorkingDays: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<WardSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    totalBeds: 50,
    nursePatientRatio: 8,
    minNursesDay: 7,
    minNursesEvening: 7,
    minNursesNight: 4,
    maxNursesDay: 15,
    maxNursesEvening: 12,
    maxNursesNight: 10,
    minWorkingDays: 20,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [configMode, setConfigMode] = useState<'ratio' | 'manual'>('manual'); // 'ratio' = 使用護病比計算, 'manual' = 直接設定各班人數

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const response = await fetch('/api/ward/settings');
      const data = await response.json();

      if (data.success && data.ward) {
        setSettings(data.ward);
        setFormData({
          name: data.ward.name || '',
          totalBeds: data.ward.totalBeds || 50,
          nursePatientRatio: data.ward.nursePatientRatio || 8,
          minNursesDay: data.ward.minNursesDay || 7,
          minNursesEvening: data.ward.minNursesEvening || 7,
          minNursesNight: data.ward.minNursesNight || 4,
          maxNursesDay: data.ward.maxNursesDay || 15,
          maxNursesEvening: data.ward.maxNursesEvening || 12,
          maxNursesNight: data.ward.maxNursesNight || 10,
          minWorkingDays: data.ward.minWorkingDays || 20,
        });
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/ward/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setSettings(data.ward);
        setMessage({ type: 'success', text: '設定已儲存成功！' });
      } else {
        setMessage({ type: 'error', text: data.error || '儲存失敗' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: '儲存過程中發生錯誤' });
    } finally {
      setSaving(false);
    }
  }

  // Calculate required nurses
  const requiredNurses = Math.ceil(formData.totalBeds / formData.nursePatientRatio);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="w-8 h-8" />
            系統設定
          </h1>
          <p className="text-gray-600 mt-2">設定病房基本資訊與護病比</p>
        </div>
        <Button
          variant="outline"
          onClick={() => window.location.href = '/'}
          className="flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          回到首頁
        </Button>
      </div>

      {message && (
        <div className={`mb-6 p-4 rounded-lg border flex items-start gap-2 ${message.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-6">
        {/* Ward Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bed className="w-5 h-5" />
              病房基本設定
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4">
              <div>
                <label htmlFor="wardName" className="text-sm font-medium">病房名稱</label>
                <Input
                  id="wardName"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：婦癌病房"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="totalBeds" className="text-sm font-medium">病床總數</label>
                  <Input
                    id="totalBeds"
                    type="number"
                    min={1}
                    max={200}
                    value={formData.totalBeds}
                    onChange={(e) => setFormData({ ...formData, totalBeds: parseInt(e.target.value) || 0 })}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">目前病房總床位數</p>
                </div>

                <div>
                  <label htmlFor="nursePatientRatio" className="text-sm font-medium">護病比（1:X）</label>
                  <Input
                    id="nursePatientRatio"
                    type="number"
                    min={1}
                    max={20}
                    step={0.5}
                    value={formData.nursePatientRatio}
                    onChange={(e) => {
                      const ratio = parseFloat(e.target.value) || 8;
                      setFormData({
                        ...formData,
                        nursePatientRatio: ratio,
                        // Auto-calculate if in ratio mode
                        ...(configMode === 'ratio' && {
                          minNursesDay: Math.ceil(formData.totalBeds / ratio),
                          minNursesEvening: Math.ceil(formData.totalBeds / ratio),
                          minNursesNight: Math.max(2, Math.ceil(formData.totalBeds / ratio * 0.6)),
                        })
                      });
                    }}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">表示 1 位護理師照顧 X 位病人</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Working Days Settings Card */}
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800">
              <Calculator className="w-5 h-5" />
              工時與排班參數 (Working Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-lg border border-green-200">
                <label htmlFor="minWorkingDays" className="text-sm font-medium text-green-800">每月最低上班天數</label>
                <Input
                  id="minWorkingDays"
                  type="number"
                  min={1}
                  max={31}
                  value={formData.minWorkingDays}
                  onChange={(e) => setFormData({ ...formData, minWorkingDays: parseInt(e.target.value) || 20 })}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">智慧排班將以此為軟限制 (建議值)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Shift-Specific Settings Card */}
        <Card className="bg-indigo-50 border-indigo-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-indigo-800">
              <Users className="w-5 h-5" />
              各班別護理師需求設定
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <div className="flex gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="configMode"
                    value="ratio"
                    checked={configMode === 'ratio'}
                    onChange={() => {
                      setConfigMode('ratio');
                      // Auto-calculate based on ratio
                      const ratio = formData.nursePatientRatio;
                      setFormData({
                        ...formData,
                        minNursesDay: Math.ceil(formData.totalBeds / ratio),
                        minNursesEvening: Math.ceil(formData.totalBeds / ratio),
                        minNursesNight: Math.max(2, Math.ceil(formData.totalBeds / ratio * 0.6)),
                      });
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">依護病比自動計算最低標</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="configMode"
                    value="manual"
                    checked={configMode === 'manual'}
                    onChange={() => setConfigMode('manual')}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">手動設定人數</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Day Shift */}
              <div className="bg-white p-4 rounded-lg border-2 border-blue-200 space-y-3">
                <h3 className="font-bold text-blue-700 border-b border-blue-100 pb-2">日班 (07-15)</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最低人數 (Min)</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={formData.minNursesDay}
                    onChange={(e) => setFormData({ ...formData, minNursesDay: parseInt(e.target.value) || 1 })}
                    disabled={configMode === 'ratio'}
                    className={configMode === 'ratio' ? 'bg-gray-100' : ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最高人數 (Max)</label>
                  <Input
                    type="number"
                    min={formData.minNursesDay}
                    max={50}
                    value={formData.maxNursesDay}
                    onChange={(e) => setFormData({ ...formData, maxNursesDay: parseInt(e.target.value) || 15 })}
                  />
                </div>
              </div>

              {/* Evening Shift */}
              <div className="bg-white p-4 rounded-lg border-2 border-orange-200 space-y-3">
                <h3 className="font-bold text-orange-700 border-b border-orange-100 pb-2">小夜班 (15-23)</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最低人數 (Min)</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={formData.minNursesEvening}
                    onChange={(e) => setFormData({ ...formData, minNursesEvening: parseInt(e.target.value) || 1 })}
                    disabled={configMode === 'ratio'}
                    className={configMode === 'ratio' ? 'bg-gray-100' : ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最高人數 (Max)</label>
                  <Input
                    type="number"
                    min={formData.minNursesEvening}
                    max={50}
                    value={formData.maxNursesEvening}
                    onChange={(e) => setFormData({ ...formData, maxNursesEvening: parseInt(e.target.value) || 12 })}
                  />
                </div>
              </div>

              {/* Night Shift */}
              <div className="bg-white p-4 rounded-lg border-2 border-purple-200 space-y-3">
                <h3 className="font-bold text-purple-700 border-b border-purple-100 pb-2">大夜班 (23-07)</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最低人數 (Min)</label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={formData.minNursesNight}
                    onChange={(e) => setFormData({ ...formData, minNursesNight: parseInt(e.target.value) || 1 })}
                    disabled={configMode === 'ratio'}
                    className={configMode === 'ratio' ? 'bg-gray-100' : ''}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">最高人數 (Max)</label>
                  <Input
                    type="number"
                    min={formData.minNursesNight}
                    max={50}
                    value={formData.maxNursesNight}
                    onChange={(e) => setFormData({ ...formData, maxNursesNight: parseInt(e.target.value) || 10 })}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-yellow-100 rounded-lg border border-yellow-300">
              <p className="text-sm text-yellow-800">
                <strong>智慧排班參數說明：</strong>
                系統將產生 介於 「最低」至「最高」人數之間的班表。若人力不足，可能會低於最高人數，但絕不錯低於最低人數。
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Nurse Calculation Card */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-800">
              <Calculator className="w-5 h-5" />
              護理師需求計算
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-white rounded-lg">
                <div className="flex items-center gap-3">
                  <Bed className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium">病床總數</p>
                    <p className="text-2xl font-bold">{formData.totalBeds} 床</p>
                  </div>
                </div>
                <div className="text-2xl text-gray-400">÷</div>
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-gray-500" />
                  <div>
                    <p className="font-medium">護病比</p>
                    <p className="text-2xl font-bold">1:{formData.nursePatientRatio}</p>
                  </div>
                </div>
                <div className="text-2xl text-gray-400">=</div>
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-3 rounded-lg">
                    <p className="font-medium text-blue-800">每班最低需求</p>
                    <p className="text-3xl font-bold text-blue-600">{requiredNurses} 人</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white p-3 rounded-lg text-center border-2 border-blue-200">
                  <span className="inline-block px-2 py-1 bg-blue-500 text-white text-xs font-medium rounded mb-2">日班</span>
                  <p className="text-xl font-bold text-blue-600">{formData.minNursesDay} 人</p>
                  <p className="text-xs text-gray-500">設定需求</p>
                </div>
                <div className="bg-white p-3 rounded-lg text-center border-2 border-orange-200">
                  <span className="inline-block px-2 py-1 bg-orange-500 text-white text-xs font-medium rounded mb-2">小夜班</span>
                  <p className="text-xl font-bold text-orange-600">{formData.minNursesEvening} 人</p>
                  <p className="text-xs text-gray-500">設定需求</p>
                </div>
                <div className="bg-white p-3 rounded-lg text-center border-2 border-purple-200">
                  <span className="inline-block px-2 py-1 bg-purple-500 text-white text-xs font-medium rounded mb-2">大夜班</span>
                  <p className="text-xl font-bold text-purple-600">{formData.minNursesNight} 人</p>
                  <p className="text-xs text-gray-500">設定需求</p>
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                <span className="text-yellow-800 text-sm">
                  系統會在自動排班時盡量滿足每班至少 {requiredNurses} 位護理師的要求。
                  實際排班會依據可用人力和勞動法規進行調整。
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Stats Card */}
        {settings && (
          <Card>
            <CardHeader>
              <CardTitle>目前設定狀態</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">病房名稱</p>
                  <p className="text-lg font-semibold">{settings.name || '未設定'}</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">病床數</p>
                  <p className="text-lg font-semibold">{settings.totalBeds} 床</p>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600">護病比</p>
                  <p className="text-lg font-semibold">1:{settings.nursePatientRatio}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-green-600 hover:bg-green-700 px-8"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                儲存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                儲存設定
              </>
            )}
          </Button>
        </div>
      </div>
    </div >
  );
}

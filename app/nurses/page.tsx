'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Edit2, Trash2, Users } from 'lucide-react';

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
  isActive: boolean;
  joinDate: string;
}

export default function NursesPage() {
  const [nurses, setNurses] = useState<Nurse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNurse, setEditingNurse] = useState<Nurse | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    employeeId: '',
    name: '',
    email: '',
    phone: '',
    level: 'N0',
    seniority: 0,
    specialStatus: 'none',
    annualLeave: 3,
    sickLeave: 30,
    personalLeave: 14,
    joinDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    fetchNurses();
  }, []);

  async function fetchNurses() {
    try {
      const response = await fetch('/api/nurses');
      const result = await response.json();
      if (result.success) {
        setNurses(result.data);
      }
    } catch (error) {
      console.error('Error fetching nurses:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calculate seniority from join date
  function calculateSeniority(joinDate: string): number {
    const join = new Date(joinDate);
    const now = new Date();
    const diffTime = now.getTime() - join.getTime();
    const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365.25);
    return Math.floor(diffYears * 10) / 10; // Round to 1 decimal
  }

  // Calculate annual leave based on seniority (Taiwan Labor Law)
  function calculateAnnualLeave(seniority: number): number {
    if (seniority < 0.5) return 3;      // Less than 6 months: 3 days
    if (seniority < 1) return 7;        // 6 months to 1 year: 7 days
    if (seniority < 2) return 10;       // 1-2 years: 10 days
    if (seniority < 3) return 14;       // 2-3 years: 14 days
    if (seniority < 5) return 14;       // 3-5 years: 14 days
    if (seniority < 10) return 15;      // 5-10 years: 15 days
    return 15 + Math.floor((seniority - 10) / 5); // Every 5 years after 10: +1 day
  }

  // Auto-calculate when join date changes
  function handleJoinDateChange(date: string) {
    const seniority = calculateSeniority(date);
    const annualLeave = calculateAnnualLeave(seniority);
    setFormData(prev => ({
      ...prev,
      joinDate: date,
      seniority,
      annualLeave,
    }));
  }

  function handleEdit(nurse: Nurse) {
    setEditingNurse(nurse);
    setFormData({
      employeeId: nurse.employeeId,
      name: nurse.name,
      email: nurse.email,
      phone: nurse.phone || '',
      level: nurse.level,
      seniority: nurse.seniority,
      specialStatus: nurse.specialStatus,
      annualLeave: nurse.annualLeave,
      sickLeave: 30,
      personalLeave: 14,
      joinDate: nurse.joinDate ? nurse.joinDate.split('T')[0] : new Date().toISOString().split('T')[0],
    });
    setDialogOpen(true);
  }

  function handleAdd() {
    setEditingNurse(null);
    setFormData({
      employeeId: '',
      name: '',
      email: '',
      phone: '',
      level: 'N0',
      seniority: 0,
      specialStatus: 'none',
      annualLeave: 3,
      sickLeave: 30,
      personalLeave: 14,
      joinDate: new Date().toISOString().split('T')[0],
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    try {
      const url = '/api/nurses';
      const method = editingNurse ? 'PUT' : 'POST';
      const body = editingNurse 
        ? { ...formData, id: editingNurse.id }
        : formData;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (result.success) {
        alert(editingNurse ? '更新成功' : '新增成功');
        setDialogOpen(false);
        fetchNurses();
      } else {
        alert(result.error || '操作失敗');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('操作過程中發生錯誤');
    }
  }

  async function handleDelete(nurse: Nurse) {
    if (!confirm(`確定要停用 ${nurse.name} 嗎？`)) return;

    try {
      const response = await fetch(`/api/nurses?id=${nurse.id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        alert('已停用');
        fetchNurses();
      } else {
        alert(result.error || '停用失敗');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('停用過程中發生錯誤');
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

  if (loading) {
    return <div className="p-8 text-center">載入中...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">人員管理</h1>
            <p className="text-gray-600 mt-1">管理護理人員資料</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd}>
              <Plus className="w-4 h-4 mr-1" />
              新增人員
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              返回首頁
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nurses.map(nurse => (
            <Card key={nurse.id} className={nurse.isActive ? '' : 'opacity-50'}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{nurse.name}</CardTitle>
                  <Badge className={getLevelColor(nurse.level)}>
                    {nurse.level}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">{nurse.employeeId}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 text-sm">
                  <p>📧 {nurse.email}</p>
                  {nurse.phone && <p>📞 {nurse.phone}</p>}
                  <p>📅 到職日: {nurse.joinDate ? new Date(nurse.joinDate).toLocaleDateString('zh-TW') : '未設定'}</p>
                  <p>年資: {nurse.seniority} 年 | 特休: {nurse.annualLeave} 天</p>
                  
                  {nurse.specialStatus !== 'none' && (
                    <Badge variant="secondary" className="mt-2">
                      {nurse.specialStatus === 'pregnant' ? '🤰 孕期' : 
                       nurse.specialStatus === 'nursing' ? '🍼 哺乳期' :
                       nurse.specialStatus === 'sick' ? '🤒 病假' :
                       nurse.specialStatus === 'personal' ? '📋 事假' :
                       nurse.specialStatus === 'bereavement' ? '⚰️ 喪假' :
                       nurse.specialStatus === 'marriage' ? '💒 婚假' :
                       '⚠️ 限制'}
                    </Badge>
                  )}
                  
                  {!nurse.isActive && (
                    <Badge variant="destructive" className="mt-2">
                      已停用
                    </Badge>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleEdit(nurse)}
                    disabled={!nurse.isActive}
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    編輯
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleDelete(nurse)}
                    disabled={!nurse.isActive}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    停用
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingNurse ? '編輯護理師' : '新增護理師'}
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-1 block">員工編號 *</label>
                <Input
                  value={formData.employeeId}
                  onChange={e => setFormData({...formData, employeeId: e.target.value})}
                  placeholder="例如: NUR021"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">姓名 *</label>
                <Input
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="請輸入姓名"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">Email *</label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  placeholder="nurse@hospital.com"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">電話</label>
                <Input
                  value={formData.phone}
                  onChange={e => setFormData({...formData, phone: e.target.value})}
                  placeholder="0912-345678"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">到職日 *</label>
                <Input
                  type="date"
                  value={formData.joinDate}
                  onChange={e => handleJoinDateChange(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  系統將自動計算年資與特休天數
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">等級 *</label>
                  <Select 
                    value={formData.level} 
                    onValueChange={value => setFormData({...formData, level: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="N0">N0 (新進)</SelectItem>
                      <SelectItem value="N1">N1 (1-2年)</SelectItem>
                      <SelectItem value="N2">N2 (2-3年)</SelectItem>
                      <SelectItem value="N3">N3 (3-5年)</SelectItem>
                      <SelectItem value="N4">N4 (5年以上)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">年資（自動計算）</label>
                  <Input
                    type="number"
                    value={formData.seniority}
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-gray-500">依到職日自動計算</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-1 block">特休天數（自動計算）</label>
                  <Input
                    type="number"
                    value={formData.annualLeave}
                    disabled
                    className="bg-gray-100"
                  />
                  <p className="text-xs text-gray-500">依年資自動計算</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">特殊狀態</label>
                <Select 
                  value={formData.specialStatus} 
                  onValueChange={value => setFormData({...formData, specialStatus: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">無</SelectItem>
                    <SelectItem value="pregnant">🤰 孕期</SelectItem>
                    <SelectItem value="nursing">🍼 哺乳期</SelectItem>
                    <SelectItem value="sick">🤒 病假</SelectItem>
                    <SelectItem value="personal">📋 事假</SelectItem>
                    <SelectItem value="bereavement">⚰️ 喪假</SelectItem>
                    <SelectItem value="marriage">💒 婚假</SelectItem>
                    <SelectItem value="restricted">⚠️ 其他限制</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSubmit}>
                {editingNurse ? '更新' : '新增'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="mt-8 bg-blue-50 p-4 rounded-lg">
          <h2 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Users className="w-5 h-5" />
            統計資訊
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">總人數:</span>{' '}
              <span className="font-medium">{nurses.length}人</span>
            </div>
            <div>
              <span className="text-gray-600">在職:</span>{' '}
              <span className="font-medium">{nurses.filter(n => n.isActive).length}人</span>
            </div>
            <div>
              <span className="text-gray-600">停用:</span>{' '}
              <span className="font-medium">{nurses.filter(n => !n.isActive).length}人</span>
            </div>
            <div>
              <span className="text-gray-600">特殊狀態:</span>{' '}
              <span className="font-medium">
                {nurses.filter(n => n.specialStatus !== 'none' && n.isActive).length}人
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  BookOpen, 
  Clock, 
  MapPin, 
  Play, 
  CheckCircle, 
  XCircle, 
  UserPlus, 
  Plus,
  ShieldCheck,
  UserCircle,
  KeyRound,
  RefreshCw,
  Download,
  QrCode,
  Wifi,
  Info,
  ExternalLink,
  Edit,
  Trash2,
  RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { QRCodeSVG } from 'qrcode.react';

// --- Types ---
interface Student {
  id: number;
  name: string;
  admission_number: string;
}

interface Unit {
  id: number;
  name: string;
  lecturer: string;
}

interface AttendanceRecord {
  id: number;
  student_id: number;
  student_name: string;
  admission_number: string;
  otp: string;
  status: 'pending' | 'present' | 'absent';
  marked_at?: string;
}

interface ActiveLesson {
  id: number;
  unit_name: string;
  lecturer: string;
  venue: string;
  duration: number;
  start_time: string;
  end_time: string;
  scheduled_start: string;
  scheduled_end: string;
  lecturer_otp: string;
  lecturer_present: number;
  otp_enabled: boolean;
  attendance: AttendanceRecord[];
}

interface LicenseStatus {
  isValid: boolean;
  daysLeft: number;
  expiry: string;
}

// --- Components ---

const AdminDashboard = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [activeLesson, setActiveLesson] = useState<ActiveLesson | null>(null);
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [repName, setRepName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [hotspotIP, setHotspotIP] = useState('192.168.43.1');
  
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  
  // Form States
  const [newStudent, setNewStudent] = useState({ name: '', admission_number: '' });
  const [newUnit, setNewUnit] = useState({ name: '', lecturer: '' });
  const [lessonConfig, setLessonConfig] = useState({ 
    unit_id: '', 
    venue: '', 
    duration: '60',
    scheduled_start: '',
    scheduled_end: ''
  });

  const fetchData = async () => {
    try {
      setRefreshing(true);
      const fetchJson = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
        return res.json();
      };

      const [sData, uData, lData, licData, repData] = await Promise.all([
        fetchJson('/api/students'),
        fetchJson('/api/units'),
        fetchJson('/api/lessons/active'),
        fetchJson('/api/license/status'),
        fetchJson('/api/settings/rep-name')
      ]);

      setStudents(sData);
      setUnits(uData);
      setActiveLesson(lData);
      setLicense(licData);
      setRepName(repData.name);
      setLastSynced(new Date());
    } catch (e: any) {
      console.error('Fetch error', e);
      // Only alert if it's not the initial load to avoid spamming
      if (!loading) alert(`System Sync Error: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const socket = io();
    socket.on('attendance-updated', () => fetchData());
    return () => { socket.disconnect(); };
  }, []);

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStudent)
    });
    if (res.ok) {
      setNewStudent({ name: '', admission_number: '' });
      fetchData();
    } else {
      alert('Error adding student (likely duplicate admission number)');
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUnit)
    });
    if (res.ok) {
      setNewUnit({ name: '', lecturer: '' });
      fetchData();
    }
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    const res = await fetch(`/api/students/${editingStudent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingStudent)
    });
    if (res.ok) {
      setEditingStudent(null);
      fetchData();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to update student');
    }
  };

  const handleDeleteStudent = async (id: number) => {
    if (!window.confirm('Are you sure? This will delete the student and all their attendance records.')) return;
    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to delete student'}`);
      }
    } catch (e: any) {
      alert(`Network Error: ${e.message}`);
    }
  };

  const handleUpdateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUnit) return;
    const res = await fetch(`/api/units/${editingUnit.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editingUnit)
    });
    if (res.ok) {
      setEditingUnit(null);
      fetchData();
    }
  };

  const handleDeleteUnit = async (id: number) => {
    if (!window.confirm('Are you sure? This will delete the unit, all its lessons, and all attendance records for those lessons.')) return;
    try {
      const res = await fetch(`/api/units/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to delete unit'}`);
      }
    } catch (e: any) {
      alert(`Network Error: ${e.message}`);
    }
  };

  const handleUpdateRepName = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/settings/rep-name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: repName })
    });
    alert('Rep name updated!');
  };

  const handleStartLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonConfig.unit_id) return alert('Select a unit');
    try {
      const res = await fetch('/api/lessons/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lessonConfig)
      });
      if (res.ok) {
        await fetchData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error || 'Failed to start lesson'}`);
      }
    } catch (error) {
      console.error('Start lesson error:', error);
      alert('Network error while starting lesson');
    }
  };

  const handleEnableOTP = async () => {
    if (!activeLesson) return;
    await fetch(`/api/lessons/${activeLesson.id}/enable-otp`, { method: 'POST' });
    fetchData();
  };

  const handleRestartSession = async () => {
    if (!window.confirm('Are you sure you want to restart this session? All current attendance for this session will be cleared.')) return;
    const res = await fetch('/api/lessons/restart', { method: 'POST' });
    if (res.ok) fetchData();
  };

  const exportToPDF = () => {
    if (!activeLesson) return;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('Attendance Report', 14, 22);
    doc.setFontSize(11);
    doc.text(`Unit: ${activeLesson.unit_name}`, 14, 30);
    doc.text(`Lecturer: ${activeLesson.lecturer} (${activeLesson.lecturer_present ? 'PRESENT' : 'ABSENT'})`, 14, 35);
    doc.text(`Venue: ${activeLesson.venue}`, 14, 40);
    doc.text(`Class Rep: ${repName || 'N/A'}`, 14, 45);
    doc.text(`Scheduled: ${activeLesson.scheduled_start || '-'} to ${activeLesson.scheduled_end || '-'}`, 14, 50);
    doc.text(`Actual Time: ${new Date(activeLesson.start_time).toLocaleTimeString()} - ${new Date(activeLesson.end_time).toLocaleTimeString()}`, 14, 55);

    const tableData = activeLesson.attendance.map(record => [
      record.student_name,
      record.admission_number,
      record.status.toUpperCase(),
      record.marked_at ? new Date(record.marked_at).toLocaleTimeString() : '-'
    ]);

    autoTable(doc, {
      startY: 65,
      head: [['Student Name', 'Admission No', 'Status', 'Time Marked']],
      body: tableData,
    });

    doc.save(`Attendance_${activeLesson.unit_name}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  if (loading) return <div className="flex items-center justify-center h-screen font-mono">INITIALIZING SYSTEM...</div>;

  if (license && !license.isValid) {
    return (
      <div className="flex flex-col items-center justify-center h-screen p-6 text-center space-y-6">
        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
          <ShieldCheck className="w-10 h-10 text-red-600" />
        </div>
        <h1 className="text-3xl font-bold">Subscription Expired</h1>
        <p className="text-neutral-500 max-w-md">
          Your 30-day trial or subscription has ended. Please contact the administrator to renew your license and continue using Class Attendance Pro.
        </p>
        <div className="bg-neutral-100 p-4 rounded-2xl font-mono text-xs">
          EXPIRED ON: {new Date(license.expiry).toLocaleDateString()}
        </div>
      </div>
    );
  }

  const studentLink = `http://${hotspotIP}:3000/`;
  const repLink = `http://${hotspotIP}:3000/rep-portal-access`;
  const lecturerLink = `http://${hotspotIP}:3000/lecturer-portal`;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between border-b border-black/10 pb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-600" />
            REPRESENTATIVE DASHBOARD
          </h1>
          <p className="text-sm text-neutral-500 font-mono italic">Offline Attendance Management System • Rep: {repName || 'Not Set'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {lastSynced && (
            <div className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest hidden sm:block">
              Last Synced: {lastSynced.toLocaleTimeString()}
            </div>
          )}
          {license && (
            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${license.daysLeft <= 5 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
              {license.daysLeft} DAYS LEFT
            </div>
          )}
          <button 
            onClick={() => setShowQR(!showQR)}
            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors"
          >
            <QrCode className="w-4 h-4" /> {showQR ? 'HIDE ACCESS' : 'SHOW ACCESS QR'}
          </button>
          {activeLesson && (
            <button 
              onClick={exportToPDF}
              className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-neutral-800 transition-colors"
            >
              <Download className="w-4 h-4" /> DOWNLOAD PDF
            </button>
          )}
        </div>
      </header>

      {showQR && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-xl space-y-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4 text-center">
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Student Access Link</h3>
              <div className="bg-neutral-50 p-4 rounded-2xl inline-block border border-black/5">
                <QRCodeSVG value={studentLink} size={150} />
              </div>
              <p className="text-xs font-mono text-neutral-400 break-all">{studentLink}</p>
              <p className="text-[10px] text-neutral-500">Share this with students to mark attendance</p>
            </div>
            <div className="space-y-4 text-center">
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Representative Access Link</h3>
              <div className="bg-neutral-50 p-4 rounded-2xl inline-block border border-black/5">
                <QRCodeSVG value={repLink} size={150} />
              </div>
              <p className="text-xs font-mono text-neutral-400 break-all">{repLink}</p>
              <p className="text-[10px] text-neutral-500">Keep this private! Use this to manage the class</p>
            </div>
            <div className="space-y-4 text-center">
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">Lecturer Access Link</h3>
              <div className="bg-neutral-50 p-4 rounded-2xl inline-block border border-black/5">
                <QRCodeSVG value={lecturerLink} size={150} />
              </div>
              <p className="text-xs font-mono text-neutral-400 break-all">{lecturerLink}</p>
              <p className="text-[10px] text-neutral-500">Share this with the lecturer to mark themselves present</p>
            </div>
          </div>
          <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 flex items-start gap-3">
            <Wifi className="w-5 h-5 text-emerald-600 mt-1" />
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-emerald-900">Hotspot Configuration Guide</h4>
              <p className="text-xs text-emerald-700 leading-relaxed">
                1. Turn on your phone's <b>Personal Hotspot</b>.<br />
                2. Tell students to connect to your Wi-Fi.<br />
                3. Find your phone's IP address (usually <b>192.168.43.1</b> on Android or <b>172.20.10.1</b> on iPhone).<br />
                4. Update the IP below if it's different so the QR codes work:
              </p>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={hotspotIP}
                  onChange={(e) => setHotspotIP(e.target.value)}
                  className="px-3 py-1 bg-white border border-emerald-200 rounded-lg text-xs font-mono w-40"
                  placeholder="e.g. 192.168.43.1"
                />
                <span className="text-[10px] text-emerald-600 font-bold">PORT: 3000</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Config */}
        <div className="space-y-6">
          {/* Rep Settings */}
          <section className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserCircle className="w-4 h-4" /> Class Rep Settings
            </h2>
            <form onSubmit={handleUpdateRepName} className="space-y-3">
              <input 
                className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                placeholder="Your Name (Class Rep)"
                value={repName}
                onChange={e => setRepName(e.target.value)}
                required
              />
              <button type="submit" className="w-full py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors">
                Save Rep Name
              </button>
            </form>
          </section>

          {/* Add Student */}
          <section className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> Register Student
            </h2>
            <form onSubmit={handleAddStudent} className="space-y-3">
              <input 
                className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                placeholder="Full Name"
                value={newStudent.name}
                onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                required
              />
              <input 
                className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10 font-mono"
                placeholder="Admission Number"
                value={newStudent.admission_number}
                onChange={e => setNewStudent({...newStudent, admission_number: e.target.value})}
                required
              />
              <button type="submit" className="w-full py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add to Registry
              </button>
            </form>
          </section>

          {/* Add Unit */}
          <section className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Define Unit
            </h2>
            <form onSubmit={handleAddUnit} className="space-y-3">
              <input 
                className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                placeholder="Unit Name (e.g. Computer Science)"
                value={newUnit.name}
                onChange={e => setNewUnit({...newUnit, name: e.target.value})}
                required
              />
              <input 
                className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                placeholder="Lecturer Name"
                value={newUnit.lecturer}
                onChange={e => setNewUnit({...newUnit, lecturer: e.target.value})}
                required
              />
              <button type="submit" className="w-full py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Register Unit
              </button>
            </form>
          </section>

          {/* Start Lesson */}
          <section className="bg-white p-5 rounded-2xl border border-black/5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
              <Play className="w-4 h-4" /> Initialize Lesson
            </h2>
            {units.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700 flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5" />
                <div>
                  <p className="font-bold">No Units Defined</p>
                  <p className="mt-1">You must register at least one unit above before you can start a lesson.</p>
                </div>
              </div>
            ) : (
              <form onSubmit={handleStartLesson} className="space-y-3">
                <select 
                  className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                  value={lessonConfig.unit_id}
                  onChange={e => setLessonConfig({...lessonConfig, unit_id: e.target.value})}
                  required
                >
                  <option value="">Select Unit</option>
                  {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input 
                  className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                  placeholder="Venue (e.g. Hall 4)"
                  value={lessonConfig.venue}
                  onChange={e => setLessonConfig({...lessonConfig, venue: e.target.value})}
                  required
                />
                <input 
                  className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                  type="number"
                  placeholder="Duration (mins)"
                  value={lessonConfig.duration}
                  onChange={e => setLessonConfig({...lessonConfig, duration: e.target.value})}
                  required
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-neutral-400 ml-1">Start Time</label>
                    <input 
                      type="time"
                      className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                      value={lessonConfig.scheduled_start}
                      onChange={e => setLessonConfig({...lessonConfig, scheduled_start: e.target.value})}
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase text-neutral-400 ml-1">End Time</label>
                    <input 
                      type="time"
                      className="w-full px-4 py-2 bg-neutral-50 border border-black/5 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-black/10"
                      value={lessonConfig.scheduled_end}
                      onChange={e => setLessonConfig({...lessonConfig, scheduled_end: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <button type="submit" className="w-full py-2 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2">
                  <Play className="w-4 h-4" /> Start Session
                </button>
              </form>
            )}
          </section>
        </div>

        {/* Right Column: Active Session & Attendance */}
        <div className="lg:col-span-2 space-y-6">
          <AnimatePresence mode="wait">
            {activeLesson ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                {/* Active Session Header */}
                <div className="bg-black text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-60">Active Session</span>
                        <h3 className="text-3xl font-bold tracking-tight">{activeLesson.unit_name}</h3>
                        <p className="text-emerald-400 font-mono text-sm">{activeLesson.lecturer}</p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 text-sm opacity-80 mb-1">
                          <MapPin className="w-4 h-4" /> {activeLesson.venue}
                        </div>
                        <div className="flex items-center gap-2 text-sm opacity-80 mb-1">
                          <Clock className="w-4 h-4" /> {new Date(activeLesson.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - {new Date(activeLesson.end_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </div>
                        <div className="text-[10px] opacity-60 font-mono">
                          {activeLesson.duration} Mins Total
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4 mt-8">
                      {!activeLesson.otp_enabled ? (
                        <button 
                          onClick={handleEnableOTP}
                          className="px-6 py-3 bg-white text-black rounded-2xl text-sm font-bold hover:bg-neutral-200 transition-all flex items-center gap-2"
                        >
                          <KeyRound className="w-4 h-4" /> ENABLE OTP INPUT
                        </button>
                      ) : (
                        <div className="px-6 py-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded-2xl text-sm font-bold flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> OTP INPUT ACTIVE
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold uppercase text-emerald-400">Lecturer OTP</div>
                        <div className="bg-emerald-900/50 px-3 py-1 rounded-lg font-mono text-lg font-black tracking-widest border border-emerald-500/30">
                          {activeLesson.lecturer_otp}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold uppercase text-emerald-400">Lecturer Status</div>
                        {activeLesson.lecturer_present ? (
                          <div className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" /> PRESENT
                          </div>
                        ) : (
                          <div className="text-neutral-500 text-xs font-bold flex items-center gap-1">
                            <Clock className="w-3 h-3" /> PENDING
                          </div>
                        )}
                      </div>

                      <button 
                        onClick={async () => {
                          if (window.confirm('Are you sure you want to RESET all attendance for this session? This will wipe current progress.')) {
                            await handleRestartSession();
                          }
                        }}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all flex items-center gap-2"
                        title="Reset Session Attendance"
                      >
                        <RotateCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      </button>
                      <button 
                        onClick={fetchData}
                        className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl text-white transition-all flex items-center gap-2"
                        title="Refresh Data"
                        disabled={refreshing}
                      >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                      </button>
                      <div className="text-[10px] font-mono opacity-50 max-w-[200px]">
                        Students have 20 minutes from {new Date(activeLesson.start_time).toLocaleTimeString()} to mark themselves present.
                      </div>
                    </div>
                  </div>
                  {/* Decorative Background Element */}
                  <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
                </div>

                {/* Attendance List (OTP Distribution) */}
                <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-black/5 flex justify-between items-center bg-neutral-50/50">
                    <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-emerald-600" /> OTP DISTRIBUTION CENTER ({activeLesson.attendance.filter(a => a.status === 'present').length}/{activeLesson.attendance.length})
                    </h4>
                    <button onClick={fetchData} className="p-2 hover:bg-black/5 rounded-full transition-colors disabled:opacity-50" disabled={refreshing}>
                      <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono border-b border-black/5">
                          <th className="px-6 py-4 font-medium">Student Name</th>
                          <th className="px-6 py-4 font-medium">Admission</th>
                          <th className="px-6 py-4 font-medium">OTP Code (Give to Student)</th>
                          <th className="px-6 py-4 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {activeLesson.attendance.map(record => (
                          <tr key={record.id} className="group hover:bg-neutral-50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="text-sm font-bold">{record.student_name}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-xs font-mono text-neutral-500">{record.admission_number}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <div className="text-lg font-black font-mono tracking-widest text-emerald-700 bg-emerald-100 px-4 py-2 rounded-xl border border-emerald-200 shadow-sm">
                                  {record.otp}
                                </div>
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(record.otp);
                                    alert(`OTP ${record.otp} copied for ${record.student_name}`);
                                  }}
                                  className="p-2 hover:bg-emerald-200 rounded-lg text-emerald-700 transition-colors"
                                  title="Copy OTP"
                                >
                                  <KeyRound className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {record.status === 'present' ? (
                                <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold bg-emerald-50 px-2 py-1 rounded-full">
                                  <CheckCircle className="w-3 h-3" /> PRESENT
                                </span>
                              ) : record.status === 'absent' ? (
                                <span className="flex items-center gap-1 text-red-500 text-xs font-bold bg-red-50 px-2 py-1 rounded-full">
                                  <XCircle className="w-3 h-3" /> ABSENT
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-neutral-400 text-xs font-bold animate-pulse bg-neutral-100 px-2 py-1 rounded-full">
                                  <Clock className="w-3 h-3" /> PENDING
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-black/5 rounded-3xl bg-neutral-50/50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                  <Play className="w-8 h-8 text-neutral-300" />
                </div>
                <h3 className="text-lg font-bold">No Active Session</h3>
                <p className="text-sm text-neutral-500 max-w-xs mt-2">
                  Configure a unit and click "Start Session" to begin tracking attendance for your class.
                </p>
              </div>
            )}
          </AnimatePresence>

          {/* Registry Lists (Always Visible) */}
          <div className="space-y-6 pt-6 border-t border-black/5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-tight">System Registry</h3>
              <div className="text-[10px] font-mono text-neutral-400 uppercase">Manage Students & Units</div>
            </div>

            {/* Student Registry List */}
            <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-black/5 flex justify-between items-center bg-neutral-50/50">
                <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-4 h-4" /> Registered Students ({students.length})
                </h4>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono border-b border-black/5">
                      <th className="px-6 py-4 font-medium">Name</th>
                      <th className="px-6 py-4 font-medium">Admission Number</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {students.length > 0 ? students.map(s => (
                      <tr key={s.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4">
                          {editingStudent?.id === s.id ? (
                            <input 
                              className="w-full px-2 py-1 border rounded text-sm"
                              value={editingStudent.name}
                              onChange={e => setEditingStudent({...editingStudent, name: e.target.value})}
                            />
                          ) : (
                            <span className="text-sm font-medium">{s.name}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingStudent?.id === s.id ? (
                            <input 
                              className="w-full px-2 py-1 border rounded text-xs font-mono"
                              value={editingStudent.admission_number}
                              onChange={e => setEditingStudent({...editingStudent, admission_number: e.target.value})}
                            />
                          ) : (
                            <span className="text-xs font-mono text-neutral-500">{s.admission_number}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {editingStudent?.id === s.id ? (
                              <>
                                <button onClick={handleUpdateStudent} className="text-emerald-600 hover:text-emerald-700 text-xs font-bold">SAVE</button>
                                <button onClick={() => setEditingStudent(null)} className="text-neutral-400 hover:text-neutral-500 text-xs font-bold">CANCEL</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setEditingStudent(s)} className="p-1.5 hover:bg-black/5 rounded-lg text-neutral-400 hover:text-black transition-colors">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteStudent(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-neutral-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-neutral-400 italic">
                          No students registered yet. Use the form on the left to add students.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unit Registry List */}
            <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-black/5 flex justify-between items-center bg-neutral-50/50">
                <h4 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                  <BookOpen className="w-4 h-4" /> Registered Units ({units.length})
                </h4>
              </div>
              <div className="max-h-96 overflow-y-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-neutral-400 font-mono border-b border-black/5">
                      <th className="px-6 py-4 font-medium">Unit Name</th>
                      <th className="px-6 py-4 font-medium">Lecturer</th>
                      <th className="px-6 py-4 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {units.length > 0 ? units.map(u => (
                      <tr key={u.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="px-6 py-4">
                          {editingUnit?.id === u.id ? (
                            <input 
                              className="w-full px-2 py-1 border rounded text-sm"
                              value={editingUnit.name}
                              onChange={e => setEditingUnit({...editingUnit, name: e.target.value})}
                            />
                          ) : (
                            <span className="text-sm font-medium">{u.name}</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {editingUnit?.id === u.id ? (
                            <input 
                              className="w-full px-2 py-1 border rounded text-sm"
                              value={editingUnit.lecturer}
                              onChange={e => setEditingUnit({...editingUnit, lecturer: e.target.value})}
                            />
                          ) : (
                            <span className="text-sm text-neutral-500">{u.lecturer}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            {editingUnit?.id === u.id ? (
                              <>
                                <button onClick={handleUpdateUnit} className="text-emerald-600 hover:text-emerald-700 text-xs font-bold">SAVE</button>
                                <button onClick={() => setEditingUnit(null)} className="text-neutral-400 hover:text-neutral-500 text-xs font-bold">CANCEL</button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => setEditingUnit(u)} className="p-1.5 hover:bg-black/5 rounded-lg text-neutral-400 hover:text-black transition-colors">
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteUnit(u.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-neutral-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-sm text-neutral-400 italic">
                          No units registered yet. Use the form on the left to add units.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StudentPortal = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [activeLesson, setActiveLesson] = useState<ActiveLesson | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isMarked, setIsMarked] = useState(false);

  const fetchStatus = async () => {
    const [sRes, lRes] = await Promise.all([
      fetch('/api/students'),
      fetch('/api/lessons/active')
    ]);
    const sData = await sRes.json();
    const lData = await lRes.json();
    setStudents(sData);
    setActiveLesson(lData);

    if (lData && selectedStudent) {
      const record = lData.attendance.find((a: any) => a.student_id === parseInt(selectedStudent));
      if (record?.status === 'present') setIsMarked(true);
    }
  };

  useEffect(() => {
    fetchStatus();
    const socket = io();
    socket.on('otp-enabled', () => fetchStatus());
    socket.on('attendance-updated', () => fetchStatus());
    return () => { socket.disconnect(); };
  }, [selectedStudent]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLesson || !selectedStudent) return;

    const res = await fetch('/api/attendance/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lesson_id: activeLesson.id,
        student_id: parseInt(selectedStudent),
        otp
      })
    });

    const data = await res.json();
    if (res.ok) {
      setStatus({ type: 'success', message: 'Attendance marked successfully!' });
      setIsMarked(true);
    } else {
      setStatus({ type: 'error', message: data.error || 'Failed to mark attendance' });
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 pt-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-black text-white rounded-3xl shadow-xl mb-4">
          <UserCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Student Portal</h1>
        <p className="text-sm text-neutral-500">Mark your attendance for the current session</p>
      </div>

      <AnimatePresence mode="wait">
        {!activeLesson ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-neutral-100 p-8 rounded-3xl text-center border border-black/5"
          >
            <Clock className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="font-bold">Waiting for Session</h3>
            <p className="text-xs text-neutral-500 mt-2">No active lesson found. Please wait for the representative to start the session.</p>
          </motion.div>
        ) : isMarked ? (
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-emerald-50 p-8 rounded-3xl text-center border border-emerald-100"
          >
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-emerald-900">You are Present!</h3>
            <p className="text-sm text-emerald-700 mt-2">Your attendance for <b>{activeLesson.unit_name}</b> has been recorded.</p>
          </motion.div>
        ) : (
          <motion.form 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            onSubmit={handleSubmit} 
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Identity</label>
                <select 
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-black/5"
                  value={selectedStudent}
                  onChange={e => setSelectedStudent(e.target.value)}
                  required
                >
                  <option value="">Select your name</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.admission_number})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">OTP Code</label>
                <input 
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl text-lg font-mono tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-black/5"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  required
                  disabled={!activeLesson.otp_enabled}
                />
                {!activeLesson.otp_enabled && (
                  <p className="text-[10px] text-amber-600 font-medium mt-2 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Waiting for representative to enable input...
                  </p>
                )}
              </div>
            </div>

            {status && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                  status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}
              >
                {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {status.message}
              </motion.div>
            )}

            <button 
              type="submit"
              disabled={!activeLesson.otp_enabled}
              className="w-full py-4 bg-black text-white rounded-2xl font-bold shadow-lg hover:bg-neutral-800 disabled:bg-neutral-200 disabled:text-neutral-400 transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" /> MARK ME PRESENT
            </button>

            <div className="text-center">
              <p className="text-[10px] text-neutral-400 font-mono uppercase tracking-widest">
                Session: {activeLesson.unit_name} • {activeLesson.venue}
              </p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
};

const LecturerPortal = () => {
  const [activeLesson, setActiveLesson] = useState<ActiveLesson | null>(null);
  const [otp, setOtp] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  const fetchStatus = async () => {
    const res = await fetch('/api/lessons/active');
    setActiveLesson(await res.json());
  };

  useEffect(() => {
    fetchStatus();
    const socket = io();
    socket.on('attendance-updated', () => fetchStatus());
    return () => { socket.disconnect(); };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLesson) return;

    const res = await fetch('/api/lecturer/mark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: activeLesson.id, otp })
    });

    const data = await res.json();
    if (res.ok) {
      setStatus({ type: 'success', message: 'Attendance marked successfully, Professor!' });
    } else {
      setStatus({ type: 'error', message: data.error || 'Failed to mark attendance' });
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 pt-12">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-emerald-600 text-white rounded-3xl shadow-xl mb-4">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Lecturer Portal</h1>
        <p className="text-sm text-neutral-500">Verify your presence for the session</p>
      </div>

      <AnimatePresence mode="wait">
        {!activeLesson ? (
          <div className="bg-neutral-100 p-8 rounded-3xl text-center border border-black/5">
            <Clock className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
            <h3 className="font-bold">No Active Session</h3>
          </div>
        ) : activeLesson.lecturer_present ? (
          <div className="bg-emerald-50 p-8 rounded-3xl text-center border border-emerald-100">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-emerald-900">Welcome, {activeLesson.lecturer}!</h3>
            <p className="text-sm text-emerald-700 mt-2">Your presence has been verified for <b>{activeLesson.unit_name}</b>.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-black/5 shadow-sm space-y-4">
              <div className="text-center p-4 bg-neutral-50 rounded-2xl mb-4">
                <p className="text-xs text-neutral-500 uppercase font-bold tracking-widest mb-1">Current Unit</p>
                <p className="text-lg font-bold">{activeLesson.unit_name}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 ml-1">Lecturer OTP</label>
                <input 
                  className="w-full px-4 py-3 bg-neutral-50 border border-black/5 rounded-2xl text-lg font-mono tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-black/5"
                  placeholder="000000"
                  maxLength={6}
                  value={otp}
                  onChange={e => setOtp(e.target.value)}
                  required
                />
              </div>
            </div>

            {status && (
              <div className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2 ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}>
                {status.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {status.message}
              </div>
            )}

            <button type="submit" className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg hover:bg-emerald-700 transition-all">
              VERIFY PRESENCE
            </button>
          </form>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const location = useLocation();
  const isRepPortal = location.pathname === '/rep-portal-access';
  const isLecturerPortal = location.pathname === '/lecturer-portal';

  return (
    <div className="min-h-screen bg-[#FDFDFD] text-neutral-900 font-sans selection:bg-emerald-100">
      <main className="pb-24">
        <Routes>
          <Route path="/" element={<StudentPortal />} />
          <Route path="/rep-portal-access" element={<AdminDashboard />} />
          <Route path="/lecturer-portal" element={<LecturerPortal />} />
        </Routes>
      </main>

      {/* Footer Info */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/50 backdrop-blur-md border-t border-black/5 p-4 flex justify-center items-center gap-6">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-400">
          <Info className="w-3 h-3" /> 
          {isLecturerPortal ? 'LECTURER MODE' : isRepPortal ? 'REPRESENTATIVE MODE' : 'STUDENT MODE'}
        </div>
        <div className="h-4 w-px bg-black/10" />
        <div className="flex gap-4">
          <Link 
            to="/" 
            className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${location.pathname === '/' ? 'text-emerald-600' : 'text-black hover:underline'}`}
          >
            Student
          </Link>
          <Link 
            to="/lecturer-portal" 
            className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${location.pathname === '/lecturer-portal' ? 'text-emerald-600' : 'text-black hover:underline'}`}
          >
            Lecturer
          </Link>
          <Link 
            to="/rep-portal-access" 
            className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ${location.pathname === '/rep-portal-access' ? 'text-emerald-600' : 'text-black hover:underline'}`}
          >
            Rep Portal
          </Link>
        </div>
      </footer>
    </div>
  );
}

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database('attendance.db');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    admission_number TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS units (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lecturer TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unit_id INTEGER,
    date TEXT NOT NULL,
    venue TEXT NOT NULL,
    duration INTEGER,
    start_time TEXT,
    end_time TEXT,
    scheduled_start TEXT,
    scheduled_end TEXT,
    lecturer_otp TEXT,
    lecturer_present INTEGER DEFAULT 0,
    otp_enabled INTEGER DEFAULT 0,
    FOREIGN KEY(unit_id) REFERENCES units(id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lesson_id INTEGER,
    student_id INTEGER,
    otp TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    marked_at TEXT,
    FOREIGN KEY(lesson_id) REFERENCES lessons(id),
    FOREIGN KEY(student_id) REFERENCES students(id)
  );
`);

// Migration: Ensure lessons table has all columns (SQLite doesn't support ADD COLUMN IF NOT EXISTS easily)
const columns = db.prepare("PRAGMA table_info(lessons)").all() as { name: string }[];
const columnNames = columns.map(c => c.name);

const requiredColumns = [
  { name: 'end_time', type: 'TEXT' },
  { name: 'scheduled_start', type: 'TEXT' },
  { name: 'scheduled_end', type: 'TEXT' },
  { name: 'lecturer_otp', type: 'TEXT' },
  { name: 'lecturer_present', type: 'INTEGER DEFAULT 0' },
  { name: 'otp_enabled', type: 'INTEGER DEFAULT 0' }
];

for (const col of requiredColumns) {
  if (!columnNames.includes(col.name)) {
    console.log(`Migrating: Adding column ${col.name} to lessons table`);
    db.exec(`ALTER TABLE lessons ADD COLUMN ${col.name} ${col.type}`);
  }
}

// Initialize license (30 days from now for testing)
const license = db.prepare("SELECT value FROM settings WHERE key = 'license_expiry'").get();
if (!license) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 30);
  db.prepare("INSERT INTO settings (key, value) VALUES ('license_expiry', ?)").run(expiry.toISOString());
}

interface StudentRow { id: number; name: string; admission_number: string; }
interface UnitRow { id: number; name: string; lecturer: string; }
interface LessonRow { 
  id: number; 
  unit_id: number; 
  date: string; 
  venue: string; 
  duration: number; 
  start_time: string; 
  end_time: string; 
  scheduled_start: string;
  scheduled_end: string;
  lecturer_otp: string;
  lecturer_present: number;
  otp_enabled: number; 
  unit_name?: string; 
  lecturer?: string; 
}
interface AttendanceRow { id: number; lesson_id: number; student_id: number; otp: string; status: string; marked_at: string; student_name?: string; admission_number?: string; }

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*' }
  });

  app.use(express.json());

  // API Routes
  app.get('/api/students', (req, res) => {
    const students = db.prepare('SELECT * FROM students ORDER BY name ASC').all() as StudentRow[];
    res.json(students);
  });

  app.post('/api/students', (req, res) => {
    const { name, admission_number } = req.body;
    try {
      const info = db.prepare('INSERT INTO students (name, admission_number) VALUES (?, ?)').run(name, admission_number);
      const studentId = Number(info.lastInsertRowid);

      // Check for an active lesson (within last 24 hours) to add this student to it
      const activeLesson = db.prepare(`
        SELECT id, start_time FROM lessons 
        WHERE datetime(start_time) > datetime('now', '-24 hours')
        ORDER BY id DESC LIMIT 1
      `).get() as { id: number, start_time: string } | undefined;

      if (activeLesson) {
        const startTime = new Date(activeLesson.start_time).getTime();
        const now = new Date().getTime();
        const diffMins = (now - startTime) / (1000 * 60);
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const status = diffMins > 20 ? 'absent' : 'pending';

        db.prepare('INSERT INTO attendance (lesson_id, student_id, otp, status) VALUES (?, ?, ?, ?)')
          .run(activeLesson.id, studentId, otp, status);
        
        io.emit('attendance-updated', { lessonId: activeLesson.id });
      }

      res.json({ id: studentId });
    } catch (e) {
      res.status(400).json({ error: 'Admission number already exists' });
    }
  });

  app.get('/api/units', (req, res) => {
    const units = db.prepare('SELECT * FROM units ORDER BY name ASC').all() as UnitRow[];
    res.json(units);
  });

  app.post('/api/units', (req, res) => {
    const { name, lecturer } = req.body;
    const info = db.prepare('INSERT INTO units (name, lecturer) VALUES (?, ?)').run(name, lecturer);
    res.json({ id: Number(info.lastInsertRowid) });
  });

  app.put('/api/students/:id', (req, res) => {
    const { name, admission_number } = req.body;
    try {
      db.prepare('UPDATE students SET name = ?, admission_number = ? WHERE id = ?')
        .run(name, admission_number, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'Admission number already exists' });
    }
  });

  app.delete('/api/students/:id', (req, res) => {
    const id = parseInt(req.params.id);
    console.log(`Attempting to delete student ID: ${id}`);
    try {
      db.transaction(() => {
        const attendanceDeleted = db.prepare('DELETE FROM attendance WHERE student_id = ?').run(id);
        const studentDeleted = db.prepare('DELETE FROM students WHERE id = ?').run(id);
        console.log(`Deleted ${attendanceDeleted.changes} attendance records and ${studentDeleted.changes} student record`);
      })();
      res.json({ success: true });
    } catch (e: any) {
      console.error(`Error deleting student ${id}:`, e);
      res.status(500).json({ error: e.message || 'Failed to delete student' });
    }
  });

  app.put('/api/units/:id', (req, res) => {
    const { name, lecturer } = req.body;
    try {
      db.prepare('UPDATE units SET name = ?, lecturer = ? WHERE id = ?')
        .run(name, lecturer, req.params.id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to update unit' });
    }
  });

  app.delete('/api/units/:id', (req, res) => {
    const id = parseInt(req.params.id);
    console.log(`Attempting to delete unit ID: ${id}`);
    try {
      db.transaction(() => {
        // Find all lessons for this unit
        const lessons = db.prepare('SELECT id FROM lessons WHERE unit_id = ?').all() as { id: number }[];
        console.log(`Found ${lessons.length} lessons for unit ${id}`);
        for (const lesson of lessons) {
          db.prepare('DELETE FROM attendance WHERE lesson_id = ?').run(lesson.id);
        }
        db.prepare('DELETE FROM lessons WHERE unit_id = ?').run(id);
        db.prepare('DELETE FROM units WHERE id = ?').run(id);
      })();
      res.json({ success: true });
    } catch (e: any) {
      console.error(`Error deleting unit ${id}:`, e);
      res.status(500).json({ error: e.message || 'Failed to delete unit' });
    }
  });

  app.get('/api/license/status', (req, res) => {
    const license = db.prepare("SELECT value FROM settings WHERE key = 'license_expiry'").get() as { value: string };
    const expiry = new Date(license.value);
    const now = new Date();
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    res.json({ 
      isValid: now < expiry,
      daysLeft: Math.max(0, daysLeft),
      expiry: license.value
    });
  });

  app.get('/api/settings/rep-name', (req, res) => {
    const setting = db.prepare("SELECT value FROM settings WHERE key = 'rep_name'").get() as { value: string } | undefined;
    res.json({ name: setting?.value || '' });
  });

  app.post('/api/settings/rep-name', (req, res) => {
    const { name } = req.body;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('rep_name', ?)").run(name);
    res.json({ success: true });
  });

  app.post('/api/lessons/start', (req, res) => {
    console.log('Starting lesson with config:', req.body);
    try {
      const { unit_id, venue, duration, scheduled_start, scheduled_end } = req.body;
      
      if (!unit_id) {
        return res.status(400).json({ error: 'Unit ID is required' });
      }

      const unitIdNum = parseInt(unit_id);
      const now = new Date();
      const start_time = now.toISOString();
      const durationNum = parseInt(duration) || 60;
      const end_time = new Date(now.getTime() + durationNum * 60000).toISOString();
      const lecturer_otp = Math.floor(100000 + Math.random() * 900000).toString();
      
      const lessonInfo = db.prepare(`
        INSERT INTO lessons (unit_id, date, venue, duration, start_time, end_time, scheduled_start, scheduled_end, lecturer_otp) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(unitIdNum, start_time, venue, durationNum, start_time, end_time, scheduled_start, scheduled_end, lecturer_otp);
      
      const lessonId = Number(lessonInfo.lastInsertRowid);
      console.log('Lesson created with ID:', lessonId);

      const students = db.prepare('SELECT id FROM students').all() as { id: number }[];
      console.log(`Adding ${students.length} students to attendance`);
      
      const insertAttendance = db.prepare('INSERT INTO attendance (lesson_id, student_id, otp) VALUES (?, ?, ?)');
      
      db.transaction(() => {
        for (const student of students) {
          const otp = Math.floor(100000 + Math.random() * 900000).toString();
          insertAttendance.run(lessonId, student.id, otp);
        }
      })();

      io.emit('attendance-updated', { lessonId });
      res.json({ lessonId, success: true });
    } catch (error: any) {
      console.error('Error starting lesson:', error);
      res.status(500).json({ error: error.message || 'Failed to start lesson' });
    }
  });

  app.post('/api/lecturer/mark', (req, res) => {
    const { lesson_id, otp } = req.body;
    const lesson = db.prepare('SELECT lecturer_otp FROM lessons WHERE id = ?').get(lesson_id) as { lecturer_otp: string } | undefined;
    
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    if (lesson.lecturer_otp !== otp) return res.status(400).json({ error: 'Invalid Lecturer OTP' });

    db.prepare('UPDATE lessons SET lecturer_present = 1 WHERE id = ?').run(lesson_id);
    io.emit('attendance-updated', { lessonId: lesson_id });
    res.json({ success: true });
  });

  app.post('/api/lessons/restart', (req, res) => {
    const activeLesson = db.prepare(`
      SELECT id, duration FROM lessons 
      WHERE datetime(start_time) > datetime('now', '-24 hours')
      ORDER BY id DESC LIMIT 1
    `).get() as { id: number, duration: number } | undefined;

    if (!activeLesson) return res.status(404).json({ error: 'No active lesson to restart' });

    const now = new Date();
    const start_time = now.toISOString();
    const end_time = new Date(now.getTime() + activeLesson.duration * 60000).toISOString();

    // Update lesson times
    db.prepare('UPDATE lessons SET start_time = ?, end_time = ?, otp_enabled = 0 WHERE id = ?')
      .run(start_time, end_time, activeLesson.id);

    // Reset attendance for this lesson
    const students = db.prepare('SELECT id FROM students').all() as { id: number }[];
    db.prepare('DELETE FROM attendance WHERE lesson_id = ?').run(activeLesson.id);
    
    const insertAttendance = db.prepare('INSERT INTO attendance (lesson_id, student_id, otp) VALUES (?, ?, ?)');
    for (const student of students) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      insertAttendance.run(activeLesson.id, student.id, otp);
    }

    io.emit('attendance-updated', { lessonId: activeLesson.id });
    res.json({ success: true });
  });

  app.post('/api/lessons/:id/enable-otp', (req, res) => {
    db.prepare('UPDATE lessons SET otp_enabled = 1 WHERE id = ?').run(req.params.id);
    io.emit('otp-enabled', { lessonId: req.params.id });
    res.json({ success: true });
  });

  app.get('/api/lessons/active', (req, res) => {
    try {
      console.log('Fetching active lesson...');
      const lesson = db.prepare(`
        SELECT l.*, u.name as unit_name, u.lecturer 
        FROM lessons l 
        JOIN units u ON l.unit_id = u.id 
        ORDER BY l.id DESC LIMIT 1
      `).get() as LessonRow | undefined;
      
      if (!lesson) {
        console.log('No lessons found in database.');
        return res.json(null);
      }

      // Only consider it "active" if it started within the last 24 hours
      const startTime = new Date(lesson.start_time).getTime();
      const now = new Date().getTime();
      const diffHours = (now - startTime) / (1000 * 60 * 60);

      if (diffHours > 24) {
        console.log('Latest lesson is older than 24 hours. Returning null.');
        return res.json(null);
      }

      console.log('Active lesson found:', lesson.unit_name);

      // Auto-expire pending records if 20 mins passed
      const diffMins = (now - startTime) / (1000 * 60);
      if (diffMins > 20) {
        const result = db.prepare("UPDATE attendance SET status = 'absent' WHERE lesson_id = ? AND status = 'pending'").run(lesson.id);
        if (result.changes > 0) {
          console.log(`Auto-expired ${result.changes} pending attendance records.`);
        }
      }

      const attendance = db.prepare(`
        SELECT a.*, s.name as student_name, s.admission_number 
        FROM attendance a 
        JOIN students s ON a.student_id = s.id 
        WHERE a.lesson_id = ?
      `).all(lesson.id) as AttendanceRow[];

      res.json({ ...lesson, attendance });
    } catch (error) {
      console.error('Error fetching active lesson:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/attendance/mark', (req, res) => {
    const { lesson_id, student_id, otp } = req.body;
    
    const lesson = db.prepare('SELECT start_time, otp_enabled FROM lessons WHERE id = ?').get(lesson_id) as LessonRow | undefined;
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    
    if (!lesson.otp_enabled) return res.status(400).json({ error: 'OTP input is not yet enabled by the representative' });

    const startTime = new Date(lesson.start_time).getTime();
    const now = new Date().getTime();
    const diffMins = (now - startTime) / (1000 * 60);

    if (diffMins > 20) {
      db.prepare("UPDATE attendance SET status = 'absent' WHERE lesson_id = ? AND student_id = ? AND status = 'pending'").run(lesson_id, student_id);
      return res.status(400).json({ error: 'OTP has expired (20 minutes elapsed)' });
    }

    const record = db.prepare('SELECT * FROM attendance WHERE lesson_id = ? AND student_id = ? AND otp = ?').get(lesson_id, student_id, otp) as AttendanceRow | undefined;
    
    if (!record) return res.status(400).json({ error: 'Invalid OTP' });
    if (record.status === 'present') return res.status(400).json({ error: 'Already marked present' });

    db.prepare("UPDATE attendance SET status = 'present', marked_at = ? WHERE id = ?")
      .run(new Date().toISOString(), record.id);

    io.emit('attendance-updated', { lessonId: lesson_id, studentId: student_id, status: 'present' });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'dist/index.html')));
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

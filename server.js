require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dns = require('dns');

// Ensure reliable SRV resolution on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if unable to set servers
}

const Event = require('./models/Event');
const Member = require('./models/Member');
const Attendance = require('./models/Attendance');
const Qualification = require('./models/Qualification');
const Otp = require('./models/Otp');
const ExcelJS = require('exceljs');
const googleSheets = require('./services/googleSheets');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'apc_attendance_jwt_secret_key_2026';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/apc_attendance')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- AUTH & ROLE HELPERS ---
function isSidAdmin(sid) {
  if (!sid) return false;
  const s = String(sid).trim();
  return s.startsWith('23') || s.startsWith('24');
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token required. Please log in.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired session. Please log in again.' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied: Admin authorization required.' });
  }
  next();
}

// --- AUTH ROUTES ---

// Login route
app.post('/api/auth/login', async (req, res) => {
  try {
    const { sid, password } = req.body;
    if (!sid) return res.status(400).json({ error: 'SID is required' });

    const trimmedSid = String(sid).trim();
    const member = await Member.findOne({ sid: trimmedSid });

    // If member not found in DB
    if (!member) {
      return res.json({
        needsSetup: true,
        sid: trimmedSid,
        message: 'Student ID not registered yet. Please enter your name and choose a password.'
      });
    }

    // If member registered via Kiosk or without password
    if (!member.password) {
      return res.json({
        needsSetup: true,
        sid: trimmedSid,
        name: member.name,
        email: member.email || '',
        message: 'No password set for this account. Please set a password to continue.'
      });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    const isMatch = bcrypt.compareSync(password, member.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const isAdmin = isSidAdmin(member.sid);
    const token = jwt.sign(
      { sid: member.sid, name: member.name, isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        sid: member.sid,
        name: member.name,
        isAdmin
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Email Transporter Helper (Nodemailer Gmail / SMTP)
const nodemailer = require('nodemailer');

function getEmailTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER.trim(),
      pass: process.env.EMAIL_PASS.trim()
    }
  });
}

// Production Email OTP Dispatcher
async function sendEmailOtp({ sid, email, otp }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const transporter = getEmailTransporter();

  // 1. Live Gmail Dispatch
  if (transporter) {
    try {
      const mailOptions = {
        from: `"APC Attendance Portal" <${process.env.EMAIL_USER.trim()}>`,
        to: cleanEmail,
        subject: `APC Verification Code: ${otp}`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="margin: 0; color: #38bdf8; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">APC Attendance</h2>
              <p style="margin: 6px 0 0 0; color: #94a3b8; font-size: 14px;">Identity Verification</p>
            </div>
            <div style="background: #1e293b; border-radius: 8px; padding: 24px; text-align: center; border: 1px solid #334155;">
              <p style="margin: 0 0 16px 0; color: #e2e8f0; font-size: 15px;">Your one-time verification code for Student ID <strong>${sid}</strong> is:</p>
              <div style="display: inline-block; background: #0284c7; color: #ffffff; font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 12px 28px; border-radius: 8px; font-family: monospace; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.35);">
                ${otp}
              </div>
              <p style="margin: 18px 0 0 0; color: #94a3b8; font-size: 13px;">This code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
            </div>
            <div style="text-align: center; margin-top: 24px; color: #64748b; font-size: 12px;">
              <p style="margin: 0;">If you did not request this verification code, you can safely ignore this email.</p>
            </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      console.log(`[Email] ✅ OTP successfully emailed to ${cleanEmail} (SID: ${sid})`);
      return { delivered: true, gateway: 'Gmail' };
    } catch (err) {
      console.error('[Email] ❌ Failed to send email:', err.message);
      return { delivered: false, gateway: 'Gmail', error: err.message };
    }
  }

  // 2. Local Terminal Fallback (when EMAIL_USER / EMAIL_PASS not in .env yet)
  console.log(`\n=================================================`);
  console.log(`[📧 EMAIL OTP GATEWAY] Recipient: ${cleanEmail} (SID: ${sid})`);
  console.log(`[📧 EMAIL OTP GATEWAY] OTP CODE: ${otp} (Valid 10 mins)`);
  console.log(`[ℹ️ Add EMAIL_USER & EMAIL_PASS to .env for live inbox delivery]`);
  console.log(`=================================================\n`);

  return {
    delivered: false,
    gateway: 'Dev/Console'
  };
}

// Request Email OTP endpoint
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { sid, email } = req.body;
    if (!sid) return res.status(400).json({ error: 'Student ID (SID) is required' });

    const cleanEmail = String(email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address to receive your verification code.' });
    }

    const trimmedSid = String(sid).trim();
    const member = await Member.findOne({ sid: trimmedSid });

    // If member already registered with an email, lock OTP requests to that email
    if (member && member.email) {
      if (member.email.trim().toLowerCase() !== cleanEmail) {
        const [u, d] = member.email.split('@');
        const masked = (u.length > 2 ? u.slice(0, 2) + '****' : u[0] + '****') + '@' + d;
        return res.status(403).json({
          error: `This SID is registered with email (${masked}). Please enter the registered email address.`
        });
      }
    }

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await Otp.findOneAndUpdate(
      { sid: trimmedSid },
      { sid: trimmedSid, email: cleanEmail, otp, expiresAt },
      { upsert: true, returnDocument: 'after' }
    );

    const sendResult = await sendEmailOtp({ sid: trimmedSid, email: cleanEmail, otp });

    if (process.env.EMAIL_USER && !sendResult.delivered) {
      return res.status(502).json({
        error: `Email delivery failed: ${sendResult.error || 'Please verify your EMAIL_USER and EMAIL_PASS settings.'}`
      });
    }

    const [u, d] = cleanEmail.split('@');
    const maskedDisplay = (u.length > 2 ? u.slice(0, 2) + '****' : u[0] + '****') + '@' + d;

    res.json({
      success: true,
      message: `Verification code sent to ${maskedDisplay}. Please check your inbox (and spam folder).`,
      email: cleanEmail
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lookup member info by SID for autofill during registration / reset password
app.get('/api/auth/lookup-sid/:sid', async (req, res) => {
  try {
    const trimmedSid = String(req.params.sid || '').trim();
    if (!trimmedSid) {
      return res.status(400).json({ error: 'SID is required' });
    }

    const member = await Member.findOne({ sid: trimmedSid });
    if (!member) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      sid: member.sid,
      name: member.name || '',
      email: member.email || '',
      hasPassword: Boolean(member.password)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setup / Register / Reset Password with Mandatory Email OTP Verification
app.post('/api/auth/setup-password', async (req, res) => {
  try {
    const { sid, name, email, otp, password } = req.body;
    if (!sid || !password) {
      return res.status(400).json({ error: 'SID and Password are required' });
    }
    if (!otp) {
      return res.status(400).json({ error: 'Verification code is required. Please click "Send Email OTP" first.' });
    }

    const cleanEmail = String(email || '').trim().toLowerCase();
    const trimmedSid = String(sid).trim();
    const otpRecord = await Otp.findOne({ sid: trimmedSid });

    if (!otpRecord) {
      return res.status(400).json({ error: 'No verification code requested for this SID. Please click "Send Email OTP" first.' });
    }

    if (new Date() > otpRecord.expiresAt) {
      await Otp.deleteOne({ sid: trimmedSid });
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    if (otpRecord.otp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid verification code. Please check your email and re-enter.' });
    }

    if (cleanEmail && otpRecord.email && otpRecord.email !== cleanEmail) {
      return res.status(400).json({ error: 'Email does not match the address the OTP was sent to.' });
    }

    // OTP verified! Remove the used OTP
    const verifiedEmail = otpRecord.email;
    await Otp.deleteOne({ sid: trimmedSid });

    let member = await Member.findOne({ sid: trimmedSid });
    const hashedPassword = bcrypt.hashSync(password, 10);

    if (!member) {
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Name is required to register.' });
      }
      member = new Member({
        sid: trimmedSid,
        name: name.trim(),
        password: hashedPassword,
        email: verifiedEmail
      });
      await member.save();
    } else {
      if (name && name.trim()) member.name = name.trim();
      member.password = hashedPassword;
      member.email = verifiedEmail;
      await member.save();
    }

    const isAdmin = isSidAdmin(member.sid);
    const token = jwt.sign(
      { sid: member.sid, name: member.name, isAdmin },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Email identity verified and password saved successfully!',
      token,
      user: {
        sid: member.sid,
        name: member.name,
        isAdmin
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Current User Profile
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  res.json({ user: req.user });
});

// --- STUDENT SPECIFIC ROUTES ---

// Get current logged-in student's personal attendance across all events
app.get('/api/student/my-attendance', authenticateToken, async (req, res) => {
  try {
    const studentSid = req.user.sid;
    const events = await Event.find().sort({ startDate: -1 });

    const studentRecords = await Attendance.find({ sid: studentSid });
    const overrides = await Qualification.find({ sid: studentSid });
    const overrideMap = new Map();
    overrides.forEach(o => overrideMap.set(String(o.eventId), o.isQualified));

    const eventDetails = [];
    for (const event of events) {
      const records = studentRecords.filter(r => String(r.eventId) === String(event._id));
      const daysPresent = records.length;
      const attendancePercentage = event.totalDays > 0 ? (daysPresent / event.totalDays) * 100 : 0;
      const isAutoQualified = attendancePercentage >= 40;
      const isOverridden = overrideMap.has(String(event._id));
      const isQualified = isOverridden ? overrideMap.get(String(event._id)) : isAutoQualified;

      eventDetails.push({
        eventId: event._id,
        name: event.name,
        description: event.description || '',
        startDate: event.startDate,
        endDate: event.endDate,
        totalDays: event.totalDays,
        isMultiDay: event.isMultiDay,
        daysPresent,
        attendancePercentage: attendancePercentage.toFixed(2),
        isQualified,
        isOverridden,
        attendedDates: records.map(r => r.date).sort((a, b) => new Date(a) - new Date(b))
      });
    }

    const attendedEvents = eventDetails.filter(e => e.daysPresent > 0);
    const qualifiedEvents = eventDetails.filter(e => e.isQualified && e.daysPresent > 0);
    const totalDaysAttended = eventDetails.reduce((sum, e) => sum + e.daysPresent, 0);
    const totalPossibleDays = eventDetails.reduce((sum, e) => sum + e.totalDays, 0);
    const overallPercentage = totalPossibleDays > 0 ? ((totalDaysAttended / totalPossibleDays) * 100).toFixed(2) : '0.00';

    res.json({
      student: {
        sid: req.user.sid,
        name: req.user.name,
        isAdmin: req.user.isAdmin
      },
      summary: {
        totalEvents: eventDetails.length,
        attendedEventsCount: attendedEvents.length,
        qualifiedEventsCount: qualifiedEvents.length,
        totalDaysAttended,
        overallPercentage
      },
      events: eventDetails
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- API ROUTES ---

// 1. Get all events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find().sort({ startDate: -1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create an event
app.post('/api/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, startDate, endDate } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate total days (inclusive)
    const timeDiff = end.getTime() - start.getTime();
    const totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    const isMultiDay = totalDays > 1;

    const event = new Event({
      name,
      description,
      startDate: start,
      endDate: end,
      isMultiDay,
      totalDays
    });

    await event.save();
    res.status(201).json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Get currently active events (happening today)
app.get('/api/events/active', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfToday = new Date(today);
    endOfToday.setHours(23, 59, 59, 999);

    const activeEvents = await Event.find({
      startDate: { $lte: endOfToday },
      endDate: { $gte: today }
    });
    res.json(activeEvents);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Mark Attendance (Admin Only)
app.post('/api/attendance', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId, sid, name } = req.body;
    if (!eventId || !sid) {
      return res.status(400).json({ error: 'Event ID and SID are required' });
    }

    // Ensure member exists, or create them if name is provided
    let member = await Member.findOne({ sid });
    if (!member) {
      if (!name) {
        return res.status(404).json({ error: 'Member not found. Please provide name to register.' });
      }
      member = new Member({ sid, name });
      await member.save();
    } else if (name && member.name !== name) {
      // Optional: update name if it changed
      member.name = name;
      await member.save();
    }

    // Get today's date at midnight for the attendance record
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if event is valid for today
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    
    if (today < new Date(event.startDate).setHours(0,0,0,0) || today > new Date(event.endDate).setHours(23,59,59,999)) {
      return res.status(400).json({ error: 'Event is not active today' });
    }

    // Create attendance record
    const attendance = new Attendance({
      eventId,
      sid,
      date: today
    });

    await attendance.save();

    const displayName = (member && member.name) ? member.name : `Student (${sid})`;
    res.status(200).json({ message: `Attendance marked for ${displayName}`, member });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Attendance already marked for today' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Event Report (calculates 40% rule + manual qualification overrides)
app.get('/api/events/:id/report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Aggregate attendance by SID
    const attendanceStats = await Attendance.aggregate([
      { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
      { $group: { _id: "$sid", daysPresent: { $sum: 1 } } }
    ]);

    // Fetch manual qualification overrides
    const overrides = await Qualification.find({ eventId: new mongoose.Types.ObjectId(eventId) });
    const overrideMap = new Map();
    overrides.forEach(o => overrideMap.set(o.sid, o.isQualified));

    const report = [];
    for (const stat of attendanceStats) {
      const member = await Member.findOne({ sid: stat._id });
      const attendancePercentage = (stat.daysPresent / event.totalDays) * 100;
      const isAutoQualified = attendancePercentage >= 40;
      const isOverridden = overrideMap.has(stat._id);
      const isQualified = isOverridden ? overrideMap.get(stat._id) : isAutoQualified;

      report.push({
        sid: stat._id,
        name: member && member.name ? member.name : null,
        daysPresent: stat.daysPresent,
        totalDays: event.totalDays,
        attendancePercentage: attendancePercentage.toFixed(2),
        isQualified,
        isOverridden
      });
    }

    // Include any students who were manually overridden even if they have 0 attendance records
    for (const [sid, isQual] of overrideMap.entries()) {
      if (!attendanceStats.some(s => s._id === sid)) {
        const member = await Member.findOne({ sid });
        report.push({
          sid,
          name: member && member.name ? member.name : null,
          daysPresent: 0,
          totalDays: event.totalDays,
          attendancePercentage: "0.00",
          isQualified: isQual,
          isOverridden: true
        });
      }
    }

    res.json({ event, report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update or toggle manual qualification for a student in an event
app.put('/api/events/:id/qualification', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sid, isQualified } = req.body;
    if (!sid || typeof isQualified !== 'boolean') {
      return res.status(400).json({ error: 'SID and boolean isQualified are required' });
    }

    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const qualification = await Qualification.findOneAndUpdate(
      { eventId: req.params.id, sid },
      { eventId: req.params.id, sid, isQualified },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: 'Qualification updated successfully', qualification });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Update an event
app.put('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, startDate, endDate } = req.body;
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const timeDiff = end.getTime() - start.getTime();
    const totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
    const isMultiDay = totalDays > 1;

    const event = await Event.findByIdAndUpdate(req.params.id, {
      name, description, startDate: start, endDate: end, isMultiDay, totalDays
    }, { new: true });

    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json(event);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete all events, attendance records, and qualifications
app.delete('/api/events', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await Event.deleteMany({});
    await Attendance.deleteMany({});
    await Qualification.deleteMany({});
    res.json({ message: 'All events, attendance records, and qualifications deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Delete an event
app.delete('/api/events/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    // Also delete attendance and qualification overrides for this event
    await Attendance.deleteMany({ eventId: req.params.id });
    await Qualification.deleteMany({ eventId: req.params.id });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Get specific attendance records for a student in an event
app.get('/api/events/:id/attendance/:sid', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const records = await Attendance.find({ eventId: req.params.id, sid: req.params.sid }).sort({ date: 1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8b. Bulk Remove Students Completely From An Event (Admin Only)
app.delete('/api/events/:id/students', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    let { sids } = req.body;

    if (!sids || !Array.isArray(sids) || sids.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of student SIDs to remove.' });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const cleanSids = sids.map(s => String(s).trim()).filter(Boolean);

    // Delete attendance records for these students in this event
    const attResult = await Attendance.deleteMany({
      eventId: new mongoose.Types.ObjectId(eventId),
      sid: { $in: cleanSids }
    });

    // Delete qualification records for these students in this event
    const qualResult = await Qualification.deleteMany({
      eventId: new mongoose.Types.ObjectId(eventId),
      sid: { $in: cleanSids }
    });

    res.json({
      message: `Successfully removed ${cleanSids.length} student(s) from "${event.name}".`,
      deletedAttendanceCount: attResult.deletedCount,
      deletedQualificationCount: qualResult.deletedCount,
      removedSids: cleanSids
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8c. Remove Single Student Completely From An Event (Admin Only)
app.delete('/api/events/:id/students/:sid', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const eventId = req.params.id;
    const sid = req.params.sid.trim();

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const attResult = await Attendance.deleteMany({
      eventId: new mongoose.Types.ObjectId(eventId),
      sid
    });

    await Qualification.deleteMany({
      eventId: new mongoose.Types.ObjectId(eventId),
      sid
    });

    res.json({
      message: `Student (${sid}) completely removed from "${event.name}".`,
      deletedCount: attResult.deletedCount
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Update an attendance record
app.put('/api/attendance/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { date, sid } = req.body;
    const recordDate = new Date(date);
    recordDate.setHours(0,0,0,0);
    
    // Validate against event dates
    const existingRecord = await Attendance.findById(req.params.id).populate('eventId');
    if (!existingRecord) return res.status(404).json({ error: 'Attendance record not found' });
    
    if (existingRecord.eventId) {
      const eventStart = new Date(existingRecord.eventId.startDate).setHours(0,0,0,0);
      const eventEnd = new Date(existingRecord.eventId.endDate).setHours(23,59,59,999);
      
      if (recordDate < eventStart || recordDate > eventEnd) {
        return res.status(400).json({ error: 'Date must be within the event dates.' });
      }
    }
    
    existingRecord.date = recordDate;
    existingRecord.sid = sid;
    await existingRecord.save();

    res.json(existingRecord);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 10. Delete an attendance record
app.delete('/api/attendance/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });

    res.json({ message: 'Attendance deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Get attendance by date
app.get('/api/attendance/date/:date', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const targetDate = new Date(req.params.date);
    targetDate.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const records = await Attendance.find({
      date: { $gte: targetDate, $lte: endOfDay }
    }).populate('eventId');

    const result = [];
    for (const record of records) {
      const member = await Member.findOne({ sid: record.sid });
      result.push({
        _id: record._id,
        sid: record.sid,
        name: member ? member.name : 'Unknown',
        event: record.eventId ? record.eventId.name : 'Unknown Event',
        eventId: record.eventId ? record.eventId._id : null,
        date: record.date
      });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Manual Attendance Entry (bypass today's date checks)
app.post('/api/attendance/manual', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId, sid, name, date } = req.body;
    if (!eventId || !sid || !date) {
      return res.status(400).json({ error: 'Event ID, SID, and Date are required' });
    }

    let member = await Member.findOne({ sid });
    if (!member) {
      member = new Member({ sid, name: name ? name.trim() : null });
      await member.save();
    } else if (name && member.name !== name) {
      member.name = name.trim();
      await member.save();
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    const eventStart = new Date(event.startDate).setHours(0,0,0,0);
    const eventEnd = new Date(event.endDate).setHours(23,59,59,999);
    
    if (targetDate < eventStart || targetDate > eventEnd) {
      return res.status(400).json({ error: 'Date must be within the event dates.' });
    }

    const attendance = new Attendance({
      eventId,
      sid,
      date: targetDate
    });

    await attendance.save();

    const displayName = (member && member.name) ? member.name : `Student (${sid})`;
    res.status(200).json({ message: `Attendance marked for ${displayName} on ${targetDate.toLocaleDateString()}` });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 12b. Bulk Attendance Marking (Admin Only)
app.post('/api/attendance/bulk', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId, sids, date } = req.body;
    if (!eventId || !sids) {
      return res.status(400).json({ error: 'Event ID and SIDs are required' });
    }

    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Target date defaults to today if not provided
    const targetDate = date ? new Date(date) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const eventStart = new Date(event.startDate).setHours(0, 0, 0, 0);
    const eventEnd = new Date(event.endDate).setHours(23, 59, 59, 999);

    if (targetDate < eventStart || targetDate > eventEnd) {
      return res.status(400).json({ error: 'Selected date must be within event start and end dates.' });
    }

    // Parse SIDs from array or string (splits on newlines, commas, semicolons, spaces)
    let rawSids = [];
    if (Array.isArray(sids)) {
      rawSids = sids;
    } else if (typeof sids === 'string') {
      rawSids = sids.split(/[\r\n,;\s]+/);
    }

    // Clean and deduplicate SIDs
    const cleanSids = Array.from(new Set(
      rawSids
        .map(s => String(s).trim())
        .filter(s => s.length > 0)
    ));

    if (cleanSids.length === 0) {
      return res.status(400).json({ error: 'No valid SIDs provided.' });
    }

    let newlyMarked = 0;
    let alreadyMarked = 0;
    let newMembersCreated = 0;
    const addedSids = [];
    const skippedSids = [];

    for (const sid of cleanSids) {
      // Find or create member with name: null
      let member = await Member.findOne({ sid });
      if (!member) {
        member = new Member({ sid, name: null });
        await member.save();
        newMembersCreated++;
      }

      // Check if attendance already marked for this date
      const existing = await Attendance.findOne({
        eventId,
        sid,
        date: targetDate
      });

      if (existing) {
        alreadyMarked++;
        skippedSids.push(sid);
      } else {
        const attendance = new Attendance({
          eventId,
          sid,
          date: targetDate
        });
        await attendance.save();
        newlyMarked++;
        addedSids.push(sid);
      }
    }

    res.status(200).json({
      message: `Bulk attendance completed: ${newlyMarked} marked present, ${alreadyMarked} already recorded.`,
      summary: {
        total: cleanSids.length,
        newlyMarked,
        alreadyMarked,
        newMembersCreated
      },
      addedSids,
      skippedSids
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12c. Update Member Name / Details (e.g. Set name after bulk attendance) (Admin Only)
app.patch('/api/members/:sid', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sid = req.params.sid.trim();
    const { name, email, phone } = req.body;

    let member = await Member.findOne({ sid });
    if (!member) {
      member = new Member({
        sid,
        name: name ? name.trim() : null,
        email: email ? email.trim() : null,
        phone: phone ? phone.trim() : null
      });
      await member.save();
    } else {
      if (name !== undefined) member.name = name ? name.trim() : null;
      if (email !== undefined) member.email = email ? email.trim() : null;
      if (phone !== undefined) member.phone = phone ? phone.trim() : null;
      await member.save();
    }

    res.json({ message: 'Student details updated successfully', member });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12d. Google Sheets Integration Status & Info
app.get('/api/sheets/info', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId, tab } = req.query;
    let url = googleSheets.getSheetUrl();
    if (googleSheets.isConfigured() && (eventId || tab)) {
      url = await googleSheets.getTabUrl(eventId || tab);
    }
    res.json({
      isConfigured: googleSheets.isConfigured(),
      url
    });
  } catch (err) {
    res.json({
      isConfigured: googleSheets.isConfigured(),
      url: googleSheets.getSheetUrl()
    });
  }
});

// 12e. Manual Trigger for Google Sheets Sync (Admin Only)
app.post('/api/sheets/sync', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { eventId } = req.body || {};
    let result;
    if (eventId) {
      result = await googleSheets.syncEventToSheet(eventId);
    } else {
      result = await googleSheets.syncAll();
    }

    res.json({
      message: 'Google Sheets sync completed',
      result,
      url: googleSheets.getSheetUrl(),
      isConfigured: googleSheets.isConfigured()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper: format Date as DD-MM-YYYY
function formatDateDDMMYYYY(d) {
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

// 13. Export Event-Wise Attendance as Excel (.xlsx)
app.get('/api/events/:id/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });

    // Generate list of calendar dates between start and end date (inclusive)
    const dates = [];
    let cur = new Date(event.startDate);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(event.endDate);
    last.setHours(0, 0, 0, 0);

    while (cur <= last) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    // Retrieve attendance records and qualification records for this event
    const attendanceRecords = await Attendance.find({ eventId: event._id });
    const qualificationRecords = await Qualification.find({ eventId: event._id });

    // Collect all distinct student SIDs
    const sidSet = new Set();
    attendanceRecords.forEach(a => sidSet.add(a.sid));
    qualificationRecords.forEach(q => sidSet.add(q.sid));

    const students = [];
    for (const sid of sidSet) {
      const member = await Member.findOne({ sid });
      students.push({
        sid,
        name: member ? member.name.toUpperCase() : 'UNKNOWN'
      });
    }
    students.sort((a, b) => a.name.localeCompare(b.name));

    // Build Excel Workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'APC Attendance Tracker';
    const sheetName = event.name.replace(/[*?:/\\\[\]]/g, '').substring(0, 31) || 'Attendance';
    const worksheet = workbook.addWorksheet(sheetName);

    // Columns: NAME, SID, and each date (DD-MM-YYYY)
    const columns = [
      { header: 'NAME', key: 'name', width: 25 },
      { header: 'SID', key: 'sid', width: 16 }
    ];

    dates.forEach((d, idx) => {
      columns.push({
        header: formatDateDDMMYYYY(d),
        key: `date_${idx}`,
        width: 14
      });
    });

    worksheet.columns = columns;

    // Add row for each student
    for (const student of students) {
      const rowData = {
        name: student.name,
        sid: student.sid
      };

      const studentDates = attendanceRecords
        .filter(a => a.sid === student.sid)
        .map(a => {
          const d = new Date(a.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        });

      dates.forEach((d, idx) => {
        const isPresent = studentDates.includes(d.getTime());
        rowData[`date_${idx}`] = isPresent ? '✔' : '✖';
      });

      worksheet.addRow(rowData);
    }

    // Styling
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).height = 24;
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
    worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };

    worksheet.eachRow((row, rowNumber) => {
      row.height = 22;
      row.alignment = { vertical: 'middle' };
      if (rowNumber > 1) {
        row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };

        for (let c = 3; c <= columns.length; c++) {
          const cell = row.getCell(c);
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
          if (cell.value === '✔' || cell.value === '✖') {
            cell.font = { name: 'Arial', size: 14, bold: true };
          }
        }
      }
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const safeName = event.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}_Attendance.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 14. Export Merged Qualified Students across all events as Excel (.xlsx)
app.get('/api/reports/qualified-merged', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const events = await Event.find().sort({ startDate: 1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'APC Attendance Tracker';
    const worksheet = workbook.addWorksheet('Qualified Students');

    worksheet.columns = [
      { header: 'SID', key: 'sid', width: 16 },
      { header: 'NAME', key: 'name', width: 25 },
      { header: 'EVENT NAME', key: 'eventName', width: 28 },
      { header: 'EVENT DATES', key: 'eventDates', width: 24 },
      { header: 'DAYS PRESENT', key: 'daysPresent', width: 14 },
      { header: 'TOTAL DAYS', key: 'totalDays', width: 12 },
      { header: 'ATTENDANCE %', key: 'attendancePercentage', width: 16 },
      { header: 'QUALIFICATION STATUS', key: 'status', width: 22 },
      { header: 'QUALIFIED BY', key: 'qualifiedBy', width: 20 }
    ];

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).height = 24;
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    for (const event of events) {
      const eventId = event._id;
      const attendanceStats = await Attendance.aggregate([
        { $match: { eventId: new mongoose.Types.ObjectId(eventId) } },
        { $group: { _id: "$sid", daysPresent: { $sum: 1 } } }
      ]);

      const overrides = await Qualification.find({ eventId: new mongoose.Types.ObjectId(eventId) });
      const overrideMap = new Map();
      overrides.forEach(o => overrideMap.set(o.sid, o.isQualified));

      const eventStudentMap = new Map();

      for (const stat of attendanceStats) {
        const attendancePercentage = (stat.daysPresent / event.totalDays) * 100;
        const isAutoQualified = attendancePercentage >= 40;
        const isOverridden = overrideMap.has(stat._id);
        const isQualified = isOverridden ? overrideMap.get(stat._id) : isAutoQualified;

        eventStudentMap.set(stat._id, {
          daysPresent: stat.daysPresent,
          attendancePercentage: attendancePercentage.toFixed(2),
          isQualified,
          qualifiedBy: isOverridden ? (isQualified ? 'Admin Override' : 'Disqualified by Admin') : 'Auto (>=40%)'
        });
      }

      for (const [sid, isQual] of overrideMap.entries()) {
        if (!eventStudentMap.has(sid)) {
          eventStudentMap.set(sid, {
            daysPresent: 0,
            attendancePercentage: "0.00",
            isQualified: isQual,
            qualifiedBy: 'Admin Override'
          });
        }
      }

      const eventDatesFormatted = `${formatDateDDMMYYYY(event.startDate)} to ${formatDateDDMMYYYY(event.endDate)}`;

      for (const [sid, data] of eventStudentMap.entries()) {
        if (data.isQualified) {
          const member = await Member.findOne({ sid });
          const row = worksheet.addRow({
            sid,
            name: member ? member.name.toUpperCase() : 'UNKNOWN',
            eventName: event.name,
            eventDates: eventDatesFormatted,
            daysPresent: data.daysPresent,
            totalDays: event.totalDays,
            attendancePercentage: `${data.attendancePercentage}%`,
            status: 'QUALIFIED',
            qualifiedBy: data.qualifiedBy
          });

          row.height = 22;
          row.alignment = { vertical: 'middle' };
          row.getCell('sid').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('eventDates').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('daysPresent').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('totalDays').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('attendancePercentage').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('status').alignment = { vertical: 'middle', horizontal: 'center' };
          row.getCell('status').font = { bold: true, color: { argb: 'FF008000' } };
        }
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="APC_Qualified_Students_Merged.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit the Site on http://localhost:${PORT}`);
});

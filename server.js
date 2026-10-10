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
const ExcelJS = require('exceljs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/apc_attendance')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

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
app.post('/api/events', async (req, res) => {
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

// 4. Mark Attendance
app.post('/api/attendance', async (req, res) => {
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
    res.status(200).json({ message: `Attendance marked for ${member.name} (SID: ${sid})`, member });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Attendance already marked for today' });
    }
    res.status(500).json({ error: err.message });
  }
});

// 5. Get Event Report (calculates 40% rule + manual qualification overrides)
app.get('/api/events/:id/report', async (req, res) => {
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
        name: member ? member.name : 'Unknown',
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
          name: member ? member.name : 'Unknown',
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
app.put('/api/events/:id/qualification', async (req, res) => {
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
app.put('/api/events/:id', async (req, res) => {
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
app.delete('/api/events', async (req, res) => {
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
app.delete('/api/events/:id', async (req, res) => {
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
app.get('/api/events/:id/attendance/:sid', async (req, res) => {
  try {
    const records = await Attendance.find({ eventId: req.params.id, sid: req.params.sid }).sort({ date: 1 });
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Update an attendance record
app.put('/api/attendance/:id', async (req, res) => {
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
app.delete('/api/attendance/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ message: 'Attendance deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Get attendance by date
app.get('/api/attendance/date/:date', async (req, res) => {
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
app.post('/api/attendance/manual', async (req, res) => {
  try {
    const { eventId, sid, name, date } = req.body;
    if (!eventId || !sid || !date) {
      return res.status(400).json({ error: 'Event ID, SID, and Date are required' });
    }

    let member = await Member.findOne({ sid });
    if (!member) {
      if (!name) {
        return res.status(404).json({ error: 'Member not found. Please provide name to register.' });
      }
      member = new Member({ sid, name });
      await member.save();
    } else if (name && member.name !== name) {
      member.name = name;
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
    res.status(200).json({ message: `Attendance marked for ${member.name} on ${targetDate.toLocaleDateString()}` });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Attendance already marked for this date' });
    }
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
app.get('/api/events/:id/export', async (req, res) => {
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
app.get('/api/reports/qualified-merged', async (req, res) => {
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

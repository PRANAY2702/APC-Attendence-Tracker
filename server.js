require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const Event = require('./models/Event');
const Member = require('./models/Member');
const Attendance = require('./models/Attendance');

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

// 5. Get Event Report (calculates 40% rule)
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

    const report = [];
    for (const stat of attendanceStats) {
      const member = await Member.findOne({ sid: stat._id });
      const attendancePercentage = (stat.daysPresent / event.totalDays) * 100;
      const isQualified = attendancePercentage >= 40;

      report.push({
        sid: stat._id,
        name: member ? member.name : 'Unknown',
        daysPresent: stat.daysPresent,
        totalDays: event.totalDays,
        attendancePercentage: attendancePercentage.toFixed(2),
        isQualified
      });
    }

    res.json({ event, report });
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

// 7. Delete an event
app.delete('/api/events/:id', async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    // Also delete attendance for this event
    await Attendance.deleteMany({ eventId: req.params.id });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit the Site on http://localhost:${PORT}`);
});

const { google } = require('googleapis');
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Member = require('../models/Member');
const Attendance = require('../models/Attendance');
const Qualification = require('../models/Qualification');

function formatDateDDMMYYYY(d) {
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function sanitizeSheetTitle(title) {
  if (!title) return 'Attendance';
  return title.replace(/[*?:/\\\[\]']/g, '').trim().substring(0, 31) || 'Attendance';
}

function isConfigured() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  const keyFile = process.env.GOOGLE_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  return Boolean(sheetId && ((email && key) || keyFile));
}

function getSheetUrl() {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) return null;
  return `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
}

async function getTabUrl(identifier) {
  const base = getSheetUrl();
  if (!base || !identifier || !isConfigured()) return base;

  try {
    let title = identifier;
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      const evt = await Event.findById(identifier);
      if (evt) title = sanitizeSheetTitle(evt.name);
    }
    const sheets = await getSheetsInstance();
    const meta = await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
    const tab = (meta.data.sheets || []).find(s => s.properties && s.properties.title.toLowerCase().trim() === String(title).toLowerCase().trim());
    if (tab && tab.properties && tab.properties.sheetId !== undefined) {
      return `${base}#gid=${tab.properties.sheetId}`;
    }
  } catch (e) {
    // Return base URL on error
  }
  return base;
}

let cachedAuth = null;
function getAuthClient() {
  if (cachedAuth) return cachedAuth;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  const keyFile = process.env.GOOGLE_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (keyFile) {
    cachedAuth = new google.auth.GoogleAuth({
      keyFile,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return cachedAuth;
  }

  if (email && key) {
    // Replace escaped \n with actual newlines if stored as single-line string in .env
    key = key.replace(/\\n/g, '\n');
    cachedAuth = new google.auth.JWT({
      email,
      key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    return cachedAuth;
  }

  return null;
}

async function getSheetsInstance() {
  const auth = getAuthClient();
  if (!auth) throw new Error('Google Sheets API credentials are not configured in .env');
  return google.sheets({ version: 'v4', auth });
}

/**
 * Ensures a sheet tab with the given title exists inside the spreadsheet.
 * Returns the sheetId (number) of the tab.
 */
async function ensureSheetTab(sheets, spreadsheetId, title) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = (meta.data.sheets || []).find(
    s => s.properties && s.properties.title === title
  );

  if (existingSheet) {
    return existingSheet.properties.sheetId;
  }

  // Create new tab
  const addRes = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title,
              gridProperties: {
                rowCount: 100,
                columnCount: 26,
                frozenRowCount: 1
              }
            }
          }
        }
      ]
    }
  });

  const newSheetId = addRes.data.replies[0].addSheet.properties.sheetId;

  // If a blank default Sheet1 tab still exists, remove it now that we have our custom tab
  try {
    const s1 = (meta.data.sheets || []).find(s => s.properties && s.properties.title === 'Sheet1');
    if (s1) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [{ deleteSheet: { sheetId: s1.properties.sheetId } }]
        }
      });
    }
  } catch (cleanErr) {
    // Ignore cleanup error
  }

  return newSheetId;
}

/**
 * Synchronizes attendance for a specific event into a Google Sheet tab named after the event.
 */
async function syncEventToSheet(eventId) {
  if (!isConfigured()) {
    console.log('[GoogleSheets] Sync skipped: Google Sheets API is not configured in .env');
    return { success: false, reason: 'NOT_CONFIGURED' };
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) return { success: false, reason: 'EVENT_NOT_FOUND' };

    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheets = await getSheetsInstance();

    const sheetTitle = sanitizeSheetTitle(event.name);
    const tabSheetId = await ensureSheetTab(sheets, spreadsheetId, sheetTitle);

    // Generate list of dates for the event
    const dates = [];
    let cur = new Date(event.startDate);
    cur.setHours(0, 0, 0, 0);
    const last = new Date(event.endDate);
    last.setHours(0, 0, 0, 0);

    while (cur <= last) {
      dates.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }

    // Fetch records
    const attendanceRecords = await Attendance.find({ eventId: event._id });
    const qualificationRecords = await Qualification.find({ eventId: event._id });

    const sidSet = new Set();
    attendanceRecords.forEach(a => sidSet.add(a.sid));
    qualificationRecords.forEach(q => sidSet.add(q.sid));

    const students = [];
    for (const sid of sidSet) {
      const member = await Member.findOne({ sid });
      students.push({
        sid,
        name: member && member.name ? member.name.toUpperCase() : '[PENDING NAME]'
      });
    }

    students.sort((a, b) => a.name.localeCompare(b.name));

    // Construct Header Row
    const headerRow = ['NAME', 'SID', ...dates.map(d => formatDateDDMMYYYY(d))];
    const dataRows = [headerRow];

    for (const student of students) {
      const row = [student.name, student.sid];
      const studentDates = attendanceRecords
        .filter(a => a.sid === student.sid)
        .map(a => {
          const d = new Date(a.date);
          d.setHours(0, 0, 0, 0);
          return d.getTime();
        });

      dates.forEach(d => {
        const isPresent = studentDates.includes(d.getTime());
        row.push(isPresent ? '✔' : '✖');
      });

      dataRows.push(row);
    }

    // Clear old data and write new values
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z5000`
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: dataRows
      }
    });

    // Formatting: Header bold, background color, centered columns
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Freeze row 1
            {
              updateSheetProperties: {
                properties: {
                  sheetId: tabSheetId,
                  gridProperties: { frozenRowCount: 1 }
                },
                fields: 'gridProperties.frozenRowCount'
              }
            },
            // Format header row style
            {
              repeatCell: {
                range: {
                  sheetId: tabSheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headerRow.length
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.1, green: 0.2, blue: 0.4 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            },
            // Center align SID and Attendance columns
            {
              repeatCell: {
                range: {
                  sheetId: tabSheetId,
                  startRowIndex: 1,
                  endRowIndex: dataRows.length,
                  startColumnIndex: 1,
                  endColumnIndex: headerRow.length
                },
                cell: {
                  userEnteredFormat: {
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(horizontalAlignment,verticalAlignment)'
              }
            }
          ]
        }
      });
    } catch (fmtErr) {
      console.warn('[GoogleSheets] Formatting warning:', fmtErr.message);
    }

    console.log(`[GoogleSheets] Successfully synced event "${event.name}" (${students.length} students)`);
    return { success: true, sheetTitle, studentCount: students.length };
  } catch (err) {
    console.error(`[GoogleSheets] Error syncing event ${eventId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Synchronizes the merged Qualified Students report across all events to a tab named "Qualified Students".
 */
async function syncQualifiedToSheet() {
  if (!isConfigured()) {
    return { success: false, reason: 'NOT_CONFIGURED' };
  }

  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    const sheets = await getSheetsInstance();
    const sheetTitle = 'Qualified Students';
    const tabSheetId = await ensureSheetTab(sheets, spreadsheetId, sheetTitle);

    const events = await Event.find().sort({ startDate: 1 });

    const headerRow = [
      'SID',
      'NAME',
      'EVENT NAME',
      'EVENT DATES',
      'DAYS PRESENT',
      'TOTAL DAYS',
      'ATTENDANCE %',
      'QUALIFICATION STATUS',
      'QUALIFIED BY'
    ];

    const dataRows = [headerRow];

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
          dataRows.push([
            sid,
            member && member.name ? member.name.toUpperCase() : '[PENDING NAME]',
            event.name,
            eventDatesFormatted,
            data.daysPresent,
            event.totalDays,
            `${data.attendancePercentage}%`,
            'QUALIFIED',
            data.qualifiedBy
          ]);
        }
      }
    }

    // Clear old data and write
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `'${sheetTitle}'!A1:Z5000`
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${sheetTitle}'!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: dataRows
      }
    });

    // Formatting: Header styling
    try {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: tabSheetId,
                  gridProperties: { frozenRowCount: 1 }
                },
                fields: 'gridProperties.frozenRowCount'
              }
            },
            {
              repeatCell: {
                range: {
                  sheetId: tabSheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headerRow.length
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.12, green: 0.45, blue: 0.25 }, // Green header
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 }, fontSize: 11 },
                    horizontalAlignment: 'CENTER',
                    verticalAlignment: 'MIDDLE'
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)'
              }
            }
          ]
        }
      });
    } catch (fmtErr) {
      console.warn('[GoogleSheets] Formatting warning:', fmtErr.message);
    }

    console.log(`[GoogleSheets] Successfully synced Qualified Students tab (${dataRows.length - 1} rows)`);
    return { success: true, count: dataRows.length - 1 };
  } catch (err) {
    console.error('[GoogleSheets] Error syncing Qualified Students:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Syncs all events and the qualified sheet tab.
 */
async function syncAll() {
  if (!isConfigured()) return { success: false, reason: 'NOT_CONFIGURED' };
  try {
    const events = await Event.find();
    for (const evt of events) {
      await syncEventToSheet(evt._id);
    }
    await syncQualifiedToSheet();
    return { success: true, eventsCount: events.length };
  } catch (err) {
    console.error('[GoogleSheets] Sync all error:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = {
  isConfigured,
  getSheetUrl,
  getTabUrl,
  syncEventToSheet,
  syncQualifiedToSheet,
  syncAll
};

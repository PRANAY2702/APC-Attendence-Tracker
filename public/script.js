document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = '/api';

  // State
  let allEvents = [];
  let activeEvents = [];

  // DOM Elements
  const navLinks = document.querySelectorAll('.nav-links li');
  const pages = document.querySelectorAll('.page');
  
  // Dashboard
  const activeEventsCount = document.getElementById('active-events-count');
  const totalEventsCount = document.getElementById('total-events-count');
  const activeEventsUl = document.getElementById('active-events-ul');

  // Events Page
  const allEventsContainer = document.getElementById('all-events-container');
  const btnShowCreateEvent = document.getElementById('btn-show-create-event');
  const createEventModal = document.getElementById('create-event-modal');
  const btnCancelEvent = document.getElementById('btn-cancel-event');
  const createEventForm = document.getElementById('create-event-form');
  const eventIdInput = document.getElementById('event-id');
  const modalTitle = document.getElementById('modal-title');
  const btnExportMergedQualified = document.getElementById('btn-export-merged-qualified');
  const btnDeleteAllEvents = document.getElementById('btn-delete-all-events');
  const btnExportEventExcel = document.getElementById('btn-export-event-excel');
  const reportModal = document.getElementById('report-modal');
  const btnCloseReport = document.getElementById('btn-close-report');
  const btnShowManualAtt = document.getElementById('btn-show-manual-att');
  const reportTableBody = document.querySelector('#report-table tbody');
  const reportEventName = document.getElementById('report-event-name');
  
  // Manual Attendance Modal
  const manualAttModal = document.getElementById('manual-attendance-modal');
  const btnCancelManualAtt = document.getElementById('btn-cancel-manual-att');
  const manualAttForm = document.getElementById('manual-attendance-form');
  const manualAttEventId = document.getElementById('manual-att-event-id');
  const manualAttSid = document.getElementById('manual-att-sid');
  const manualAttName = document.getElementById('manual-att-name');
  const manualAttDate = document.getElementById('manual-att-date');
  
  // Attendance Details Modal
  const detailsModal = document.getElementById('attendance-details-modal');
  const btnCloseDetails = document.getElementById('btn-close-details');
  const detailsTableBody = document.querySelector('#details-table tbody');
  const detailsStudentInfo = document.getElementById('details-student-info');

  // Daily Attendance Page
  const dailyDatePicker = document.getElementById('daily-date-picker');
  const btnFetchDaily = document.getElementById('btn-fetch-daily');
  const dailyTableBody = document.querySelector('#daily-table tbody');
  const editAttModal = document.getElementById('edit-attendance-modal');
  const editAttForm = document.getElementById('edit-attendance-form');
  const editAttId = document.getElementById('edit-att-id');
  const editAttSid = document.getElementById('edit-att-sid');
  const editAttDate = document.getElementById('edit-att-date');
  const btnCancelEditAtt = document.getElementById('btn-cancel-edit-att');

  // Kiosk Page
  const kioskEventSelect = document.getElementById('kiosk-event-select');
  const kioskForm = document.getElementById('kiosk-form');
  const kioskSid = document.getElementById('kiosk-sid');
  const kioskNameGroup = document.getElementById('kiosk-name-group');
  const kioskName = document.getElementById('kiosk-name');
  const kioskMessage = document.getElementById('kiosk-message');

  // Navigation Logic
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const target = link.getAttribute('data-target');
      
      pages.forEach(p => p.classList.remove('active'));
      document.getElementById(target).classList.add('active');

      if (target === 'dashboard') loadDashboard();
      if (target === 'events') loadEvents();
      if (target === 'daily-attendance') loadDailyAttendance();
      if (target === 'kiosk') loadKiosk();
    });
  });

  // Initialization
  dailyDatePicker.value = new Date().toISOString().split('T')[0];
  loadDashboard();
  
  // --- API Functions ---
  async function fetchEvents() {
    try {
      const res = await fetch(`${API_BASE}/events`);
      if (!res.ok) {
        const errData = await res.json();
        console.error('Server error fetching events:', errData);
        alert('Error fetching events: ' + (errData.error || '500 Internal Server Error'));
        return [];
      }
      return await res.json();
    } catch (e) {
      console.error(e);
      alert('Network error fetching events.');
      return [];
    }
  }

  async function fetchActiveEvents() {
    try {
      const res = await fetch(`${API_BASE}/events/active`);
      if (!res.ok) {
        const errData = await res.json();
        console.error('Server error fetching active events:', errData);
        return [];
      }
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  // --- View Loading Logic ---
  async function loadDashboard() {
    allEvents = await fetchEvents();
    activeEvents = await fetchActiveEvents();

    totalEventsCount.textContent = allEvents.length;
    activeEventsCount.textContent = activeEvents.length;

    activeEventsUl.innerHTML = '';
    if (activeEvents.length === 0) {
      activeEventsUl.innerHTML = '<li>No events are currently active.</li>';
    } else {
      activeEvents.forEach(evt => {
        const li = document.createElement('li');
        li.textContent = `${evt.name} (${new Date(evt.startDate).toLocaleDateString()} - ${new Date(evt.endDate).toLocaleDateString()})`;
        activeEventsUl.appendChild(li);
      });
    }
  }

  async function loadEvents() {
    allEvents = await fetchEvents();
    allEventsContainer.innerHTML = '';

    allEvents.forEach(evt => {
      const start = new Date(evt.startDate).toLocaleDateString();
      const end = new Date(evt.endDate).toLocaleDateString();
      
      const card = document.createElement('div');
      card.className = 'event-card glass-panel';
      card.innerHTML = `
        <div>
          <h3>${evt.name}</h3>
          <p>${evt.description || 'No description provided.'}</p>
          <div class="event-tags">
            <span class="tag">${evt.isMultiDay ? 'Multi-day' : 'Single-day'}</span>
            <span class="tag">${evt.totalDays} Days</span>
          </div>
          <p><strong>Dates:</strong> ${start} to ${end}</p>
        </div>
        <div class="mt-4 flex gap-2" style="flex-wrap: wrap;">
          <button class="btn-primary" onclick="openReport('${evt._id}', '${evt.name.replace(/'/g, "\\'")}')">View Report</button>
          <button class="btn-secondary" onclick="exportEventExcel('${evt._id}')">Export Excel</button>
          <button class="btn-secondary" onclick="editEvent('${evt._id}')">Edit</button>
          <button class="btn-danger" onclick="deleteEvent('${evt._id}')">Delete</button>
        </div>
      `;
      allEventsContainer.appendChild(card);
    });
  }

  async function loadKiosk() {
    activeEvents = await fetchActiveEvents();
    kioskEventSelect.innerHTML = '';
    
    if (activeEvents.length === 0) {
      kioskEventSelect.innerHTML = '<option value="">No active events today</option>';
      kioskEventSelect.disabled = true;
    } else {
      kioskEventSelect.disabled = false;
      activeEvents.forEach(evt => {
        const option = document.createElement('option');
        option.value = evt._id;
        option.textContent = evt.name;
        kioskEventSelect.appendChild(option);
      });
    }
    
    resetKioskForm();
  }

  async function loadDailyAttendance() {
    const date = dailyDatePicker.value;
    if (!date) return;
    dailyTableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
    
    try {
      const res = await fetch(`${API_BASE}/attendance/date/${date}`);
      const records = await res.json();
      
      dailyTableBody.innerHTML = '';
      if (records.length === 0) {
        dailyTableBody.innerHTML = '<tr><td colspan="4">No attendance found for this date.</td></tr>';
        return;
      }
      
      records.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${r.sid}</td>
          <td>${r.name}</td>
          <td>${r.event}</td>
          <td style="display:flex; gap: 0.5rem; justify-content:center;">
            <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" onclick="openEditAttendance('${r._id}', '${r.sid}', '${r.date}', '${r.eventId}')">Edit</button>
            <button class="btn-danger" style="background-color: var(--danger-color); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;" onclick="deleteDailyAttendance('${r._id}')">Delete</button>
          </td>
        `;
        dailyTableBody.appendChild(tr);
      });
    } catch (err) {
      dailyTableBody.innerHTML = '<tr><td colspan="4">Error loading data.</td></tr>';
    }
  }

  btnFetchDaily.addEventListener('click', loadDailyAttendance);

  // --- Event Creation/Editing Logic ---
  btnShowCreateEvent.addEventListener('click', () => {
    eventIdInput.value = '';
    modalTitle.textContent = 'Create New Event';
    createEventForm.reset();
    createEventModal.classList.remove('hidden');
  });

  btnCancelEvent.addEventListener('click', () => {
    createEventModal.classList.add('hidden');
    createEventForm.reset();
  });

  createEventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('event-name').value,
      description: document.getElementById('event-desc').value,
      startDate: document.getElementById('event-start').value,
      endDate: document.getElementById('event-end').value,
    };
    const id = eventIdInput.value;
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_BASE}/events/${id}` : `${API_BASE}/events`;

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        createEventModal.classList.add('hidden');
        createEventForm.reset();
        loadEvents();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save event');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving event');
    }
  });

  window.editEvent = (id) => {
    const evt = allEvents.find(e => e._id === id);
    if (!evt) return;
    
    eventIdInput.value = evt._id;
    modalTitle.textContent = 'Edit Event';
    document.getElementById('event-name').value = evt.name;
    document.getElementById('event-desc').value = evt.description;
    document.getElementById('event-start').value = new Date(evt.startDate).toISOString().split('T')[0];
    document.getElementById('event-end').value = new Date(evt.endDate).toISOString().split('T')[0];
    
    createEventModal.classList.remove('hidden');
  };

  window.deleteEvent = async (id) => {
    if (!confirm('Are you sure you want to delete this event? This will also delete all attendance records for it.')) return;
    try {
      const res = await fetch(`${API_BASE}/events/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadEvents();
      } else {
        alert('Failed to delete event');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting event');
    }
  };

  // --- Report Logic ---
  let currentReportEventId = null;
  let currentReportEventName = null;

  window.openReport = async (eventId, eventName) => {
    currentReportEventId = eventId;
    currentReportEventName = eventName;
    reportEventName.textContent = `Report for: ${eventName}`;
    reportTableBody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
    reportModal.classList.remove('hidden');

    try {
      const res = await fetch(`${API_BASE}/events/${eventId}/report`);
      const data = await res.json();
      
      reportTableBody.innerHTML = '';
      if (data.report.length === 0) {
        reportTableBody.innerHTML = '<tr><td colspan="5">No attendance data found.</td></tr>';
        return;
      }

      data.report.forEach(r => {
        const tr = document.createElement('tr');
        const statusBtnClass = r.isQualified ? 'badge-qualified' : 'badge-not-qualified';
        const statusIcon = r.isQualified ? '✔' : '✖';
        const statusText = r.isQualified ? 'Qualified' : 'Not Qualified';
        const overrideBadge = r.isOverridden ? '<span class="badge-overridden-indicator" title="Admin Override">Override</span>' : '';
        
        tr.innerHTML = `
          <td>${r.sid}</td>
          <td>${r.name}</td>
          <td>${r.daysPresent} / ${r.totalDays}</td>
          <td>${r.attendancePercentage}%</td>
          <td>
            <button class="badge-btn ${statusBtnClass}" onclick="toggleQualification('${eventId}', '${r.sid}', ${r.isQualified})" title="Click to toggle qualification status">
              ${statusText} ${statusIcon} ${overrideBadge}
            </button>
          </td>
          <td>
            <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" onclick="openAttendanceDetails('${eventId}', '${eventName.replace(/'/g, "\\'")}', '${r.sid}', '${r.name.replace(/'/g, "\\'")}')">Details</button>
          </td>
        `;
        reportTableBody.appendChild(tr);
      });
    } catch (err) {
      reportTableBody.innerHTML = '<tr><td colspan="6">Error loading report.</td></tr>';
    }
  };

  btnCloseReport.addEventListener('click', () => {
    reportModal.classList.add('hidden');
  });

  // --- Manual Attendance Logic ---
  btnShowManualAtt.addEventListener('click', () => {
    if (!currentReportEventId) return;
    manualAttForm.reset();
    manualAttEventId.value = currentReportEventId;
    
    const evt = allEvents.find(e => e._id === currentReportEventId);
    if (evt) {
      const start = new Date(evt.startDate).toISOString().split('T')[0];
      const end = new Date(evt.endDate).toISOString().split('T')[0];
      manualAttDate.min = start;
      manualAttDate.max = end;
    }
    
    // Set a default date (e.g. today's date if it's within event range, but since we don't have event details here locally except from allEvents, we can just default to today)
    manualAttDate.value = new Date().toISOString().split('T')[0];
    
    manualAttModal.classList.remove('hidden');
  });

  btnCancelManualAtt.addEventListener('click', () => {
    manualAttModal.classList.add('hidden');
  });

  manualAttForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      eventId: manualAttEventId.value,
      sid: manualAttSid.value.trim(),
      date: manualAttDate.value
    };
    const nameVal = manualAttName.value.trim();
    if (nameVal) payload.name = nameVal;

    try {
      const res = await fetch(`${API_BASE}/attendance/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        manualAttModal.classList.add('hidden');
        // Refresh report table
        openReport(currentReportEventId, currentReportEventName);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add attendance');
      }
    } catch (err) {
      alert('Error adding manual attendance');
    }
  });

  // --- Attendance Details Logic ---
  window.openAttendanceDetails = async (eventId, eventName, sid, name) => {
    reportModal.classList.add('hidden');
    detailsModal.classList.remove('hidden');
    detailsStudentInfo.textContent = `Student: ${name} (${sid}) | Event: ${eventName}`;
    detailsTableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
      const res = await fetch(`${API_BASE}/events/${eventId}/attendance/${sid}`);
      const records = await res.json();

      detailsTableBody.innerHTML = '';
      if (records.length === 0) {
        detailsTableBody.innerHTML = '<tr><td colspan="2">No attendance records.</td></tr>';
        return;
      }

      records.forEach(record => {
        const tr = document.createElement('tr');
        const dateStr = new Date(record.date).toLocaleDateString();
        tr.innerHTML = `
          <td>${dateStr}</td>
          <td>
            <button class="btn-danger" style="background-color: var(--danger-color); color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 4px; cursor: pointer;" onclick="deleteAttendance('${record._id}', '${eventId}', '${eventName}', '${sid}', '${name}')">Delete</button>
          </td>
        `;
        detailsTableBody.appendChild(tr);
      });
    } catch (err) {
      detailsTableBody.innerHTML = '<tr><td colspan="2">Error loading details.</td></tr>';
    }
  };

  window.deleteAttendance = async (attendanceId, eventId, eventName, sid, name) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    try {
      const res = await fetch(`${API_BASE}/attendance/${attendanceId}`, { method: 'DELETE' });
      if (res.ok) {
        // Refresh details modal
        openAttendanceDetails(eventId, eventName, sid, name);
      } else {
        alert('Failed to delete attendance');
      }
    } catch (err) {
      console.error(err);
      alert('Error deleting attendance');
    }
  };

  btnCloseDetails.addEventListener('click', () => {
    detailsModal.classList.add('hidden');
    reportModal.classList.remove('hidden'); // Go back to report
    // We should ideally refresh the report here, but doing it manually is okay too.
    // Or extract the openReport logic to reuse it easily, but for now we just show it.
    // Let's re-fetch the report since we might have deleted records.
    const eventId = kioskEventSelect.value; // Wait, eventId wasn't saved globally. 
    // We can extract it from the DOM or simply let the user reopen it from the events page.
    // Let's actually just close it and let user click View Report again to be safe.
    // Actually, reportModal has no fresh data. Let's hide both and tell user to reopen.
    // Or just re-trigger openReport, we need the eventId and name.
    // Let's modify btnCloseDetails to just hide detailsModal and user can click View Report on the event card again.
    // Wait, the easiest is to just call a global re-load or keep the previous state. I'll just hide both.
    reportModal.classList.add('hidden');
  });

  // --- Daily Attendance Logic ---
  window.openEditAttendance = (id, sid, dateStr, eventId) => {
    editAttId.value = id;
    editAttSid.value = sid;
    editAttDate.value = new Date(dateStr).toISOString().split('T')[0];
    
    const evt = allEvents.find(e => e._id === eventId);
    if (evt) {
      const start = new Date(evt.startDate).toISOString().split('T')[0];
      const end = new Date(evt.endDate).toISOString().split('T')[0];
      editAttDate.min = start;
      editAttDate.max = end;
    }

    editAttModal.classList.remove('hidden');
  };

  btnCancelEditAtt.addEventListener('click', () => {
    editAttModal.classList.add('hidden');
  });

  editAttForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editAttId.value;
    const payload = {
      sid: editAttSid.value,
      date: editAttDate.value
    };

    try {
      const res = await fetch(`${API_BASE}/attendance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        editAttModal.classList.add('hidden');
        loadDailyAttendance(); // Refresh table
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update attendance');
      }
    } catch (err) {
      alert('Error updating attendance');
    }
  });

  window.deleteDailyAttendance = async (id) => {
    if (!confirm('Are you sure you want to delete this attendance record?')) return;
    try {
      const res = await fetch(`${API_BASE}/attendance/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadDailyAttendance();
      } else {
        alert('Failed to delete attendance');
      }
    } catch (err) {
      alert('Error deleting attendance');
    }
  };

  // --- Kiosk Logic ---
  function showMessage(msg, type) {
    kioskMessage.textContent = msg;
    kioskMessage.className = `message mt-4 ${type}`;
    kioskMessage.classList.remove('hidden');
    setTimeout(() => {
      kioskMessage.classList.add('hidden');
    }, 4000);
  }

  function resetKioskForm() {
    kioskSid.value = '';
    kioskName.value = '';
    kioskNameGroup.classList.add('hidden');
    kioskMessage.classList.add('hidden');
    kioskSid.focus();
  }

  kioskForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const eventId = kioskEventSelect.value;
    const sid = kioskSid.value.trim();
    const name = kioskName.value.trim();

    if (!eventId) {
      showMessage('No active event selected', 'error');
      return;
    }
    if (!sid) {
      showMessage('Please enter SID', 'error');
      return;
    }

    try {
      const payload = { eventId, sid };
      if (name) payload.name = name;

      const res = await fetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();

      if (res.ok) {
        showMessage(`✅ Success: ${data.message}`, 'success');
        resetKioskForm();
      } else if (res.status === 404 && data.error.includes('name')) {
        // First time user, needs name
        kioskNameGroup.classList.remove('hidden');
        kioskName.focus();
        showMessage('First time? Please enter your Name.', 'error');
      } else {
        showMessage(`❌ ${data.error}`, 'error');
        resetKioskForm();
      }
    } catch (err) {
      showMessage('Error marking attendance', 'error');
    }
  });

  // --- Qualification Toggle Logic ---
  window.toggleQualification = async (eventId, sid, currentStatus) => {
    const newStatus = !currentStatus;
    try {
      const res = await fetch(`${API_BASE}/events/${eventId}/qualification`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, isQualified: newStatus })
      });
      if (res.ok) {
        openReport(currentReportEventId, currentReportEventName);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to update qualification');
      }
    } catch (e) {
      console.error(e);
      alert('Error updating qualification status');
    }
  };

  // --- Excel Exports & Delete All Logic ---
  window.exportEventExcel = (eventId) => {
    window.location.href = `${API_BASE}/events/${eventId}/export`;
  };

  if (btnExportEventExcel) {
    btnExportEventExcel.addEventListener('click', () => {
      if (!currentReportEventId) return;
      window.location.href = `${API_BASE}/events/${currentReportEventId}/export`;
    });
  }

  if (btnExportMergedQualified) {
    btnExportMergedQualified.addEventListener('click', () => {
      window.location.href = `${API_BASE}/reports/qualified-merged`;
    });
  }

  if (btnDeleteAllEvents) {
    btnDeleteAllEvents.addEventListener('click', async () => {
      const confirmed = confirm('WARNING: Are you sure you want to permanently delete ALL events, attendance records, and qualification statuses? This action CANNOT be undone.');
      if (!confirmed) return;

      try {
        const res = await fetch(`${API_BASE}/events`, { method: 'DELETE' });
        if (res.ok) {
          alert('All events and associated records have been successfully deleted.');
          loadEvents();
          loadDashboard();
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to delete events');
        }
      } catch (err) {
        console.error(err);
        alert('Network error deleting events');
      }
    });
  }

});


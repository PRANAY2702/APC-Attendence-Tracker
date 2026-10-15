document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = '/api';

  // --- State & Auth Storage ---
  let allEvents = [];
  let activeEvents = [];

  function getAuthToken() {
    return localStorage.getItem('apc_auth_token');
  }

  function getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('apc_auth_user') || 'null');
    } catch (e) {
      return null;
    }
  }

  function setAuthSession(token, user) {
    localStorage.setItem('apc_auth_token', token);
    localStorage.setItem('apc_auth_user', JSON.stringify(user));
  }

  function clearAuthSession() {
    localStorage.removeItem('apc_auth_token');
    localStorage.removeItem('apc_auth_user');
  }

  async function authFetch(url, options = {}) {
    const token = getAuthToken();
    const headers = Object.assign({}, options.headers || {});
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      clearAuthSession();
      checkAuthState();
    }
    return res;
  }

  // --- DOM Elements ---
  const navLinks = document.querySelectorAll('.nav-links li');
  const pages = document.querySelectorAll('.page');

  // Auth & Profile
  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginSid = document.getElementById('login-sid');
  const loginPassword = document.getElementById('login-password');
  const setupForm = document.getElementById('setup-form');
  const setupFormTitle = document.getElementById('setup-form-title');
  const setupSid = document.getElementById('setup-sid');
  const setupName = document.getElementById('setup-name');
  const setupEmail = document.getElementById('setup-email');
  const btnSendOtp = document.getElementById('btn-send-otp');
  const btnBackToLogin = document.getElementById('btn-back-to-login');
  const otpTimerText = document.getElementById('otp-timer-text');
  const setupOtp = document.getElementById('setup-otp');
  const setupPassword = document.getElementById('setup-password');
  const setupConfirmPassword = document.getElementById('setup-confirm-password');
  const authAlert = document.getElementById('auth-alert');
  const linkSwitchSetup = document.getElementById('link-switch-setup');
  const linkSwitchLogin = document.getElementById('link-switch-login');
  const linkForgotPassword = document.getElementById('link-forgot-password');
  const userProfileBadge = document.getElementById('user-profile-badge');
  const userAvatar = document.getElementById('user-avatar');
  const userDisplayName = document.getElementById('user-display-name');
  const userDisplayRole = document.getElementById('user-display-role');
  const btnLogout = document.getElementById('btn-logout');

  // Student Portal
  const btnRefreshStudent = document.getElementById('btn-refresh-student');
  const studentAttendedEvents = document.getElementById('student-attended-events');
  const studentQualifiedEvents = document.getElementById('student-qualified-events');
  const studentDaysAttended = document.getElementById('student-days-attended');
  const studentOverallPercentage = document.getElementById('student-overall-percentage');
  const studentEventsContainer = document.getElementById('student-events-container');
  const studentWelcomeSubtitle = document.getElementById('student-welcome-subtitle');

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
  const btnSheetsQualified = document.getElementById('btn-sheets-qualified');
  const btnSyncAllSheets = document.getElementById('btn-sync-all-sheets');
  const btnShowBulkAttGeneral = document.getElementById('btn-show-bulk-att-general');
  const btnDeleteAllEvents = document.getElementById('btn-delete-all-events');
  const btnOpenEventSheets = document.getElementById('btn-open-event-sheets');
  const btnSyncEventSheets = document.getElementById('btn-sync-event-sheets');
  const btnShowBulkAttEvent = document.getElementById('btn-show-bulk-att-event');
  const reportModal = document.getElementById('report-modal');
  const btnCloseReport = document.getElementById('btn-close-report');
  const btnShowManualAtt = document.getElementById('btn-show-manual-att');
  const reportTableBody = document.querySelector('#report-table tbody');
  const reportEventName = document.getElementById('report-event-name');
  const reportSelectAll = document.getElementById('report-select-all');
  const reportBulkActions = document.getElementById('report-bulk-actions');
  const reportSelectedCount = document.getElementById('report-selected-count');
  const btnBulkDeleteStudents = document.getElementById('btn-bulk-delete-students');

  // Manual Attendance Modal
  const manualAttModal = document.getElementById('manual-attendance-modal');
  const btnCancelManualAtt = document.getElementById('btn-cancel-manual-att');
  const manualAttForm = document.getElementById('manual-attendance-form');
  const manualAttEventId = document.getElementById('manual-att-event-id');
  const manualAttSid = document.getElementById('manual-att-sid');
  const manualAttName = document.getElementById('manual-att-name');
  const manualAttDate = document.getElementById('manual-att-date');

  // Bulk Attendance Modal
  const bulkAttModal = document.getElementById('bulk-attendance-modal');
  const bulkAttForm = document.getElementById('bulk-attendance-form');
  const bulkAttEventSelect = document.getElementById('bulk-att-event-select');
  const bulkAttDate = document.getElementById('bulk-att-date');
  const bulkAttSids = document.getElementById('bulk-att-sids');
  const bulkSidCounterPill = document.getElementById('bulk-sid-counter-pill');
  const btnClearBulkSids = document.getElementById('btn-clear-bulk-sids');
  const btnCancelBulkAtt = document.getElementById('btn-cancel-bulk-att');
  const bulkResultBox = document.getElementById('bulk-result-box');
  const btnSubmitBulkAtt = document.getElementById('btn-submit-bulk-att');

  // Edit Member Name Modal
  const editMemberNameModal = document.getElementById('edit-member-name-modal');
  const editMemberNameForm = document.getElementById('edit-member-name-form');
  const editMemberSid = document.getElementById('edit-member-sid');
  const editMemberNameInput = document.getElementById('edit-member-name-input');
  const btnCancelEditMember = document.getElementById('btn-cancel-edit-member');

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
  const btnKioskTabSingle = document.getElementById('btn-kiosk-tab-single');
  const btnKioskTabBulk = document.getElementById('btn-kiosk-tab-bulk');
  const kioskEventSelect = document.getElementById('kiosk-event-select');
  const kioskForm = document.getElementById('kiosk-form');
  const kioskSid = document.getElementById('kiosk-sid');
  const kioskNameGroup = document.getElementById('kiosk-name-group');
  const kioskName = document.getElementById('kiosk-name');
  const kioskBulkForm = document.getElementById('kiosk-bulk-form');
  const kioskBulkSids = document.getElementById('kiosk-bulk-sids');
  const kioskSidCounterPill = document.getElementById('kiosk-sid-counter-pill');
  const btnKioskBulkSubmit = document.getElementById('btn-kiosk-bulk-submit');
  const kioskMessage = document.getElementById('kiosk-message');

  // --- Auth UI Helpers ---
  function showAuthAlert(msg, type = 'error') {
    authAlert.textContent = msg;
    authAlert.className = `auth-alert ${type}`;
    authAlert.classList.remove('hidden');
  }

  function hideAuthAlert() {
    authAlert.classList.add('hidden');
    authAlert.textContent = '';
  }

  function checkAuthState() {
    const token = getAuthToken();
    const user = getCurrentUser();

    if (!token || !user) {
      loginScreen.classList.remove('hidden');
      userProfileBadge.classList.add('hidden');
      btnLogout.classList.add('hidden');
      return false;
    }

    loginScreen.classList.add('hidden');
    userProfileBadge.classList.remove('hidden');
    btnLogout.classList.remove('hidden');

    const firstLetter = (user.name || user.sid || '?').trim()[0].toUpperCase();
    userAvatar.textContent = firstLetter;
    userDisplayName.textContent = `${user.name} (${user.sid})`;
    userDisplayRole.textContent = user.isAdmin ? 'Admin' : 'Student';

    const adminElements = document.querySelectorAll('.admin-only');
    if (user.isAdmin) {
      adminElements.forEach(el => el.style.display = '');
    } else {
      adminElements.forEach(el => el.style.display = 'none');
    }

    return true;
  }

  function switchToTab(target) {
    navLinks.forEach(l => {
      if (l.getAttribute('data-target') === target) {
        l.classList.add('active');
      } else {
        l.classList.remove('active');
      }
    });

    pages.forEach(p => {
      if (p.id === target) {
        p.classList.add('active');
      } else {
        p.classList.remove('active');
      }
    });

    if (target === 'dashboard') loadDashboard();
    if (target === 'events') loadEvents();
    if (target === 'daily-attendance') loadDailyAttendance();
    if (target === 'student-attendance') loadStudentAttendance();
    if (target === 'kiosk') loadKiosk();
  }

  // --- Navigation Event Listeners ---
  navLinks.forEach(link => {
    link.addEventListener('click', () => {
      const target = link.getAttribute('data-target');
      const user = getCurrentUser();

      // Restrict admin pages if student
      if (!user || (!user.isAdmin && ['dashboard', 'events', 'daily-attendance', 'kiosk'].includes(target))) {
        return;
      }

      switchToTab(target);
    });
  });

  // --- Auth Form Handlers ---
  // --- OTP & Auth Form Handlers ---
  let otpCooldownTimer = null;

  function startOtpCooldown(seconds = 60) {
    btnSendOtp.disabled = true;
    let remaining = seconds;
    btnSendOtp.textContent = `Wait ${remaining}s`;
    otpTimerText.style.display = 'block';
    otpTimerText.textContent = `You can request another OTP in ${remaining}s.`;

    if (otpCooldownTimer) clearInterval(otpCooldownTimer);
    otpCooldownTimer = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(otpCooldownTimer);
        btnSendOtp.disabled = false;
        btnSendOtp.textContent = 'Resend OTP';
        otpTimerText.style.display = 'none';
      } else {
        btnSendOtp.textContent = `Wait ${remaining}s`;
        otpTimerText.textContent = `You can request another OTP in ${remaining}s.`;
      }
    }, 1000);
  }

  let sidLookupTimeout = null;
  async function autofillMemberBySid(sid) {
    if (!sid) return;
    const cleanSid = String(sid).trim();
    if (cleanSid.length < 2) return;

    try {
      const res = await fetch(`${API_BASE}/auth/lookup-sid/${encodeURIComponent(cleanSid)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.exists) {
        if (data.name) {
          setupName.value = data.name;
          setupName.dataset.autofilled = 'true';
        }
        if (data.email) {
          setupEmail.value = data.email;
          setupEmail.dataset.autofilled = 'true';
        }
      } else {
        if (setupName.dataset.autofilled === 'true') {
          setupName.value = '';
          delete setupName.dataset.autofilled;
        }
        if (setupEmail.dataset.autofilled === 'true') {
          setupEmail.value = '';
          delete setupEmail.dataset.autofilled;
        }
      }
    } catch (e) {
      // Ignore lookup failure if offline
    }
  }

  function returnToLoginForm() {
    hideAuthAlert();
    setupForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
    if (setupName.dataset.autofilled === 'true') {
      setupName.value = '';
      delete setupName.dataset.autofilled;
    }
    if (setupEmail.dataset.autofilled === 'true') {
      setupEmail.value = '';
      delete setupEmail.dataset.autofilled;
    }
    loginSid.focus();
  }

  if (btnBackToLogin) {
    btnBackToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      returnToLoginForm();
    });
  }

  linkSwitchLogin.addEventListener('click', (e) => {
    e.preventDefault();
    returnToLoginForm();
  });

  linkSwitchSetup.addEventListener('click', (e) => {
    e.preventDefault();
    hideAuthAlert();
    setupFormTitle.textContent = 'Verify Email & Set Password';
    loginForm.classList.add('hidden');
    setupForm.classList.remove('hidden');
    const sid = loginSid.value.trim();
    setupSid.value = sid;
    if (sid) {
      autofillMemberBySid(sid);
      setupEmail.focus();
    } else {
      setupSid.focus();
    }
  });

  linkForgotPassword.addEventListener('click', (e) => {
    e.preventDefault();
    hideAuthAlert();
    setupFormTitle.textContent = 'Reset Password via Email';
    loginForm.classList.add('hidden');
    setupForm.classList.remove('hidden');
    const sid = loginSid.value.trim();
    setupSid.value = sid;
    if (sid) {
      autofillMemberBySid(sid);
      setupEmail.focus();
    } else {
      setupSid.focus();
    }
  });

  setupSid.addEventListener('input', () => {
    if (sidLookupTimeout) clearTimeout(sidLookupTimeout);
    sidLookupTimeout = setTimeout(() => {
      autofillMemberBySid(setupSid.value.trim());
    }, 300);
  });

  setupSid.addEventListener('blur', () => {
    autofillMemberBySid(setupSid.value.trim());
  });

  setupName.addEventListener('input', () => {
    delete setupName.dataset.autofilled;
  });

  setupEmail.addEventListener('input', () => {
    delete setupEmail.dataset.autofilled;
  });

  // Send Email OTP Button
  btnSendOtp.addEventListener('click', async () => {
    hideAuthAlert();
    const sid = setupSid.value.trim();
    const email = setupEmail.value.trim();

    if (!sid) {
      showAuthAlert('Please enter your Student ID (SID) first.', 'error');
      setupSid.focus();
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showAuthAlert('Please enter a valid student email address to receive your OTP.', 'error');
      setupEmail.focus();
      return;
    }

    btnSendOtp.disabled = true;
    btnSendOtp.textContent = 'Sending Email...';

    try {
      const res = await fetch(`${API_BASE}/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, email })
      });
      const data = await res.json();

      if (!res.ok) {
        btnSendOtp.disabled = false;
        btnSendOtp.textContent = 'Send Email OTP';
        showAuthAlert(data.error || 'Failed to send verification code', 'error');
        return;
      }

      showAuthAlert(data.message, 'success');
      startOtpCooldown(60);
      setupOtp.focus();
    } catch (err) {
      btnSendOtp.disabled = false;
      btnSendOtp.textContent = 'Send Email OTP';
      showAuthAlert('Network error while requesting verification code. Please check your connection.', 'error');
    }
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const sid = loginSid.value.trim();
    const password = loginPassword.value;

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showAuthAlert(data.error || 'Login failed', 'error');
        return;
      }

      if (data.needsSetup) {
        showAuthAlert(data.message + ' Enter your email to receive a verification code.', 'info');
        loginForm.classList.add('hidden');
        setupForm.classList.remove('hidden');
        setupSid.value = data.sid || sid;
        if (data.name) {
          setupName.value = data.name;
          setupName.dataset.autofilled = 'true';
        }
        if (data.email) {
          setupEmail.value = data.email;
          setupEmail.dataset.autofilled = 'true';
        }
        if (!data.name || !data.email) {
          autofillMemberBySid(setupSid.value);
        }
        setupEmail.focus();
        return;
      }

      setAuthSession(data.token, data.user);
      checkAuthState();
      loginForm.reset();

      if (data.user.isAdmin) {
        switchToTab('dashboard');
      } else {
        switchToTab('student-attendance');
      }
    } catch (err) {
      showAuthAlert('Network error during login. Please check connection.', 'error');
    }
  });

  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAuthAlert();

    const sid = setupSid.value.trim();
    const name = setupName.value.trim();
    const email = setupEmail.value.trim();
    const otp = setupOtp.value.trim();
    const password = setupPassword.value;
    const confirmPassword = setupConfirmPassword.value;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      showAuthAlert('Please enter a valid student email address.', 'error');
      setupEmail.focus();
      return;
    }

    if (!otp) {
      showAuthAlert('Please click "Send Email OTP" and enter the 6-digit code received.', 'error');
      setupOtp.focus();
      return;
    }

    if (password !== confirmPassword) {
      showAuthAlert('Passwords do not match. Please re-enter.', 'error');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/setup-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sid, name, email, otp, password })
      });
      const data = await res.json();

      if (!res.ok) {
        showAuthAlert(data.error || 'Verification failed', 'error');
        return;
      }

      setAuthSession(data.token, data.user);
      checkAuthState();
      setupForm.reset();
      delete setupName.dataset.autofilled;
      delete setupEmail.dataset.autofilled;

      if (data.user.isAdmin) {
        switchToTab('dashboard');
      } else {
        switchToTab('student-attendance');
      }
    } catch (err) {
      showAuthAlert('Network error during setup. Please try again.', 'error');
    }
  });

  btnLogout.addEventListener('click', () => {
    clearAuthSession();
    checkAuthState();
    loginForm.classList.remove('hidden');
    setupForm.classList.add('hidden');
    loginSid.value = '';
    loginPassword.value = '';
    hideAuthAlert();
  });

  // --- Student Attendance Loading Logic ---
  async function loadStudentAttendance() {
    studentEventsContainer.innerHTML = '<p class="loading-text">Loading your attendance records...</p>';

    try {
      const res = await authFetch(`${API_BASE}/student/my-attendance`);
      if (!res.ok) {
        const err = await res.json();
        studentEventsContainer.innerHTML = `<div class="auth-alert error">Error: ${err.error || 'Failed to load records'}</div>`;
        return;
      }

      const data = await res.json();
      const { student, summary, events } = data;

      studentWelcomeSubtitle.textContent = `Welcome, ${student.name} (SID: ${student.sid}). Here is your personal attendance status.`;
      studentAttendedEvents.textContent = summary.attendedEventsCount;
      studentQualifiedEvents.textContent = summary.qualifiedEventsCount;
      studentDaysAttended.textContent = summary.totalDaysAttended;
      studentOverallPercentage.textContent = `${summary.overallPercentage}%`;

      studentEventsContainer.innerHTML = '';
      if (!events || events.length === 0) {
        studentEventsContainer.innerHTML = '<div class="empty-state"><p>No club events found.</p></div>';
        return;
      }

      events.forEach(evt => {
        const startStr = new Date(evt.startDate).toLocaleDateString();
        const endStr = new Date(evt.endDate).toLocaleDateString();
        const isQual = evt.isQualified;
        const badgeClass = isQual ? 'status-badge qualified' : 'status-badge unqualified';
        const badgeText = isQual ? 'QUALIFIED ✔' : 'NOT QUALIFIED ✖';
        const fillClass = isQual ? 'progress-fill fill-qualified' : 'progress-fill fill-unqualified';
        const percentage = parseFloat(evt.attendancePercentage) || 0;
        const cappedWidth = Math.min(Math.max(percentage, 0), 100);

        let datesChipsHtml = '';
        if (evt.attendedDates && evt.attendedDates.length > 0) {
          datesChipsHtml = evt.attendedDates.map(d => {
            const dt = new Date(d);
            const dateFormatted = `${String(dt.getDate()).padStart(2, '0')}-${String(dt.getMonth() + 1).padStart(2, '0')}-${dt.getFullYear()}`;
            return `<span class="date-chip">✔ ${dateFormatted}</span>`;
          }).join('');
        } else {
          datesChipsHtml = '<span class="no-attendance-text">No attendance recorded yet for this event.</span>';
        }

        const card = document.createElement('div');
        card.className = 'student-event-card glass-panel';
        card.innerHTML = `
          <div class="event-card-header">
            <div>
              <h3 class="event-card-title">${evt.name}</h3>
              <div class="event-card-dates">${startStr} to ${endStr} (${evt.totalDays} ${evt.totalDays === 1 ? 'day' : 'days'})</div>
            </div>
            <span class="${badgeClass}">${badgeText}</span>
          </div>

          ${evt.description ? `<p style="font-size: 0.9rem; color: var(--text-main); line-height: 1.4;">${evt.description}</p>` : ''}

          <div class="attendance-progress-box">
            <div class="progress-labels">
              <span><strong>${evt.daysPresent}</strong> of <strong>${evt.totalDays}</strong> days attended</span>
              <span style="font-weight: 700; color: ${isQual ? 'var(--success)' : '#ff8b8b'};">${percentage.toFixed(1)}%</span>
            </div>
            <div class="progress-track">
              <div class="${fillClass}" style="width: ${cappedWidth}%;"></div>
            </div>
          </div>

          <div class="dates-attended-wrapper">
            <div class="dates-label">Days Present:</div>
            <div class="chips-list">
              ${datesChipsHtml}
            </div>
          </div>
        `;
        studentEventsContainer.appendChild(card);
      });
    } catch (err) {
      studentEventsContainer.innerHTML = '<div class="auth-alert error">Error connecting to server. Please try again.</div>';
    }
  }

  if (btnRefreshStudent) {
    btnRefreshStudent.addEventListener('click', loadStudentAttendance);
  }

  // --- API Functions for Admin & General ---
  async function fetchEvents() {
    try {
      const res = await authFetch(`${API_BASE}/events`);
      if (!res.ok) {
        const errData = await res.json();
        console.error('Server error fetching events:', errData);
        return [];
      }
      return await res.json();
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  async function fetchActiveEvents() {
    try {
      const res = await authFetch(`${API_BASE}/events/active`);
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
      const res = await authFetch(`${API_BASE}/attendance/date/${date}`);
      const records = await res.json();

      dailyTableBody.innerHTML = '';
      if (!Array.isArray(records) || records.length === 0) {
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
      const res = await authFetch(url, {
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
      const res = await authFetch(`${API_BASE}/events/${id}`, { method: 'DELETE' });
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
    reportTableBody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';
    if (reportSelectAll) reportSelectAll.checked = false;
    if (reportBulkActions) reportBulkActions.classList.add('hidden');
    reportModal.classList.remove('hidden');

    try {
      const res = await authFetch(`${API_BASE}/events/${eventId}/report`);
      const data = await res.json();

      reportTableBody.innerHTML = '';
      if (!data.report || data.report.length === 0) {
        reportTableBody.innerHTML = '<tr><td colspan="7">No attendance data found.</td></tr>';
        return;
      }

      data.report.forEach(r => {
        const tr = document.createElement('tr');
        const statusBtnClass = r.isQualified ? 'badge-qualified' : 'badge-not-qualified';
        const statusIcon = r.isQualified ? '✔' : '✖';
        const statusText = r.isQualified ? 'Qualified' : 'Not Qualified';
        const overrideBadge = r.isOverridden ? '<span class="badge-overridden-indicator" title="Admin Override">Override</span>' : '';

        const hasValidName = r.name && r.name !== 'Unknown' && r.name !== 'null';
        const nameCellHtml = hasValidName ? `
          <div class="student-name-container">
            <span>${r.name}</span>
            <button type="button" class="btn-edit-name-inline" onclick="openEditMemberName('${r.sid}', '${r.name.replace(/'/g, "\\'")}')" title="Edit Student Name">✏️</button>
          </div>
        ` : `
          <div class="student-name-container">
            <span class="badge-unregistered-name" onclick="openEditMemberName('${r.sid}', '')" title="Click to add student name">
              ⚠️ Pending Name (+ Add)
            </span>
          </div>
        `;

        tr.innerHTML = `
          <td style="text-align: center;">
            <input type="checkbox" class="student-row-checkbox" data-sid="${r.sid}" style="cursor: pointer; width: 16px; height: 16px;">
          </td>
          <td>${r.sid}</td>
          <td>${nameCellHtml}</td>
          <td>${r.daysPresent} / ${r.totalDays}</td>
          <td>${r.attendancePercentage}%</td>
          <td>
            <button class="badge-btn ${statusBtnClass}" onclick="toggleQualification('${eventId}', '${r.sid}', ${r.isQualified})" title="Click to toggle qualification status">
              ${statusText} ${statusIcon} ${overrideBadge}
            </button>
          </td>
          <td style="white-space: nowrap;">
            <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" onclick="openAttendanceDetails('${eventId}', '${eventName.replace(/'/g, "\\'")}', '${r.sid}', '${(r.name || 'Student').replace(/'/g, "\\'")}')">Details</button>
            <button class="btn-danger" style="padding: 0.25rem 0.5rem; font-size: 0.85rem; margin-left: 4px;" onclick="removeStudentFromEvent('${eventId}', '${r.sid}', '${(r.name || r.sid).replace(/'/g, "\\'")}')" title="Completely remove student from this event">Remove</button>
          </td>
        `;
        reportTableBody.appendChild(tr);
      });
    } catch (err) {
      reportTableBody.innerHTML = '<tr><td colspan="7">Error loading report.</td></tr>';
    }
  };

  // --- Student Selection & Bulk Delete in Report Logic ---
  function updateSelectedStudentsState() {
    const allCbs = document.querySelectorAll('.student-row-checkbox');
    const checkedCbs = document.querySelectorAll('.student-row-checkbox:checked');
    const count = checkedCbs.length;

    if (reportSelectedCount) {
      reportSelectedCount.textContent = `${count} selected`;
    }

    if (reportBulkActions) {
      if (count > 0) {
        reportBulkActions.classList.remove('hidden');
      } else {
        reportBulkActions.classList.add('hidden');
      }
    }

    if (reportSelectAll) {
      reportSelectAll.checked = allCbs.length > 0 && count === allCbs.length;
    }
  }

  if (reportSelectAll) {
    reportSelectAll.addEventListener('change', () => {
      const allCbs = document.querySelectorAll('.student-row-checkbox');
      allCbs.forEach(cb => {
        cb.checked = reportSelectAll.checked;
      });
      updateSelectedStudentsState();
    });
  }

  if (reportTableBody) {
    reportTableBody.addEventListener('change', (e) => {
      if (e.target.classList.contains('student-row-checkbox')) {
        updateSelectedStudentsState();
      }
    });
  }

  if (btnBulkDeleteStudents) {
    btnBulkDeleteStudents.addEventListener('click', async () => {
      const checkedCbs = document.querySelectorAll('.student-row-checkbox:checked');
      const sids = Array.from(checkedCbs).map(cb => cb.dataset.sid);

      if (!currentReportEventId || sids.length === 0) {
        alert('Please select at least one student to remove.');
        return;
      }

      const confirmed = confirm(`Are you sure you want to completely remove ${sids.length} selected student(s) from "${currentReportEventName}"?\n\nAll their attendance records and qualification status for this event will be permanently deleted and Google Sheets will update automatically.`);
      if (!confirmed) return;

      btnBulkDeleteStudents.disabled = true;
      btnBulkDeleteStudents.textContent = 'Removing...';

      try {
        const res = await authFetch(`${API_BASE}/events/${currentReportEventId}/students`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sids })
        });
        const data = await res.json();

        if (res.ok) {
          openReport(currentReportEventId, currentReportEventName);
        } else {
          alert(data.error || 'Failed to remove students');
        }
      } catch (err) {
        alert('Network error removing students');
      } finally {
        btnBulkDeleteStudents.disabled = false;
        btnBulkDeleteStudents.textContent = '🗑 Remove Selected From Event';
      }
    });
  }

  window.removeStudentFromEvent = async (eventId, sid, displayName) => {
    const confirmed = confirm(`Are you sure you want to completely remove student ${displayName} (${sid}) from this event?\n\nAll attendance records for this student in this event will be deleted and Google Sheets will update.`);
    if (!confirmed) return;

    try {
      const res = await authFetch(`${API_BASE}/events/${eventId}/students/${sid}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        openReport(currentReportEventId, currentReportEventName);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to remove student from event');
      }
    } catch (err) {
      alert('Network error removing student');
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
      const res = await authFetch(`${API_BASE}/attendance/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        manualAttModal.classList.add('hidden');
        openReport(currentReportEventId, currentReportEventName);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add attendance');
      }
    } catch (err) {
      alert('Error adding manual attendance');
    }
  });

  // --- Student Name Editing Logic ---
  window.openEditMemberName = (sid, currentName) => {
    editMemberSid.value = sid;
    editMemberNameInput.value = (currentName && currentName !== 'Unknown' && currentName !== 'null') ? currentName : '';
    editMemberNameModal.classList.remove('hidden');
    editMemberNameInput.focus();
  };

  if (btnCancelEditMember) {
    btnCancelEditMember.addEventListener('click', () => {
      editMemberNameModal.classList.add('hidden');
    });
  }

  if (editMemberNameForm) {
    editMemberNameForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sid = editMemberSid.value;
      const name = editMemberNameInput.value.trim();

      try {
        const res = await authFetch(`${API_BASE}/members/${sid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });

        if (res.ok) {
          editMemberNameModal.classList.add('hidden');
          if (currentReportEventId && currentReportEventName) {
            openReport(currentReportEventId, currentReportEventName);
          }
        } else {
          const err = await res.json();
          alert(err.error || 'Failed to update student name');
        }
      } catch (err) {
        alert('Error updating student name');
      }
    });
  }

  // --- Bulk Attendance Modal Logic ---
  function parseSidsFromText(text) {
    if (!text) return [];
    return Array.from(new Set(
      text.split(/[\r\n,;\s]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
    ));
  }

  function updateBulkSidCounter() {
    const sids = parseSidsFromText(bulkAttSids.value);
    bulkSidCounterPill.textContent = `${sids.length} SID${sids.length === 1 ? '' : 's'}`;
  }

  if (bulkAttSids) {
    bulkAttSids.addEventListener('input', updateBulkSidCounter);
  }

  if (btnClearBulkSids) {
    btnClearBulkSids.addEventListener('click', () => {
      bulkAttSids.value = '';
      updateBulkSidCounter();
      bulkResultBox.classList.add('hidden');
    });
  }

  window.openBulkAttendance = (preSelectedEventId = null) => {
    bulkAttForm.reset();
    bulkResultBox.classList.add('hidden');
    bulkResultBox.innerHTML = '';
    updateBulkSidCounter();

    // Populate events dropdown
    bulkAttEventSelect.innerHTML = '<option value="">-- Choose an Event --</option>';
    allEvents.forEach(evt => {
      const opt = document.createElement('option');
      opt.value = evt._id;
      opt.textContent = `${evt.name} (${new Date(evt.startDate).toLocaleDateString()} to ${new Date(evt.endDate).toLocaleDateString()})`;
      bulkAttEventSelect.appendChild(opt);
    });

    if (preSelectedEventId) {
      bulkAttEventSelect.value = preSelectedEventId;
      const evt = allEvents.find(e => e._id === preSelectedEventId);
      if (evt) {
        bulkAttDate.min = new Date(evt.startDate).toISOString().split('T')[0];
        bulkAttDate.max = new Date(evt.endDate).toISOString().split('T')[0];
      }
    }

    bulkAttDate.value = new Date().toISOString().split('T')[0];
    bulkAttModal.classList.remove('hidden');
    bulkAttSids.focus();
  };

  if (bulkAttEventSelect) {
    bulkAttEventSelect.addEventListener('change', () => {
      const evtId = bulkAttEventSelect.value;
      const evt = allEvents.find(e => e._id === evtId);
      if (evt) {
        bulkAttDate.min = new Date(evt.startDate).toISOString().split('T')[0];
        bulkAttDate.max = new Date(evt.endDate).toISOString().split('T')[0];
      } else {
        bulkAttDate.removeAttribute('min');
        bulkAttDate.removeAttribute('max');
      }
    });
  }

  if (btnShowBulkAttGeneral) {
    btnShowBulkAttGeneral.addEventListener('click', () => {
      openBulkAttendance();
    });
  }

  if (btnShowBulkAttEvent) {
    btnShowBulkAttEvent.addEventListener('click', () => {
      openBulkAttendance(currentReportEventId);
    });
  }

  if (btnCancelBulkAtt) {
    btnCancelBulkAtt.addEventListener('click', () => {
      bulkAttModal.classList.add('hidden');
    });
  }

  if (bulkAttForm) {
    bulkAttForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventId = bulkAttEventSelect.value;
      const date = bulkAttDate.value;
      const sids = parseSidsFromText(bulkAttSids.value);

      if (!eventId) {
        alert('Please select an event');
        return;
      }
      if (sids.length === 0) {
        alert('Please enter at least one valid SID');
        return;
      }

      btnSubmitBulkAtt.disabled = true;
      btnSubmitBulkAtt.textContent = 'Processing Attendance...';
      bulkResultBox.classList.add('hidden');

      try {
        const res = await authFetch(`${API_BASE}/attendance/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, date, sids })
        });

        const data = await res.json();

        if (res.ok) {
          const { summary } = data;
          bulkResultBox.className = 'bulk-result-box success';
          bulkResultBox.innerHTML = `
            <div><strong>✅ Attendance Processed Successfully!</strong></div>
            <div class="bulk-stats-grid">
              <span class="bulk-stat-chip added">✔ Newly Marked: ${summary.newlyMarked}</span>
              <span class="bulk-stat-chip skipped">ℹ Already Present: ${summary.alreadyMarked}</span>
              <span class="bulk-stat-chip new-member">🆕 Unregistered (no name): ${summary.newMembersCreated}</span>
            </div>
            <p style="margin-top: 8px; font-size: 0.8rem; opacity: 0.9;">Google Sheets is being updated automatically with these records.</p>
          `;
          bulkResultBox.classList.remove('hidden');

          if (currentReportEventId && currentReportEventId === eventId) {
            openReport(currentReportEventId, currentReportEventName);
          }
        } else {
          bulkResultBox.className = 'bulk-result-box error';
          bulkResultBox.innerHTML = `<strong>❌ Error:</strong> ${data.error || 'Failed to mark bulk attendance'}`;
          bulkResultBox.classList.remove('hidden');
        }
      } catch (err) {
        bulkResultBox.className = 'bulk-result-box error';
        bulkResultBox.innerHTML = '<strong>❌ Network Error:</strong> Could not connect to server.';
        bulkResultBox.classList.remove('hidden');
      } finally {
        btnSubmitBulkAtt.disabled = false;
        btnSubmitBulkAtt.textContent = 'Mark Attendance';
      }
    });
  }


  // --- Attendance Details Logic ---
  window.openAttendanceDetails = async (eventId, eventName, sid, name) => {
    reportModal.classList.add('hidden');
    detailsModal.classList.remove('hidden');
    detailsStudentInfo.textContent = `Student: ${name} (${sid}) | Event: ${eventName}`;
    detailsTableBody.innerHTML = '<tr><td colspan="2">Loading...</td></tr>';

    try {
      const res = await authFetch(`${API_BASE}/events/${eventId}/attendance/${sid}`);
      const records = await res.json();

      detailsTableBody.innerHTML = '';
      if (!Array.isArray(records) || records.length === 0) {
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
      const res = await authFetch(`${API_BASE}/attendance/${attendanceId}`, { method: 'DELETE' });
      if (res.ok) {
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
    if (currentReportEventId && currentReportEventName) {
      openReport(currentReportEventId, currentReportEventName);
    }
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
      const res = await authFetch(`${API_BASE}/attendance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        editAttModal.classList.add('hidden');
        loadDailyAttendance();
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
      const res = await authFetch(`${API_BASE}/attendance/${id}`, { method: 'DELETE' });
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

      const res = await authFetch(`${API_BASE}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok) {
        showMessage(`✅ Success: ${data.message}`, 'success');
        resetKioskForm();
      } else if (res.status === 404 && data.error && data.error.includes('name')) {
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
      const res = await authFetch(`${API_BASE}/events/${eventId}/qualification`, {
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

  // --- Kiosk Tabs & Bulk Submission Logic ---
  if (btnKioskTabSingle && btnKioskTabBulk) {
    btnKioskTabSingle.addEventListener('click', () => {
      btnKioskTabSingle.classList.add('active');
      btnKioskTabBulk.classList.remove('active');
      kioskForm.classList.remove('hidden');
      kioskBulkForm.classList.add('hidden');
      kioskSid.focus();
    });

    btnKioskTabBulk.addEventListener('click', () => {
      btnKioskTabBulk.classList.add('active');
      btnKioskTabSingle.classList.remove('active');
      kioskForm.classList.add('hidden');
      kioskBulkForm.classList.remove('hidden');
      kioskBulkSids.focus();
    });
  }

  if (kioskBulkSids) {
    kioskBulkSids.addEventListener('input', () => {
      const sids = parseSidsFromText(kioskBulkSids.value);
      kioskSidCounterPill.textContent = `${sids.length} SID${sids.length === 1 ? '' : 's'}`;
    });
  }

  if (kioskBulkForm) {
    kioskBulkForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const eventId = kioskEventSelect.value;
      const sids = parseSidsFromText(kioskBulkSids.value);

      if (!eventId) {
        showMessage('No active event selected', 'error');
        return;
      }
      if (sids.length === 0) {
        showMessage('Please enter at least one SID', 'error');
        return;
      }

      btnKioskBulkSubmit.disabled = true;
      btnKioskBulkSubmit.textContent = 'Processing...';

      try {
        const res = await authFetch(`${API_BASE}/attendance/bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId, sids })
        });
        const data = await res.json();

        if (res.ok) {
          const { summary } = data;
          showMessage(`✅ Marked ${summary.newlyMarked} present (${summary.alreadyMarked} already recorded, ${summary.newMembersCreated} new students).`, 'success');
          kioskBulkSids.value = '';
          kioskSidCounterPill.textContent = '0 SIDs';
        } else {
          showMessage(`❌ ${data.error || 'Failed to process bulk attendance'}`, 'error');
        }
      } catch (err) {
        showMessage('Network error submitting attendance', 'error');
      } finally {
        btnKioskBulkSubmit.disabled = false;
        btnKioskBulkSubmit.textContent = 'Mark All Present';
      }
    });
  }

  // --- Google Sheets Integration Actions ---
  async function openGoogleSheet(params = {}) {
    try {
      let url = `${API_BASE}/sheets/info`;
      if (params.eventId) {
        url += `?eventId=${encodeURIComponent(params.eventId)}`;
      } else if (params.tab) {
        url += `?tab=${encodeURIComponent(params.tab)}`;
      }

      const res = await authFetch(url);
      const data = await res.json();

      if (!data.isConfigured || !data.url) {
        alert('Google Sheets integration is not configured yet in .env.\n\nTo enable automatic Google Sheets updates:\n1. Create a Google Cloud Service Account\n2. Share your Google Sheet with the Service Account email as Editor\n3. Add GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, and GOOGLE_PRIVATE_KEY into your .env file.');
        return;
      }

      window.open(data.url, '_blank');
    } catch (err) {
      console.error(err);
      alert('Error fetching Google Sheets URL');
    }
  }

  if (btnSheetsQualified) {
    btnSheetsQualified.addEventListener('click', () => openGoogleSheet({ tab: 'Qualified Students' }));
  }

  if (btnOpenEventSheets) {
    btnOpenEventSheets.addEventListener('click', () => {
      if (currentReportEventId) {
        openGoogleSheet({ eventId: currentReportEventId });
      } else {
        openGoogleSheet();
      }
    });
  }

  if (btnSyncEventSheets) {
    btnSyncEventSheets.addEventListener('click', async () => {
      if (!currentReportEventId) return;
      btnSyncEventSheets.disabled = true;
      btnSyncEventSheets.textContent = '↻ Syncing...';

      try {
        const res = await authFetch(`${API_BASE}/sheets/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: currentReportEventId })
        });
        const data = await res.json();

        if (res.ok) {
          if (!data.isConfigured) {
            alert('Google Sheets API is not configured in .env yet.\nRecords are saved in MongoDB, but real-time sync requires Google Cloud credentials in .env.');
          } else {
            alert('✅ Event attendance successfully synced to Google Sheets!');
          }
        } else {
          alert(`Sync error: ${data.error || 'Failed to sync'}`);
        }
      } catch (err) {
        alert('Network error syncing with Google Sheets');
      } finally {
        btnSyncEventSheets.disabled = false;
        btnSyncEventSheets.textContent = '↻ Sync';
      }
    });
  }

  if (btnSyncAllSheets) {
    btnSyncAllSheets.addEventListener('click', async () => {
      btnSyncAllSheets.disabled = true;
      btnSyncAllSheets.textContent = '↻ Syncing...';

      try {
        const res = await authFetch(`${API_BASE}/sheets/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const data = await res.json();

        if (res.ok) {
          if (!data.isConfigured) {
            alert('Google Sheets API is not configured in .env yet.\nRecords are saved in MongoDB, but sync requires Google Cloud credentials in .env.');
          } else {
            alert('✅ All events and Qualified Students successfully synced to Google Sheets!');
          }
        } else {
          alert(`Sync error: ${data.error || 'Failed to sync'}`);
        }
      } catch (err) {
        alert('Network error syncing with Google Sheets');
      } finally {
        btnSyncAllSheets.disabled = false;
        btnSyncAllSheets.textContent = '↻ Sync Google Sheets';
      }
    });
  }

  if (btnDeleteAllEvents) {
    btnDeleteAllEvents.addEventListener('click', async () => {
      const confirmed = confirm('WARNING: Are you sure you want to permanently delete ALL events, attendance records, and qualification statuses? This action CANNOT be undone.');
      if (!confirmed) return;

      try {
        const res = await authFetch(`${API_BASE}/events`, { method: 'DELETE' });
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

  // --- Application Initialization ---
  dailyDatePicker.value = new Date().toISOString().split('T')[0];

  const isAuthenticated = checkAuthState();
  if (isAuthenticated) {
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.isAdmin) {
      switchToTab('dashboard');
    } else {
      switchToTab('student-attendance');
    }
  }
});

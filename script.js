/* ==========================================================================
   ORBIT — STUDY PLANNER
   Vanilla JS application. Organized into clearly commented modules:
   Storage, State, Utilities, Router, Clock, Tasks, Calendar, Focus/Timers,
   Alarms, Audio, Notes, Analytics/Charts, Settings, Toasts/Modals, Init.
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. STORAGE LAYER
   ========================================================================== */
const STORAGE_KEY = 'orbit_study_planner_v1';

const Storage = {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('Orbit: failed to parse saved data', e);
      return null;
    }
  },
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Orbit: failed to save data', e);
      return false;
    }
  }
};

/* ==========================================================================
   2. DEFAULT STATE
   ========================================================================== */
function defaultState() {
  return {
    tasks: [],
    notes: [],
    alarms: [],
    sessions: [],        // { date: 'YYYY-MM-DD', minutes, type }
    dailyStats: {},       // { 'YYYY-MM-DD': { tasksDone, focusMinutes } }
    streak: { count: 0, lastActiveDate: null },
    settings: {
      theme: 'dark',
      accent: 'violet',
      fontScale: 100,
      notifTasks: true,
      notifFocus: true,
      notifSummary: false,
      defaultAlarmSound: 'classic',
      defaultAlarmVolume: 70,
      sidebarCollapsed: false
    },
    customSoundData: null,  // base64 data URL for uploaded alarm sound
    customSoundName: ''
  };
}

let state = Storage.load() || defaultState();
// Backfill any missing keys if loading an older save
state = Object.assign(defaultState(), state, {
  settings: Object.assign(defaultState().settings, state.settings || {})
});

function persist() { Storage.save(state); }

/* ==========================================================================
   3. UTILITIES
   ========================================================================== */
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function pad2(n) { return n.toString().padStart(2, '0'); }

function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatFriendlyDate(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isSameDay(a, b) { return todayISO(a) === todayISO(b); }

function daysBetween(a, b) {
  const ms = new Date(todayISO(a)) - new Date(todayISO(b));
  return Math.round(ms / 86400000);
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function debounce(fn, wait) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

const CATEGORY_COLORS = {
  study: 'var(--accent)', assignment: 'var(--amber)', exam: 'var(--danger)',
  reading: 'var(--blue)', project: 'var(--accent-2)', personal: 'var(--rose)'
};

const MOTIVATIONAL_QUOTES = [
  ['Small steps, every day, build the biggest wins.', '— Orbit'],
  ['Discipline is choosing what you want most over what you want now.', '— Abraham Lincoln (attributed)'],
  ['The secret of getting ahead is getting started.', '— Mark Twain'],
  ['You don\u2019t have to be great to start, but you have to start to be great.', '— Zig Ziglar'],
  ['Focus on being productive instead of busy.', '— Tim Ferriss'],
  ['Well begun is half done.', '— Aristotle'],
  ['A little progress each day adds up to big results.', '— Orbit'],
  ['Study while others are sleeping; work while others are loafing.', '— William A. Ward'],
  ['Success is the sum of small efforts repeated daily.', '— Robert Collier'],
  ['Your future is created by what you do today, not tomorrow.', '— Orbit']
];

/* ==========================================================================
   4. TOASTS
   ========================================================================== */
const Toast = {
  container: null,
  init() { this.container = $('#toastContainer'); },
  show(message, type = 'info', duration = 3600) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    const icons = {
      success: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>',
      error: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M18 6L6 18M6 6l12 12"/></svg>',
      info: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>'
    };
    el.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${escapeHTML(message)}</span>`;
    this.container.appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 320);
    }, duration);
  }
};

/* ==========================================================================
   5. MODAL SYSTEM
   ========================================================================== */
const ModalManager = {
  open(id) {
    const overlay = document.getElementById(id);
    if (!overlay) return;
    overlay.classList.add('is-open');
    const focusable = overlay.querySelector('input, textarea, select, button');
    if (focusable) setTimeout(() => focusable.focus(), 60);
  },
  close(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('is-open');
  },
  closeAll() { $$('.modal-overlay.is-open').forEach(o => o.classList.remove('is-open')); }
};

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('is-open');
  }
  const closeBtn = e.target.closest('[data-close-modal]');
  if (closeBtn) ModalManager.close(closeBtn.dataset.closeModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') ModalManager.closeAll();
});

/** Custom confirm dialog (replaces window.confirm for a premium feel) */
function confirmDialog(title, message) {
  return new Promise((resolve) => {
    $('#confirmTitle').textContent = title;
    $('#confirmMessage').textContent = message;
    ModalManager.open('confirmOverlay');
    const okBtn = $('#confirmOkBtn');
    const cancelBtn = $('#confirmCancelBtn');
    const cleanup = (result) => {
      ModalManager.close('confirmOverlay');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

/* ==========================================================================
   6. RIPPLE EFFECT (delegated, applies to all .btn elements)
   ========================================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn, .btn-icon, .nav-item, .chip, .sound-chip');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const ripple = document.createElement('span');
  const size = Math.max(rect.width, rect.height);
  ripple.className = 'ripple';
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  const prevPosition = getComputedStyle(btn).position;
  if (prevPosition === 'static') btn.style.position = 'relative';
  btn.style.overflow = btn.style.overflow || 'hidden';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 620);
});

/* ==========================================================================
   7. ROUTER / PAGE NAVIGATION
   ========================================================================== */
const Router = {
  current: 'dashboard',
  go(pageId) {
    this.current = pageId;
    $$('.page').forEach(p => p.classList.toggle('is-active', p.dataset.page === pageId));
    $$('.nav-item').forEach(n => n.classList.toggle('is-active', n.dataset.page === pageId));
    // Close mobile sidebar on navigation
    $('.app-shell').classList.remove('is-mobile-open');
    $('#sidebarOverlay').style.display = 'none';
    if (pageId === 'analytics') Analytics.renderAll();
    if (pageId === 'calendar') Calendar.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

$$('.nav-item[data-page]').forEach(btn => {
  btn.addEventListener('click', () => Router.go(btn.dataset.page));
});
$$('[data-goto]').forEach(btn => btn.addEventListener('click', () => Router.go(btn.dataset.goto)));

/* ==========================================================================
   8. SIDEBAR / TOPBAR CHROME
   ========================================================================== */
const appShell = $('.app-shell');

$('#sidebarToggle').addEventListener('click', () => {
  appShell.classList.toggle('is-collapsed');
  state.settings.sidebarCollapsed = appShell.classList.contains('is-collapsed');
  persist();
});
if (state.settings.sidebarCollapsed) appShell.classList.add('is-collapsed');

$('#mobileMenuBtn').addEventListener('click', () => {
  appShell.classList.add('is-mobile-open');
  $('#sidebarOverlay').style.display = 'block';
});
$('#sidebarOverlay').addEventListener('click', () => {
  appShell.classList.remove('is-mobile-open');
  $('#sidebarOverlay').style.display = 'none';
});

$('#quickAddBtn').addEventListener('click', () => {
  ModalManager.open('quickAddOverlay');
});
$('#quickAddInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.value.trim()) {
    Tasks.add({ title: e.target.value.trim(), category: 'study', priority: 'medium', dueDate: '', dueTime: '', notes: '' });
    e.target.value = '';
    ModalManager.close('quickAddOverlay');
    Toast.show('Task added', 'success');
  }
});

$('#globalSearch').addEventListener('input', debounce((e) => {
  const q = e.target.value.trim();
  if (!q) return;
  Router.go('tasks');
  $('#taskSearch').value = q;
  Tasks.render();
}, 300));

/* Keyboard shortcuts */
document.addEventListener('keydown', (e) => {
  const cmd = e.metaKey || e.ctrlKey;
  if (cmd && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#globalSearch').focus(); }
  if (cmd && e.key.toLowerCase() === 'n') { e.preventDefault(); ModalManager.open('quickAddOverlay'); }
  if (cmd && e.key.toLowerCase() === 'j') { e.preventDefault(); Settings.toggleTheme(); }
  if (cmd && e.key.toLowerCase() === 'b') { e.preventDefault(); $('#sidebarToggle').click(); }
});

/* ==========================================================================
   9. LIVE CLOCK / GREETING / DATE
   ========================================================================== */
const Clock = {
  init() {
    this.tick();
    setInterval(() => this.tick(), 1000);
  },
  tick() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const timeShort = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    $('#topbarClock').textContent = timeShort;
    $('#dashClock').textContent = timeStr;
    $('#dashDate').textContent = formatFriendlyDate(now);

    const hour = now.getHours();
    let greeting = 'Good evening';
    if (hour < 12) greeting = 'Good morning';
    else if (hour < 17) greeting = 'Good afternoon';
    $('#dashGreeting').textContent = `${greeting}, scholar.`;

    Alarms.checkTick(now);
  }
};

/* ==========================================================================
   10. TASKS MODULE
   ========================================================================== */
const Tasks = {
  filters: { search: '', category: 'all', priority: 'all', status: 'all', sort: 'dueDate' },
  dragId: null,

  add(data) {
    const task = {
      id: uid(),
      title: data.title,
      category: data.category || 'study',
      priority: data.priority || 'medium',
      dueDate: data.dueDate || '',
      dueTime: data.dueTime || '',
      notes: data.notes || '',
      completed: false,
      completedAt: null,
      createdAt: Date.now(),
      order: state.tasks.length
    };
    state.tasks.push(task);
    persist();
    this.render();
    Dashboard.render();
    return task;
  },

  update(id, data) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    Object.assign(t, data);
    persist();
    this.render();
    Dashboard.render();
  },

  remove(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    persist();
    this.render();
    Dashboard.render();
  },

  toggleComplete(id) {
    const t = state.tasks.find(t => t.id === id);
    if (!t) return;
    t.completed = !t.completed;
    t.completedAt = t.completed ? Date.now() : null;
    if (t.completed) {
      Analytics.recordTaskCompletion();
      Streak.markActiveToday();
    }
    persist();
    this.render();
    Dashboard.render();
    Analytics.renderAll();
  },

  getFiltered() {
    let list = [...state.tasks];
    const f = this.filters;
    const now = todayISO();

    if (f.search) {
      const q = f.search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
    }
    if (f.category !== 'all') list = list.filter(t => t.category === f.category);
    if (f.priority !== 'all') list = list.filter(t => t.priority === f.priority);
    if (f.status === 'pending') list = list.filter(t => !t.completed);
    if (f.status === 'completed') list = list.filter(t => t.completed);
    if (f.status === 'overdue') list = list.filter(t => !t.completed && t.dueDate && t.dueDate < now);

    const priorityRank = { high: 0, medium: 1, low: 2 };
    switch (f.sort) {
      case 'dueDate':
        list.sort((a, b) => (a.dueDate || '9999') === (b.dueDate || '9999') ? 0 : (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
        break;
      case 'priority':
        list.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
        break;
      case 'created':
        list.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case 'alpha':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
    }
    return list;
  },

  render() {
    const list = this.getFiltered();
    const container = $('#taskList');
    const emptyState = $('#taskEmptyState');
    container.innerHTML = '';

    if (list.length === 0) {
      emptyState.hidden = false;
    } else {
      emptyState.hidden = true;
      list.forEach(t => container.appendChild(this.buildTaskEl(t)));
    }

    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.completed).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#taskListProgressBar').style.width = pct + '%';
    $('#taskListProgressText').textContent = `${done} of ${total} complete`;
    $('#navTaskBadge').textContent = state.tasks.filter(t => !t.completed).length;
  },

  buildTaskEl(t) {
    const li = document.createElement('li');
    li.className = 'task-item';
    li.draggable = true;
    li.dataset.id = t.id;
    if (t.completed) li.classList.add('is-completed');
    const isOverdue = !t.completed && t.dueDate && t.dueDate < todayISO();
    if (isOverdue) li.classList.add('is-overdue');

    const dueLabel = t.dueDate ? `${formatShortDate(t.dueDate)}${t.dueTime ? ' · ' + t.dueTime : ''}` : 'No due date';

    li.innerHTML = `
      <button class="task-checkbox ${t.completed ? 'is-checked' : ''}" aria-label="Toggle complete">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
      </button>
      <div class="task-item-body">
        <div class="task-item-title">${escapeHTML(t.title)}</div>
        ${t.notes ? `<div class="task-item-notes">${escapeHTML(t.notes)}</div>` : ''}
        <div class="task-item-meta">
          <span class="tag tag-cat">${escapeHTML(t.category)}</span>
          <span class="tag tag-priority-${t.priority}">${t.priority}</span>
          <span class="task-due">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            ${dueLabel}
          </span>
        </div>
      </div>
      <div class="task-item-actions">
        <button class="edit-btn" aria-label="Edit task">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button class="delete-btn" aria-label="Delete task">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
        </button>
      </div>
    `;

    li.querySelector('.task-checkbox').addEventListener('click', () => this.toggleComplete(t.id));
    li.querySelector('.edit-btn').addEventListener('click', () => TaskModal.open(t));
    li.querySelector('.delete-btn').addEventListener('click', async () => {
      const ok = await confirmDialog('Delete task?', `"${t.title}" will be permanently removed.`);
      if (ok) { this.remove(t.id); Toast.show('Task deleted', 'info'); }
    });

    // Drag and drop
    li.addEventListener('dragstart', () => { this.dragId = t.id; li.classList.add('is-dragging'); });
    li.addEventListener('dragend', () => { li.classList.remove('is-dragging'); this.render(); });
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('is-drop-target'); });
    li.addEventListener('dragleave', () => li.classList.remove('is-drop-target'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      li.classList.remove('is-drop-target');
      if (!this.dragId || this.dragId === t.id) return;
      const fromIdx = state.tasks.findIndex(x => x.id === this.dragId);
      const toIdx = state.tasks.findIndex(x => x.id === t.id);
      const [moved] = state.tasks.splice(fromIdx, 1);
      state.tasks.splice(toIdx, 0, moved);
      persist();
      this.render();
    });

    return li;
  },

  getTodayTasks() {
    const now = todayISO();
    return state.tasks.filter(t => t.dueDate === now).sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  },

  getUpcomingTasks(limit = 5) {
    const now = todayISO();
    return state.tasks
      .filter(t => !t.completed && t.dueDate && t.dueDate > now)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, limit);
  }
};

/* Filter/search/sort bindings */
$('#taskSearch').addEventListener('input', debounce((e) => { Tasks.filters.search = e.target.value; Tasks.render(); }, 200));
$('#filterCategory').addEventListener('change', (e) => { Tasks.filters.category = e.target.value; Tasks.render(); });
$('#filterPriority').addEventListener('change', (e) => { Tasks.filters.priority = e.target.value; Tasks.render(); });
$('#filterStatus').addEventListener('change', (e) => { Tasks.filters.status = e.target.value; Tasks.render(); });
$('#sortTasks').addEventListener('change', (e) => { Tasks.filters.sort = e.target.value; Tasks.render(); });

/* Task modal (add/edit) */
const TaskModal = {
  editingId: null,
  open(task = null) {
    this.editingId = task ? task.id : null;
    $('#taskModalTitle').textContent = task ? 'Edit task' : 'New task';
    $('#taskId').value = task ? task.id : '';
    $('#taskTitle').value = task ? task.title : '';
    $('#taskCategory').value = task ? task.category : 'study';
    $('#taskPriority').value = task ? task.priority : 'medium';
    $('#taskDueDate').value = task ? task.dueDate : '';
    $('#taskDueTime').value = task ? task.dueTime : '';
    $('#taskNotes').value = task ? task.notes : '';
    ModalManager.open('taskModalOverlay');
  }
};
$('#openTaskModalBtn').addEventListener('click', () => TaskModal.open());
$('[data-openmodal="task"]').addEventListener('click', () => TaskModal.open());
$('#taskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    title: $('#taskTitle').value.trim(),
    category: $('#taskCategory').value,
    priority: $('#taskPriority').value,
    dueDate: $('#taskDueDate').value,
    dueTime: $('#taskDueTime').value,
    notes: $('#taskNotes').value.trim()
  };
  if (!data.title) return;
  if (TaskModal.editingId) {
    Tasks.update(TaskModal.editingId, data);
    Toast.show('Task updated', 'success');
  } else {
    Tasks.add(data);
    Toast.show('Task added', 'success');
  }
  ModalManager.close('taskModalOverlay');
  Calendar.render();
});

/* ==========================================================================
   11. STREAK / PRODUCTIVITY SCORE
   ========================================================================== */
const Streak = {
  markActiveToday() {
    const today = todayISO();
    if (state.streak.lastActiveDate === today) return;
    if (state.streak.lastActiveDate) {
      const gap = daysBetween(new Date(), new Date(state.streak.lastActiveDate + 'T00:00:00'));
      state.streak.count = gap === 1 ? state.streak.count + 1 : 1;
    } else {
      state.streak.count = 1;
    }
    state.streak.lastActiveDate = today;
    persist();
  },
  getCount() {
    if (!state.streak.lastActiveDate) return 0;
    const gap = daysBetween(new Date(), new Date(state.streak.lastActiveDate + 'T00:00:00'));
    return gap > 1 ? 0 : state.streak.count;
  }
};

function computeProductivityScore() {
  const today = todayISO();
  const todayTasks = Tasks.getTodayTasks();
  const doneToday = todayTasks.filter(t => t.completed).length;
  const taskScore = todayTasks.length ? (doneToday / todayTasks.length) * 55 : (doneToday > 0 ? 55 : 0);
  const focusMinutes = (state.dailyStats[today] || {}).focusMinutes || 0;
  const focusScore = clamp((focusMinutes / 120) * 30, 0, 30);
  const streakScore = clamp(Streak.getCount() * 1.5, 0, 15);
  return Math.round(clamp(taskScore + focusScore + streakScore, 0, 100));
}

/* ==========================================================================
   12. DASHBOARD MODULE
   ========================================================================== */
const Dashboard = {
  render() {
    const today = todayISO();
    const todayTasks = Tasks.getTodayTasks();
    const doneToday = todayTasks.filter(t => t.completed).length;

    // Hero stats
    $('#heroTasksDone').textContent = `${doneToday}/${todayTasks.length}`;
    const focusMinutesToday = (state.dailyStats[today] || {}).focusMinutes || 0;
    $('#heroFocusTime').textContent = focusMinutesToday >= 60 ? `${(focusMinutesToday / 60).toFixed(1)}h` : `${focusMinutesToday}m`;
    const score = computeProductivityScore();
    $('#heroScore').textContent = score;

    // Quote (deterministic per day so it doesn't flicker)
    const dayIdx = new Date().getDate() % MOTIVATIONAL_QUOTES.length;
    $('#heroQuote').textContent = MOTIVATIONAL_QUOTES[dayIdx][0];
    $('#heroQuoteAuthor').textContent = MOTIVATIONAL_QUOTES[dayIdx][1];

    // Productivity ring
    const circumference = 2 * Math.PI * 60;
    const ring = $('#productivityRing');
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = circumference - (score / 100) * circumference;
    $('#productivityValue').textContent = score;
    $('#productivityCaption').textContent = score >= 80 ? 'Outstanding momentum!' : score >= 50 ? 'Solid pace — keep going.' : 'Complete tasks to build momentum';

    // Daily progress
    const dailyPct = todayTasks.length ? Math.round((doneToday / todayTasks.length) * 100) : 0;
    $('#dailyProgressBar').style.width = dailyPct + '%';
    $('#dailyProgressPill').textContent = dailyPct + '%';
    $('#dailyProgressNote').textContent = `${doneToday} of ${todayTasks.length} tasks complete`;

    // Weekly progress + mini bars
    const weekData = getLastNDaysStats(7);
    const weeklyTotal = weekData.reduce((s, d) => s + d.tasksDone, 0);
    const weeklyTarget = Math.max(weeklyTotal, 7);
    const weeklyPct = Math.min(100, Math.round((weeklyTotal / weeklyTarget) * 100));
    $('#weeklyProgressPill').textContent = weekData.filter(d => d.tasksDone > 0).length + '/7 days active';
    const maxVal = Math.max(1, ...weekData.map(d => d.tasksDone));
    $('#weeklyMiniBars').innerHTML = weekData.map(d => {
      const h = Math.max(6, Math.round((d.tasksDone / maxVal) * 60));
      return `<div class="mini-bar ${d.isToday ? 'is-today' : ''}" style="height:${h}px" title="${d.label}: ${d.tasksDone} tasks"></div>`;
    }).join('');

    // Streak
    const streakCount = Streak.getCount();
    $('#streakDays').textContent = streakCount;
    $('#sidebarStreak').textContent = streakCount;

    // Today's tasks list
    const todayList = $('#todayTaskList');
    todayList.innerHTML = todayTasks.length ? todayTasks.slice(0, 6).map(taskMiniHTML).join('') : '<li class="empty-state-mini">No tasks scheduled for today yet.</li>';
    // Upcoming
    const upcoming = Tasks.getUpcomingTasks(6);
    $('#upcomingTaskList').innerHTML = upcoming.length ? upcoming.map(taskMiniHTML).join('') : '<li class="empty-state-mini">Nothing on the horizon.</li>';

    bindMiniTaskToggles();
  }
};

function taskMiniHTML(t) {
  const color = CATEGORY_COLORS[t.category] || 'var(--accent)';
  const dueLabel = t.dueDate ? `${formatShortDate(t.dueDate)}${t.dueTime ? ' · ' + t.dueTime : ''}` : '';
  return `<li class="task-mini-item" data-mini-id="${t.id}">
    <span class="task-mini-dot" style="background:${color}"></span>
    <span class="task-mini-title" style="${t.completed ? 'text-decoration:line-through;opacity:.6' : ''}">${escapeHTML(t.title)}</span>
    <span class="task-mini-meta">${dueLabel}</span>
  </li>`;
}
function bindMiniTaskToggles() {
  $$('.task-mini-item').forEach(el => {
    el.addEventListener('click', () => Tasks.toggleComplete(el.dataset.miniId));
  });
}

function getLastNDaysStats(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = todayISO(d);
    const stat = state.dailyStats[iso] || { tasksDone: 0, focusMinutes: 0 };
    out.push({
      iso,
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      tasksDone: stat.tasksDone,
      focusMinutes: stat.focusMinutes,
      isToday: i === 0
    });
  }
  return out;
}

/* ==========================================================================
   13. ANALYTICS RECORDING
   ========================================================================== */
const Analytics = {
  recordTaskCompletion() {
    const today = todayISO();
    if (!state.dailyStats[today]) state.dailyStats[today] = { tasksDone: 0, focusMinutes: 0 };
    state.dailyStats[today].tasksDone += 1;
    persist();
  },
  recordFocusMinutes(minutes, type) {
    const today = todayISO();
    if (!state.dailyStats[today]) state.dailyStats[today] = { tasksDone: 0, focusMinutes: 0 };
    state.dailyStats[today].focusMinutes += minutes;
    state.sessions.push({ date: today, minutes, type, timestamp: Date.now() });
    Streak.markActiveToday();
    persist();
    Dashboard.render();
  },

  renderAll() {
    const range = parseInt($('#analyticsRange').value, 10) || 7;
    const data = getLastNDaysStats(range);

    // Stat strip
    $('#statProductivity').textContent = computeProductivityScore();
    $('#statStreak').textContent = Streak.getCount();
    $('#statTasksDone').textContent = state.tasks.filter(t => t.completed).length;
    $('#statFocusSessions').textContent = state.sessions.length;
    const totalFocusMin = state.sessions.reduce((s, x) => s + x.minutes, 0);
    $('#statFocusHours').textContent = (totalFocusMin / 60).toFixed(1) + 'h';

    Charts.drawBarChart('chartDailyTime', data.map(d => d.label), data.map(d => d.focusMinutes), 'min');
    Charts.drawDonutChart('chartTaskCompletion', state.tasks.filter(t => t.completed).length, state.tasks.filter(t => !t.completed).length);
    Charts.drawLineChart('chartWeekly', data.map(d => d.label), data.map(d => d.tasksDone));
    Charts.drawBarChart('chartFocusSessions', data.map(d => d.label), data.map(d => {
      return state.sessions.filter(s => s.date === d.iso).length;
    }), '');
  }
};
$('#analyticsRange').addEventListener('change', () => Analytics.renderAll());

/* ==========================================================================
   14. CANVAS CHARTS (hand-rolled, no external libs)
   ========================================================================== */
const Charts = {
  colors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      accent: styles.getPropertyValue('--accent').trim() || '#6C5CE7',
      accent2: styles.getPropertyValue('--accent-2').trim() || '#22D3B8',
      text: styles.getPropertyValue('--text-secondary').trim() || '#9498B3',
      grid: styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.1)'
    };
  },

  setupCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas) return null;
    const parentWidth = canvas.parentElement.clientWidth - 44; // account for card padding
    const cssHeight = parseInt(canvas.getAttribute('height'), 10) || 200;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = parentWidth * dpr;
    canvas.height = cssHeight * dpr;
    canvas.style.width = parentWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, parentWidth, cssHeight);
    return { ctx, w: parentWidth, h: cssHeight };
  },

  drawBarChart(id, labels, values, unit) {
    const setup = this.setupCanvas(id);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const c = this.colors();
    const padding = { top: 14, right: 8, bottom: 26, left: 8 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const maxVal = Math.max(1, ...values);
    const barSlot = chartW / values.length;
    const barWidth = Math.min(34, barSlot * 0.5);

    // grid lines
    ctx.strokeStyle = c.grid; ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (chartH / 3) * i;
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(w - padding.right, y); ctx.stroke();
    }

    values.forEach((val, i) => {
      const barH = maxVal ? (val / maxVal) * chartH : 0;
      const x = padding.left + barSlot * i + (barSlot - barWidth) / 2;
      const y = padding.top + chartH - barH;
      const grad = ctx.createLinearGradient(0, y, 0, y + barH);
      grad.addColorStop(0, c.accent);
      grad.addColorStop(1, c.accent2);
      ctx.fillStyle = barH > 0 ? grad : c.grid;
      roundRect(ctx, x, y, barWidth, Math.max(barH, 3), 6);
      ctx.fill();

      ctx.fillStyle = c.text;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barWidth / 2, h - 8);
    });
  },

  drawLineChart(id, labels, values) {
    const setup = this.setupCanvas(id);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const c = this.colors();
    const padding = { top: 16, right: 14, bottom: 26, left: 14 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;
    const maxVal = Math.max(1, ...values);
    const stepX = chartW / (values.length - 1 || 1);

    const points = values.map((v, i) => ({
      x: padding.left + stepX * i,
      y: padding.top + chartH - (v / maxVal) * chartH
    }));

    // Area fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartH);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    grad.addColorStop(0, c.accent + '55');
    grad.addColorStop(1, c.accent + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = c.accent;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Points
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = c.accent2;
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = c.text;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((l, i) => ctx.fillText(l, points[i].x, h - 8));
  },

  drawDonutChart(id, done, pending) {
    const setup = this.setupCanvas(id);
    if (!setup) return;
    const { ctx, w, h } = setup;
    const c = this.colors();
    const total = done + pending;
    const cx = w / 2, cy = h / 2 - 6, r = Math.min(w, h) / 2 - 20;

    ctx.lineWidth = 18;
    ctx.lineCap = 'round';

    // Track
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = c.grid;
    ctx.stroke();

    if (total > 0) {
      const doneFrac = done / total;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + doneFrac * Math.PI * 2);
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, c.accent);
      grad.addColorStop(1, c.accent2);
      ctx.strokeStyle = grad;
      ctx.stroke();
    }

    ctx.fillStyle = c.text;
    ctx.textAlign = 'center';
    ctx.font = '700 22px "Space Grotesk", sans-serif';
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
    ctx.fillText(total ? Math.round((done / total) * 100) + '%' : '0%', cx, cy + 6);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = c.text;
    ctx.fillText('completed', cx, cy + 24);
  }
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

window.addEventListener('resize', debounce(() => {
  if (Router.current === 'analytics') Analytics.renderAll();
}, 250));

/* ==========================================================================
   15. CALENDAR MODULE
   ========================================================================== */
const Calendar = {
  viewDate: new Date(),
  viewMode: 'month',

  render() {
    if (this.viewMode === 'month') this.renderMonth();
    else if (this.viewMode === 'week') this.renderWeek();
    else this.renderDay();
  },

  renderMonth() {
    $('#calendarMonthView').hidden = false;
    $('#calendarWeekView').hidden = true;
    $('#calendarDayView').hidden = true;

    const d = this.viewDate;
    $('#calendarTitle').textContent = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    $('#calendarWeekdays').innerHTML = weekdayNames.map(w => `<span>${w}</span>`).join('');

    const year = d.getFullYear(), month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const cells = [];
    for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, outside: true, month: month - 1 });
    for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, outside: false, month });
    while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ day: cells.length - (startOffset + daysInMonth) + 1, outside: true, month: month + 1 });

    const grid = $('#calendarGrid');
    grid.innerHTML = '';
    cells.forEach(cell => {
      const cellDate = new Date(year, cell.month, cell.day);
      const iso = todayISO(cellDate);
      const dayTasks = state.tasks.filter(t => t.dueDate === iso);
      const el = document.createElement('div');
      el.className = 'cal-day' + (cell.outside ? ' is-outside' : '') + (isSameDay(cellDate, new Date()) ? ' is-today' : '');
      el.innerHTML = `
        <span class="cal-day-num">${cell.day}</span>
        <div class="cal-day-events">
          ${dayTasks.slice(0, 2).map(t => `<span class="cal-event-chip" style="background:${CATEGORY_COLORS[t.category]}22;color:${CATEGORY_COLORS[t.category]}">${escapeHTML(t.title)}</span>`).join('')}
        </div>
        ${dayTasks.length > 2 ? `<span style="font-size:.66rem;color:var(--text-tertiary)">+${dayTasks.length - 2} more</span>` : ''}
      `;
      el.addEventListener('click', () => DayPopup.open(iso));
      grid.appendChild(el);
    });
  },

  renderWeek() {
    $('#calendarMonthView').hidden = true;
    $('#calendarWeekView').hidden = false;
    $('#calendarDayView').hidden = true;

    const d = new Date(this.viewDate);
    const dow = d.getDay();
    const start = new Date(d); start.setDate(d.getDate() - dow);
    $('#calendarTitle').textContent = `Week of ${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

    const container = $('#calendarWeekView');
    container.innerHTML = '';
    for (let i = 0; i < 7; i++) {
      const day = new Date(start); day.setDate(start.getDate() + i);
      const iso = todayISO(day);
      const dayTasks = state.tasks.filter(t => t.dueDate === iso);
      const col = document.createElement('div');
      col.className = 'week-day-col';
      col.innerHTML = `<div class="week-day-head"><span>${day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' })}</span>${isSameDay(day, new Date()) ? '<span class="pill">Today</span>' : ''}</div>
        <ul class="task-mini-list">${dayTasks.length ? dayTasks.map(taskMiniHTML).join('') : '<li class="empty-state-mini">No tasks</li>'}</ul>`;
      col.addEventListener('click', (e) => { if (!e.target.closest('.task-mini-item')) DayPopup.open(iso); });
      container.appendChild(col);
    }
    bindMiniTaskToggles();
  },

  renderDay() {
    $('#calendarMonthView').hidden = true;
    $('#calendarWeekView').hidden = true;
    $('#calendarDayView').hidden = false;

    const iso = todayISO(this.viewDate);
    $('#calendarTitle').textContent = this.viewDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const dayTasks = state.tasks.filter(t => t.dueDate === iso);
    const container = $('#calendarDayView');
    container.innerHTML = `<div class="week-day-col">
      <div class="week-day-head"><span>Tasks</span><span class="pill">${dayTasks.length}</span></div>
      <ul class="task-mini-list">${dayTasks.length ? dayTasks.map(taskMiniHTML).join('') : '<li class="empty-state-mini">Nothing scheduled — enjoy the open time.</li>'}</ul>
    </div>`;
    bindMiniTaskToggles();
  },

  navigate(delta) {
    const d = this.viewDate;
    if (this.viewMode === 'month') d.setMonth(d.getMonth() + delta);
    else if (this.viewMode === 'week') d.setDate(d.getDate() + delta * 7);
    else d.setDate(d.getDate() + delta);
    this.render();
  }
};

$$('.view-switch-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.view-switch-btn').forEach(b => b.classList.remove('is-active'));
  btn.classList.add('is-active');
  Calendar.viewMode = btn.dataset.calView;
  Calendar.render();
}));
$('#calPrev').addEventListener('click', () => Calendar.navigate(-1));
$('#calNext').addEventListener('click', () => Calendar.navigate(1));
$('#calToday').addEventListener('click', () => { Calendar.viewDate = new Date(); Calendar.render(); });

const DayPopup = {
  activeISO: null,
  open(iso) {
    this.activeISO = iso;
    const d = new Date(iso + 'T00:00:00');
    $('#dayPopupTitle').textContent = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const dayTasks = state.tasks.filter(t => t.dueDate === iso);
    $('#dayPopupTaskList').innerHTML = dayTasks.length ? dayTasks.map(taskMiniHTML).join('') : '<li class="empty-state-mini">No tasks yet for this day.</li>';
    bindMiniTaskToggles();
    ModalManager.open('dayPopupOverlay');
  }
};
$('#dayPopupAddTaskBtn').addEventListener('click', () => {
  ModalManager.close('dayPopupOverlay');
  TaskModal.open();
  $('#taskDueDate').value = DayPopup.activeISO;
});

/* ==========================================================================
   16. AUDIO ENGINE (Web Audio API — synthesized tones + generated ambience)
   ========================================================================== */
const AudioEngine = {
  ctx: null,
  ambienceNodes: null,
  alarmInterval: null,
  alarmSourceNode: null,

  getCtx() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },

  /** Play a short synthesized tone pattern representing a named alarm sound. */
  playAlarmTone(soundName, volume = 0.7) {
    const ctx = this.getCtx();
    const master = ctx.createGain();
    master.gain.value = clamp(volume, 0, 1);
    master.connect(ctx.destination);

    const now = ctx.currentTime;
    const patterns = {
      classic: [[880, 0.15], [0, 0.08], [880, 0.15], [0, 0.3]],
      bell: [[1200, 0.5], [0, 0.4]],
      digital: [[1400, 0.08], [0, 0.06], [1400, 0.08], [0, 0.06], [1400, 0.08], [0, 0.4]],
      schoolbell: [[1000, 0.12], [1300, 0.12], [1000, 0.12], [1300, 0.12], [0, 0.3]],
      chime: [[660, 0.3], [880, 0.3], [1100, 0.4], [0, 0.4]],
      nature: [[520, 0.2], [0, 0.1], [640, 0.2], [0, 0.5]]
    };
    const seq = patterns[soundName] || patterns.classic;
    let t = now;
    seq.forEach(([freq, dur]) => {
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = soundName === 'bell' || soundName === 'chime' ? 'sine' : soundName === 'digital' ? 'square' : 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(1, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
      t += dur;
    });
    return t - now; // pattern duration in seconds
  },

  /** Loop a synthesized alarm pattern (or custom uploaded audio) until stopped. */
  startAlarmLoop(soundName, volume) {
    this.stopAlarmLoop();
    if (soundName === 'custom' && state.customSoundData) {
      const audio = new Audio(state.customSoundData);
      audio.loop = true;
      audio.volume = clamp(volume, 0, 1);
      audio.play().catch(() => {});
      this.alarmSourceNode = audio;
      return;
    }
    const loop = () => {
      const dur = this.playAlarmTone(soundName, volume);
      this.alarmInterval = setTimeout(loop, Math.max(600, dur * 1000 + 250));
    };
    loop();
  },

  stopAlarmLoop() {
    if (this.alarmInterval) { clearTimeout(this.alarmInterval); this.alarmInterval = null; }
    if (this.alarmSourceNode) { this.alarmSourceNode.pause(); this.alarmSourceNode = null; }
  },

  /** Generated ambient background loops using filtered noise (no external assets). */
  startAmbience(type, volume) {
    this.stopAmbience();
    if (type === 'none') return;
    const ctx = this.getCtx();
    const bufferSize = 2 * ctx.sampleRate;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;

    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    gain.gain.value = clamp(volume, 0, 1) * 0.5;

    const presets = {
      rain: { type: 'highpass', freq: 1200 },
      forest: { type: 'bandpass', freq: 800 },
      waves: { type: 'lowpass', freq: 500 },
      whitenoise: { type: 'allpass', freq: 1000 },
      cafe: { type: 'bandpass', freq: 1500 }
    };
    const preset = presets[type] || presets.whitenoise;
    filter.type = preset.type;
    filter.frequency.value = preset.freq;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start();

    // Gentle amplitude LFO for waves/forest so it feels alive, not static hiss
    if (type === 'waves' || type === 'forest') {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = type === 'waves' ? 0.15 : 0.4;
      lfoGain.gain.value = gain.gain.value * 0.4;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      lfo.start();
      this.ambienceNodes = { noise, filter, gain, lfo };
    } else {
      this.ambienceNodes = { noise, filter, gain };
    }
  },

  setAmbienceVolume(volume) {
    if (this.ambienceNodes) this.ambienceNodes.gain.gain.value = clamp(volume, 0, 1) * 0.5;
  },

  stopAmbience() {
    if (this.ambienceNodes) {
      try { this.ambienceNodes.noise.stop(); } catch (e) {}
      if (this.ambienceNodes.lfo) { try { this.ambienceNodes.lfo.stop(); } catch (e) {} }
      this.ambienceNodes = null;
    }
  }
};

/* ==========================================================================
   17. FOCUS TIMERS (Pomodoro / Countdown / Stopwatch)
   Guarded against duplicate intervals via a single named interval handle.
   ========================================================================== */
const FocusTimer = {
  mode: 'pomodoro',        // pomodoro | countdown | stopwatch
  intervalHandle: null,
  running: false,
  totalSeconds: 25 * 60,
  remainingSeconds: 25 * 60,
  elapsedSeconds: 0,        // for stopwatch
  phase: 'focus',           // focus | break | longbreak
  round: 1,

  init() {
    this.setMode('pomodoro');
    $$('.timer-tab').forEach(tab => tab.addEventListener('click', () => this.setMode(tab.dataset.timer)));
    $('#timerStartBtn').addEventListener('click', () => this.toggleRun());
    $('#timerResetBtn').addEventListener('click', () => this.reset());
    $('#timerSkipBtn').addEventListener('click', () => this.skipPhase());

    ['pomodoroFocusMin', 'pomodoroBreakMin', 'pomodoroLongBreakMin', 'pomodoroRounds'].forEach(id => {
      $('#' + id).addEventListener('change', () => { if (this.mode === 'pomodoro' && !this.running) this.reset(); });
    });
    $('#countdownMin').addEventListener('change', () => { if (this.mode === 'countdown' && !this.running) this.reset(); });
  },

  setMode(mode) {
    if (this.running) this.pause();
    this.mode = mode;
    $$('.timer-tab').forEach(t => t.classList.toggle('is-active', t.dataset.timer === mode));
    $('#timerSettingsPanel').hidden = mode !== 'pomodoro';
    $('#countdownSettingsPanel').hidden = mode !== 'countdown';
    $('#timerSkipBtn').style.visibility = mode === 'pomodoro' ? 'visible' : 'hidden';
    this.phase = 'focus';
    this.round = 1;
    this.reset();
  },

  reset() {
    this.pause();
    if (this.mode === 'pomodoro') {
      this.totalSeconds = parseInt($('#pomodoroFocusMin').value, 10) * 60;
      this.remainingSeconds = this.totalSeconds;
      $('#timerPhase').textContent = 'Focus session';
      $('#pomodoroRoundLabel').textContent = `Round ${this.round} of ${$('#pomodoroRounds').value}`;
    } else if (this.mode === 'countdown') {
      this.totalSeconds = parseInt($('#countdownMin').value, 10) * 60;
      this.remainingSeconds = this.totalSeconds;
      $('#timerPhase').textContent = 'Countdown';
    } else {
      this.elapsedSeconds = 0;
      $('#timerPhase').textContent = 'Stopwatch';
    }
    $('#timerStartBtn').textContent = 'Start';
    this.updateDisplay();
  },

  toggleRun() { this.running ? this.pause() : this.start(); },

  start() {
    if (this.running) return; // guard against duplicate timers
    this.running = true;
    $('#timerStartBtn').textContent = 'Pause';
    AudioEngine.getCtx();
    this.intervalHandle = setInterval(() => this.tick(), 1000);
  },

  pause() {
    this.running = false;
    if (this.intervalHandle) { clearInterval(this.intervalHandle); this.intervalHandle = null; }
    $('#timerStartBtn').textContent = 'Resume';
  },

  tick() {
    if (this.mode === 'stopwatch') {
      this.elapsedSeconds++;
    } else {
      this.remainingSeconds--;
      if (this.remainingSeconds <= 0) {
        this.completePhase();
        return;
      }
    }
    this.updateDisplay();
  },

  completePhase() {
    this.pause();
    const minutesElapsed = Math.round(this.totalSeconds / 60);
    if (this.mode === 'pomodoro' && this.phase === 'focus') {
      Analytics.recordFocusMinutes(minutesElapsed, 'pomodoro');
      SessionHistory.add('Focus session', minutesElapsed);
    }
    if (state.settings.notifFocus) {
      Toast.show(this.mode === 'pomodoro' ? `${this.phase === 'focus' ? 'Focus' : 'Break'} complete!` : 'Countdown finished!', 'success');
      AudioEngine.playAlarmTone(state.settings.defaultAlarmSound, state.settings.defaultAlarmVolume / 100);
    }

    if (this.mode === 'pomodoro') {
      const rounds = parseInt($('#pomodoroRounds').value, 10);
      if (this.phase === 'focus') {
        if (this.round >= rounds) { this.phase = 'longbreak'; this.round = 1; }
        else { this.phase = 'break'; this.round++; }
      } else {
        this.phase = 'focus';
      }
      const durMin = this.phase === 'focus' ? $('#pomodoroFocusMin').value : this.phase === 'break' ? $('#pomodoroBreakMin').value : $('#pomodoroLongBreakMin').value;
      this.totalSeconds = parseInt(durMin, 10) * 60;
      this.remainingSeconds = this.totalSeconds;
      $('#timerPhase').textContent = this.phase === 'focus' ? 'Focus session' : this.phase === 'break' ? 'Short break' : 'Long break';
      $('#pomodoroRoundLabel').textContent = `Round ${this.round} of ${rounds}`;
      $('#timerStartBtn').textContent = 'Start';
      this.updateDisplay();
      if ($('#autoStartNext').checked) this.start();
    } else if (this.mode === 'countdown') {
      Analytics.recordFocusMinutes(minutesElapsed, 'countdown');
      SessionHistory.add('Countdown', minutesElapsed);
      this.reset();
    }
  },

  skipPhase() {
    if (this.mode !== 'pomodoro') return;
    this.remainingSeconds = 0;
    this.completePhase();
  },

  updateDisplay() {
    let seconds, ratio;
    if (this.mode === 'stopwatch') {
      seconds = this.elapsedSeconds;
      ratio = 0;
    } else {
      seconds = this.remainingSeconds;
      ratio = this.totalSeconds ? (this.totalSeconds - this.remainingSeconds) / this.totalSeconds : 0;
    }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    $('#timerDisplay').textContent = h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`;

    const circumference = 2 * Math.PI * 115;
    const ring = $('#timerRingProgress');
    ring.style.strokeDasharray = circumference;
    if (this.mode === 'stopwatch') {
      ring.style.strokeDashoffset = 0;
    } else {
      ring.style.strokeDashoffset = circumference * (1 - ratio);
    }
  }
};

const SessionHistory = {
  add(label, minutes) {
    const list = $('#sessionHistoryList');
    if (list.querySelector('.empty-state-mini')) list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'session-item';
    li.innerHTML = `<span>${escapeHTML(label)}</span><span>${minutes} min · ${new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>`;
    list.prepend(li);
  }
};

/* Background sound chips */
$$('.sound-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    $$('.sound-chip').forEach(c => c.classList.remove('is-active'));
    chip.classList.add('is-active');
    const vol = $('#bgVolumeSlider').value / 100;
    AudioEngine.startAmbience(chip.dataset.sound, vol);
  });
});
$('#soundGrid').querySelector('[data-sound="none"]').classList.add('is-active');
$('#bgVolumeSlider').addEventListener('input', (e) => AudioEngine.setAmbienceVolume(e.target.value / 100));

/* Focus mode (fullscreen distraction-free) */
$('#focusModeBtn').addEventListener('click', () => {
  document.body.classList.toggle('is-focus-mode');
  if (document.body.classList.contains('is-focus-mode')) {
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    Toast.show('Focus mode on — press the button again to exit', 'info');
  } else {
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
});
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.body.classList.remove('is-focus-mode');
});

/* ==========================================================================
   18. ALARM SYSTEM
   ========================================================================== */
const Alarms = {
  ringingId: null,
  snoozeTimers: {},
  lastFiredMinute: {},

  render() {
    const list = $('#alarmList');
    if (!state.alarms.length) {
      list.innerHTML = '<li class="empty-state-mini">No alarms set. Add one to get started.</li>';
      return;
    }
    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    list.innerHTML = state.alarms.map(a => {
      const daysLabel = a.repeat && a.days.length ? a.days.sort().map(d => dayLetters[d]).join(' ') : (a.repeat ? 'Every day' : 'One time');
      return `<li class="alarm-item" data-id="${a.id}">
        <span class="alarm-time ${a.enabled ? '' : 'is-disabled'}">${a.time}</span>
        <div class="alarm-info">
          <div class="alarm-label">${escapeHTML(a.label || 'Alarm')}</div>
          <div class="alarm-days">${daysLabel} · ${a.sound}</div>
        </div>
        <div class="alarm-actions">
          <label class="switch"><input type="checkbox" class="alarm-enable-toggle" ${a.enabled ? 'checked' : ''}><span></span></label>
          <button class="btn-icon alarm-edit-btn" aria-label="Edit alarm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="btn-icon alarm-delete-btn" aria-label="Delete alarm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6"/></svg>
          </button>
        </div>
      </li>`;
    }).join('');

    $$('.alarm-enable-toggle', list).forEach(el => {
      el.addEventListener('change', (e) => {
        const id = e.target.closest('.alarm-item').dataset.id;
        const a = state.alarms.find(x => x.id === id);
        a.enabled = e.target.checked;
        persist();
      });
    });
    $$('.alarm-edit-btn', list).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.alarm-item').dataset.id;
      AlarmModal.open(state.alarms.find(x => x.id === id));
    }));
    $$('.alarm-delete-btn', list).forEach(btn => btn.addEventListener('click', async () => {
      const id = btn.closest('.alarm-item').dataset.id;
      const ok = await confirmDialog('Delete alarm?', 'This alarm will be removed permanently.');
      if (ok) {
        state.alarms = state.alarms.filter(x => x.id !== id);
        persist();
        this.render();
        Toast.show('Alarm deleted', 'info');
      }
    }));
  },

  /** Checked once per second by Clock.tick — fires at most once per matching minute. */
  checkTick(now) {
    const hhmm = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    if (now.getSeconds() !== 0) return; // only evaluate on the minute boundary
    state.alarms.forEach(a => {
      if (!a.enabled) return;
      if (a.time !== hhmm) return;
      const dow = now.getDay();
      if (a.repeat && a.days.length && !a.days.includes(dow)) return;
      const fireKey = `${a.id}_${todayISO(now)}_${hhmm}`;
      if (this.lastFiredMinute[fireKey]) return;
      this.lastFiredMinute[fireKey] = true;
      this.trigger(a);
    });
  },

  trigger(alarm) {
    if (this.ringingId) return; // never stack alarms
    this.ringingId = alarm.id;
    $('#ringingAlarmLabel').textContent = alarm.label || 'Alarm';
    $('#ringingAlarmTime').textContent = alarm.time;
    $('#alarmRingOverlay').classList.add('is-open');
    AudioEngine.startAlarmLoop(alarm.sound, (alarm.volume ?? 70) / 100);
  },

  stop() {
    AudioEngine.stopAlarmLoop();
    $('#alarmRingOverlay').classList.remove('is-open');
    this.ringingId = null;
  },

  snooze() {
    const alarm = state.alarms.find(a => a.id === this.ringingId);
    const snoozeMin = alarm ? (alarm.snooze || 5) : 5;
    this.stop();
    Toast.show(`Snoozed for ${snoozeMin} minutes`, 'info');
    setTimeout(() => { if (alarm) this.trigger(alarm); }, snoozeMin * 60 * 1000);
  }
};

$('#stopAlarmBtn').addEventListener('click', () => Alarms.stop());
$('#snoozeAlarmBtn').addEventListener('click', () => Alarms.snooze());
$('#addAlarmBtn').addEventListener('click', () => AlarmModal.open());

const AlarmModal = {
  editingId: null,
  selectedDays: [],

  open(alarm = null) {
    this.editingId = alarm ? alarm.id : null;
    this.selectedDays = alarm ? [...alarm.days] : [];
    $('#alarmModalTitle').textContent = alarm ? 'Edit alarm' : 'New alarm';
    $('#alarmId').value = alarm ? alarm.id : '';
    $('#alarmTime').value = alarm ? alarm.time : '';
    $('#alarmLabel').value = alarm ? alarm.label : '';
    $('#alarmSound').value = alarm ? alarm.sound : state.settings.defaultAlarmSound;
    $('#alarmVolume').value = alarm ? alarm.volume : state.settings.defaultAlarmVolume;
    $('#alarmSnooze').value = alarm ? alarm.snooze : 5;
    $('#alarmRepeatToggle').checked = alarm ? alarm.repeat : false;
    $('#customSoundRow').hidden = $('#alarmSound').value !== 'custom';
    $('#customSoundName').textContent = state.customSoundName || 'No file chosen';
    $$('#alarmDayPicker button').forEach(btn => btn.classList.toggle('is-active', this.selectedDays.includes(parseInt(btn.dataset.day, 10))));
    ModalManager.open('alarmModalOverlay');
  }
};

$$('#alarmDayPicker button').forEach(btn => btn.addEventListener('click', () => {
  const day = parseInt(btn.dataset.day, 10);
  const idx = AlarmModal.selectedDays.indexOf(day);
  if (idx > -1) AlarmModal.selectedDays.splice(idx, 1); else AlarmModal.selectedDays.push(day);
  btn.classList.toggle('is-active');
}));

$('#alarmSound').addEventListener('change', (e) => { $('#customSoundRow').hidden = e.target.value !== 'custom'; });
$('#customSoundUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 4 * 1024 * 1024) { Toast.show('File too large — keep uploads under 4MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    state.customSoundData = reader.result;
    state.customSoundName = file.name;
    $('#customSoundName').textContent = file.name;
    persist();
    Toast.show('Custom sound uploaded', 'success');
  };
  reader.readAsDataURL(file);
});

$('#previewAlarmBtn').addEventListener('click', () => {
  const sound = $('#alarmSound').value;
  const vol = $('#alarmVolume').value / 100;
  if (sound === 'custom' && state.customSoundData) {
    const a = new Audio(state.customSoundData);
    a.volume = vol;
    a.play().catch(() => {});
  } else {
    AudioEngine.playAlarmTone(sound === 'custom' ? 'classic' : sound, vol);
  }
});

$('#alarmForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    id: AlarmModal.editingId || uid(),
    time: $('#alarmTime').value,
    label: $('#alarmLabel').value.trim(),
    days: [...AlarmModal.selectedDays],
    repeat: $('#alarmRepeatToggle').checked,
    sound: $('#alarmSound').value,
    volume: parseInt($('#alarmVolume').value, 10),
    snooze: parseInt($('#alarmSnooze').value, 10),
    enabled: true
  };
  if (!data.time) return;
  if (AlarmModal.editingId) {
    const idx = state.alarms.findIndex(a => a.id === data.id);
    state.alarms[idx] = Object.assign({}, state.alarms[idx], data);
  } else {
    state.alarms.push(data);
  }
  persist();
  Alarms.render();
  ModalManager.close('alarmModalOverlay');
  Toast.show('Alarm saved', 'success');
});

/* ==========================================================================
   19. NOTES MODULE
   ========================================================================== */
const Notes = {
  filterCategory: 'all',
  filterSearch: '',
  autosaveTimer: null,

  add(data) {
    const note = { id: uid(), title: data.title, category: data.category, body: data.body, pinned: false, updatedAt: Date.now() };
    state.notes.unshift(note);
    persist();
    this.render();
    return note;
  },

  update(id, data) {
    const n = state.notes.find(n => n.id === id);
    if (!n) return;
    Object.assign(n, data, { updatedAt: Date.now() });
    persist();
    this.render();
  },

  remove(id) {
    state.notes = state.notes.filter(n => n.id !== id);
    persist();
    this.render();
  },

  togglePin(id) {
    const n = state.notes.find(n => n.id === id);
    if (!n) return;
    n.pinned = !n.pinned;
    persist();
    this.render();
  },

  getFiltered() {
    let list = [...state.notes];
    if (this.filterCategory !== 'all') list = list.filter(n => n.category === this.filterCategory);
    if (this.filterSearch) {
      const q = this.filterSearch.toLowerCase();
      list = list.filter(n => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q));
    }
    list.sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
    return list;
  },

  render() {
    const list = this.getFiltered();
    const grid = $('#notesGrid');
    $('#notesEmptyState').hidden = list.length > 0;
    grid.innerHTML = list.map(n => `
      <div class="note-card" data-id="${n.id}">
        <div class="note-card-head">
          <span class="note-card-title">${escapeHTML(n.title || 'Untitled')}</span>
          <button class="note-pin-btn ${n.pinned ? 'is-pinned' : ''}" aria-label="Pin note" data-pin="${n.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="${n.pinned ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M12 2l2 7h7l-5.5 4.5L17 21l-5-4-5 4 1.5-7.5L3 9h7z"/></svg>
          </button>
        </div>
        <div class="note-card-body">${escapeHTML(n.body || 'No content yet…')}</div>
        <div class="note-card-foot">
          <span class="tag tag-cat">${n.category}</span>
          <span class="note-card-date">${new Date(n.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    `).join('');

    $$('.note-pin-btn', grid).forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); this.togglePin(btn.dataset.pin); }));
    $$('.note-card', grid).forEach(card => card.addEventListener('click', () => {
      const note = state.notes.find(n => n.id === card.dataset.id);
      NoteModal.open(note);
    }));
  }
};

$('#noteSearch').addEventListener('input', debounce((e) => { Notes.filterSearch = e.target.value; Notes.render(); }, 200));
$$('#noteCategoryFilter .chip').forEach(chip => chip.addEventListener('click', () => {
  $$('#noteCategoryFilter .chip').forEach(c => c.classList.remove('is-active'));
  chip.classList.add('is-active');
  Notes.filterCategory = chip.dataset.cat;
  Notes.render();
}));

const NoteModal = {
  editingId: null,
  open(note = null) {
    this.editingId = note ? note.id : null;
    $('#noteModalTitle').textContent = note ? 'Edit note' : 'New note';
    $('#noteId').value = note ? note.id : '';
    $('#noteTitleInput').value = note ? note.title : '';
    $('#noteCategoryInput').value = note ? note.category : 'study';
    $('#noteBodyInput').value = note ? note.body : '';
    $('#autosaveIndicator').classList.remove('is-visible');
    ModalManager.open('noteModalOverlay');
    if (!note) {
      // Create a draft immediately so autosave has something to attach to
      const draft = Notes.add({ title: '', category: 'study', body: '' });
      this.editingId = draft.id;
      $('#noteId').value = draft.id;
    }
  },
  autosave() {
    if (!this.editingId) return;
    Notes.update(this.editingId, {
      title: $('#noteTitleInput').value.trim() || 'Untitled',
      category: $('#noteCategoryInput').value,
      body: $('#noteBodyInput').value
    });
    const indicator = $('#autosaveIndicator');
    indicator.textContent = 'Saved';
    indicator.classList.add('is-visible');
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => indicator.classList.remove('is-visible'), 1400);
  }
};

$('#newNoteBtn').addEventListener('click', () => NoteModal.open());
$('#notesEmptyAddBtn').addEventListener('click', () => NoteModal.open());
['noteTitleInput', 'noteCategoryInput', 'noteBodyInput'].forEach(id => {
  $('#' + id).addEventListener('input', debounce(() => NoteModal.autosave(), 500));
});
// Remove empty untitled drafts when the modal closes without content
$('#noteModalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'noteModalOverlay' || e.target.closest('[data-close-modal="noteModalOverlay"]')) {
    const n = state.notes.find(n => n.id === NoteModal.editingId);
    if (n && !n.title && !n.body) Notes.remove(n.id);
  }
});

/* ==========================================================================
   20. SETTINGS MODULE
   ========================================================================== */
const ACCENT_HSL = {
  violet: { h: 249, s: 71, l: 63 },
  teal: { h: 168, s: 66, l: 48 },
  amber: { h: 38, s: 100, l: 56 },
  rose: { h: 337, s: 92, l: 68 },
  blue: { h: 219, s: 100, l: 65 }
};

const Settings = {
  init() {
    this.applyTheme(state.settings.theme);
    this.applyAccent(state.settings.accent);
    this.applyFontScale(state.settings.fontScale);

    $$('#themeSegmented button').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.theme === state.settings.theme);
      btn.addEventListener('click', () => this.setTheme(btn.dataset.theme));
    });
    $$('#accentSwatches .swatch').forEach(sw => {
      sw.classList.toggle('is-active', sw.dataset.accent === state.settings.accent);
      sw.addEventListener('click', () => this.setAccent(sw.dataset.accent));
    });
    $('#fontSizeSlider').value = state.settings.fontScale;
    $('#fontSizeSlider').addEventListener('input', (e) => this.applyFontScale(parseInt(e.target.value, 10), true));

    $('#notifTasksToggle').checked = state.settings.notifTasks;
    $('#notifFocusToggle').checked = state.settings.notifFocus;
    $('#notifSummaryToggle').checked = state.settings.notifSummary;
    $('#notifTasksToggle').addEventListener('change', (e) => { state.settings.notifTasks = e.target.checked; persist(); });
    $('#notifFocusToggle').addEventListener('change', (e) => { state.settings.notifFocus = e.target.checked; persist(); });
    $('#notifSummaryToggle').addEventListener('change', (e) => { state.settings.notifSummary = e.target.checked; persist(); });

    $('#defaultAlarmSound').value = state.settings.defaultAlarmSound;
    $('#defaultAlarmVolume').value = state.settings.defaultAlarmVolume;
    $('#defaultAlarmSound').addEventListener('change', (e) => { state.settings.defaultAlarmSound = e.target.value; persist(); });
    $('#defaultAlarmVolume').addEventListener('input', (e) => { state.settings.defaultAlarmVolume = parseInt(e.target.value, 10); persist(); });
    $('#testDefaultAlarmBtn').addEventListener('click', () => AudioEngine.playAlarmTone(state.settings.defaultAlarmSound, state.settings.defaultAlarmVolume / 100));

    $('#exportJsonBtn').addEventListener('click', () => this.exportData());
    $('#importJsonBtn').addEventListener('click', () => $('#importJsonInput').click());
    $('#importJsonInput').addEventListener('change', (e) => this.importData(e.target.files[0]));
    $('#resetDataBtn').addEventListener('click', () => this.resetData());

    $('#themeQuickToggle').addEventListener('click', () => this.toggleTheme());
  },

  setTheme(theme) {
    state.settings.theme = theme;
    persist();
    this.applyTheme(theme);
    $$('#themeSegmented button').forEach(b => b.classList.toggle('is-active', b.dataset.theme === theme));
  },
  toggleTheme() { this.setTheme(state.settings.theme === 'dark' ? 'light' : 'dark'); },
  applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); },

  setAccent(accent) {
    state.settings.accent = accent;
    persist();
    this.applyAccent(accent);
    $$('#accentSwatches .swatch').forEach(s => s.classList.toggle('is-active', s.dataset.accent === accent));
  },
  applyAccent(accent) {
    const hsl = ACCENT_HSL[accent] || ACCENT_HSL.violet;
    document.documentElement.style.setProperty('--accent-h', hsl.h);
    document.documentElement.style.setProperty('--accent-s', hsl.s + '%');
    document.documentElement.style.setProperty('--accent-l', hsl.l + '%');
    if (Router.current === 'analytics') Analytics.renderAll();
  },

  applyFontScale(value, save = false) {
    document.documentElement.style.setProperty('--scale', value / 100);
    if (save) { state.settings.fontScale = value; persist(); }
  },

  exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbit-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Backup exported', 'success');
  },

  importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid file');
        state = Object.assign(defaultState(), parsed, { settings: Object.assign(defaultState().settings, parsed.settings || {}) });
        persist();
        RenderAll();
        this.init();
        Toast.show('Data restored successfully', 'success');
      } catch (err) {
        Toast.show('Import failed — invalid file', 'error');
      }
    };
    reader.readAsText(file);
    $('#importJsonInput').value = '';
  },

  async resetData() {
    const ok = await confirmDialog('Reset all data?', 'This permanently deletes every task, note, alarm, and stat. This cannot be undone.');
    if (!ok) return;
    state = defaultState();
    persist();
    RenderAll();
    this.init();
    Toast.show('All data has been reset', 'info');
  }
};

/* ==========================================================================
   21. GLOBAL RENDER + INIT
   ========================================================================== */
function RenderAll() {
  Dashboard.render();
  Tasks.render();
  Calendar.render();
  Alarms.render();
  Notes.render();
  if (Router.current === 'analytics') Analytics.renderAll();
}

function init() {
  Toast.init();
  Clock.init();
  FocusTimer.init();
  Settings.init();
  RenderAll();

  // Hide loader once first paint of real content is ready
  setTimeout(() => $('#app-loader').classList.add('is-hidden'), 500);

  Router.go('dashboard');
}

document.addEventListener('DOMContentLoaded', init);

// Persist any in-flight state before the tab closes (extra safety net)
window.addEventListener('beforeunload', persist);

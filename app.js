'use strict';

/* ============================= storage ============================= */

const STORAGE_KEY = 'bizdash_v1';

const EXPENSE_CATEGORIES = [
  'Office & Supplies', 'Software & Subscriptions', 'Marketing & Advertising', 'Travel',
  'Meals & Entertainment', 'Professional & Legal Fees', 'Rent & Utilities', 'Equipment & Tools',
  'Vehicle & Fuel', 'Insurance', 'Bank & Merchant Fees', 'Contractors & Wages', 'Other'
];

function defaultState() {
  return {
    todos: [],       // {id, text, done, doneWeek, recurring, clientId, dueDate, createdAt}
    clients: [],      // {id, name, notes, createdAt}
    revenue: { goal: 10000, entries: [] },  // entries: {id, source, amount, date, status: 'actual'|'expected'}
    expenses: { goal: 1000, gstRate: 10, entries: [] },  // entries: {id, name, amount, date, category, includesGst}
    prospects: [],    // {id, name, notes, stage, reachedOutDate, updatedAt, notifiedAt}
    ideas: [],        // {id, text, createdAt}
    links: [],        // {id, label, url}
    timeEntries: []   // {id, todoId, minutes, date, note, createdAt}
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed, {
      revenue: Object.assign({ goal: 10000, entries: [] }, parsed.revenue),
      expenses: Object.assign({ goal: 1000, gstRate: 10, entries: [] }, parsed.expenses)
    });
  } catch (e) {
    console.error('Failed to load saved data, starting fresh.', e);
    return defaultState();
  }
}

let state = loadState();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// which single item (by id) is currently showing an inline edit form, per list
const editing = { todo: null, client: null, revenue: null, expense: null, prospect: null, idea: null, link: null, timeEntry: null, clientContext: null };

// which single to-do (by id) currently has its time log panel expanded
let expandedTimeLog = null;

/* ============================= helpers ============================= */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function currentMonthKey(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isoWeekKey(d) {
  d = d ? new Date(d) : new Date();
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function daysSince(dateStr) {
  const then = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now - then) / 86400000);
}

function fmtMoney(n) {
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function monthLabel(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function categoryOptions(selected) {
  return EXPENSE_CATEGORIES.map(c => `<option value="${c}" ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
}

function gstAmount(entry, rate) {
  if (!entry.includesGst || !rate) return 0;
  return entry.amount * (rate / (100 + rate));
}

function fmtDuration(minutes) {
  minutes = Math.round(minutes);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function timeEntriesForTodo(todoId) {
  return state.timeEntries.filter(e => e.todoId === todoId);
}

function totalMinutesForTodo(todoId) {
  return timeEntriesForTodo(todoId).reduce((s, e) => s + e.minutes, 0);
}

function totalMinutesForClient(clientId) {
  const todoIds = new Set(state.todos.filter(t => t.clientId === clientId).map(t => t.id));
  return state.timeEntries.filter(e => todoIds.has(e.todoId)).reduce((s, e) => s + e.minutes, 0);
}

/* ============================= tabs ============================= */

function goToTab(tab) {
  document.querySelectorAll('.nav__item').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab').forEach(panel => {
    panel.classList.toggle('is-active', panel.dataset.tabPanel === tab);
  });
}

document.getElementById('tabNav').addEventListener('click', e => {
  const btn = e.target.closest('.nav__item');
  if (!btn) return;
  goToTab(btn.dataset.tab);
});

document.querySelectorAll('[data-goto]').forEach(el => {
  el.addEventListener('click', () => goToTab(el.dataset.goto));
});

/* ============================= todo done state ============================= */

function isTodoDone(todo) {
  if (todo.recurring) return todo.doneWeek === isoWeekKey();
  return !!todo.done;
}

function toggleTodo(id) {
  const todo = state.todos.find(t => t.id === id);
  if (!todo) return;
  if (todo.recurring) {
    todo.doneWeek = isTodoDone(todo) ? null : isoWeekKey();
  } else {
    todo.done = !todo.done;
  }
  save();
  renderAll();
}

function removeTodo(id) {
  state.todos = state.todos.filter(t => t.id !== id);
  state.timeEntries = state.timeEntries.filter(e => e.todoId !== id);
  if (expandedTimeLog === id) expandedTimeLog = null;
  save();
  renderAll();
}

function clientChip(clientId) {
  if (!clientId) return '';
  const client = state.clients.find(c => c.id === clientId);
  if (!client) return '';
  return `<span class="task__chip">${escapeHtml(client.name)}</span>`;
}

function clientOptions(selectedId) {
  return '<option value="">No client</option>' +
    state.clients.map(c => `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
}

function renderTodoItem(todo, opts) {
  opts = opts || {};

  if (editing.todo === todo.id) {
    return `
      <form class="inline-edit" data-action="save-todo-edit" data-id="${todo.id}">
        <input type="text" name="text" value="${escapeHtml(todo.text)}" required maxlength="200" data-autofocus />
        <select name="clientId">${clientOptions(todo.clientId)}</select>
        <label class="checkbox">
          <span>Due</span>
          <input type="date" name="dueDate" value="${todo.dueDate || ''}" />
        </label>
        <label class="checkbox">
          <input type="checkbox" name="recurring" ${todo.recurring ? 'checked' : ''} />
          <span>Repeats weekly</span>
        </label>
        <button type="submit" class="btn btn--primary btn--small">Save</button>
        <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="todo">Cancel</button>
      </form>`;
  }

  const done = isTodoDone(todo);
  const overdue = todo.dueDate && !done && todo.dueDate < todayISO();
  const dueChip = todo.dueDate
    ? `<span class="task__chip ${overdue ? 'task__chip--expected' : ''}">${overdue ? 'Overdue ' : 'Due '}${fmtDate(todo.dueDate)}</span>`
    : '';
  const totalMin = totalMinutesForTodo(todo.id);
  const timeChip = totalMin > 0 ? `<span class="task__chip">${fmtDuration(totalMin)}</span>` : '';
  const logOpen = expandedTimeLog === todo.id;
  return `
    <div class="task" data-id="${todo.id}">
      <input type="checkbox" data-action="toggle-todo" data-id="${todo.id}" ${done ? 'checked' : ''} />
      <span class="task__text ${done ? 'is-done' : ''}">${escapeHtml(todo.text)}</span>
      ${todo.recurring ? '<span class="task__chip task__chip--recurring">Weekly</span>' : ''}
      ${dueChip}
      ${timeChip}
      ${opts.showClient ? clientChip(todo.clientId) : ''}
      <button type="button" class="btn--icon ${logOpen ? 'is-active' : ''}" data-action="toggle-timelog" data-id="${todo.id}" title="Log time">⏱</button>
      <button type="button" class="btn--icon" data-action="edit-todo" data-id="${todo.id}" title="Edit">✎</button>
      <button type="button" class="btn--icon" data-action="remove-todo" data-id="${todo.id}" title="Remove">✕</button>
    </div>
    ${logOpen ? renderTimeLogPanel(todo) : ''}`;
}

function renderTimeEntryRow(entry) {
  if (editing.timeEntry === entry.id) {
    return `
      <form class="inline-edit" data-action="save-time-edit" data-id="${entry.id}">
        <input type="number" name="hours" value="${Math.floor(entry.minutes / 60)}" min="0" step="1" placeholder="h" style="width:56px" data-autofocus />
        <input type="number" name="minutes" value="${entry.minutes % 60}" min="0" max="59" step="1" placeholder="m" style="width:56px" />
        <input type="text" name="note" value="${escapeHtml(entry.note || '')}" placeholder="What did you work on?" maxlength="140" />
        <input type="date" name="date" value="${entry.date}" />
        <button type="submit" class="btn btn--primary btn--small">Save</button>
        <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="timeEntry">Cancel</button>
      </form>`;
  }
  return `
    <div class="timelog__entry">
      <span class="timelog__date">${fmtDate(entry.date)}</span>
      <span class="timelog__duration">${fmtDuration(entry.minutes)}</span>
      <span class="timelog__note">${entry.note ? escapeHtml(entry.note) : ''}</span>
      <button type="button" class="btn--icon" data-action="edit-time-entry" data-id="${entry.id}" title="Edit">✎</button>
      <button type="button" class="btn--icon" data-action="remove-time-entry" data-id="${entry.id}" title="Remove">✕</button>
    </div>`;
}

function renderTimeLogPanel(todo) {
  const entries = timeEntriesForTodo(todo.id).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const total = totalMinutesForTodo(todo.id);
  return `
    <div class="timelog" data-todo-id="${todo.id}">
      <div class="timelog__total">${entries.length ? `${fmtDuration(total)} logged on this task` : 'No time logged yet'}</div>
      ${entries.length ? `<div class="timelog__entries">${entries.map(renderTimeEntryRow).join('')}</div>` : ''}
      <form class="timelog__form" data-action="add-time-entry" data-todo-id="${todo.id}">
        <input type="number" name="hours" min="0" step="1" placeholder="h" />
        <input type="number" name="minutes" min="0" max="59" step="1" placeholder="m" />
        <input type="text" name="note" placeholder="What did you work on? (optional)" maxlength="140" />
        <input type="date" name="date" value="${todayISO()}" />
        <button type="submit" class="btn btn--secondary btn--small">Log time</button>
      </form>
    </div>`;
}

/* ============================= renderers ============================= */

function populateClientSelects() {
  const selects = document.querySelectorAll('select[name="clientId"]');
  selects.forEach(sel => {
    const current = sel.value;
    sel.innerHTML = clientOptions(null);
    sel.value = current;
  });

  const filter = document.getElementById('todoFilter');
  const currentFilter = filter.value;
  filter.innerHTML = '<option value="all">All clients</option><option value="none">Unassigned</option>' +
    state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if ([...filter.options].some(o => o.value === currentFilter)) filter.value = currentFilter;
}

function populateCategorySelect() {
  const sel = document.getElementById('expenseCategory');
  const current = sel.value;
  sel.innerHTML = categoryOptions(current);
  if (!sel.value) sel.value = EXPENSE_CATEGORIES[0];
}

function renderMeter(container, opts) {
  // opts: value, goal, kind: 'revenue'|'expense', extra (optional trailing note)
  const pct = opts.goal > 0 ? Math.min(100, (opts.value / opts.goal) * 100) : 0;
  const isExpense = opts.kind === 'expense';
  const over = isExpense && opts.value > opts.goal;
  const fillClass = isExpense ? 'meter__fill--expense' + (over ? ' meter__fill--over' : '') : '';
  const trackClass = isExpense ? 'meter__track--expense' : '';

  let statusHtml = '';
  if (isExpense) {
    if (over) {
      statusHtml = `<div class="meter__status is-bad">⚠ ${fmtMoney(opts.value - opts.goal)} over budget</div>`;
    } else {
      statusHtml = `<div class="meter__status is-good">On budget — ${fmtMoney(opts.goal - opts.value)} of room left</div>`;
    }
  } else {
    const remaining = opts.goal - opts.value;
    statusHtml = remaining > 0
      ? `<div class="meter__status">${fmtMoney(remaining)} to goal</div>`
      : `<div class="meter__status is-good">🎉 Goal reached</div>`;
  }

  container.innerHTML = `
    <div class="meter__figure">${fmtMoney(opts.value)}</div>
    <div class="meter__sub">of ${fmtMoney(opts.goal)} goal (${Math.round(opts.goal > 0 ? (opts.value / opts.goal) * 100 : 0)}%)${opts.extra ? ' · ' + opts.extra : ''}</div>
    <div class="meter__track ${trackClass}"><div class="meter__fill ${fillClass}" style="width:${pct}%"></div></div>
    ${statusHtml}
  `;
}

function renderBars(container, items, kind) {
  if (!items.length) {
    container.innerHTML = '<div class="bars--empty">Nothing recorded yet.</div>';
    return;
  }
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const max = sorted[0].value || 1;
  const fillClass = kind === 'expense' ? 'bar-row__fill--expense' : '';
  container.innerHTML = sorted.map(item => `
    <div class="bar-row">
      <div class="bar-row__label" title="${escapeHtml(item.label)}">${escapeHtml(item.label)}</div>
      <div class="bar-row__track"><div class="bar-row__fill ${fillClass}" style="width:${Math.max(2, (item.value / max) * 100)}%"></div></div>
      <div class="bar-row__value">${fmtMoney(item.value)}</div>
    </div>
  `).join('');
}

function groupSum(entries, key, fallback) {
  const map = new Map();
  entries.forEach(e => {
    const k = e[key] || fallback || e[key];
    map.set(k, (map.get(k) || 0) + Number(e.amount));
  });
  return [...map.entries()].map(([label, value]) => ({ label, value }));
}

function entriesForCurrentMonth(entries) {
  const mk = currentMonthKey();
  return entries.filter(e => currentMonthKey(e.date) === mk);
}

function sumAmount(entries) {
  return entries.reduce((s, e) => s + Number(e.amount), 0);
}

/* ---- Home ---- */

function renderHome() {
  document.getElementById('todayLabel').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const revMonth = entriesForCurrentMonth(state.revenue.entries);
  const revActual = revMonth.filter(e => (e.status || 'actual') === 'actual');
  const revExpected = revMonth.filter(e => (e.status || 'actual') === 'expected');
  const revTotal = sumAmount(revActual);
  const revExpectedTotal = sumAmount(revExpected);
  const expMonth = entriesForCurrentMonth(state.expenses.entries);
  const expTotal = sumAmount(expMonth);

  const openTodos = state.todos.filter(t => !isTodoDone(t));
  const overdueProspects = state.prospects.filter(p => p.stage === 'reached_out' && daysSince(p.reachedOutDate) >= 7);

  const stats = [
    { label: 'Revenue this month', value: fmtMoney(revTotal), delta: `${Math.round(state.revenue.goal > 0 ? (revTotal / state.revenue.goal) * 100 : 0)}% of goal` },
    { label: 'Expenses this month', value: fmtMoney(expTotal), delta: expTotal > state.expenses.goal ? 'Over budget' : `${fmtMoney(state.expenses.goal - expTotal)} left`, bad: expTotal > state.expenses.goal },
    { label: 'Open tasks', value: openTodos.length, delta: `${state.todos.filter(t => t.recurring).length} recurring` },
    { label: 'Needs follow-up', value: overdueProspects.length, delta: `${state.prospects.length} total prospects`, bad: overdueProspects.length > 0 }
  ];

  document.getElementById('homeStats').innerHTML = stats.map(s => `
    <div class="stat">
      <div class="stat__label">${s.label}</div>
      <div class="stat__value">${s.value}</div>
      <div class="stat__delta ${s.bad ? 'is-bad' : ''}">${s.delta}</div>
    </div>
  `).join('');

  renderMeter(document.getElementById('homeRevenueMeter'), {
    value: revTotal, goal: state.revenue.goal, kind: 'revenue',
    extra: revExpectedTotal > 0 ? `+${fmtMoney(revExpectedTotal)} expected` : ''
  });
  renderMeter(document.getElementById('homeExpenseMeter'), { value: expTotal, goal: state.expenses.goal, kind: 'expense' });

  const homeTodos = openTodos.slice().sort((a, b) => (b.recurring - a.recurring)).slice(0, 6);
  document.getElementById('homeTodoList').innerHTML = homeTodos.length
    ? homeTodos.map(t => renderTodoItem(t, { showClient: true })).join('')
    : '<div class="list__empty">Nothing open. Nice.</div>';

  const homeSales = overdueProspects.slice(0, 6);
  document.getElementById('homeSalesList').innerHTML = homeSales.length
    ? homeSales.map(p => `
        <div class="task">
          <span class="task__text">${escapeHtml(p.name)}</span>
          <span class="task__chip" style="background:var(--warning-bg);color:var(--warning-text)">${daysSince(p.reachedOutDate)}d since reach out</span>
        </div>
      `).join('')
    : '<div class="list__empty">No prospects waiting on a follow-up.</div>';

  updateFollowupBanner(overdueProspects.length);
}

function updateFollowupBanner(count) {
  const banner = document.getElementById('followupBanner');
  const text = document.getElementById('followupBannerText');
  if (count > 0) {
    text.textContent = `${count} prospect${count > 1 ? 's' : ''} waiting a week or more for a follow-up.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

/* ---- To-Do ---- */

function renderTodo() {
  const filter = document.getElementById('todoFilter').value;
  let items = state.todos;
  if (filter === 'none') items = items.filter(t => !t.clientId);
  else if (filter !== 'all') items = items.filter(t => t.clientId === filter);

  items = items.slice().sort((a, b) => {
    const doneA = isTodoDone(a), doneB = isTodoDone(b);
    if (doneA !== doneB) return doneA ? 1 : -1;
    return b.createdAt - a.createdAt;
  });

  document.getElementById('todoList').innerHTML = items.length
    ? items.map(t => renderTodoItem(t, { showClient: true })).join('')
    : '<div class="list__empty">No tasks yet — add one above.</div>';
}

/* ---- Revenue ---- */

function renderRevenueEntryRow(entry) {
  if (editing.revenue === entry.id) {
    return `
      <form class="inline-edit" data-action="save-revenue-edit" data-id="${entry.id}">
        <input type="text" name="source" value="${escapeHtml(entry.source)}" required maxlength="80" data-autofocus />
        <input type="number" name="amount" value="${entry.amount}" min="0" step="0.01" required />
        <input type="date" name="date" value="${entry.date}" required />
        <label class="checkbox">
          <input type="checkbox" name="expected" ${(entry.status || 'actual') === 'expected' ? 'checked' : ''} />
          <span>Expected</span>
        </label>
        <button type="submit" class="btn btn--primary btn--small">Save</button>
        <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="revenue">Cancel</button>
      </form>`;
  }

  const status = entry.status || 'actual';
  return `
    <div class="entry-row" data-id="${entry.id}">
      <input type="checkbox" data-action="toggle-revenue-status" data-id="${entry.id}" ${status === 'actual' ? 'checked' : ''} title="Tick once the money actually lands" />
      <span class="entry-row__date">${fmtDate(entry.date)}</span>
      <span class="entry-row__name">${escapeHtml(entry.source)}</span>
      <span class="task__chip ${status === 'expected' ? 'task__chip--expected' : 'task__chip--actual'}">${status === 'expected' ? 'Expected' : 'Actual'}</span>
      <span class="entry-row__amount">${fmtMoney(entry.amount)}</span>
      <button type="button" class="btn--icon" data-action="edit-revenue" data-id="${entry.id}" title="Edit">✎</button>
      <button type="button" class="btn--icon" data-action="remove-revenue" data-id="${entry.id}" title="Remove">✕</button>
    </div>`;
}

function renderRevenue() {
  document.getElementById('revenueGoal').value = state.revenue.goal;
  document.getElementById('revenueMonthLabel').textContent = `This month — ${monthLabel()}`;

  const month = entriesForCurrentMonth(state.revenue.entries);
  const actualMonth = month.filter(e => (e.status || 'actual') === 'actual');
  const expectedMonth = month.filter(e => (e.status || 'actual') === 'expected');
  const actualTotal = sumAmount(actualMonth);
  const expectedTotal = sumAmount(expectedMonth);

  renderMeter(document.getElementById('revenueMeter'), {
    value: actualTotal, goal: state.revenue.goal, kind: 'revenue',
    extra: expectedTotal > 0 ? `+${fmtMoney(expectedTotal)} expected` : ''
  });
  renderBars(document.getElementById('revenueBars'), groupSum(actualMonth, 'source'), 'revenue');

  const potential = expectedMonth.slice().sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('potentialIncomings').innerHTML = potential.length
    ? potential.map(renderRevenueEntryRow).join('') +
      `<div class="entry-row" style="border-bottom:none"><span class="entry-row__name" style="font-weight:600">Total potential</span><span class="entry-row__amount">${fmtMoney(expectedTotal)}</span></div>`
    : '<div class="list__empty">Nothing expected right now — add income below and tick "Expected".</div>';

  const all = state.revenue.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  document.getElementById('revenueEntries').innerHTML = all.length
    ? all.map(renderRevenueEntryRow).join('')
    : '<div class="list__empty">No income logged yet.</div>';
}

/* ---- Expenses ---- */

function renderExpenseEntryRow(entry) {
  if (editing.expense === entry.id) {
    return `
      <form class="inline-edit" data-action="save-expense-edit" data-id="${entry.id}">
        <input type="text" name="name" value="${escapeHtml(entry.name)}" required maxlength="80" data-autofocus />
        <input type="number" name="amount" value="${entry.amount}" min="0" step="0.01" required />
        <input type="date" name="date" value="${entry.date}" required />
        <select name="category">${categoryOptions(entry.category || 'Other')}</select>
        <label class="checkbox">
          <input type="checkbox" name="includesGst" ${entry.includesGst ? 'checked' : ''} />
          <span>Includes GST</span>
        </label>
        <button type="submit" class="btn btn--primary btn--small">Save</button>
        <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="expense">Cancel</button>
      </form>`;
  }

  const gst = gstAmount(entry, state.expenses.gstRate);
  return `
    <div class="entry-row" data-id="${entry.id}">
      <span class="entry-row__date">${fmtDate(entry.date)}</span>
      <span class="entry-row__name">${escapeHtml(entry.name)}</span>
      <span class="task__chip">${escapeHtml(entry.category || 'Other')}</span>
      ${entry.includesGst ? `<span class="task__chip task__chip--gst">GST ${fmtMoney(gst)}</span>` : ''}
      <span class="entry-row__amount">${fmtMoney(entry.amount)}</span>
      <button type="button" class="btn--icon" data-action="edit-expense" data-id="${entry.id}" title="Edit">✎</button>
      <button type="button" class="btn--icon" data-action="remove-expense" data-id="${entry.id}" title="Remove">✕</button>
    </div>`;
}

function renderExpenses() {
  document.getElementById('expenseGoal').value = state.expenses.goal;
  document.getElementById('gstRate').value = state.expenses.gstRate;
  document.getElementById('expenseMonthLabel').textContent = `This month — ${monthLabel()}`;
  populateCategorySelect();

  const month = entriesForCurrentMonth(state.expenses.entries);
  renderMeter(document.getElementById('expenseMeter'), { value: sumAmount(month), goal: state.expenses.goal, kind: 'expense' });

  const rate = state.expenses.gstRate;
  const gstTotal = month.reduce((s, e) => s + gstAmount(e, rate), 0);
  const gstEl = document.getElementById('expenseGstStat');
  gstEl.classList.toggle('is-good', gstTotal > 0);
  gstEl.textContent = gstTotal > 0
    ? `GST reclaimable this month: ${fmtMoney(gstTotal)} (at ${rate}%)`
    : 'No GST-inclusive expenses logged this month yet.';

  renderBars(document.getElementById('expenseBars'), groupSum(month, 'category', 'Other'), 'expense');

  const all = state.expenses.entries.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  document.getElementById('expenseEntries').innerHTML = all.length
    ? all.map(renderExpenseEntryRow).join('')
    : '<div class="list__empty">No expenses logged yet.</div>';
}

/* ---- Sales ---- */

const STAGE_LABELS = { prospect: 'Prospects', reached_out: 'Reached out', follow_up: 'Follow-up', meeting: 'Meeting' };
const STAGE_ORDER = ['prospect', 'reached_out', 'follow_up', 'meeting'];

function renderProspectCard(p) {
  if (editing.prospect === p.id) {
    return `
      <div class="prospect" data-id="${p.id}">
        <form class="inline-edit" data-action="save-prospect-edit" data-id="${p.id}" style="margin:0">
          <input type="text" name="name" value="${escapeHtml(p.name)}" required maxlength="80" data-autofocus />
          <input type="text" name="notes" value="${escapeHtml(p.notes || '')}" placeholder="Notes (optional)" maxlength="140" />
          ${p.stage !== 'prospect' ? `<input type="date" name="date" value="${p.reachedOutDate || ''}" required />` : ''}
          <button type="submit" class="btn btn--primary btn--small">Save</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="prospect">Cancel</button>
        </form>
      </div>`;
  }

  const overdue = p.stage === 'reached_out' && daysSince(p.reachedOutDate) >= 7;
  const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(p.stage) + 1];
  const metaLine = p.stage === 'prospect'
    ? `Added ${fmtDate(new Date(p.createdAt || Date.now()).toISOString().slice(0, 10))}`
    : `Reached out ${fmtDate(p.reachedOutDate)} · ${daysSince(p.reachedOutDate)}d ago`;
  return `
    <div class="prospect ${overdue ? 'is-overdue' : ''}" data-id="${p.id}">
      <div class="prospect__name">${escapeHtml(p.name)}</div>
      ${p.notes ? `<div class="prospect__notes">${escapeHtml(p.notes)}</div>` : ''}
      <div class="prospect__meta">${metaLine}</div>
      ${overdue ? `<div class="prospect__flag">⚠ Follow up now</div>` : ''}
      <div class="prospect__actions">
        ${nextStage ? `<button type="button" class="btn btn--secondary" data-action="advance-prospect" data-id="${p.id}">Move to ${STAGE_LABELS[nextStage]}</button>` : ''}
        <button type="button" class="btn--icon" data-action="edit-prospect" data-id="${p.id}" title="Edit">✎</button>
        <button type="button" class="btn--icon" data-action="remove-prospect" data-id="${p.id}" title="Remove">✕</button>
      </div>
    </div>
  `;
}

function renderSales() {
  STAGE_ORDER.forEach(stage => {
    const list = state.prospects.filter(p => p.stage === stage)
      .sort((a, b) => (a.reachedOutDate || '').localeCompare(b.reachedOutDate || '') || (a.createdAt || 0) - (b.createdAt || 0));
    const el = document.querySelector(`[data-stage-list="${stage}"]`);
    el.innerHTML = list.length ? list.map(renderProspectCard).join('') : '<div class="list__empty">Empty</div>';
  });
  checkFollowupNotifications();
}

/* ---- Clients ---- */

function renderClients() {
  const container = document.getElementById('clientBoards');
  if (!state.clients.length) {
    container.innerHTML = '<div class="card"><div class="list__empty">No clients yet — add one above to give them their own task board.</div></div>';
    return;
  }
  container.innerHTML = state.clients.map(client => {
    const tasks = state.todos.filter(t => t.clientId === client.id)
      .sort((a, b) => {
        const doneA = isTodoDone(a), doneB = isTodoDone(b);
        if (doneA !== doneB) return doneA ? 1 : -1;
        return b.createdAt - a.createdAt;
      });
    const revenueFromClient = sumAmount(
      state.revenue.entries.filter(e =>
        (e.status || 'actual') === 'actual' &&
        e.source.trim().toLowerCase() === client.name.trim().toLowerCase())
    );
    const timeForClient = totalMinutesForClient(client.id);

    const headBlock = editing.client === client.id
      ? `<form class="inline-edit" data-action="save-client-edit" data-id="${client.id}" style="flex:1">
           <input type="text" name="name" value="${escapeHtml(client.name)}" required maxlength="60" data-autofocus />
           <input type="text" name="notes" value="${escapeHtml(client.notes || '')}" placeholder="Notes (optional)" maxlength="140" />
           <button type="submit" class="btn btn--primary btn--small">Save</button>
           <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="client">Cancel</button>
         </form>`
      : `<h2>${escapeHtml(client.name)}</h2>
         <div style="display:flex;gap:2px">
           <button type="button" class="btn--icon" data-action="edit-client" data-id="${client.id}" title="Edit">✎</button>
           <button type="button" class="btn--icon" data-action="remove-client" data-id="${client.id}" title="Remove client">✕</button>
         </div>`;

    return `
      <div class="clientBoard" data-id="${client.id}">
        <div class="clientBoard__head">${headBlock}</div>
        ${editing.client !== client.id && client.notes ? `<p class="clientBoard__notes">${escapeHtml(client.notes)}</p>` : ''}
        ${revenueFromClient > 0 ? `<p class="clientBoard__revenue">${fmtMoney(revenueFromClient)} in confirmed revenue all-time</p>` : ''}
        ${timeForClient > 0 ? `<p class="clientBoard__time">${fmtDuration(timeForClient)} logged all-time</p>` : ''}
        ${renderClientContext(client)}
        ${renderClientDocs(client)}
        <form class="clientBoard__form" data-action="client-todo-form" data-client-id="${client.id}">
          <input type="text" name="text" placeholder="Add a task for ${escapeHtml(client.name)}…" maxlength="200" required />
          <button type="submit" class="btn btn--secondary">Add</button>
        </form>
        <div class="list">
          ${tasks.length ? tasks.map(t => renderTodoItem(t)).join('') : '<div class="list__empty">No tasks for this client yet.</div>'}
        </div>
      </div>
    `;
  }).join('');
}

function renderClientContext(client) {
  if (editing.clientContext === client.id) {
    return `
      <form class="inline-edit" data-action="save-client-context" data-id="${client.id}" style="align-items:flex-start">
        <textarea name="context" rows="6" placeholder="Paste everything this client needs — brand voice, goals, deliverables, links, constraints…" data-autofocus>${escapeHtml(client.context || '')}</textarea>
        <div style="display:flex;gap:8px">
          <button type="submit" class="btn btn--primary btn--small">Save</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="clientContext">Cancel</button>
        </div>
      </form>`;
  }
  if (client.context) {
    return `
      <div class="clientBoard__context">
        <div class="clientBoard__sectionHead">
          <span>Context for agents</span>
          <button type="button" class="btn--icon" data-action="edit-client-context" data-id="${client.id}" title="Edit context">✎</button>
        </div>
        <p>${escapeHtml(client.context)}</p>
      </div>`;
  }
  return `<button type="button" class="btn btn--ghost btn--small" data-action="edit-client-context" data-id="${client.id}">+ Add context for agents</button>`;
}

/* ---- Client documents (stored in IndexedDB, not synced to agents) ---- */

const FILES_DB_NAME = 'bizdash_files';
const FILES_STORE = 'files';
let filesDbPromise = null;
let clientFiles = {}; // clientId -> [{id, clientId, name, type, size, addedAt}] (metadata only — blobs stay in IndexedDB)

function openFilesDb() {
  if (filesDbPromise) return filesDbPromise;
  filesDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(FILES_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        const store = db.createObjectStore(FILES_STORE, { keyPath: 'id' });
        store.createIndex('clientId', 'clientId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return filesDbPromise;
}

async function idbPut(record) {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    tx.objectStore(FILES_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(id) {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    tx.objectStore(FILES_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(id) {
  const db = await openFilesDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FILES_STORE, 'readonly').objectStore(FILES_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function loadClientFiles() {
  try {
    const all = await idbGetAll();
    const grouped = {};
    all.forEach(rec => {
      (grouped[rec.clientId] = grouped[rec.clientId] || []).push({
        id: rec.id, clientId: rec.clientId, name: rec.name, type: rec.type, size: rec.size, addedAt: rec.addedAt
      });
    });
    clientFiles = grouped;
  } catch (e) {
    console.error('Could not load client documents', e);
    clientFiles = {};
  }
  renderClients();
}

function fmtFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderClientDocs(client) {
  const files = (clientFiles[client.id] || []).slice().sort((a, b) => b.addedAt - a.addedAt);
  return `
    <div class="clientBoard__docs">
      <div class="clientBoard__sectionHead">
        <span>Documents</span>
        <label class="btn btn--ghost btn--small">+ Upload
          <input type="file" multiple data-action="upload-doc" data-client-id="${client.id}" hidden />
        </label>
      </div>
      ${files.length
        ? `<div class="docList">${files.map(f => `
            <div class="docRow" data-id="${f.id}">
              <span class="docRow__name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
              <span class="docRow__size">${fmtFileSize(f.size)}</span>
              <button type="button" class="btn--icon" data-action="download-doc" data-id="${f.id}" title="Download">⬇</button>
              <button type="button" class="btn--icon" data-action="remove-doc" data-id="${f.id}" title="Remove">✕</button>
            </div>`).join('')}</div>`
        : '<div class="list__empty">No documents yet — onboarding forms, briefs, contracts…</div>'}
    </div>`;
}

/* ---- Ideas ---- */

function renderIdeas() {
  const items = state.ideas.slice().sort((a, b) => b.createdAt - a.createdAt);
  document.getElementById('ideaList').innerHTML = items.length
    ? items.map(i => editing.idea === i.id ? `
        <form class="inline-edit" data-action="save-idea-edit" data-id="${i.id}">
          <input type="text" name="text" value="${escapeHtml(i.text)}" required maxlength="240" data-autofocus />
          <button type="submit" class="btn btn--primary btn--small">Save</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="idea">Cancel</button>
        </form>` : `
        <div class="task">
          <span class="task__text">${escapeHtml(i.text)}</span>
          <button type="button" class="btn--icon" data-action="edit-idea" data-id="${i.id}" title="Edit">✎</button>
          <button type="button" class="btn--icon" data-action="remove-idea" data-id="${i.id}" title="Remove">✕</button>
        </div>`).join('')
    : '<div class="list__empty">No ideas captured yet.</div>';
}

/* ---- Agents ---- */

const AGENTS = [
  { id: 'sales', name: 'Sales', role: 'Outreach, proposals & pipeline', color: 'var(--series-1)' },
  { id: 'email-campaigns', name: 'Email Campaigns', role: 'Newsletters & lifecycle email', color: 'var(--series-3)' },
  { id: 'website', name: 'Website', role: 'Site builds & maintenance', color: 'var(--series-7)' },
  { id: 'analytics', name: 'Analytics', role: 'Ad breakdowns & performance', color: 'var(--series-2)' },
  { id: 'design', name: 'Design', role: 'Graphic design & brand assets', color: 'var(--warning)' },
  { id: 'ops-overseer', name: 'Ops Overseer', role: 'Whole-operation view, aligned to business goals', color: 'var(--good)' }
];

let agentsLog = [];
let agentsSnapshot = null;

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function renderAgentCards() {
  document.getElementById('agentCards').innerHTML = AGENTS.map(a => {
    const entries = agentsLog.filter(e => e.agent === a.id);
    const last = entries[0];
    return `
      <div class="card agentCard">
        <div class="agentCard__dot" style="background:${a.color}"></div>
        <h3>${escapeHtml(a.name)}</h3>
        <p class="agentCard__role">${escapeHtml(a.role)}</p>
        ${last
          ? `<p class="agentCard__last">Last active ${timeAgo(last.timestamp)}<br><span class="task__chip">${escapeHtml(last.summary)}</span></p>`
          : `<p class="agentCard__last agentCard__last--empty">No activity logged yet.</p>`}
      </div>`;
  }).join('');
}

function renderAgentActivity() {
  const sorted = agentsLog.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 40);
  document.getElementById('agentActivity').innerHTML = sorted.length
    ? sorted.map(e => {
        const agent = AGENTS.find(a => a.id === e.agent);
        return `
          <div class="task">
            <span class="task__chip" style="background:${agent ? agent.color : 'var(--baseline)'};color:#fff">${escapeHtml(agent ? agent.name : e.agent)}</span>
            <span class="task__text">${escapeHtml(e.summary)}</span>
            <span class="task__chip">${timeAgo(e.timestamp)}</span>
          </div>`;
      }).join('')
    : '<div class="list__empty">No agent activity yet. Once you ask a Thryve agent to do something, it will log its work here.</div>';
}

function renderAgentsSnapshot() {
  const el = document.getElementById('agentsSnapshot');
  if (!agentsSnapshot) {
    el.innerHTML = '<div class="list__empty">data.json hasn\'t been synced yet.</div>';
    return;
  }
  const s = agentsSnapshot;
  const stats = [
    { label: 'Clients tracked', value: (s.clients || []).length },
    { label: 'Open prospects', value: (s.prospects || []).filter(p => p.stage !== 'meeting').length },
    { label: 'Open tasks', value: (s.todos || []).filter(t => !t.done).length },
    { label: 'Revenue entries', value: (s.revenue && s.revenue.entries || []).length }
  ];
  el.innerHTML = stats.map(st => `
    <div class="stat">
      <div class="stat__label">${st.label}</div>
      <div class="stat__value">${st.value}</div>
    </div>
  `).join('');
}

async function loadAgentsData() {
  try {
    const res = await fetch('./agents-log.json', { cache: 'no-store' });
    agentsLog = res.ok ? await res.json() : [];
  } catch (e) {
    agentsLog = [];
  }
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    agentsSnapshot = res.ok ? await res.json() : null;
  } catch (e) {
    agentsSnapshot = null;
  }
  renderAgentCards();
  renderAgentActivity();
  renderAgentsSnapshot();
}

/* ---- Key Links ---- */

function renderLinks() {
  const items = state.links.slice().sort((a, b) => a.label.localeCompare(b.label));
  document.getElementById('linkList').innerHTML = items.length
    ? items.map(l => editing.link === l.id ? `
        <form class="inline-edit" data-action="save-link-edit" data-id="${l.id}">
          <input type="text" name="label" value="${escapeHtml(l.label)}" required maxlength="60" data-autofocus />
          <input type="text" name="url" value="${escapeHtml(l.url)}" required />
          <button type="submit" class="btn btn--primary btn--small">Save</button>
          <button type="button" class="btn btn--ghost btn--small" data-action="cancel-edit" data-kind="link">Cancel</button>
        </form>` : `
        <div class="link-row">
          <a href="${escapeHtml(l.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(l.label)}</a>
          <span class="link-row__url">${escapeHtml(l.url.replace(/^https?:\/\//, ''))}</span>
          <button type="button" class="btn--icon" data-action="edit-link" data-id="${l.id}" title="Edit">✎</button>
          <button type="button" class="btn--icon" data-action="remove-link" data-id="${l.id}" title="Remove">✕</button>
        </div>`).join('')
    : '<div class="list__empty">No links saved yet.</div>';
}

/* ---- render all ---- */

function renderAll() {
  populateClientSelects();
  renderHome();
  renderTodo();
  renderRevenue();
  renderExpenses();
  renderSales();
  renderClients();
  renderIdeas();
  renderLinks();

  const autofocus = document.querySelector('[data-autofocus]');
  if (autofocus) autofocus.focus();
}

/* ============================= follow-up notifications ============================= */

function checkFollowupNotifications() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const today = todayISO();
  state.prospects.forEach(p => {
    if (p.stage !== 'reached_out') return;
    if (daysSince(p.reachedOutDate) < 7) return;
    if (p.notifiedAt === today) return;
    new Notification('Follow-up due', { body: `${p.name} was reached out to a week ago — time to follow up.` });
    p.notifiedAt = today;
  });
  save();
}

document.getElementById('notifyBtn').addEventListener('click', () => {
  if (!('Notification' in window)) {
    alert('This browser does not support notifications.');
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      checkFollowupNotifications();
      alert('Notifications enabled. Keep this tab open — checks run while the dashboard is loaded.');
    }
  });
});

document.getElementById('resetReachedOutBtn').addEventListener('click', () => {
  const toReset = state.prospects.filter(p => p.stage === 'reached_out');
  if (!toReset.length) {
    alert('Nothing is currently in "Reached out".');
    return;
  }
  if (!confirm(`Move all ${toReset.length} prospect${toReset.length > 1 ? 's' : ''} in "Reached out" back to "Prospects"?`)) return;
  toReset.forEach(p => {
    p.stage = 'prospect';
    p.reachedOutDate = null;
    p.notifiedAt = null;
    p.updatedAt = Date.now();
  });
  save();
  renderAll();
});

/* ============================= event wiring — add forms ============================= */

document.getElementById('todoForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  state.todos.push({
    id: uid(),
    text: data.get('text').trim(),
    done: false,
    doneWeek: null,
    recurring: !!data.get('recurring'),
    clientId: data.get('clientId') || null,
    dueDate: data.get('dueDate') || null,
    createdAt: Date.now()
  });
  save();
  form.reset();
  renderAll();
});

document.getElementById('todoFilter').addEventListener('change', renderTodo);

document.getElementById('revenueForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  state.revenue.entries.push({
    id: uid(),
    source: data.get('source').trim(),
    amount: Number(data.get('amount')),
    date: data.get('date'),
    status: data.get('expected') ? 'expected' : 'actual',
    createdAt: Date.now()
  });
  save();
  form.reset();
  document.querySelector('#revenueForm input[name="date"]').value = todayISO();
  renderAll();
});

document.getElementById('expenseForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  state.expenses.entries.push({
    id: uid(),
    name: data.get('name').trim(),
    amount: Number(data.get('amount')),
    date: data.get('date'),
    category: data.get('category') || 'Other',
    includesGst: !!data.get('includesGst'),
    createdAt: Date.now()
  });
  save();
  form.reset();
  document.querySelector('#expenseForm input[name="date"]').value = todayISO();
  renderAll();
});

// These fire on blur, which can happen a split second before a click on an
// edit/remove button elsewhere in the same list — re-rendering immediately
// would replace that button mid-click and swallow the click. Deferring the
// re-render to the next tick lets the in-flight click finish first.
document.getElementById('revenueGoal').addEventListener('change', e => {
  const value = Math.max(0, Number(e.target.value) || 0);
  setTimeout(() => {
    state.revenue.goal = value;
    save();
    renderAll();
  }, 0);
});

document.getElementById('expenseGoal').addEventListener('change', e => {
  const value = Math.max(0, Number(e.target.value) || 0);
  setTimeout(() => {
    state.expenses.goal = value;
    save();
    renderAll();
  }, 0);
});

document.getElementById('gstRate').addEventListener('change', e => {
  const value = Math.max(0, Number(e.target.value) || 0);
  setTimeout(() => {
    state.expenses.gstRate = value;
    save();
    renderAll();
  }, 0);
});

document.getElementById('prospectForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  state.prospects.push({
    id: uid(),
    name: data.get('name').trim(),
    notes: (data.get('notes') || '').trim(),
    stage: 'prospect',
    reachedOutDate: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    notifiedAt: null
  });
  save();
  form.reset();
  renderAll();
});

document.getElementById('clientForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  state.clients.push({
    id: uid(),
    name: data.get('name').trim(),
    notes: (data.get('notes') || '').trim(),
    createdAt: Date.now()
  });
  save();
  form.reset();
  renderAll();
});

document.getElementById('ideaForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  state.ideas.push({ id: uid(), text: data.get('text').trim(), createdAt: Date.now() });
  save();
  form.reset();
  renderAll();
});

document.getElementById('linkForm').addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const data = new FormData(form);
  let url = data.get('url').trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  state.links.push({ id: uid(), label: data.get('label').trim(), url, createdAt: Date.now() });
  save();
  form.reset();
  renderAll();
});

/* ============================= event wiring — edit forms (delegated) ============================= */

document.addEventListener('submit', e => {
  const form = e.target;
  const action = form.dataset.action;
  if (!action) return;

  if (action === 'client-todo-form') {
    e.preventDefault();
    const text = new FormData(form).get('text').trim();
    if (!text) return;
    state.todos.push({
      id: uid(), text, done: false, doneWeek: null, recurring: false,
      clientId: form.dataset.clientId, dueDate: null, createdAt: Date.now()
    });
    save();
    renderAll();
    return;
  }

  if (action === 'save-todo-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const todo = state.todos.find(t => t.id === form.dataset.id);
    if (todo) {
      const wasDone = isTodoDone(todo);
      todo.text = data.get('text').trim();
      todo.clientId = data.get('clientId') || null;
      todo.dueDate = data.get('dueDate') || null;
      todo.recurring = !!data.get('recurring');
      if (todo.recurring) {
        todo.doneWeek = wasDone ? isoWeekKey() : null;
      } else {
        todo.done = wasDone;
        todo.doneWeek = null;
      }
    }
    editing.todo = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-client-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const client = state.clients.find(c => c.id === form.dataset.id);
    if (client) {
      client.name = data.get('name').trim();
      client.notes = (data.get('notes') || '').trim();
    }
    editing.client = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-client-context') {
    e.preventDefault();
    const data = new FormData(form);
    const client = state.clients.find(c => c.id === form.dataset.id);
    if (client) client.context = data.get('context').trim();
    editing.clientContext = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-revenue-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const entry = state.revenue.entries.find(x => x.id === form.dataset.id);
    if (entry) {
      entry.source = data.get('source').trim();
      entry.amount = Number(data.get('amount'));
      entry.date = data.get('date');
      entry.status = data.get('expected') ? 'expected' : 'actual';
    }
    editing.revenue = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-expense-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const entry = state.expenses.entries.find(x => x.id === form.dataset.id);
    if (entry) {
      entry.name = data.get('name').trim();
      entry.amount = Number(data.get('amount'));
      entry.date = data.get('date');
      entry.category = data.get('category') || 'Other';
      entry.includesGst = !!data.get('includesGst');
    }
    editing.expense = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-prospect-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const p = state.prospects.find(x => x.id === form.dataset.id);
    if (p) {
      p.name = data.get('name').trim();
      p.notes = (data.get('notes') || '').trim();
      if (data.has('date')) p.reachedOutDate = data.get('date');
    }
    editing.prospect = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-idea-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const idea = state.ideas.find(x => x.id === form.dataset.id);
    if (idea) idea.text = data.get('text').trim();
    editing.idea = null;
    save();
    renderAll();
    return;
  }

  if (action === 'save-link-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const link = state.links.find(x => x.id === form.dataset.id);
    if (link) {
      link.label = data.get('label').trim();
      let url = data.get('url').trim();
      if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      link.url = url;
    }
    editing.link = null;
    save();
    renderAll();
    return;
  }

  if (action === 'add-time-entry') {
    e.preventDefault();
    const data = new FormData(form);
    const totalMinutes = (Number(data.get('hours')) || 0) * 60 + (Number(data.get('minutes')) || 0);
    if (totalMinutes <= 0) {
      alert('Enter how long this took (hours and/or minutes).');
      return;
    }
    state.timeEntries.push({
      id: uid(),
      todoId: form.dataset.todoId,
      minutes: totalMinutes,
      date: data.get('date') || todayISO(),
      note: (data.get('note') || '').trim(),
      createdAt: Date.now()
    });
    save();
    renderAll();
    return;
  }

  if (action === 'save-time-edit') {
    e.preventDefault();
    const data = new FormData(form);
    const entry = state.timeEntries.find(x => x.id === form.dataset.id);
    if (entry) {
      const totalMinutes = (Number(data.get('hours')) || 0) * 60 + (Number(data.get('minutes')) || 0);
      if (totalMinutes <= 0) {
        alert('Enter how long this took (hours and/or minutes).');
        return;
      }
      entry.minutes = totalMinutes;
      entry.note = (data.get('note') || '').trim();
      entry.date = data.get('date') || entry.date;
    }
    editing.timeEntry = null;
    save();
    renderAll();
    return;
  }
});

/* ============================= delegated clicks & changes ============================= */

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === 'remove-todo') { removeTodo(id); }
  else if (action === 'remove-revenue') { state.revenue.entries = state.revenue.entries.filter(x => x.id !== id); save(); renderAll(); }
  else if (action === 'remove-expense') { state.expenses.entries = state.expenses.entries.filter(x => x.id !== id); save(); renderAll(); }
  else if (action === 'remove-idea') { state.ideas = state.ideas.filter(x => x.id !== id); save(); renderAll(); }
  else if (action === 'remove-link') { state.links = state.links.filter(x => x.id !== id); save(); renderAll(); }
  else if (action === 'remove-client') {
    if (confirm('Remove this client? Their tasks will become unassigned, not deleted. Any uploaded documents for this client will be deleted.')) {
      state.clients = state.clients.filter(x => x.id !== id);
      state.todos.forEach(t => { if (t.clientId === id) t.clientId = null; });
      const filesToDelete = clientFiles[id] || [];
      delete clientFiles[id];
      filesToDelete.forEach(f => idbDelete(f.id));
      save();
      renderAll();
    }
  }
  else if (action === 'remove-prospect') { state.prospects = state.prospects.filter(x => x.id !== id); save(); renderAll(); }
  else if (action === 'advance-prospect') {
    const p = state.prospects.find(x => x.id === id);
    if (p) {
      const next = STAGE_ORDER[STAGE_ORDER.indexOf(p.stage) + 1];
      if (next) {
        p.stage = next;
        p.updatedAt = Date.now();
        if (next === 'reached_out' && !p.reachedOutDate) p.reachedOutDate = todayISO();
      }
      save();
      renderAll();
    }
  }
  else if (action === 'edit-todo') { editing.todo = id; renderAll(); }
  else if (action === 'edit-client') { editing.client = id; renderAll(); }
  else if (action === 'edit-revenue') { editing.revenue = id; renderAll(); }
  else if (action === 'edit-expense') { editing.expense = id; renderAll(); }
  else if (action === 'edit-prospect') { editing.prospect = id; renderAll(); }
  else if (action === 'edit-idea') { editing.idea = id; renderAll(); }
  else if (action === 'edit-link') { editing.link = id; renderAll(); }
  else if (action === 'toggle-timelog') { expandedTimeLog = expandedTimeLog === id ? null : id; renderAll(); }
  else if (action === 'edit-time-entry') { editing.timeEntry = id; renderAll(); }
  else if (action === 'remove-time-entry') { state.timeEntries = state.timeEntries.filter(x => x.id !== id); save(); renderAll(); }
  else if (action === 'edit-client-context') { editing.clientContext = id; renderAll(); }
  else if (action === 'download-doc') {
    idbGet(id).then(rec => {
      if (!rec) return;
      const url = URL.createObjectURL(rec.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = rec.name;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
  else if (action === 'remove-doc') {
    if (confirm('Remove this document? This cannot be undone.')) {
      Object.keys(clientFiles).forEach(cid => {
        clientFiles[cid] = clientFiles[cid].filter(f => f.id !== id);
      });
      idbDelete(id).then(renderClients);
    }
  }
  else if (action === 'cancel-edit') { editing[btn.dataset.kind] = null; renderAll(); }
});

document.addEventListener('change', e => {
  if (e.target.matches('[data-action="toggle-todo"]')) {
    toggleTodo(e.target.dataset.id);
  } else if (e.target.matches('[data-action="toggle-revenue-status"]')) {
    const entry = state.revenue.entries.find(x => x.id === e.target.dataset.id);
    if (entry) {
      entry.status = e.target.checked ? 'actual' : 'expected';
      save();
      renderAll();
    }
  } else if (e.target.matches('[data-action="upload-doc"]')) {
    const clientId = e.target.dataset.clientId;
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    Promise.all(files.map(async file => {
      const id = uid();
      const addedAt = Date.now();
      await idbPut({ id, clientId, name: file.name, type: file.type, size: file.size, addedAt, blob: file });
      (clientFiles[clientId] = clientFiles[clientId] || []).push({ id, clientId, name: file.name, type: file.type, size: file.size, addedAt });
    })).then(renderClients);
  }
});

/* ============================= theme toggle ============================= */

function applyTheme(theme) {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  else document.documentElement.removeAttribute('data-theme');
}

const savedTheme = localStorage.getItem('bizdash_theme');
applyTheme(savedTheme);

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentlyDark = current ? current === 'dark' : prefersDark;
  const next = currentlyDark ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('bizdash_theme', next);
});

/* ============================= data modal (backup/restore) ============================= */

const dataModal = document.getElementById('dataModal');
document.getElementById('dataBtn').addEventListener('click', () => { dataModal.hidden = false; });
document.getElementById('dataClose').addEventListener('click', () => { dataModal.hidden = true; });
dataModal.addEventListener('click', e => { if (e.target === dataModal) dataModal.hidden = true; });

document.getElementById('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `business-dashboard-backup-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('importBtn').addEventListener('click', () => {
  document.getElementById('importFile').click();
});

document.getElementById('importFile').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!confirm('Import this backup? It will replace all data currently in the dashboard.')) return;
      state = Object.assign(defaultState(), parsed, {
        revenue: Object.assign({ goal: 10000, entries: [] }, parsed.revenue),
        expenses: Object.assign({ goal: 1000, gstRate: 10, entries: [] }, parsed.expenses)
      });
      save();
      renderAll();
      dataModal.hidden = true;
    } catch (err) {
      alert('Could not read that file — is it a valid dashboard backup?');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

document.getElementById('resetBtn').addEventListener('click', () => {
  if (confirm('Erase everything? This cannot be undone unless you have an exported backup.')) {
    state = defaultState();
    save();
    renderAll();
    dataModal.hidden = true;
  }
});

/* ============================= init ============================= */

document.querySelector('#revenueForm input[name="date"]').value = todayISO();
document.querySelector('#expenseForm input[name="date"]').value = todayISO();

renderAll();
loadAgentsData();
loadClientFiles();
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}
setInterval(checkFollowupNotifications, 60 * 60 * 1000);

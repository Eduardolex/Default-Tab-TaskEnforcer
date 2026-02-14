// ============================================================
// newtab.js — Task Tab: New Tab task manager (no frameworks)
// ============================================================

const $ = (sel) => document.querySelector(sel);

// DOM references
const taskInput = $("#task-input");
const taskList = $("#task-list");
const remainingCount = $("#remaining-count");
const clearCompletedBtn = $("#clear-completed-btn");
const reviewBanner = $("#review-banner");
const markReviewedBtn = $("#mark-reviewed-btn");
const badgeToggle = $("#badge-toggle");

// ---- Storage helpers ----

/** Read a key from chrome.storage.local. Returns undefined if missing. */
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]));
  });
}

/** Write one or more key-value pairs to chrome.storage.local. */
function storageSet(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set(obj, resolve);
  });
}

// ---- Task CRUD ----

/** Load the tasks array from storage (defaults to []). */
async function loadTasks() {
  return (await storageGet("tasks")) || [];
}

/** Persist the tasks array and re-render everything. */
async function saveTasks(tasks) {
  await storageSet({ tasks });
  render(tasks);
  updateBadge(tasks);
  await snapshotToday(tasks);
}

/** Create a new task object. */
function createTask(text) {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    done: false,
    createdAt: new Date().toISOString(),
  };
}

// ---- Rendering ----

/** Build the full task list UI from the tasks array. */
function render(tasks) {
  taskList.innerHTML = "";

  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = "task-item" + (task.done ? " done" : "");
    li.dataset.id = task.id;

    // Checkbox
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = task.done;
    checkbox.addEventListener("change", () => toggleTask(task.id));

    // Text
    const span = document.createElement("span");
    span.className = "task-text";
    span.textContent = task.text;

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "\u00d7"; // multiplication sign (×)
    delBtn.title = "Delete task";
    delBtn.addEventListener("click", () => deleteTask(task.id));

    li.append(checkbox, span, delBtn);
    taskList.appendChild(li);
  });

  // Update remaining count
  const remaining = tasks.filter((t) => !t.done).length;
  remainingCount.textContent =
    remaining === 1 ? "1 remaining" : `${remaining} remaining`;
}

// ---- Task actions ----

async function addTask(text) {
  if (!text.trim()) return;
  const tasks = await loadTasks();
  tasks.push(createTask(text));
  await saveTasks(tasks);
  taskInput.value = "";
}

async function toggleTask(id) {
  const tasks = await loadTasks();
  const task = tasks.find((t) => t.id === id);
  if (task) task.done = !task.done;
  await saveTasks(tasks);
}

async function deleteTask(id) {
  let tasks = await loadTasks();
  tasks = tasks.filter((t) => t.id !== id);
  await saveTasks(tasks);
}

async function clearCompleted() {
  let tasks = await loadTasks();
  tasks = tasks.filter((t) => !t.done);
  await saveTasks(tasks);
}

/** Delete the last non-done task in the list (Ctrl+Backspace shortcut). */
async function deleteLastTask() {
  const tasks = await loadTasks();
  // Find the last task that is NOT done
  for (let i = tasks.length - 1; i >= 0; i--) {
    if (!tasks[i].done) {
      tasks.splice(i, 1);
      await saveTasks(tasks);
      return;
    }
  }
}

// ---- Badge ----

/** Tell the service worker to update (or clear) the badge. */
async function updateBadge(tasks) {
  const enabled = await storageGet("badgeEnabled");
  const remaining = tasks.filter((t) => !t.done).length;

  // Send message to service worker; it may not be alive, so catch errors.
  try {
    chrome.runtime.sendMessage({
      type: "UPDATE_BADGE",
      count: enabled ? remaining : null,
    });
  } catch {
    // Service worker not available — no-op.
  }
}

// ---- Calendar & Streak ----

const calendarToggle = $("#calendar-toggle");
const calendarPanel = $("#calendar-panel");
const calDays = $("#cal-days");
const calMonthLabel = $("#cal-month-label");
const calPrev = $("#cal-prev");
const calNext = $("#cal-next");
const streakCurrent = $("#streak-current");
const streakBest = $("#streak-best");
const dayDetailPopup = $("#day-detail-popup");
const dayDetailOverlay = $("#day-detail-overlay");
const dayDetailDate = $("#day-detail-date");
const dayDetailTasks = $("#day-detail-tasks");
const dayDetailClose = $("#day-detail-close");

let calYear, calMonth; // currently displayed month
let dailyHistory = {};

/** Snapshot today's task state into dailyHistory. */
async function snapshotToday(tasks) {
  dailyHistory = (await storageGet("dailyHistory")) || {};
  const today = todayString();
  const simplified = tasks.map((t) => ({ text: t.text, done: t.done }));
  const allDone = tasks.length > 0 && tasks.every((t) => t.done);
  dailyHistory[today] = { tasks: simplified, allDone };
  await storageSet({ dailyHistory });
  updateStreak();
  if (!calendarPanel.classList.contains("hidden")) {
    renderCalendar(calYear, calMonth);
  }
}

/** Load dailyHistory from storage. */
async function loadHistory() {
  dailyHistory = (await storageGet("dailyHistory")) || {};
}

/** Calculate streak from dailyHistory walking backwards. */
function calculateStreak() {
  const dates = Object.keys(dailyHistory).sort();
  if (dates.length === 0) return { current: 0, best: 0 };

  // Walk backwards from today
  let current = 0;
  const d = new Date();
  // Check today first
  const todayKey = todayString();
  if (dailyHistory[todayKey] && dailyHistory[todayKey].allDone) {
    current = 1;
    d.setDate(d.getDate() - 1);
  } else {
    // Maybe the streak ended yesterday
    d.setDate(d.getDate() - 1);
  }

  while (true) {
    const key = formatDate(d);
    if (dailyHistory[key] && dailyHistory[key].allDone) {
      current++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Calculate best streak ever
  let best = 0;
  let run = 0;
  const allDates = dates.slice().sort();
  for (let i = 0; i < allDates.length; i++) {
    if (dailyHistory[allDates[i]].allDone) {
      // Check if consecutive from previous
      if (i === 0) {
        run = 1;
      } else {
        const prev = new Date(allDates[i - 1] + "T00:00:00");
        const curr = new Date(allDates[i] + "T00:00:00");
        const diff = (curr - prev) / (1000 * 60 * 60 * 24);
        if (diff === 1 && dailyHistory[allDates[i - 1]].allDone) {
          run++;
        } else {
          run = 1;
        }
      }
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }

  return { current, best: Math.max(best, current) };
}

/** Format a Date object as YYYY-MM-DD. */
function formatDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Update the streak display. */
function updateStreak() {
  const { current, best } = calculateStreak();
  streakCurrent.textContent = current > 0 ? `\u{1F525} ${current} day streak` : "No streak yet";
  streakBest.textContent = best > 0 ? `Best: ${best}` : "";
}

/** Render the calendar grid for a given year/month. */
function renderCalendar(year, month) {
  calYear = year;
  calMonth = month;

  const monthNames = ["January","February","March","April","May","June",
    "July","August","September","October","November","December"];
  calMonthLabel.textContent = `${monthNames[month]} ${year}`;

  calDays.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = todayString();

  // Empty cells for days before the 1st
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement("div");
    empty.className = "cal-day empty";
    calDays.appendChild(empty);
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-day";
    cell.textContent = day;

    if (dateStr === todayKey) cell.classList.add("today");

    const entry = dailyHistory[dateStr];
    if (entry) {
      cell.classList.add("has-data");
      cell.classList.add(entry.allDone ? "all-done" : "not-all-done");
      cell.addEventListener("click", () => showDayDetail(dateStr));
    }

    calDays.appendChild(cell);
  }
}

/** Show the day detail popup for a given date. */
function showDayDetail(dateStr) {
  const entry = dailyHistory[dateStr];
  if (!entry) return;

  // Format date nicely
  const d = new Date(dateStr + "T00:00:00");
  const opts = { weekday: "long", year: "numeric", month: "long", day: "numeric" };
  dayDetailDate.textContent = d.toLocaleDateString(undefined, opts);

  dayDetailTasks.innerHTML = "";
  entry.tasks.forEach((t) => {
    const li = document.createElement("li");
    li.className = "day-detail-task" + (t.done ? " is-done" : "");

    const icon = document.createElement("span");
    icon.className = "status-icon " + (t.done ? "done" : "not-done");
    icon.textContent = t.done ? "\u2713" : "\u2717";

    const label = document.createElement("span");
    label.className = "task-label";
    label.textContent = t.text;

    li.append(icon, label);
    dayDetailTasks.appendChild(li);
  });

  dayDetailPopup.classList.remove("hidden");
  dayDetailOverlay.classList.remove("hidden");
}

/** Close the day detail popup. */
function closeDayDetail() {
  dayDetailPopup.classList.add("hidden");
  dayDetailOverlay.classList.add("hidden");
}

// Calendar navigation
calPrev.addEventListener("click", () => {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar(calYear, calMonth);
});

calNext.addEventListener("click", () => {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar(calYear, calMonth);
});

// Toggle calendar
calendarToggle.addEventListener("click", () => {
  const isHidden = calendarPanel.classList.toggle("hidden");
  calendarToggle.classList.toggle("active", !isHidden);
  if (!isHidden) {
    renderCalendar(calYear, calMonth);
  }
});

// Close day detail
dayDetailClose.addEventListener("click", closeDayDetail);
dayDetailOverlay.addEventListener("click", closeDayDetail);

// ---- Daily review ----

/** Return today's date as YYYY-MM-DD in local time. */
function todayString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Show or hide the review banner depending on lastReviewedDate. */
async function checkReview() {
  const lastReviewed = await storageGet("lastReviewedDate");
  if (lastReviewed === todayString()) {
    reviewBanner.classList.add("hidden");
  } else {
    reviewBanner.classList.remove("hidden");
  }
}

async function markReviewed() {
  await storageSet({ lastReviewedDate: todayString() });
  reviewBanner.classList.add("hidden");
}

// ---- Keyboard shortcuts ----

taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    addTask(taskInput.value);
  }
  if (e.key === "Escape") {
    taskInput.value = "";
  }
});

document.addEventListener("keydown", (e) => {
  // Escape — close day detail popup
  if (e.key === "Escape" && !dayDetailPopup.classList.contains("hidden")) {
    closeDayDetail();
    return;
  }
  // Ctrl+Backspace — delete last incomplete task
  if (e.ctrlKey && e.key === "Backspace") {
    // Only fire when the input is NOT focused (avoid interfering with typing)
    if (document.activeElement !== taskInput) {
      e.preventDefault();
      deleteLastTask();
    }
  }
});

// ---- Event listeners ----

clearCompletedBtn.addEventListener("click", clearCompleted);
markReviewedBtn.addEventListener("click", markReviewed);

// Badge toggle
badgeToggle.addEventListener("change", async () => {
  await storageSet({ badgeEnabled: badgeToggle.checked });
  const tasks = await loadTasks();
  updateBadge(tasks);
});

// ---- Init ----

(async function init() {
  const tasks = await loadTasks();
  render(tasks);

  // Restore badge toggle state
  const badgeEnabled = await storageGet("badgeEnabled");
  badgeToggle.checked = !!badgeEnabled;

  // Check daily review
  await checkReview();

  // Ensure badge is up-to-date on open
  updateBadge(tasks);

  // Calendar init
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
  await loadHistory();
  await snapshotToday(tasks);
  updateStreak();
})();

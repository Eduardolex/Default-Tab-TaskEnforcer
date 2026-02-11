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
})();

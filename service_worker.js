// ============================================================
// service_worker.js — Handles extension badge updates
// ============================================================

// Listen for messages from newtab.js to update the action badge.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "UPDATE_BADGE") return;

  if (msg.count === null || msg.count === undefined) {
    // Badge disabled — clear it
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  const count = msg.count;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#3a7a4a" });
});

// Also refresh the badge whenever storage changes (e.g. tasks edited),
// so the badge stays accurate even if the new tab isn't open.
chrome.storage.onChanged.addListener(async (changes) => {
  if (!changes.tasks) return;

  const { badgeEnabled } = await chrome.storage.local.get("badgeEnabled");
  if (!badgeEnabled) {
    chrome.action.setBadgeText({ text: "" });
    return;
  }

  const tasks = changes.tasks.newValue || [];
  const remaining = tasks.filter((t) => !t.done).length;
  chrome.action.setBadgeText({ text: remaining > 0 ? String(remaining) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#3a7a4a" });
});

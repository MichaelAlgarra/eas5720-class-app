/**
 * Backend for the "What Works for Mom" log. Paste this into a Google Sheet's
 * Extensions > Apps Script editor, then Deploy > New deployment > Web app (see README.md).
 * Nothing needs editing: the tabs are created on first use, and the first code entered
 * in the app becomes the family code (stored in Script Properties, not in this file).
 *
 * Everything the family writes lives in this Sheet, never in the public repo.
 */

const CODE_PROPERTY = 'PASSCODE';
const MIN_CODE_LENGTH = 4;

const LOG_SHEET = 'Log';
const TIPS_SHEET = 'Tips';
const LOG_HEADERS = ['Saved at', 'Entry ID', 'Who', 'Music', 'Memory box', 'Slow, warm voice',
                     'Mood', 'Meals', 'Nap', 'Things to avoid', 'Anything else'];
const CHOICES = {
  music: ['worked', 'didnt', 'not_tried'],
  memory_box: ['worked', 'didnt', 'not_tried'],
  voice: ['worked', 'didnt', 'not_tried'],
  mood: ['calm', 'okay', 'restless', 'upset'],
  meals: ['all', 'some', 'little', 'none'],
  nap: ['yes', 'no'],
};
const MAX_TEXT = 500;
const MAX_ENTRIES_RETURNED = 200;

/** Creates the Log and Tips tabs if they are missing. Runs automatically; safe to run by hand. */
function setup() {
  const ss = SpreadsheetApp.getActive();
  let log = ss.getSheetByName(LOG_SHEET);
  if (!log) log = ss.insertSheet(LOG_SHEET);
  if (log.getLastRow() === 0) {
    log.appendRow(LOG_HEADERS);
    log.setFrozenRows(1);
  }
  let tips = ss.getSheetByName(TIPS_SHEET);
  if (!tips) tips = ss.insertSheet(TIPS_SHEET);
  if (tips.getLastRow() === 0) {
    tips.appendRow(['Try this', 'How to do it']);
    tips.appendRow(['Her songs', 'Which playlist and which speaker or phone to use']);
    tips.appendRow(['The memory box', 'Where it is kept']);
    tips.appendRow(['Slow, warm voice', 'Make eye contact before touching her. Don\'t correct her, go along with her.']);
    tips.setFrozenRows(1);
  }
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out({ ok: false, error: 'bad_request' }); }
  return out(handle(body));
}

// GET only reports that the service is up; it never returns data, so the passcode never sits in a URL.
function doGet() {
  return out({ ok: true, service: 'what-works-log' });
}

function handle(body) {
  const code = String(body.code || '');
  const props = PropertiesService.getScriptProperties();
  let saved = props.getProperty(CODE_PROPERTY);
  if (!saved) {
    // First connection after deploying: this code becomes the family code.
    if (code.length < MIN_CODE_LENGTH) return { ok: false, error: 'code_too_short' };
    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      saved = props.getProperty(CODE_PROPERTY);
      if (!saved) { props.setProperty(CODE_PROPERTY, code); saved = code; }
    } finally {
      lock.releaseLock();
    }
  }
  if (code !== saved) return { ok: false, error: 'bad_code' };
  setup();
  if (body.action === 'list') return { ok: true, entries: listEntries(), tips: listTips() };
  if (body.action === 'add') return addEntry(body.entry || {});
  return { ok: false, error: 'unknown_action' };
}

function addEntry(entry) {
  const who = clean(entry.who, 40);
  if (!who) return { ok: false, error: 'who_required' };
  const id = clean(entry.id, 64);
  if (!id) return { ok: false, error: 'id_required' };
  const row = [new Date(), id, who];
  for (const key of ['music', 'memory_box', 'voice', 'mood', 'meals', 'nap']) {
    const v = String(entry[key] || '');
    if (v && CHOICES[key].indexOf(v) === -1) return { ok: false, error: 'bad_value', field: key };
    row.push(v);
  }
  row.push(clean(entry.avoid, MAX_TEXT), clean(entry.notes, MAX_TEXT));

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = logSheet();
    // The app retries entries saved while offline; skip one we already have.
    const last = sheet.getLastRow();
    if (last > 1) {
      const start = Math.max(2, last - 199);
      const ids = sheet.getRange(start, 2, last - start + 1, 1).getValues();
      if (ids.some(function (r) { return r[0] === id; })) return { ok: true, duplicate: true };
    }
    sheet.appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true };
}

function listEntries() {
  const sheet = logSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - MAX_ENTRIES_RETURNED + 1);
  const rows = sheet.getRange(start, 1, last - start + 1, LOG_HEADERS.length).getValues();
  return rows.reverse().map(function (r) {
    return {
      saved_at: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      id: String(r[1]), who: String(r[2]),
      music: String(r[3]), memory_box: String(r[4]), voice: String(r[5]),
      mood: String(r[6]), meals: String(r[7]), nap: String(r[8]),
      avoid: unescapeCell(r[9]), notes: unescapeCell(r[10]),
    };
  });
}

function listTips() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(TIPS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return { title: String(r[0]), how: String(r[1]) }; });
}

function logSheet() {
  return SpreadsheetApp.getActive().getSheetByName(LOG_SHEET);
}

// Trim, cap length, and stop text like "=SUM(...)" from being read as a spreadsheet formula.
function clean(v, max) {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function unescapeCell(v) {
  const s = String(v);
  return s.charAt(0) === "'" ? s.slice(1) : s;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

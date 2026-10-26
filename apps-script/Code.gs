/**
 * Drop-in Google Apps Script for the 3R on-call roster.
 *
 * Paste this whole file into the existing script project as Code.gs.
 * Step-by-step instructions for Ross are in apps-script/SETUP.md.
 *
 * ---------------------------------------------------------------------------
 * Assumptions (read these before trusting the sheet)
 * ---------------------------------------------------------------------------
 * The live web app's action=get JSON was observed. It is NOT the spreadsheet
 * layout. Tab names, column order, and which file is bound to the script
 * cannot be inferred safely from that JSON. This file therefore does not
 * read, rename, or delete unknown tabs. After you paste it, the roster looks
 * empty until you import a JSON backup into the tabs listed below.
 *
 * Data shape the page already expects, taken from action=get and index.html:
 *   slots[i]  { primary: string|null, days: {Mon..Sun: string}, note: string, locked: boolean }
 *   techs     string[]
 *   log[]     { t, tech, wk, dates, action, type }  newest first
 *   settings  { managerEmail, notifyEmail: boolean, prize1, prize2, prize3 }
 * Week index 0 is Monday 2026-04-13. The page sends that index as wi.
 * Log dates use a hyphen (Apr 13-19), which is what the existing log stores.
 * Holiday primary lines look like "Claimed primary + 18 pts + $50 holiday bonus"
 * and use type "holiday". A week with two holidays still scores once.
 * notifyEmail comes back as a real boolean. The page sends the string "true"
 * or "false" when saving settings.
 * clear_all keeps techs and settings, and blanks slots and the log.
 * The page only sends GET. Unknown query parameters are ignored.
 * Names are kept as typed, including names longer than a typical first name.
 * The activity log keeps the newest 500 lines. The backup that was read had 114.
 * Log times, date ranges, and notes are written as plain text. A time such as
 * "Apr 14, 7:05 PM" must not be stored as a spreadsheet date, or the page
 * would show a different string after the next save.
 *
 * Tabs this script owns (created if missing; refused if the header row differs):
 *   RosterSlots, RosterTechs, RosterLog, RosterSettings, RosterImport
 *
 * Script Properties:
 *   REQUIRE_TOKEN   false until Ross turns the check on. true / yes / on / 1 enforce it.
 *   ROSTER_TOKEN    shared secret. Compared to the token query parameter.
 *   SPREADSHEET_ID  optional. Only needed if this project is not bound to the sheet.
 *
 * The token check is off when REQUIRE_TOKEN is missing or not a true value,
 * so the current website keeps working after the paste. clear_all always
 * requires confirm=CLEAR, including while the token check is off.
 * ---------------------------------------------------------------------------
 */

var ROSTER_CONFIG = {
  startDate: '2026-04-13',
  rotationDays: 7,
  companyHolidays: ['mothers-day', 'fathers-day']
};

var SCORING = { primary: 10, backupDay: 2, holidayPrimary: 8, holidayDay: 4 };
var MAX_WEEK_INDEX = 779;
var MAX_LOG = 500;
var DAY_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

var SHEET_SLOTS = 'RosterSlots';
var SHEET_TECHS = 'RosterTechs';
var SHEET_LOG = 'RosterLog';
var SHEET_SETTINGS = 'RosterSettings';
var SHEET_IMPORT = 'RosterImport';

var SLOT_HEADERS = ['WeekIndex', 'Primary', 'Note', 'Locked', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
var TECH_HEADERS = ['Name'];
var LOG_HEADERS = ['Time', 'Tech', 'Week', 'Dates', 'Action', 'Type'];
var SETTING_HEADERS = ['Key', 'Value'];

var DEFAULT_SETTINGS = {
  managerEmail: '',
  notifyEmail: true,
  prize1: '$250 end-of-period bonus',
  prize2: '$100 end-of-period bonus',
  prize3: '$50 end-of-period bonus'
};

function pad(n) {
  return (n < 10 ? '0' : '') + n;
}

function parseISO(isoDate) {
  var parts = String(isoDate || '').split('-');
  if (parts.length !== 3) throw new Error('Expected a YYYY-MM-DD date');
  return new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
}

function iso(date) {
  return date.getUTCFullYear() + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate());
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

function utcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function nthWeekday(year, month, weekday, n) {
  var firstDow = utcDate(year, month, 1).getUTCDay();
  var day = 1 + ((weekday - firstDow + 7) % 7) + (n - 1) * 7;
  return utcDate(year, month, day);
}

function lastWeekday(year, month, weekday) {
  var last = new Date(Date.UTC(year, month, 0));
  var day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return utcDate(year, month, day);
}

function observedDate(official) {
  var dow = official.getUTCDay();
  if (dow === 6) return addDays(official, -1);
  if (dow === 0) return addDays(official, 1);
  return official;
}

function federalHolidays(year) {
  return [
    { name: "New Year's Day", official: utcDate(year, 1, 1) },
    { name: 'Martin Luther King Jr. Day', official: nthWeekday(year, 1, 1, 3) },
    { name: 'Presidents Day', official: nthWeekday(year, 2, 1, 3) },
    { name: 'Memorial Day', official: lastWeekday(year, 5, 1) },
    { name: 'Juneteenth', official: utcDate(year, 6, 19) },
    { name: 'Independence Day', official: utcDate(year, 7, 4) },
    { name: 'Labor Day', official: nthWeekday(year, 9, 1, 1) },
    { name: 'Columbus Day', official: nthWeekday(year, 10, 1, 2) },
    { name: 'Veterans Day', official: utcDate(year, 11, 11) },
    { name: 'Thanksgiving', official: nthWeekday(year, 11, 4, 4) },
    { name: 'Christmas Day', official: utcDate(year, 12, 25) }
  ];
}

function companyHolidayDates(year, which) {
  var list = which || [];
  var out = [];
  if (list.indexOf('mothers-day') >= 0) out.push({ name: "Mother's Day", official: nthWeekday(year, 5, 0, 2) });
  if (list.indexOf('fathers-day') >= 0) out.push({ name: "Father's Day", official: nthWeekday(year, 6, 0, 3) });
  return out;
}

function asEvent(item, shiftWeekend) {
  var official = iso(item.official);
  var dates = [official];
  if (shiftWeekend) {
    var observed = iso(observedDate(item.official));
    if (observed !== official) dates = [official, observed].sort();
  }
  return { name: item.name, official: official, dates: dates };
}

function holidayEvents(yearStart, yearEnd) {
  var events = [];
  for (var year = yearStart; year <= yearEnd; year++) {
    federalHolidays(year).forEach(function (item) { events.push(asEvent(item, true)); });
    companyHolidayDates(year, ROSTER_CONFIG.companyHolidays).forEach(function (item) { events.push(asEvent(item, false)); });
  }
  events.sort(function (a, b) {
    if (a.dates[0] < b.dates[0]) return -1;
    if (a.dates[0] > b.dates[0]) return 1;
    if (a.official < b.official) return -1;
    if (a.official > b.official) return 1;
    return 0;
  });
  return events;
}

function holidayLabel(events, startIso, endIso) {
  var names = [];
  events.forEach(function (ev) {
    var hits = ev.dates.filter(function (d) { return d >= startIso && d <= endIso; });
    if (!hits.length) return;
    var officialInWeek = hits.indexOf(ev.official) >= 0;
    var label = officialInWeek ? ev.name : ev.name + ' (observed)';
    if (names.indexOf(label) < 0) names.push(label);
  });
  return names.length ? names.join(', ') : null;
}

function formatLogDates(start, end) {
  var sm = MONTHS[start.getUTCMonth()];
  var em = MONTHS[end.getUTCMonth()];
  var sd = start.getUTCDate();
  var ed = end.getUTCDate();
  var sy = start.getUTCFullYear();
  var ey = end.getUTCFullYear();
  if (sy !== ey) return sm + ' ' + sd + ', ' + sy + '-' + em + ' ' + ed + ', ' + ey;
  if (start.getUTCMonth() !== end.getUTCMonth()) return sm + ' ' + sd + '-' + em + ' ' + ed;
  return sm + ' ' + sd + '-' + ed;
}

function weekAt(index) {
  var start = addDays(parseISO(ROSTER_CONFIG.startDate), index * ROSTER_CONFIG.rotationDays);
  var end = addDays(start, ROSTER_CONFIG.rotationDays - 1);
  var startIso = iso(start);
  var endIso = iso(end);
  var events = holidayEvents(start.getUTCFullYear() - 1, end.getUTCFullYear() + 1);
  return {
    index: index,
    label: 'Week ' + (index + 1),
    dates: formatLogDates(start, end),
    start: startIso,
    end: endIso,
    holiday: holidayLabel(events, startIso, endIso)
  };
}

function pointsFor(role, isHoliday) {
  if (role === 'primary') return SCORING.primary + (isHoliday ? SCORING.holidayPrimary : 0);
  if (role === 'backup' || role === 'day') return SCORING.backupDay + (isHoliday ? SCORING.holidayDay : 0);
  return 0;
}

function emptySlot() {
  return { primary: null, days: {}, note: '', locked: false };
}

function sanitizeSlot(slot) {
  var src = slot && typeof slot === 'object' ? slot : {};
  var days = {};
  var rawDays = src.days;
  if (rawDays && typeof rawDays === 'object' && !Array.isArray(rawDays)) {
    Object.keys(rawDays).forEach(function (day) {
      if (DAY_KEYS.indexOf(day) >= 0 && rawDays[day]) days[day] = String(rawDays[day]).trim();
    });
  }
  return {
    primary: src.primary ? String(src.primary).trim() : null,
    days: days,
    note: src.note == null ? '' : String(src.note),
    locked: src.locked === true || String(src.locked).toLowerCase() === 'true'
  };
}

function asBool(value, fallback) {
  if (value === true || value === false) return value;
  var text = String(value == null ? '' : value).toLowerCase().trim();
  if (text === 'true' || text === 'yes' || text === '1' || text === 'on') return true;
  if (text === 'false' || text === 'no' || text === '0' || text === 'off') return false;
  return fallback;
}

function defaultSettings() {
  return {
    managerEmail: DEFAULT_SETTINGS.managerEmail,
    notifyEmail: DEFAULT_SETTINGS.notifyEmail,
    prize1: DEFAULT_SETTINGS.prize1,
    prize2: DEFAULT_SETTINGS.prize2,
    prize3: DEFAULT_SETTINGS.prize3
  };
}

function createEmptyState() {
  return { slots: [], techs: [], log: [], settings: defaultSettings() };
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state || createEmptyState()));
}

function publicSettings(settings) {
  var src = settings || {};
  return {
    managerEmail: src.managerEmail == null ? '' : String(src.managerEmail),
    notifyEmail: asBool(src.notifyEmail, true),
    prize1: src.prize1 ? String(src.prize1) : DEFAULT_SETTINGS.prize1,
    prize2: src.prize2 ? String(src.prize2) : DEFAULT_SETTINGS.prize2,
    prize3: src.prize3 ? String(src.prize3) : DEFAULT_SETTINGS.prize3
  };
}

function publicState(state) {
  var src = state || createEmptyState();
  return {
    slots: (src.slots || []).map(sanitizeSlot),
    techs: (src.techs || []).map(function (name) { return String(name); }),
    log: (src.log || []).map(function (entry) {
      return {
        t: String(entry.t || ''),
        tech: String(entry.tech || ''),
        wk: String(entry.wk || ''),
        dates: String(entry.dates || ''),
        action: String(entry.action || ''),
        type: String(entry.type || '')
      };
    }),
    settings: publicSettings(src.settings)
  };
}

function isTruthyFlag(value) {
  return asBool(value, false);
}

function tokenError(params, props) {
  var bag = props || {};
  if (!isTruthyFlag(bag.REQUIRE_TOKEN)) return null;
  var expected = bag.ROSTER_TOKEN == null ? '' : String(bag.ROSTER_TOKEN);
  if (!expected) {
    return { error: 'Token check is turned on, but ROSTER_TOKEN is empty in Script Properties.' };
  }
  if (String((params || {}).token || '') !== expected) {
    return { error: 'Unauthorized. The shared token does not match.' };
  }
  return null;
}

function headerMismatch(name, actual, expected, sheetIsEmpty) {
  if (sheetIsEmpty) return null;
  var cells = actual || [];
  for (var i = 0; i < expected.length; i++) {
    if (String(cells[i] || '') !== expected[i]) {
      return 'The tab "' + name + '" already exists, but its header row is not the one this roster script uses. Nothing was deleted. Rename that tab, then reload the roster so this script can create its own tab.';
    }
  }
  return null;
}

function parseWeekIndex(value) {
  if (!/^\d+$/.test(String(value == null ? '' : value).trim())) return null;
  var index = Number(value);
  if (index > MAX_WEEK_INDEX) return null;
  return index;
}

function ensureSlots(state, index) {
  while (state.slots.length <= index) state.slots.push(emptySlot());
}

function cleanName(value) {
  return String(value == null ? '' : value).trim();
}

function cellText(value) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return value == null ? '' : String(value);
}

function pushLog(state, entry) {
  state.log.unshift(entry);
  if (state.log.length > MAX_LOG) state.log.length = MAX_LOG;
}

function formatLogTime(date) {
  var when = date || new Date();
  var tz = 'America/New_York';
  try {
    if (typeof Session !== 'undefined' && Session.getScriptTimeZone) tz = Session.getScriptTimeZone() || tz;
  } catch (ignore) {}
  try {
    if (typeof Utilities !== 'undefined' && Utilities.formatDate) return Utilities.formatDate(when, tz, 'MMM d, h:mm a');
  } catch (ignore2) {}
  var hour = when.getUTCHours();
  var ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  var minute = when.getUTCMinutes();
  return MONTHS[when.getUTCMonth()] + ' ' + when.getUTCDate() + ', ' + hour + ':' + pad(minute) + ' ' + ampm;
}

function applyAction(state, params, options) {
  var next = cloneState(state || createEmptyState());
  var query = params || {};
  var action = query.action || 'get';
  var stamp = (options && options.stamp) || formatLogTime(options && options.now);

  if (action === 'get') return { state: next, changed: false };

  if (action === 'clear_all') {
    if (String(query.confirm || '') !== 'CLEAR') {
      return { error: 'To clear the roster, the request must include confirm=CLEAR.' };
    }
    next.slots = next.slots.map(function () { return emptySlot(); });
    next.log = [];
    return { state: next, changed: true };
  }

  if (action === 'add_tech') {
    var added = cleanName(query.name);
    if (!added) return { error: 'Enter a tech name.' };
    if (next.techs.indexOf(added) >= 0) return { state: next, changed: false };
    next.techs.push(added);
    return { state: next, changed: true };
  }

  if (action === 'remove_tech') {
    var removed = cleanName(query.name);
    var at = next.techs.indexOf(removed);
    if (at < 0) return { state: next, changed: false };
    next.techs.splice(at, 1);
    return { state: next, changed: true };
  }

  if (action === 'save_settings') {
    next.settings = publicSettings({
      managerEmail: query.managerEmail != null ? query.managerEmail : next.settings.managerEmail,
      notifyEmail: query.notifyEmail != null ? query.notifyEmail : next.settings.notifyEmail,
      prize1: query.prize1 || next.settings.prize1,
      prize2: query.prize2 || next.settings.prize2,
      prize3: query.prize3 || next.settings.prize3
    });
    return { state: next, changed: true };
  }

  if (action === 'signup_primary' || action === 'signup_day' || action === 'remove_primary' || action === 'remove_day' || action === 'save_note') {
    var wi = parseWeekIndex(query.wi);
    if (wi == null) return { error: 'Week index must be a whole number from 0 through ' + MAX_WEEK_INDEX + '.' };
    ensureSlots(next, wi);
    if (next.slots[wi].locked) return { error: 'That week is locked.' };
    var week = weekAt(wi);
    var isHol = !!week.holiday;

    if (action === 'signup_primary') {
      var primaryName = cleanName(query.name);
      if (!primaryName) return { error: 'Enter a name.' };
      next.slots[wi].primary = primaryName;
      var primaryPts = pointsFor('primary', isHol);
      pushLog(next, {
        t: stamp,
        tech: primaryName,
        wk: week.label,
        dates: week.dates,
        action: isHol ? 'Claimed primary + ' + primaryPts + ' pts + $50 holiday bonus' : 'Claimed primary + ' + primaryPts + ' pts',
        type: isHol ? 'holiday' : 'primary'
      });
      return { state: next, changed: true };
    }

    if (action === 'signup_day') {
      var day = String(query.day || '');
      if (DAY_KEYS.indexOf(day) < 0) return { error: 'Day must be Mon, Tue, Wed, Thu, Fri, Sat, or Sun.' };
      var dayName = cleanName(query.name);
      if (!dayName) return { error: 'Enter a name.' };
      next.slots[wi].days[day] = dayName;
      var dayPts = pointsFor('backup', isHol);
      pushLog(next, {
        t: stamp,
        tech: dayName,
        wk: week.label,
        dates: week.dates,
        action: 'Covered ' + day + ' (backup) + ' + dayPts + ' pts' + (isHol ? ' + $50 holiday bonus' : ''),
        type: isHol ? 'holiday' : 'day'
      });
      return { state: next, changed: true };
    }

    if (action === 'remove_primary') {
      var previous = next.slots[wi].primary;
      if (!previous) return { state: next, changed: false };
      next.slots[wi].primary = null;
      pushLog(next, {
        t: stamp,
        tech: previous,
        wk: week.label,
        dates: week.dates,
        action: 'Primary removed',
        type: 'remove'
      });
      return { state: next, changed: true };
    }

    if (action === 'remove_day') {
      var removeDay = String(query.day || '');
      if (DAY_KEYS.indexOf(removeDay) < 0) return { error: 'Day must be Mon, Tue, Wed, Thu, Fri, Sat, or Sun.' };
      var covered = next.slots[wi].days[removeDay];
      if (!covered) return { state: next, changed: false };
      delete next.slots[wi].days[removeDay];
      pushLog(next, {
        t: stamp,
        tech: covered,
        wk: week.label,
        dates: week.dates,
        action: 'Backup removed for ' + removeDay,
        type: 'remove'
      });
      return { state: next, changed: true };
    }

    var note = query.note == null ? '' : String(query.note);
    if (note.length > 5000) note = note.slice(0, 5000);
    next.slots[wi].note = note;
    return { state: next, changed: true };
  }

  return { error: 'Unknown action.' };
}

function importSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('Backup JSON must be an object with slots, techs, log, and settings.');
  }
  if (!Array.isArray(snapshot.slots)) throw new Error('Backup JSON is missing the slots list.');
  if (snapshot.slots.length > MAX_WEEK_INDEX + 1) {
    throw new Error('Backup has more weeks than this script will store.');
  }
  var state = createEmptyState();
  snapshot.slots.forEach(function (slot, index) {
    ensureSlots(state, index);
    state.slots[index] = sanitizeSlot(slot);
  });
  if (Array.isArray(snapshot.techs)) {
    snapshot.techs.forEach(function (name) {
      var clean = cleanName(name);
      if (clean && state.techs.indexOf(clean) < 0) state.techs.push(clean);
    });
  }
  if (Array.isArray(snapshot.log)) {
    snapshot.log.forEach(function (entry) {
      if (!entry || typeof entry !== 'object') return;
      state.log.push({
        t: String(entry.t || ''),
        tech: String(entry.tech || ''),
        wk: String(entry.wk || ''),
        dates: String(entry.dates || ''),
        action: String(entry.action || ''),
        type: String(entry.type || '')
      });
    });
    if (state.log.length > MAX_LOG) state.log = state.log.slice(0, MAX_LOG);
  }
  if (snapshot.settings && typeof snapshot.settings === 'object') {
    state.settings = publicSettings(snapshot.settings);
  }
  return state;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function scriptProperties() {
  var props = PropertiesService.getScriptProperties();
  return {
    REQUIRE_TOKEN: props.getProperty('REQUIRE_TOKEN'),
    ROSTER_TOKEN: props.getProperty('ROSTER_TOKEN'),
    SPREADSHEET_ID: props.getProperty('SPREADSHEET_ID')
  };
}

function spreadsheet() {
  var id = '';
  try { id = scriptProperties().SPREADSHEET_ID || ''; } catch (ignore) {}
  if (id) return SpreadsheetApp.openById(id);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  throw new Error('No spreadsheet is attached to this script. Open it from the roster spreadsheet, or set Script Property SPREADSHEET_ID to the ID in the sheet URL.');
}

function ensureSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, sheet.getMaxRows(), headers.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var empty = lastRow === 0 || (lastRow === 1 && sheet.getRange(1, 1, 1, lastColumn).getValues()[0].join('') === '');
  var actual = empty ? [] : sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var problem = headerMismatch(name, actual, headers, empty);
  if (problem) throw new Error(problem);
  if (empty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sheetRows(sheet) {
  var values = sheet.getDataRange().getValues();
  return values.length > 1 ? values.slice(1) : [];
}

function clearBody(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow > 1 && lastColumn > 0) sheet.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
}

function loadState() {
  var ss = spreadsheet();
  var slotsSheet = ensureSheet(ss, SHEET_SLOTS, SLOT_HEADERS);
  var state = createEmptyState();
  sheetRows(slotsSheet).forEach(function (row, offset) {
    if (row[0] === '' || row[0] == null) return;
    var index = parseWeekIndex(row[0]);
    if (index == null) throw new Error('RosterSlots row ' + (offset + 2) + ' has a week index this script cannot use.');
    ensureSlots(state, index);
    var days = {};
    DAY_KEYS.forEach(function (day, i) {
      var name = String(row[4 + i] || '').trim();
      if (name) days[day] = name;
    });
    state.slots[index] = sanitizeSlot({
      primary: row[1],
      note: row[2],
      locked: row[3],
      days: days
    });
  });

  var techSheet = ensureSheet(ss, SHEET_TECHS, TECH_HEADERS);
  sheetRows(techSheet).forEach(function (row) {
    var name = cleanName(row[0]);
    if (name && state.techs.indexOf(name) < 0) state.techs.push(name);
  });

  var logSheet = ensureSheet(ss, SHEET_LOG, LOG_HEADERS);
  sheetRows(logSheet).forEach(function (row) {
    if (!row.join('')) return;
    state.log.push({
      t: String(row[0] || ''),
      tech: String(row[1] || ''),
      wk: String(row[2] || ''),
      dates: String(row[3] || ''),
      action: String(row[4] || ''),
      type: String(row[5] || '')
    });
  });

  var settingsSheet = ensureSheet(ss, SHEET_SETTINGS, SETTING_HEADERS);
  var stored = {};
  sheetRows(settingsSheet).forEach(function (row) {
    if (row[0]) stored[String(row[0])] = row[1];
  });
  if (Object.keys(stored).length) state.settings = publicSettings(stored);
  return state;
}

function writeRows(sheet, rows) {
  clearBody(sheet);
  if (!rows.length) return;
  var width = rows[0].length;
  var range = sheet.getRange(2, 1, rows.length, width);
  // Plain text. Otherwise Sheets turns "Apr 14, 7:05 PM" into a date and the
  // activity log no longer matches the string the page already displays.
  range.setNumberFormat('@');
  range.setValues(rows.map(function (row) {
    return row.map(cellText);
  }));
}

function saveState(state) {
  var ss = spreadsheet();
  var clean = publicState(state);
  var slotRows = clean.slots.map(function (slot, index) {
    return [index, slot.primary || '', slot.note, slot.locked].concat(DAY_KEYS.map(function (day) {
      return slot.days[day] || '';
    }));
  });
  writeRows(ensureSheet(ss, SHEET_SLOTS, SLOT_HEADERS), slotRows);
  writeRows(ensureSheet(ss, SHEET_TECHS, TECH_HEADERS), clean.techs.map(function (name) { return [name]; }));
  writeRows(ensureSheet(ss, SHEET_LOG, LOG_HEADERS), clean.log.map(function (entry) {
    return [entry.t, entry.tech, entry.wk, entry.dates, entry.action, entry.type];
  }));
  var settings = clean.settings;
  writeRows(ensureSheet(ss, SHEET_SETTINGS, SETTING_HEADERS), [
    ['managerEmail', settings.managerEmail],
    ['notifyEmail', settings.notifyEmail],
    ['prize1', settings.prize1],
    ['prize2', settings.prize2],
    ['prize3', settings.prize3]
  ]);
}

function doGet(e) {
  var params = (e && e.parameter) || {};
  try {
    var denied = tokenError(params, scriptProperties());
    if (denied) return jsonOut(denied);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) return jsonOut({ error: 'The roster is busy. Try again in a moment.' });
    try {
      var state = loadState();
      var result = applyAction(state, params);
      if (result.error) return jsonOut({ error: result.error });
      if (result.changed) saveState(result.state);
      return jsonOut(publicState(result.state));
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return jsonOut({ error: err && err.message ? err.message : String(err) });
  }
}

function importRosterSnapshot() {
  var ss = spreadsheet();
  var sheet = ss.getSheetByName(SHEET_IMPORT);
  if (!sheet) throw new Error('Add a tab named RosterImport and paste the backup JSON into cell A1.');
  var raw = sheet.getRange('A1').getValue();
  if (!String(raw || '').trim()) throw new Error('RosterImport cell A1 is empty. Paste the backup JSON there first.');
  var snapshot;
  try {
    snapshot = JSON.parse(String(raw));
  } catch (err) {
    throw new Error('RosterImport cell A1 is not valid JSON. Paste the backup again, starting with { and ending with }.');
  }
  var state = importSnapshot(snapshot);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('The roster is busy. Try the import again in a moment.');
  try {
    saveState(state);
  } finally {
    lock.releaseLock();
  }
  ss.toast('Imported ' + state.slots.length + ' weeks, ' + state.techs.length + ' techs, and ' + state.log.length + ' log lines.', 'Roster backup', 10);
}

function exportRosterSnapshot() {
  var ss = spreadsheet();
  var state = loadState();
  var text = JSON.stringify(publicState(state));
  if (text.length > 49000) throw new Error('The roster is too big for one cell. Open the web app URL instead and save that page.');
  var sheet = ss.getSheetByName(SHEET_IMPORT) || ss.insertSheet(SHEET_IMPORT);
  sheet.getRange('A1').setValue(text);
  ss.toast('Current roster written to RosterImport cell A1.', 'Roster backup', 8);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Roster backup')
    .addItem('Import backup from RosterImport cell A1', 'importRosterSnapshot')
    .addItem('Save a backup into RosterImport cell A1', 'exportRosterSnapshot')
    .addToUi();
}

if (typeof module === 'object' && module.exports) {
  module.exports = {
    ROSTER_CONFIG: ROSTER_CONFIG,
    SCORING: SCORING,
    MAX_WEEK_INDEX: MAX_WEEK_INDEX,
    weekAt: weekAt,
    pointsFor: pointsFor,
    applyAction: applyAction,
    importSnapshot: importSnapshot,
    tokenError: tokenError,
    headerMismatch: headerMismatch,
    publicState: publicState,
    createEmptyState: createEmptyState,
    cellText: cellText,
    SLOT_HEADERS: SLOT_HEADERS
  };
}

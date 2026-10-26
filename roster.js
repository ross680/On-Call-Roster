/*
 * On-call week generation, US holiday detection, and leaderboard scoring.
 * Loaded by index.html and by the Node tests. No build step.
 *
 * Week index 0 is ROSTER_CONFIG.startDate (Monday, April 13, 2026).
 * Saved Apps Script assignments are stored by that index. Do not change
 * startDate or rotationDays or existing weeks will point at the wrong dates.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Roster = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // primary 10 + holidayPrimary 8 = 18 on a holiday week.
  // backupDay 2 + holidayDay 4 = 6 for each backup day on a holiday week.
  // A week with more than one holiday still scores once.
  var SCORING = { primary: 10, backupDay: 2, holidayPrimary: 8, holidayDay: 4 };

  var ROSTER_CONFIG = {
    startDate: '2026-04-13',
    rotationDays: 7,
    // Weeks after the one that contains today. The end moves forward; there is no final Sunday.
    futureWeeks: 26,
    // Always keep the original April 13–June 28 season addressable.
    minWeeks: 11,
    // These were already scored as holiday weeks. Dropping them would change saved points.
    companyHolidays: ['mothers-day', 'fathers-day']
  };

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function parseISO(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) throw new Error('Expected a YYYY-MM-DD date');
    var y = +parts[0], m = +parts[1], d = +parts[2];
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) throw new Error('Expected a YYYY-MM-DD date');
    return new Date(Date.UTC(y, m - 1, d));
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

  function todayISO(now) {
    var n = now || new Date();
    return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate());
  }

  function formatRange(start, end) {
    var sm = MONTHS[start.getUTCMonth()];
    var em = MONTHS[end.getUTCMonth()];
    var sd = start.getUTCDate();
    var ed = end.getUTCDate();
    var sy = start.getUTCFullYear();
    var ey = end.getUTCFullYear();
    if (sy !== ey) return sm + ' ' + sd + ', ' + sy + '\u2013' + em + ' ' + ed + ', ' + ey;
    if (start.getUTCMonth() !== end.getUTCMonth()) return sm + ' ' + sd + '\u2013' + em + ' ' + ed;
    return sm + ' ' + sd + '\u2013' + ed;
  }

  function formatLong(isoDate) {
    var date = parseISO(isoDate);
    return MONTHS[date.getUTCMonth()] + ' ' + date.getUTCDate() + ', ' + date.getUTCFullYear();
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

  // Saturday holidays are observed Friday; Sunday holidays are observed Monday.
  function observedDate(official) {
    var dow = official.getUTCDay();
    if (dow === 6) return addDays(official, -1);
    if (dow === 0) return addDays(official, 1);
    return official;
  }

  function resolveConfig(overrides) {
    var src = overrides || {};
    return {
      startDate: src.startDate || ROSTER_CONFIG.startDate,
      rotationDays: src.rotationDays || ROSTER_CONFIG.rotationDays,
      futureWeeks: src.futureWeeks != null ? src.futureWeeks : ROSTER_CONFIG.futureWeeks,
      minWeeks: src.minWeeks != null ? src.minWeeks : ROSTER_CONFIG.minWeeks,
      companyHolidays: src.companyHolidays != null ? src.companyHolidays : ROSTER_CONFIG.companyHolidays
    };
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

  function holidayEvents(yearStart, yearEnd, config) {
    var cfg = resolveConfig(config);
    var events = [];
    for (var year = yearStart; year <= yearEnd; year++) {
      federalHolidays(year).forEach(function (item) { events.push(asEvent(item, true)); });
      companyHolidayDates(year, cfg.companyHolidays).forEach(function (item) { events.push(asEvent(item, false)); });
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

  function dayNames(config) {
    var cfg = resolveConfig(config);
    var start = parseISO(cfg.startDate);
    var names = [];
    for (var i = 0; i < cfg.rotationDays; i++) names.push(DAY_NAMES[addDays(start, i).getUTCDay()]);
    return names;
  }

  function generateWeeks(config, todayIsoDate, minCount) {
    var cfg = resolveConfig(config);
    var rotation = cfg.rotationDays;
    if (!rotation || rotation < 1) throw new Error('rotationDays must be a positive number');
    var start = parseISO(cfg.startDate);
    var today = parseISO(todayIsoDate || todayISO());
    var future = cfg.futureWeeks;
    if (future < 0) future = 0;
    var currentIndex = 0;
    if (today.getTime() >= start.getTime()) {
      currentIndex = Math.floor((today.getTime() - start.getTime()) / (rotation * 86400000));
    }
    var count = today.getTime() < start.getTime() ? Math.max(future, 1) : currentIndex + 1 + future;
    if (cfg.minWeeks > count) count = cfg.minWeeks;
    if (minCount > count) count = minCount;

    var lastEnd = addDays(start, count * rotation - 1);
    var events = holidayEvents(start.getUTCFullYear() - 1, lastEnd.getUTCFullYear() + 1, cfg);
    var weeks = [];
    for (var i = 0; i < count; i++) {
      var weekStart = addDays(start, i * rotation);
      var weekEnd = addDays(weekStart, rotation - 1);
      var startIso = iso(weekStart);
      var endIso = iso(weekEnd);
      weeks.push({
        num: i + 1,
        index: i,
        label: 'Week ' + (i + 1),
        dates: formatRange(weekStart, weekEnd),
        start: startIso,
        end: endIso,
        holiday: holidayLabel(events, startIso, endIso)
      });
    }
    return weeks;
  }

  function pointsFor(role, isHoliday, scoring) {
    var rules = scoring || SCORING;
    if (role === 'primary') return rules.primary + (isHoliday ? rules.holidayPrimary : 0);
    if (role === 'backup' || role === 'day') return rules.backupDay + (isHoliday ? rules.holidayDay : 0);
    return 0;
  }

  function sanitizeSlot(slot) {
    var src = slot && typeof slot === 'object' ? slot : {};
    var days = {};
    var rawDays = src.days;
    if (rawDays && typeof rawDays === 'object' && !Array.isArray(rawDays)) {
      Object.keys(rawDays).forEach(function (day) {
        if (rawDays[day]) days[day] = rawDays[day];
      });
    }
    return {
      primary: src.primary || null,
      days: days,
      note: src.note == null ? '' : String(src.note),
      locked: !!src.locked
    };
  }

  function emptySlot() {
    return sanitizeSlot(null);
  }

  function blankSlots(count) {
    var out = [];
    for (var i = 0; i < count; i++) out.push(emptySlot());
    return out;
  }

  function normalizeSlots(raw, weekCount) {
    var list = [];
    if (Array.isArray(raw)) {
      list = raw;
    } else if (raw && typeof raw === 'object') {
      Object.keys(raw).forEach(function (key) {
        if (/^\d+$/.test(key)) list[+key] = raw[key];
      });
    }
    var count = Math.max(weekCount || 0, list.length);
    var out = [];
    for (var i = 0; i < count; i++) out.push(sanitizeSlot(list[i]));
    return out;
  }

  function calcPoints(name, weeks, slots, scoring) {
    var pts = 0;
    var primWks = 0;
    var days = 0;
    var holCount = 0;
    var list = weeks || [];
    for (var i = 0; i < list.length; i++) {
      var week = list[i] || {};
      var slot = sanitizeSlot(slots && slots[i]);
      var isHol = !!week.holiday;
      if (slot.primary === name) {
        primWks++;
        pts += pointsFor('primary', isHol, scoring);
        if (isHol) holCount++;
      }
      Object.keys(slot.days).forEach(function (day) {
        if (slot.days[day] === name) {
          days++;
          pts += pointsFor('backup', isHol, scoring);
          if (isHol) holCount++;
        }
      });
    }
    return { pts: pts, primWks: primWks, days: days, holCount: holCount };
  }

  function collectTechs(techs, slots) {
    var all = [];
    function add(name) {
      if (!name || all.indexOf(name) >= 0) return;
      all.push(name);
    }
    (techs || []).forEach(add);
    (slots || []).forEach(function (slot) {
      var clean = sanitizeSlot(slot);
      add(clean.primary);
      Object.keys(clean.days).forEach(function (day) { add(clean.days[day]); });
    });
    return all;
  }

  // Tied scores share a place. The next distinct score takes the next place
  // (1, 1, 2), not a skipped rank. A score of 0 does not win a prize.
  function rankLeaderboard(rows) {
    var sorted = (rows || []).map(function (row) {
      return {
        name: row.name,
        pts: row.pts || 0,
        primWks: row.primWks || 0,
        days: row.days || 0,
        holCount: row.holCount || 0
      };
    }).sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (a.name < b.name) return -1;
      if (a.name > b.name) return 1;
      return 0;
    });
    var place = 0;
    for (var i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i].pts !== sorted[i - 1].pts) place++;
      sorted[i].rank = place;
      sorted[i].prizeTier = sorted[i].pts > 0 && place <= 3 ? place : 0;
    }
    return sorted;
  }

  function buildLeaderboard(techs, weeks, slots, scoring) {
    var rows = collectTechs(techs, slots).map(function (name) {
      var row = calcPoints(name, weeks, slots, scoring);
      row.name = name;
      return row;
    });
    return rankLeaderboard(rows);
  }

  return {
    CONFIG: ROSTER_CONFIG,
    SCORING: SCORING,
    parseISO: parseISO,
    todayISO: todayISO,
    formatLong: formatLong,
    dayNames: dayNames,
    holidayEvents: holidayEvents,
    generateWeeks: generateWeeks,
    pointsFor: pointsFor,
    sanitizeSlot: sanitizeSlot,
    emptySlot: emptySlot,
    blankSlots: blankSlots,
    normalizeSlots: normalizeSlots,
    calcPoints: calcPoints,
    collectTechs: collectTechs,
    rankLeaderboard: rankLeaderboard,
    buildLeaderboard: buildLeaderboard
  };
});

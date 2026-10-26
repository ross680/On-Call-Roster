const test = require('node:test');
const assert = require('node:assert/strict');
const Roster = require('../roster.js');

const EN = '\u2013';

function weeksOn(today, extra) {
  return Roster.generateWeeks(Object.assign({}, Roster.CONFIG, extra || {}), today);
}

test('week indexes stay anchored to April 13, 2026', () => {
  const early = weeksOn('2026-06-28', { futureWeeks: 0 });
  const later = weeksOn('2028-06-01', { futureWeeks: 2 });
  assert.equal(early.length, 11);
  assert.ok(later.length > early.length);
  assert.equal(early[0].start, '2026-04-13');
  assert.equal(early[0].end, '2026-04-19');
  assert.equal(early[0].label, 'Week 1');
  assert.equal(later[0].start, '2026-04-13');
  assert.equal(later[0].holiday, early[0].holiday);
  for (let i = 0; i < early.length; i++) {
    assert.equal(later[i].start, early[i].start);
    assert.equal(later[i].end, early[i].end);
    assert.equal(later[i].holiday, early[i].holiday);
    assert.equal(later[i].index, i);
  }
  assert.ok(later.some((week) => week.start <= '2028-06-01' && week.end >= '2028-06-01'));
});

test('the original season keeps its dates and holiday weeks', () => {
  const weeks = weeksOn('2026-06-28', { futureWeeks: 0 });
  assert.deepEqual(weeks.map((week) => week.dates), [
    'Apr 13' + EN + '19',
    'Apr 20' + EN + '26',
    'Apr 27' + EN + 'May 3',
    'May 4' + EN + '10',
    'May 11' + EN + '17',
    'May 18' + EN + '24',
    'May 25' + EN + '31',
    'Jun 1' + EN + '7',
    'Jun 8' + EN + '14',
    'Jun 15' + EN + '21',
    'Jun 22' + EN + '28'
  ]);
  assert.deepEqual(weeks.map((week) => Boolean(week.holiday)), [
    false, false, false, true, false, false, true, false, false, true, false
  ]);
  assert.equal(weeks[3].holiday, "Mother's Day");
  assert.equal(weeks[6].holiday, 'Memorial Day');
  assert.equal(weeks[9].holiday, "Juneteenth, Father's Day");
  assert.deepEqual(Roster.dayNames(), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
});

test('federal holidays land on the right weeks and score once', () => {
  const weeks = weeksOn('2026-10-26', { futureWeeks: 40 });
  const byStart = Object.fromEntries(weeks.map((week) => [week.start, week]));
  assert.equal(byStart['2026-06-29'].holiday, 'Independence Day');
  assert.equal(byStart['2026-09-07'].holiday, 'Labor Day');
  assert.equal(byStart['2026-10-12'].holiday, 'Columbus Day');
  assert.equal(byStart['2026-10-26'].start, '2026-10-26');
  assert.equal(byStart['2026-11-23'].holiday, 'Thanksgiving');
  assert.equal(byStart['2026-12-21'].holiday, 'Christmas Day');
  assert.equal(byStart['2026-12-28'].holiday, "New Year's Day");
  assert.equal(byStart['2027-01-18'].holiday, 'Martin Luther King Jr. Day');

  const slots = Roster.blankSlots(weeks.length);
  const fatherWeek = weeks.findIndex((week) => week.start === '2026-06-15');
  slots[fatherWeek].primary = 'Alex';
  const score = Roster.calcPoints('Alex', weeks, slots);
  assert.equal(score.pts, 18);
  assert.equal(score.holCount, 1);
  assert.equal(score.pts, Roster.pointsFor('primary', true));
});

test('weekend federal holidays are observed, including across weeks', () => {
  const july = Roster.generateWeeks({
    startDate: '2021-06-28',
    rotationDays: 7,
    futureWeeks: 2,
    minWeeks: 0,
    companyHolidays: []
  }, '2021-06-28');
  assert.equal(july[0].holiday, 'Independence Day');
  assert.equal(july[1].holiday, 'Independence Day (observed)');
  assert.equal(july[2].holiday, null);

  const newYear = Roster.generateWeeks({
    startDate: '2016-12-19',
    rotationDays: 7,
    futureWeeks: 3,
    minWeeks: 0,
    companyHolidays: []
  }, '2016-12-19');
  assert.equal(newYear[0].holiday, 'Christmas Day');
  assert.equal(newYear[1].holiday, "Christmas Day (observed), New Year's Day");
  assert.equal(newYear[2].holiday, "New Year's Day (observed)");
});

test('rotation length follows the config', () => {
  const weeks = Roster.generateWeeks({
    startDate: '2026-04-13',
    rotationDays: 14,
    futureWeeks: 1,
    minWeeks: 0,
    companyHolidays: []
  }, '2026-04-13');
  assert.equal(weeks.length, 2);
  assert.equal(weeks[0].end, '2026-04-26');
  assert.equal(weeks[1].start, '2026-04-27');
});

test('scoring matches primary, backup, and holiday bonuses', () => {
  assert.equal(Roster.pointsFor('primary', false), 10);
  assert.equal(Roster.pointsFor('primary', true), 18);
  assert.equal(Roster.pointsFor('backup', false), 2);
  assert.equal(Roster.pointsFor('backup', true), 6);

  const weeks = weeksOn('2026-06-28', { futureWeeks: 0 });
  const slots = weeks.map(() => ({ primary: 'Alex', days: {} }));
  slots[0].days = { Mon: 'Blake', Tue: 'Alex' };
  slots[3].days = { Sun: 'Blake' };
  const alex = Roster.calcPoints('Alex', weeks, slots);
  const blake = Roster.calcPoints('Blake', weeks, slots);
  assert.equal(alex.pts, (8 * 10) + (3 * 18) + 2);
  assert.equal(alex.primWks, 11);
  assert.equal(alex.days, 1);
  assert.equal(alex.holCount, 3);
  assert.equal(blake.pts, 2 + 6);
  assert.equal(blake.days, 2);
  assert.equal(blake.holCount, 1);
  assert.equal(blake.primWks, 0);
});

test('saved assignments still score when the server has fewer slots than weeks', () => {
  const weeks = weeksOn('2026-10-26');
  assert.ok(weeks.length > 11);
  const stored = [];
  stored[1] = { primary: 'Alex', days: { Tue: 'Blake' }, note: 'bring the van', locked: false };
  stored[3] = { primary: 'Alex' };
  const slots = Roster.normalizeSlots(stored, weeks.length);
  assert.equal(slots.length, weeks.length);
  assert.equal(slots[0].primary, null);
  assert.equal(slots[1].days.Tue, 'Blake');
  assert.equal(slots[1].note, 'bring the van');
  assert.equal(slots[11].primary, null);
  const alex = Roster.calcPoints('Alex', weeks, slots);
  assert.equal(alex.pts, 10 + 18);
  assert.equal(alex.holCount, 1);
  assert.equal(Roster.calcPoints('Blake', weeks, [{ days: null }, null]).pts, 0);
});

test('normalizeSlots accepts a map and pads holes', () => {
  const slots = Roster.normalizeSlots({
    0: { primary: 'Alex', days: { Tue: 'Blake' }, note: 'hi', locked: true },
    10: { primary: 'Casey', days: { Mon: '' } }
  }, 12);
  assert.equal(slots.length, 12);
  assert.equal(slots[0].primary, 'Alex');
  assert.equal(slots[0].locked, true);
  assert.deepEqual(slots[5].days, {});
  assert.equal(slots[10].primary, 'Casey');
  assert.deepEqual(slots[10].days, {});
  assert.equal(slots[11].note, '');
});

test('tied scores share a prize and zero points do not place', () => {
  const tied = Roster.rankLeaderboard([
    { name: 'Cara', pts: 20 },
    { name: 'Abe', pts: 20 },
    { name: 'Bea', pts: 10 }
  ]);
  assert.deepEqual(tied.map((row) => row.name), ['Abe', 'Cara', 'Bea']);
  assert.deepEqual(tied.map((row) => row.rank), [1, 1, 2]);
  assert.deepEqual(tied.map((row) => row.prizeTier), [1, 1, 2]);

  const season = Roster.rankLeaderboard([
    { name: 'A', pts: 36 },
    { name: 'B', pts: 28 },
    { name: 'C', pts: 20 },
    { name: 'D', pts: 20 },
    { name: 'E', pts: 20 },
    { name: 'F', pts: 10 },
    { name: 'G', pts: 0 }
  ]);
  assert.deepEqual(season.map((row) => row.rank), [1, 2, 3, 3, 3, 4, 5]);
  assert.deepEqual(season.map((row) => row.prizeTier), [1, 2, 3, 3, 3, 0, 0]);

  const empty = Roster.rankLeaderboard([
    { name: 'Zoe', pts: 0 },
    { name: 'Amy', pts: 0 }
  ]);
  assert.deepEqual(empty.map((row) => row.prizeTier), [0, 0]);
  assert.deepEqual(empty.map((row) => row.rank), [1, 1]);
});

test('the leaderboard includes backup techs and keeps roster order out of the prize', () => {
  const weeks = [
    { holiday: null },
    { holiday: 'Memorial Day' }
  ];
  const slots = [
    { primary: 'Zoe', days: { Mon: 'Amy' } },
    { primary: null, days: { Fri: 'Amy' } }
  ];
  const board = Roster.buildLeaderboard(['Zoe', 'Nora'], weeks, slots);
  assert.deepEqual(board.map((row) => row.name), ['Zoe', 'Amy', 'Nora']);
  assert.equal(board[0].pts, 10);
  assert.equal(board[0].prizeTier, 1);
  assert.equal(board[1].pts, 2 + 6);
  assert.equal(board[1].days, 2);
  assert.equal(board[1].holCount, 1);
  assert.equal(board[1].prizeTier, 2);
  assert.equal(board[2].pts, 0);
  assert.equal(board[2].prizeTier, 0);
});

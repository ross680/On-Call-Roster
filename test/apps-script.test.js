const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Roster = require('../roster.js');
const Script = require('../apps-script/Code.gs');

test('holiday rules and points match roster.js', () => {
  const weeks = Roster.generateWeeks(Roster.CONFIG, '2027-06-01', 80);
  assert.ok(weeks.length > 11);
  weeks.forEach((week) => {
    const info = Script.weekAt(week.index);
    assert.equal(info.holiday, week.holiday);
    assert.equal(info.label, week.label);
    assert.equal(info.dates, week.dates.replace(/\u2013/g, '-'));
    assert.equal(Script.pointsFor('primary', !!info.holiday), Roster.pointsFor('primary', !!week.holiday));
    assert.equal(Script.pointsFor('backup', !!info.holiday), Roster.pointsFor('backup', !!week.holiday));
  });
  const father = Script.weekAt(9);
  assert.equal(father.dates, 'Jun 15-21');
  assert.equal(father.holiday, "Juneteenth, Father's Day");
  assert.equal(Script.pointsFor('primary', true), 18);
  assert.equal(Script.weekAt(0).dates, 'Apr 13-19');
  assert.equal(Script.weekAt(2).dates, 'Apr 27-May 3');
});

test('signup log points match the leaderboard, including a grown week index', () => {
  let state = Script.createEmptyState();
  const holiday = Script.applyAction(state, { action: 'signup_primary', wi: '9', name: 'Alex' }, { stamp: 'Jun 1, 9:00 AM' });
  assert.equal(holiday.state.log[0].action, 'Claimed primary + 18 pts + $50 holiday bonus');
  assert.equal(holiday.state.log[0].type, 'holiday');
  assert.equal(holiday.state.log[0].wk, 'Week 10');
  assert.equal(holiday.state.log[0].dates, 'Jun 15-21');
  assert.equal(holiday.state.slots.length, 10);
  assert.equal(holiday.state.slots[0].primary, null);
  assert.equal(holiday.state.slots[9].primary, 'Alex');

  const regular = Script.applyAction(holiday.state, { action: 'signup_primary', wi: '0', name: 'Blake' }, { stamp: 'Jun 1, 9:05 AM' });
  assert.equal(regular.state.log[0].action, 'Claimed primary + 10 pts');
  assert.equal(regular.state.log[0].type, 'primary');
  assert.equal(regular.state.log[0].t, 'Jun 1, 9:05 AM');
  assert.equal(regular.state.log[1].tech, 'Alex');

  const backup = Script.applyAction(regular.state, { action: 'signup_day', wi: '9', day: 'Tue', name: 'Casey' }, { stamp: 'Jun 1, 9:06 AM' });
  assert.equal(backup.state.log[0].action, 'Covered Tue (backup) + 6 pts + $50 holiday bonus');
  assert.equal(backup.state.log[0].type, 'holiday');
  const plainDay = Script.applyAction(backup.state, { action: 'signup_day', wi: '0', day: 'Tue', name: 'Casey' }, { stamp: 'Jun 1, 9:07 AM' });
  assert.equal(plainDay.state.log[0].action, 'Covered Tue (backup) + 2 pts');
  assert.equal(plainDay.state.log[0].type, 'day');

  const later = Script.applyAction(plainDay.state, { action: 'signup_primary', wi: '40', name: 'Drew' }, { stamp: 'Jun 1, 9:08 AM' });
  assert.equal(later.state.slots.length, 41);
  assert.equal(later.state.slots[40].primary, 'Drew');
  assert.equal(later.state.slots[40].days && later.state.slots[10].primary, null);
  const thanks = Roster.generateWeeks(Roster.CONFIG, '2026-12-01').find((week) => week.holiday === 'Thanksgiving');
  const turkey = Script.applyAction(later.state, { action: 'signup_primary', wi: String(thanks.index), name: 'Drew' }, { stamp: 'Jun 1, 9:09 AM' });
  assert.equal(turkey.state.log[0].action, 'Claimed primary + 18 pts + $50 holiday bonus');
  assert.equal(turkey.state.log[0].dates, thanks.dates.replace(/\u2013/g, '-'));
});

test('removes, notes, techs, and settings keep the response shape', () => {
  let state = Script.createEmptyState();
  state = Script.applyAction(state, { action: 'signup_primary', wi: '1', name: 'Alex' }, { stamp: 'Apr 1, 1:00 PM' }).state;
  state = Script.applyAction(state, { action: 'signup_day', wi: '1', day: 'Tue', name: 'Blake' }, { stamp: 'Apr 1, 1:01 PM' }).state;
  const removedPrimary = Script.applyAction(state, { action: 'remove_primary', wi: '1' }, { stamp: 'Apr 1, 1:02 PM' });
  assert.equal(removedPrimary.state.slots[1].primary, null);
  assert.equal(removedPrimary.state.log[0].action, 'Primary removed');
  assert.equal(removedPrimary.state.log[0].type, 'remove');
  const removedDay = Script.applyAction(removedPrimary.state, { action: 'remove_day', wi: '1', day: 'Tue' }, { stamp: 'Apr 1, 1:03 PM' });
  assert.deepEqual(removedDay.state.slots[1].days, {});
  assert.equal(removedDay.state.log[0].action, 'Backup removed for Tue');

  const noted = Script.applyAction(removedDay.state, { action: 'save_note', wi: '4', note: 'Gate code 1234' }, { stamp: 'Apr 1, 1:04 PM' });
  assert.equal(noted.state.slots.length, 5);
  assert.equal(noted.state.slots[4].note, 'Gate code 1234');

  const added = Script.applyAction(noted.state, { action: 'add_tech', name: 'Alex' }).state;
  const again = Script.applyAction(added, { action: 'add_tech', name: 'Alex' });
  assert.equal(again.changed, false);
  assert.deepEqual(again.state.techs, ['Alex']);
  const gone = Script.applyAction(added, { action: 'remove_tech', name: 'Alex' });
  assert.deepEqual(gone.state.techs, []);

  const saved = Script.applyAction(added, {
    action: 'save_settings',
    managerEmail: 'boss@example.com',
    notifyEmail: 'false',
    prize1: 'Pizza',
    prize2: '',
    prize3: '$50 end-of-period bonus'
  });
  const body = Script.publicState(saved.state);
  assert.equal(body.settings.notifyEmail, false);
  assert.equal(body.settings.managerEmail, 'boss@example.com');
  assert.equal(body.settings.prize1, 'Pizza');
  assert.equal(body.settings.prize2, '$100 end-of-period bonus');
  assert.equal(typeof body.settings.notifyEmail, 'boolean');
  assert.deepEqual(Object.keys(body).sort(), ['log', 'settings', 'slots', 'techs']);
});

test('clear_all requires confirm and keeps the tech roster', () => {
  const start = Script.applyAction(Script.createEmptyState(), { action: 'add_tech', name: 'Alex' }).state;
  const claimed = Script.applyAction(start, { action: 'signup_primary', wi: '3', name: 'Alex' }, { stamp: 'May 1, 8:00 AM' }).state;
  const blocked = Script.applyAction(claimed, { action: 'clear_all' });
  assert.equal(blocked.error, 'To clear the roster, the request must include confirm=CLEAR.');
  assert.equal(claimed.slots[3].primary, 'Alex');
  const cleared = Script.applyAction(claimed, { action: 'clear_all', confirm: 'CLEAR' });
  assert.equal(cleared.state.slots[3].primary, null);
  assert.deepEqual(cleared.state.log, []);
  assert.deepEqual(cleared.state.techs, ['Alex']);
  assert.equal(cleared.state.settings.prize1, '$250 end-of-period bonus');
});

test('token check stays off until the property flag is on', () => {
  assert.equal(Script.tokenError({ action: 'get' }, {}), null);
  assert.equal(Script.tokenError({ action: 'get' }, { REQUIRE_TOKEN: 'false', ROSTER_TOKEN: 'secret' }), null);
  assert.match(Script.tokenError({ action: 'get' }, { REQUIRE_TOKEN: 'true', ROSTER_TOKEN: 'secret' }).error, /Unauthorized/);
  assert.match(Script.tokenError({ action: 'signup_primary', token: 'nope' }, { REQUIRE_TOKEN: 'yes', ROSTER_TOKEN: 'secret' }).error, /Unauthorized/);
  assert.equal(Script.tokenError({ action: 'get', token: 'secret' }, { REQUIRE_TOKEN: 'on', ROSTER_TOKEN: 'secret' }), null);
  assert.match(Script.tokenError({ action: 'get', token: '' }, { REQUIRE_TOKEN: '1', ROSTER_TOKEN: '' }).error, /ROSTER_TOKEN is empty/);
});

test('import accepts a get snapshot and refuses a bad header row', () => {
  const snapshot = {
    slots: [
      { primary: 'Alex', days: {}, note: '', locked: false },
      { primary: null, days: { Tue: 'Blake' }, note: 'van', locked: false }
    ],
    techs: ['Alex', 'Blake'],
    log: [{ t: 'Apr 14, 7:05 PM', tech: 'Alex', wk: 'Week 1', dates: 'Apr 13-19', action: 'Claimed primary + 10 pts', type: 'primary' }],
    settings: { managerEmail: 'boss@example.com', notifyEmail: true, prize1: '$250 end-of-period bonus', prize2: '$100 end-of-period bonus', prize3: '$50 end-of-period bonus' }
  };
  const state = Script.importSnapshot(snapshot);
  assert.equal(state.slots[0].primary, 'Alex');
  assert.equal(state.slots[1].days.Tue, 'Blake');
  assert.equal(state.log[0].dates, 'Apr 13-19');
  assert.equal(state.settings.notifyEmail, true);
  assert.throws(() => Script.importSnapshot({ techs: [] }), /slots/);
  assert.equal(Script.headerMismatch('RosterSlots', Script.SLOT_HEADERS, Script.SLOT_HEADERS, false), null);
  assert.match(Script.headerMismatch('RosterSlots', ['Week', 'Name'], Script.SLOT_HEADERS, false), /Rename that tab/);
  assert.equal(Script.headerMismatch('RosterSlots', [], Script.SLOT_HEADERS, true), null);
});

test('a locked week rejects edits and unknown actions fail closed', () => {
  const state = Script.createEmptyState();
  state.slots = [{ primary: 'Alex', days: {}, note: '', locked: true }];
  assert.match(Script.applyAction(state, { action: 'signup_primary', wi: '0', name: 'Blake' }).error, /locked/);
  assert.match(Script.applyAction(state, { action: 'signup_day', wi: '0', day: 'Mon', name: 'Blake' }).error, /locked/);
  assert.match(Script.applyAction(state, { action: 'nope' }).error, /Unknown action/);
  assert.match(Script.applyAction(state, { action: 'signup_primary', wi: '800', name: 'Blake' }).error, /0 through 779/);
});

test('sheet cells stay text so log times are not rewritten as dates', () => {
  assert.equal(Script.cellText('Apr 14, 7:05 PM'), 'Apr 14, 7:05 PM');
  assert.equal(Script.cellText('Apr 13-19'), 'Apr 13-19');
  assert.equal(Script.cellText(false), 'false');
  assert.equal(Script.cellText(0), '0');
  assert.equal(Script.cellText(null), '');
});

test('the page sends the token and the clear confirmation', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /var SCRIPT_TOKEN = ''/);
  assert.match(html, /if \(SCRIPT_TOKEN\) payload\.token = SCRIPT_TOKEN/);
  assert.match(html, /action:'clear_all', confirm:'CLEAR'/);
});

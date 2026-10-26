# 3R Plumbing and Mechanical — On-call roster

Static site for claiming on-call weeks, scoring primary and backup shifts, and showing the leaderboard. It runs on GitHub Pages with no build step. `index.html` and `roster.js` are the site. Week math and scoring live in `roster.js` so they can be tested with Node.

Techs claim a primary week or cover individual backup days. Points feed the leaderboard. The default prizes are **$250**, **$100**, and **$50** (change them in Settings; they are stored by the Apps Script). A holiday week adds holiday points and shows a **+$50** pay bonus. The pay pills at the top ($100 / week, $50 / call, 15% OT, $299 dispatch) are reminders only. This page does not calculate pay.

Email alerts are a `mailto:` link. If a manager email is saved and notifications are on, the browser opens the visitor's mail program after a signup. The site does not send mail itself.

## Scoring

| Shift | Points |
| --- | --- |
| Primary week | 10 |
| Backup day | 2 |
| Holiday primary | 18 (10 + 8) |
| Holiday backup day | 6 (2 + 4) |

A week that contains more than one holiday is still one holiday week. It scores once, and the +$50 pay bonus is once. The June 15–21, 2026 week is both Juneteenth and Father's Day, and a primary on that week is still 18 points.

The Holidays column counts a holiday primary as one and each backup day on a holiday week as one.

Tied scores share a place, and the next distinct score takes the next place. Two techs at 20 points are both 1st, and the next score is 2nd. Ties are listed alphabetically. A tech with zero points stays on the board but does not win a prize. Before this change, equal scores were ordered by roster entry and only one of them received the prize.

## Weeks

`ROSTER_CONFIG` in `roster.js`:

| Setting | Default | Meaning |
| --- | --- | --- |
| `startDate` | `2026-04-13` | Monday that begins week index 0 |
| `rotationDays` | `7` | Length of one rotation, Monday–Sunday |
| `futureWeeks` | `26` | Weeks shown after the current week |
| `minWeeks` | `11` | Always keep the original Apr 13–Jun 28, 2026 season |
| `companyHolidays` | Mother's Day, Father's Day | Extra holidays that already scored on this roster |

Do not change `startDate` or `rotationDays`. Saved assignments are stored by week index (`wi`). Index 0 is April 13–19, 2026, index 1 is the next week, and so on. Moving the anchor would attach those saved names to the wrong dates.

There is no final Sunday. Each visit builds weeks from April 13, 2026 through the current week plus `futureWeeks`. Raise `futureWeeks` to put more of the future on screen.

Federal holidays are computed for each year:

- New Year's Day, Martin Luther King Jr. Day, Presidents Day, Memorial Day, Juneteenth, Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas Day

When a federal holiday falls on Saturday it is also observed Friday. When it falls on Sunday it is also observed Monday. If those two dates fall in different weeks, both weeks are holiday weeks. Mother's Day (second Sunday in May) and Father's Day (third Sunday in June) stay in the list because those weeks were already worth holiday points. Taking them out would change saved scores.

Empty past weeks are hidden so the April–October gap does not fill the page. Past weeks with a signup, a note, or a holiday stay visible. **Show empty past weeks** brings the rest back. **Jump to this week** scrolls to the week that contains today. The old page always marked week 1 as the current week.

## Tests

No install and no site build:

```bash
node --test test/roster.test.js test/apps-script.test.js
```

`npm test` runs the same command. `test/roster.test.js` covers weeks and scoring. `test/apps-script.test.js` checks that `apps-script/Code.gs` uses those same holiday points.

## GitHub Pages

Publish the repository root (`/`). The pages to serve are `index.html` and `roster.js`. Do not add a build command.

## Data backend

The browser loads and saves through the Google Apps Script web app URL in `index.html` (`SCRIPT_URL`). Every call is an HTTP GET. When `SCRIPT_TOKEN` is filled in, the page also sends it as `token` on every action, including `get`. Reset sends `confirm=CLEAR` as well.

| Action | Parameters |
| --- | --- |
| `get` | `action`, and `token` once `SCRIPT_TOKEN` is set |
| `signup_primary` | `action`, `wi`, `name` |
| `signup_day` | `action`, `wi`, `day`, `name` |
| `remove_primary` | `action`, `wi` |
| `remove_day` | `action`, `wi`, `day` |
| `save_note` | `action`, `wi`, `note` |
| `add_tech` | `action`, `name` |
| `remove_tech` | `action`, `name` |
| `save_settings` | `action`, `managerEmail`, `notifyEmail`, `prize1`, `prize2`, `prize3` |
| `clear_all` | `action`, `confirm=CLEAR` |

The script that is deployed today still answers `action=get` with no sign-in. A read returned the slots, tech names, activity log, prize text, notification toggle, and manager email. No write was sent. That deployed script does not check a token, and it stores 11 weeks. Treat it as open to anyone who has the URL until it is replaced.

The replacement you can paste in is `apps-script/Code.gs`. Follow `apps-script/SETUP.md`. It grows week slots on demand, scores holiday log lines the same way as the leaderboard, and ignores the token until Script Property `REQUIRE_TOKEN` is `true`. The spreadsheet layout behind the current script cannot be inferred from the JSON, so the new script does not rewrite unknown tabs. The setup guide starts with a spreadsheet copy and a JSON backup.

`SCRIPT_TOKEN` is left blank in git. Fill it with the same value as Script Property `ROSTER_TOKEN` before turning the check on. Anyone who can open the published page can read that value. It blocks people who only have the script link.

## ServiceTitan function

`netlify/functions/st-kpi.js` was not part of the roster. It was a ServiceTitan KPI proxy with a tenant id, client id, and client secret hardcoded in the file. The file is deleted. The repo had no other Netlify config. History was not rewritten, so those credentials are still in the old commit and in the diff that deletes the file. Rotate the client secret and do not reuse it. Do not paste that diff into chat or email. GitHub Pages never ran the function. If this repo is also connected to Netlify, the next deploy will no longer publish it. Disconnect Netlify if it only existed for that function.

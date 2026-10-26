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
node --test test/roster.test.js
```

`npm test` runs the same command.

## GitHub Pages

Publish the repository root (`/`). The pages to serve are `index.html` and `roster.js`. Do not add a build command.

## Data backend

The browser loads and saves through the Google Apps Script web app URL in `index.html` (`SCRIPT_URL`). The script source is not in this repo. This is what the client sends.

Every call is an HTTP GET with query parameters. The page does not send an API key, bearer token, cookie, or Google sign-in.

`action=get` returns the roster with no sign-in. A read from this environment came back HTTP 200 JSON and included the slots, tech names, activity log, prize text, notification toggle, and manager email. No write was sent.

These actions use that same public URL, still with no credential:

| Action | Parameters |
| --- | --- |
| `signup_primary` | `action`, `wi`, `name` |
| `signup_day` | `action`, `wi`, `day`, `name` |
| `remove_primary` | `action`, `wi` |
| `remove_day` | `action`, `wi`, `day` |
| `save_note` | `action`, `wi`, `note` |
| `add_tech` | `action`, `name` |
| `remove_tech` | `action`, `name` |
| `save_settings` | `action`, `managerEmail`, `notifyEmail`, `prize1`, `prize2`, `prize3` |
| `clear_all` | `action` |

Nothing in the client adds a secret for writes that it skips on reads. The read is already anonymous, so treat writes as open to anyone who has the web app URL. That includes `clear_all`.

Add a shared token check in the Apps Script (store it in Script Properties and reject the request when the query parameter does not match). Check it on every action, including `get`, because a read already returns the manager email and the full roster. A token shipped in this public page only stops someone who has the script URL and not the site. Anyone who can open the roster can read the token out of the page source. A stronger limit is to deploy the web app so only the company Google Workspace domain can call it, if that matches how techs open the page.

The script currently has 11 stored weeks, through June 28, 2026. This page sends higher `wi` values for later weeks. After you publish, claim one current week and confirm the name is still there on refresh. If it disappears or the request errors, the script is still fixed at 11 slots and needs to append empty slots up to `wi`.

Signup log lines such as "Claimed primary + 18 pts" are written by the script, not by this page. The leaderboard will score a new holiday week correctly even if the script's log still says +10, until that script's own holiday list is updated.

## ServiceTitan function

`netlify/functions/st-kpi.js` was not part of the roster. It was a ServiceTitan KPI proxy with a tenant id, client id, and client secret hardcoded in the file. The file is deleted. The repo had no other Netlify config. History was not rewritten, so those credentials are still in the old commit and in the diff that deletes the file. Rotate the client secret and do not reuse it. Do not paste that diff into chat or email. GitHub Pages never ran the function. If this repo is also connected to Netlify, the next deploy will no longer publish it. Disconnect Netlify if it only existed for that function.

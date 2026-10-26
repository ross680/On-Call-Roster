# Replace the roster's Apps Script

This is the new code behind the on-call website. You paste it into the Google Apps Script project that the roster already uses. The website address does not change.

Do this when nobody is in the middle of claiming a week. Import the backup before you publish the new web app version. If you publish first, the site looks empty until the import finishes. The names are not deleted either way.

The old spreadsheet tabs are not deleted. This script cannot see how the old script arranged its cells, so it uses new tabs and an import instead of guessing.

## 1. Make a copy of the spreadsheet

1. Open the Google Sheet that holds the roster.
2. Click **File**, then **Make a copy**.
3. Name the copy `On-call roster backup` and today's date.
4. Leave that copy alone. It is your undo button.

## 2. Save a copy of the live data

Do this before you change the script. The current script is what still knows how to read the old sheet.

1. Open the roster website and click **Settings**. You do not need to change anything. Cancel is fine. This is only so you know the site loads.
2. Open a new browser tab and paste the web app address from `index.html` (the `SCRIPT_URL` line). Add this on the end:

   `?action=get`

   The full address looks like your script address, then `?action=get`.
3. You should see a page of text that starts with `{` and ends with `}`. It includes the weeks, names, and the activity log.
4. Select all of that text and copy it.
5. Paste it into a note or a file on your computer named `roster-backup.json`. Save it.

If the page asks you to sign in, or you do not see text that starts with `{`, stop. The backup did not work. Do not paste the new script yet.

## 3. Paste the new script

1. From the roster spreadsheet, click **Extensions**, then **Apps Script**.
2. If the address bar says `docs.google.com/spreadsheets`, you are in the right place. If you only have a script.google.com project and no sheet attached, stop and read "If the script is not attached to the sheet" at the bottom before continuing.
3. Open `Code.gs`. Select all of the old code and delete it.
4. Open `apps-script/Code.gs` from this project and copy the whole file. Paste it into `Code.gs`.
5. Click the save icon.

If you see other files besides `Code.gs`, leave them. If Google later says a function is declared twice, the old roster code is still in one of those files. Use **Project history** (the clock icon) to put the old `Code.gs` back, and get help before deleting other files.

## 4. Add the token, but leave the check off

The token is a password the website will send later. Leave the check off for now so the current website keeps working while you finish these steps.

1. In the Apps Script editor, click the gear, **Project settings**.
2. Under **Script properties**, click **Add script property**.
3. Add these two rows. Type the names exactly.

   | Property | Value |
   | --- | --- |
   | `ROSTER_TOKEN` | A long password you make up. Use at least 20 letters and numbers. Do not reuse an email or bank password. |
   | `REQUIRE_TOKEN` | `false` |

4. Click **Save script properties**.
5. Write the password down somewhere safe. You will paste the same password into the website in step 7.

Anyone who can open the roster website will be able to see this password in the page source. It stops someone who only has the script link. It is not a private password for one person.

## 5. Import the backup before you publish

The saved script can import now. The live website is still on the old script until step 6, so the roster stays up while you do this.

1. Go back to the roster spreadsheet.
2. Click the **+** at the bottom to add a tab. Rename the tab exactly `RosterImport`.
3. Click cell **A1**. Paste the entire backup from step 2. It will be one long line. Press Enter.
4. Go back to Apps Script. In the function dropdown, choose `importRosterSnapshot`. Click **Run**.

Google may ask you to allow the script to see the spreadsheet. If you see "Google hasn't verified this app":

1. Click **Advanced**.
2. Click **Go to (your project name) (unsafe)**.
3. Click **Allow**.

That prompt is normal for a script you own.

When the run finishes, the log should say it imported weeks, techs, and log lines. Reload the spreadsheet. You should see new tabs named `RosterSlots`, `RosterTechs`, `RosterLog`, and `RosterSettings`. Leave the old tabs where they are.

After a reload, a **Roster backup** menu may show up next to Help. You can use that menu later. The first import is the **Run** button above.

## 6. Publish a new version of the same web app

Do not create a second web app. A second one gets a new address and the website will point at the old one.

1. Click **Deploy**, then **Manage deployments**.
2. On the deployment that is already a web app, click the pencil.
3. Under **Version**, choose **New version**.
4. Leave **Execute as** set to **Me**.
5. Leave **Who has access** set to **Anyone**. If you change this, the roster page cannot load the data.
6. Click **Deploy**. The web app address should stay the same. Copy it only if you want to compare it with `SCRIPT_URL`. They should match.
7. Open the roster website and refresh. The old names should be back. You can claim a week past June 2026. That week is added to the sheet when someone claims it. You do not add those rows yourself.

**Reset all data** on the current website stops working as soon as this version is published. That is on purpose. The reset button only works from the updated website, which sends an extra confirmation. Every other button still works while `REQUIRE_TOKEN` is `false`.

## 7. Put the same token on the website

1. Open `index.html` in this project.
2. Find the line `var SCRIPT_TOKEN = '';`
3. Put your `ROSTER_TOKEN` password between the quotes:

   `var SCRIPT_TOKEN = 'paste-the-same-password-here';`

4. Publish that change to GitHub Pages (merge it to `main`, or edit the file on GitHub and commit it to `main`).
5. Wait until the live roster page is the new one. You can confirm by opening the page, choosing **Settings**, and reading the line that says a shared token is set.

Do not turn the check on before this page is live. If you do, every phone will get "Unauthorized" until the page has the password.

## 8. Turn the token check on

1. Apps Script, gear, **Project settings**, **Script properties**.
2. Change `REQUIRE_TOKEN` from `false` to `true`.
3. Save.
4. **Deploy**, **Manage deployments**, pencil, **New version**, **Deploy**.

Refresh the roster. It should load. Claim nothing if you only want to look.

If a red banner says the token does not match, the password in `index.html` and the password in `ROSTER_TOKEN` are not the same. Fix one of them. The check stays on until you set `REQUIRE_TOKEN` back to `false` and deploy another new version.

## If something goes wrong

1. The spreadsheet copy from step 1 is still the old sheet.
2. In Apps Script, click the clock icon, **Project history**, and restore the version from before the paste.
3. Deploy that restored code again as a **New version** of the same web app.
4. The `roster-backup.json` file is a second copy of the names and weeks.

## If the script is not attached to the sheet

If Apps Script opens by itself and **Extensions > Apps Script** from the sheet is a different project, this code does not know which spreadsheet to use.

1. Open the roster spreadsheet. The address looks like `https://docs.google.com/spreadsheets/d/` then a long id, then `/edit`.
2. Copy only that long id.
3. In the script project, add a script property named `SPREADSHEET_ID` with that id as the value.
4. Then continue from step 5.

## What the new script changes

- Weeks are no longer stuck at 11. Claiming week index 40 creates the rows in between.
- Holiday weeks in the activity log use the same points as the leaderboard. A holiday primary is `+ 18 pts`. A holiday backup day is `+ 6 pts`. Two holidays in one week still count once.
- Every action, including loading the page, needs the token after you set `REQUIRE_TOKEN` to `true`.
- Resetting the roster needs the extra `confirm=CLEAR` value. The updated website sends it. A bare link does not.

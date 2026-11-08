# What Works for Mom — shared care log

A phone-friendly version of the paper door card. Static site for GitHub Pages; entries are saved to a Google Sheet through a small Apps Script, behind a family passcode. The Sheet is the only place entries are stored. Nothing personal goes in this repo.

```
index.html, styles.css, app.js   the app
config.js                        the Apps Script URL + names on the "who are you" screen
apps-script/Code.gs              the backend, pasted into the Google Sheet
test/mock-server.js              local stand-in for the backend (no Google needed)
```

## Part A — Google side (do this on a personal phone or laptop, not the work computer)

1. Go to **sheets.new** while signed into your personal Google account. Name the sheet `What Works for Mom`.
2. **Extensions → Apps Script.** Delete what's there and paste all of `apps-script/Code.gs`.
3. On the line `const PASSCODE = 'CHANGE-ME';`, replace `CHANGE-ME` with the family code. Save (💾).
4. In the function dropdown at the top, pick **setup** and click **Run**. Approve the permission prompt ("Advanced → Go to … (unsafe)" is expected for your own script). This creates the **Log** and **Tips** tabs.
5. **Deploy → New deployment → ⚙ → Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (ends in `/exec`).
6. Send that URL to Michael's work computer any way that works (text or email it to yourself). The URL is not a secret: the passcode protects the data.
7. In the **Tips** tab, fill in the "How to do it" column: which playlist and speaker, where the memory box is. The app shows this tab as "Hard moment? Try these first."

On a phone, the Apps Script editor works best in Chrome with **Desktop site** turned on.

**Changing the code later:** edit `PASSCODE`, then **Deploy → Manage deployments → ✏ → Version: New version → Deploy**. The URL stays the same. Everyone re-enters the code once.

## Part B — connect and publish (work computer)

1. Put the URL in `config.js`: `API_URL: "https://script.google.com/macros/s/…/exec"`.
2. Push this folder to its own GitHub repo (only this folder, no homework files) and turn on **Settings → Pages → Deploy from branch → main / root**.
3. Share the Pages link and the code with Joe, Jasmine, and Alex. On a phone, "Add to Home Screen" makes it open like an app.

## How saving works

- Every entry is saved on the phone first, then sent to the Sheet. If someone has no signal at the door, the entry waits on their phone and sends the next time the app is open and online. A note on the home screen says how many are waiting.
- Each entry has an ID, so if a retry sends it twice the Sheet keeps one copy.
- The Sheet is the record: open it any time to see, fix, or export entries.

## Test locally (no Google needed)

```
node test/mock-server.js        # then open http://127.0.0.1:8765, code: test
```

The mock keeps entries in memory only and applies the same passcode and validation rules as `Code.gs`.

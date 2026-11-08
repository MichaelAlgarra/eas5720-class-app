# What Works for Mom — shared care log

A phone-friendly version of the paper door card. Static site for GitHub Pages; entries are saved to a Google Sheet through a small Apps Script, behind a family passcode (stored in the script's settings, not in this repo). The Sheet is the only place entries are stored. Nothing personal goes in this repo.

```
index.html, styles.css, app.js   the app
config.js                        the Apps Script URL + names on the "who are you" screen
apps-script/Code.gs              the backend, pasted into the Google Sheet
test/mock-server.js              local stand-in for the backend (no Google needed)
```

## Part A — Google side (personal Google account, on a personal phone or laptop)

Nothing in the code needs editing.

1. Go to **sheets.new** signed into your personal Gmail. Name it `What Works for Mom`.
2. **Extensions → Apps Script.** Delete what's there, paste all of `apps-script/Code.gs` (open it on GitHub → **Raw** → copy), and click **Save**.
3. **Deploy → New deployment → ⚙ → Web app.** Execute as **Me**, Who has access **Anyone**. Click **Deploy**, then approve the permission prompt ("Advanced → Go to … (unsafe)" is expected for your own script).
4. Copy the **Web app URL** (ends in `/exec`) and send it to the work computer.

The first time the app connects:

- The **Log** and **Tips** tabs are created automatically.
- **The first code anyone enters becomes the family code.** Enter it yourself right after deploying, before you share the link. Fill in the "How to do it" column of **Tips** (playlist and speaker, where the memory box is).

**Changing the code later:** in Apps Script, open **Project Settings (⚙) → Script properties**, delete `PASSCODE`, and enter the new code in the app. Everyone else re-enters it once.

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

The mock keeps entries in memory only and applies the same validation rules as `Code.gs`. `MOCK_FIRST_RUN=1 node test/mock-server.js` mimics a fresh deploy, where the first code entered is kept.

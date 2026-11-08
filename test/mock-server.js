// Local stand-in for apps-script/Code.gs so the app can be tested without Google.
// Usage: node test/mock-server.js [port]   (passcode is "test"; data lives in memory only)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.argv[2] || 8765);
let PASSCODE = process.env.MOCK_FIRST_RUN ? "" : "test"; // MOCK_FIRST_RUN=1 mimics a fresh deploy
const CHOICES = {
  music: ["worked", "didnt", "not_tried"], memory_box: ["worked", "didnt", "not_tried"], voice: ["worked", "didnt", "not_tried"],
  mood: ["calm", "okay", "restless", "upset"], meals: ["all", "some", "little", "none"], nap: ["yes", "no"],
};
const TIPS = [
  { title: "Her songs", how: "Which playlist and which speaker or phone to use" },
  { title: "The memory box", how: "Where it is kept" },
  { title: "Slow, warm voice", how: "Make eye contact before touching her. Don't correct her, go along with her." },
];
const log = [];
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };

function handle(body) {
  const code = String(body.code || "");
  if (!PASSCODE) {
    if (code.length < 4) return { ok: false, error: "code_too_short" };
    PASSCODE = code;
  }
  if (code !== PASSCODE) return { ok: false, error: "bad_code" };
  if (body.action === "list") return { ok: true, entries: log.slice(-200).reverse(), tips: TIPS };
  if (body.action !== "add") return { ok: false, error: "unknown_action" };
  const e = body.entry || {};
  const who = String(e.who || "").trim().slice(0, 40);
  if (!who) return { ok: false, error: "who_required" };
  if (!e.id) return { ok: false, error: "id_required" };
  if (log.some((r) => r.id === e.id)) return { ok: true, duplicate: true };
  const row = { saved_at: new Date().toISOString(), id: String(e.id), who };
  for (const k of Object.keys(CHOICES)) {
    const v = String(e[k] || "");
    if (v && !CHOICES[k].includes(v)) return { ok: false, error: "bad_value", field: k };
    row[k] = v;
  }
  row.avoid = String(e.avoid || "").trim().slice(0, 500);
  row.notes = String(e.notes || "").trim().slice(0, 500);
  log.push(row);
  return { ok: true };
}

http.createServer((req, res) => {
  if (req.url === "/api" && req.method === "POST") {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", () => {
      let out;
      try { out = handle(JSON.parse(raw || "{}")); } catch (e) { out = { ok: false, error: "bad_request" }; }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(out));
    });
    return;
  }
  const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || file.includes(`${path.sep}test${path.sep}`) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`mock backend + app on http://127.0.0.1:${PORT}  (code: ${PASSCODE || "first one entered"})`));

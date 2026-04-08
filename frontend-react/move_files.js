const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'pages', 'NewSubmissionPage.tsx');
let code = fs.readFileSync(filePath, 'utf8');

const filesStartStr = "{/* ── Files Section ─────────────────────────── */}";
const quickCheckStr = "{/* ── Quick Check-in Toggle ──────────────────── */}";

const idxStart = code.indexOf(filesStartStr);
let idxEnd = code.indexOf(quickCheckStr);

if (idxStart === -1 || idxEnd === -1) {
    console.error("Could not find boundaries.");
    process.exit(1);
}

// Find appropriate leading spaces for files section
let actualStart = idxStart;
while (code[actualStart - 1] === ' ') actualStart--;
while (code[actualStart - 1] === '\n' || code[actualStart - 1] === '\r') actualStart--;

const filesSection = code.substring(actualStart, idxEnd).trim() + '\n\n                    ';
code = code.substring(0, actualStart) + code.substring(idxEnd);

const moodStr = "{/* ── Mood Rating ─────────────────────────── */}";
const targetIdx = code.indexOf(moodStr);

if (targetIdx === -1) {
    console.error("Could not find Mood Rating.");
    process.exit(1);
}

code = code.substring(0, targetIdx) + filesSection + code.substring(targetIdx);

fs.writeFileSync(filePath, code, 'utf8');
console.log("Successfully moved Files Section.");

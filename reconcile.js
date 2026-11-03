// Payment reconciliation (fixed).
//
// Reads payments.jsonl and works out how much money we actually collected.
// Run:  node reconcile.js

const fs = require("fs");

// Turn the "ts" field into a number we can compare (a bigger number is later).
function toTime(ts) {
  if (typeof ts === "number") {
    // Numbers like 1700000000 are seconds; bigger ones are milliseconds.
    return ts < 1e11 ? ts * 1000 : ts;
  }
  const t = Date.parse(ts);
  return Number.isNaN(t) ? -Infinity : t; // unreadable time = treated as oldest
}

// For every txn_id, we keep only its LATEST event here.
const latest = new Map();
let unreadable = 0;
let noTxnId = 0;

const lines = fs.readFileSync("payments.jsonl", "utf8").split("\n");

for (const line of lines) {
  if (line.trim() === "") continue; // empty line: nothing to read

  // Fix 1: a line we can't read must be skipped, not crash the program.
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    unreadable += 1;
    continue;
  }
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    unreadable += 1;
    continue;
  }

  // Fix 2: skip events that have no txn_id.
  const id = event.txn_id == null ? "" : String(event.txn_id).trim();
  if (id === "") {
    noTxnId += 1;
    continue;
  }

  // Fix 3: keep only the latest attempt for each txn_id.
  // If two attempts have the same time, the one lower in the file wins.
  const time = toTime(event.ts);
  const previous = latest.get(id);
  if (!previous || time >= previous.time) {
    latest.set(id, { event, time });
  }
}

// Fix 4: a payment counts only if its LATEST attempt is a success.
let total = 0;
let count = 0;
let badAmount = 0;
for (const { event } of latest.values()) {
  if (String(event.status).trim().toLowerCase() === "success") {
    const amount = Number(String(event.amount).replace(/,/g, ""));
    if (Number.isNaN(amount)) {
      badAmount += 1;
      continue;
    }
    total += amount;
    count += 1;
  }
}

console.log(`Skipped ${unreadable} unreadable lines and ${noTxnId} events without a txn_id.`);
console.log(`Found ${latest.size} different payments. ${badAmount} had an unreadable amount.`);

const expected = parseInt(fs.readFileSync("expected.txt", "utf8").trim(), 10);

if (count !== expected) {
  console.log(`Check failed: counted ${count} successful payments, expected ${expected}.`);
  console.log("Something in the data isn't being handled the way the README describes.");
} else {
  console.log(`Check passed: ${count} successful payments.`);
  console.log(`Your code: KOYA-${Math.round(total)}`);
}

import express from "express";
import helmet from "helmet";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "data.json");
const SEED_PATH = path.join(__dirname, "seed.json");

if (!fs.existsSync(DATA_PATH)) {
  fs.copyFileSync(SEED_PATH, DATA_PATH);
}

function readDb() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function writeDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2));
}

function withNames(db) {
  const chief = db.people[db.account.chiefId];
  const designated = db.handover.designatedChiefId
    ? db.people[db.handover.designatedChiefId]
    : null;
  return { ...db, chief, designated };
}

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  const digits = normalizePhone(phone).replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

function slugFromName(firstName, lastName) {
  const raw = `${firstName}-${lastName}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return raw || "invitee";
}

function uniqueId(db, base) {
  let id = base;
  let n = 1;
  while (db.people[id]) id = `${base}-${n++}`;
  return id;
}

function resolveSuccessor(db, body) {
  const chief = db.people[db.account.chiefId];
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const channel = body.channel === "sms" ? "sms" : "email";
  const email = normalizeEmail(body.email);
  const phone = String(body.phone || "").trim();

  if (!firstName || !lastName) {
    return { error: "First name and last name are required.", status: 400 };
  }

  if (channel === "email") {
    if (!isValidEmail(email)) {
      return { error: "Enter a valid email address.", status: 400 };
    }
    if (email === normalizeEmail(chief.email)) {
      return { error: "You cannot hand the mandate over to yourself.", status: 400 };
    }
  } else {
    if (!isValidPhone(phone)) {
      return { error: "Enter a valid mobile number.", status: 400 };
    }
    if (normalizePhone(phone) === normalizePhone(chief.phone)) {
      return { error: "You cannot hand the mandate over to yourself.", status: 400 };
    }
  }

  const existing = Object.values(db.people).find((p) => {
    if (channel === "email") return p.email && normalizeEmail(p.email) === email;
    return p.phone && normalizePhone(p.phone) === normalizePhone(phone);
  });

  if (existing) {
    if (existing.id === chief.id) {
      return { error: "You cannot hand the mandate over to yourself.", status: 400 };
    }
    existing.firstName = firstName;
    existing.lastName = lastName;
    existing.name = `${firstName} ${lastName}`;
    if (email) existing.email = email;
    if (phone) existing.phone = phone;
    return { person: existing, channel };
  }

  const person = {
    id: uniqueId(db, slugFromName(firstName, lastName)),
    firstName,
    lastName,
    name: `${firstName} ${lastName}`,
    email: email || null,
    phone: phone || null,
    role: "Invited successor",
  };
  db.people[person.id] = person;
  return { person, channel, created: true };
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/api/account", (_req, res) => {
  res.json(withNames(readDb()));
});

/** Simulated KBC detection: mandate cycle ends in September. */
app.get("/api/check-mandate", (_req, res) => {
  const db = withNames(readDb());
  const month = new Date().getMonth() + 1;
  const endingSoon = month === 9 || process.env.FORCE_MANDATE === "1";

  res.json({
    status: endingSoon ? "ending_soon" : "ok",
    suggestion: endingSoon
      ? "Invite a successor by email or SMS, then confirm with Itsme / eID"
      : null,
    month,
    chief: db.chief,
    designated: db.designated,
    handover: db.handover,
  });
});

app.post("/api/handover/initiate", (req, res) => {
  const { actorId, itsmeToken } = req.body;
  const db = readDb();

  if (actorId !== db.account.chiefId) {
    return res.status(403).json({ error: "Only the current chair can start a handover." });
  }
  if (db.handover.status !== "idle") {
    return res.status(400).json({ error: "A handover is already in progress." });
  }
  if (!itsmeToken?.verified) {
    return res.status(401).json({ error: "Itsme identity was not verified." });
  }

  const resolved = resolveSuccessor(db, req.body);
  if (resolved.error) {
    return res.status(resolved.status).json({ error: resolved.error });
  }

  const dest =
    resolved.channel === "sms"
      ? resolved.person.phone
      : resolved.person.email;

  db.handover.outgoingVerified = true;
  db.handover.incomingVerified = false;
  db.handover.status = "pending_incoming";
  db.handover.designatedChiefId = resolved.person.id;
  db.handover.invite = {
    channel: resolved.channel,
    to: dest,
    toName: resolved.person.name,
    sentAt: new Date().toISOString(),
  };
  writeDb(db);
  res.json(withNames(db));
});

app.post("/api/handover/accept", (req, res) => {
  const { actorId, itsmeToken } = req.body;
  const db = readDb();

  if (db.handover.status !== "pending_incoming") {
    return res.status(400).json({ error: "No handover is waiting for acceptance." });
  }
  if (actorId !== db.handover.designatedChiefId) {
    return res.status(403).json({ error: "Only the invited successor can accept." });
  }
  if (!itsmeToken?.verified) {
    return res.status(401).json({ error: "Itsme identity was not verified." });
  }

  const successor = db.people[actorId];
  const outgoing = db.people[db.account.chiefId];
  db.handover.incomingVerified = true;
  db.handover.status = "completed";
  db.account.chiefId = actorId;
  db.account.cardStatus = "in_transit";
  successor.role = "Current chair";
  if (outgoing && outgoing.id !== actorId) outgoing.role = "Former chair";

  db.timeline = db.timeline.map((item) =>
    item.status === "current" ? { ...item, status: "past" } : item
  );
  db.timeline.push({
    year: new Date().getFullYear(),
    chiefName: successor.name,
    status: "current",
  });
  writeDb(db);
  res.json(withNames(db));
});

app.post("/api/reset", (_req, res) => {
  fs.copyFileSync(SEED_PATH, DATA_PATH);
  res.json(withNames(readDb()));
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`KBC handover API on http://localhost:${port}`);
});

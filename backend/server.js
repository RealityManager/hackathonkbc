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
  const designated = db.people[db.handover.designatedChiefId];
  return { ...db, chief, designated };
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
      ? `Initiate handover to ${db.designated.name}`
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
    return res.status(403).json({ error: "Seul le chef actuel peut initier." });
  }
  if (!itsmeToken?.verified) {
    return res.status(401).json({ error: "Identité Itsme non validée." });
  }

  db.handover.outgoingVerified = true;
  db.handover.status = "pending_incoming";
  writeDb(db);
  res.json(withNames(db));
});

app.post("/api/handover/accept", (req, res) => {
  const { actorId, itsmeToken } = req.body;
  const db = readDb();

  if (db.handover.status !== "pending_incoming") {
    return res.status(400).json({ error: "Aucun transfert en attente." });
  }
  if (actorId !== db.handover.designatedChiefId) {
    return res.status(403).json({ error: "Seul le chef désigné peut accepter." });
  }
  if (!itsmeToken?.verified) {
    return res.status(401).json({ error: "Identité Itsme non validée." });
  }

  db.handover.incomingVerified = true;
  db.handover.status = "completed";
  db.account.chiefId = actorId;
  db.account.cardStatus = "in_transit";
  db.timeline = db.timeline.map((item) => {
    if (item.status === "current") return { ...item, status: "past" };
    if (item.status === "next") return { ...item, status: "current" };
    return item;
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

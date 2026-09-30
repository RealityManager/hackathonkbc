# Mandate Continuity for Association Accounts

A KBC proof of concept for **secure handover of association accounts**.

When a mandate ends — a scout troop, a sports club, an ASBL — the outgoing chair does not just “transfer a login”. The incoming chair inherits the **account, the payment card, and the financial memory** of the organisation, after both parties prove their identity.

---

## Problem

Association accounts change hands every year. Today that change is late, manual, and incomplete:

- The bank does not anticipate the end of a mandate.
- Identity of the incoming authorised person is weakly guaranteed.
- The new chair starts without history: no P&L, no succession of previous chairs, no operational context.

That creates friction for customers and a control gap for the bank.

## Solution

KBC detects that a mandate is ending, prompts the current chair to start a handover, requires **Itsme / eID on both sides**, then switches ownership. The incoming chair lands on a **heritage dashboard**: balance, cash-flow, timeline of previous chairs, and a printable statement. A new card is issued in their name.

This prototype implements the end-to-end flow on a sample account: **Scout Troop 123**, outgoing chair **Alice Dupont**, incoming chair **Bob Martin**.

---

## Product walkthrough

1. Sign in as Alice. If the mandate cycle is ending, a banner invites her to prepare the succession.
2. Alice confirms with a simulated Itsme / eID challenge. The request is sent to Bob.
3. Sign in as Bob. He sees the notification, confirms with Itsme / eID.
4. Ownership moves to Bob. He sees the heritage dashboard (inflows/outflows, chair timeline, recent transactions), can print the statement, and sees that a card is on its way.

Use **Reset demo** in the header to return to the initial state. The role selector simulates two devices in one screen.

---

## Security model

Handover is a **two-party check**. The API rejects the operation unless:

- the current chair initiates the transfer;
- the designated chair accepts it;
- each step carries a verified identity token;
- acceptance happens only while a transfer is pending.

`chiefId` does not change until both validations succeed. After completion, the timeline is updated and card issuance is triggered (`in_transit`).

Itsme / eID is simulated in the UI (a verified token is posted to the API). The **authorisation rules** on the server are real.

Mandate detection is represented by a seasonal rule (September, typical association year). Production would replace that with transaction-pattern detection; the user experience stays the same.

---

## Getting started

Requires Node.js.

```bash
# API — http://localhost:3001
cd backend && npm install && npm start

# UI — http://localhost:5173
cd frontend && npm install && npm run dev
```

Open the UI only. Vite proxies `/api` to the backend.

To show the succession banner outside September:

```bash
cd backend && FORCE_MANDATE=1 npm start
```

---

## Architecture

```
Web app (React)  ── /api ──►  Express
                                  │
                                  ▼
                           data.json  (runtime)
                           seed.json  (reset)
```

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/account` | Account, current chair, timeline, transactions |
| `GET` | `/api/check-mandate` | Mandate status and handover suggestion |
| `POST` | `/api/handover/initiate` | Outgoing identity check; marks transfer pending |
| `POST` | `/api/handover/accept` | Incoming identity check; switches chair |
| `POST` | `/api/reset` | Restore seed data |

**Stack:** React, Vite, Tailwind CSS, Recharts · Node.js, Express · local JSON store.

---

## Production path

The interfaces are stable. Live Itsme / eID replaces the simulated token; association detection replaces the month rule; card issuing and serverless scale sit behind the same handover events. The product contract does not change.

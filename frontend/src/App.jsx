import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const euro = (n) =>
  n.toLocaleString("fr-BE", { style: "currency", currency: "EUR" });

async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erreur API");
  }
  return res.json();
}

export default function App() {
  const [role, setRole] = useState("alice");
  const [db, setDb] = useState(null);
  const [mandate, setMandate] = useState(null);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    const [account, check] = await Promise.all([
      api("/api/account"),
      api("/api/check-mandate"),
    ]);
    setDb(account);
    setMandate(check);
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  if (!db || !mandate) {
    return (
      <div className="grid min-h-screen place-items-center text-slate-500">
        Chargement du compte associatif…
      </div>
    );
  }

  const isAlice = role === "alice";
  const isBob = role === "bob";
  const isChief = db.account.chiefId === role;
  const showBanner =
    isAlice &&
    mandate.status === "ending_soon" &&
    db.handover.status === "idle";
  const showBobNotif = isBob && db.handover.status === "pending_incoming";
  const showHeritage = isChief && db.handover.status === "completed";

  async function afterItsme() {
    const token = { verified: true, provider: "itsme-sim", at: Date.now() };
    if (modal === "outgoing") {
      await api("/api/handover/initiate", {
        method: "POST",
        body: JSON.stringify({ actorId: "alice", itsmeToken: token }),
      });
    } else {
      await api("/api/handover/accept", {
        method: "POST",
        body: JSON.stringify({ actorId: "bob", itsmeToken: token }),
      });
    }
    setModal(null);
    await refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="no-print flex items-center justify-between bg-[#00965e] px-6 py-4 text-white">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">
            KBC · Preuve de concept
          </p>
          <h1 className="text-xl font-semibold">Relève associative</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-90">Se connecter en tant que</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-full bg-white px-3 py-1.5 text-sm font-medium text-[#00965e]"
          >
            <option value="alice">Alice (sortante)</option>
            <option value="bob">Bob (entrant)</option>
          </select>
          <button
            className="rounded-full border border-white/40 px-3 py-1.5 text-xs"
            onClick={async () => {
              await api("/api/reset", { method: "POST" });
              setRole("alice");
              await refresh();
            }}
          >
            Reset démo
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 p-6">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-slate-500">{db.account.iban}</p>
              <h2 className="text-2xl font-semibold">{db.account.name}</h2>
              <p className="mt-1 text-sm">
                Chef actuel : <strong>{db.chief.name}</strong>
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Solde</p>
              <p className="text-3xl font-semibold text-[#00965e]">
                {euro(db.account.balance)}
              </p>
            </div>
          </div>
        </section>

        {showBanner && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Détection KBC · cycle de mandat
            </p>
            <h3 className="mt-1 text-xl font-semibold">
              Il est temps de préparer la relève
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-slate-700">
              Le mandat de {db.chief.name} se termine bientôt. Suggestion :{" "}
              {mandate.suggestion}.
            </p>
            <button
              className="mt-4 rounded-full bg-[#00965e] px-5 py-2 text-sm font-medium text-white"
              onClick={() => setModal("outgoing")}
            >
              Préparer la relève
            </button>
          </section>
        )}

        {isAlice && db.handover.status === "pending_incoming" && (
          <section className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="font-medium">Transfert envoyé à {db.designated.name}.</p>
            <p className="text-sm text-slate-600">
              En attente de sa validation Itsme (double check).
            </p>
          </section>
        )}

        {showBobNotif && (
          <section className="rounded-2xl border border-[#00965e]/30 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#00965e]">
              Notification
            </p>
            <h3 className="mt-1 text-xl font-semibold">
              {db.people.alice.name} vous transmet la gestion
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Acceptez pour devenir chef du compte, avec la mémoire financière
              de la troupe.
            </p>
            <button
              className="mt-4 rounded-full bg-[#ff5f00] px-5 py-2 text-sm font-medium text-white"
              onClick={() => setModal("incoming")}
            >
              Accepter & prendre le contrôle
            </button>
          </section>
        )}

        {isBob && db.handover.status === "idle" && (
          <p className="rounded-2xl bg-white p-5 text-sm text-slate-600 shadow-sm">
            Pas encore de transfert. Passez sur Alice pour initier la relève.
          </p>
        )}

        {showHeritage && <HeritageDashboard db={db} />}

        {db.account.cardStatus === "in_transit" && isChief && (
          <section className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#00965e]/10 text-lg">
              💳
            </span>
            <div>
              <p className="font-medium">Carte en route</p>
              <p className="text-sm text-slate-600">
                Le système commande automatiquement la nouvelle carte au nom de{" "}
                {db.chief.name}.
              </p>
            </div>
          </section>
        )}
      </main>

      {modal && (
        <ItsmeModal
          name={modal === "outgoing" ? db.people.alice.name : db.people.bob.name}
          onCancel={() => setModal(null)}
          onConfirm={async () => {
            try {
              setError("");
              await afterItsme();
            } catch (e) {
              setError(e.message);
              setModal(null);
            }
          }}
        />
      )}
    </div>
  );
}

function ItsmeModal({ name, onCancel, onConfirm }) {
  return (
    <div className="no-print fixed inset-0 z-20 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#ff5f00]">
          Simulation Itsme / eID
        </p>
        <h3 className="mt-2 text-xl font-semibold">Confirmer l’identité</h3>
        <p className="mt-2 text-sm text-slate-600">
          En production, l’API Itsme validerait {name} en temps réel. Ici, un
          token fictif <code>verified: true</code> est renvoyé au backend.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button className="rounded-full px-4 py-2 text-sm" onClick={onCancel}>
            Annuler
          </button>
          <button
            className="rounded-full bg-[#ff5f00] px-4 py-2 text-sm font-medium text-white"
            onClick={onConfirm}
          >
            Valider avec Itsme
          </button>
        </div>
      </div>
    </div>
  );
}

function HeritageDashboard({ db }) {
  return (
    <section className="space-y-5">
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold">Dashboard héritage</h3>
            <p className="text-sm text-slate-600">
              Continuité de la mémoire — tu reprends là où Alice s’est arrêtée.
            </p>
          </div>
          <button
            className="no-print rounded-full border border-[#00965e] px-4 py-2 text-sm text-[#00965e]"
            onClick={() => window.print()}
          >
            Télécharger le bilan PDF
          </button>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={db.monthly} barSize={16}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="in" name="Recettes" fill="#00965e" isAnimationActive={false} />
              <Bar dataKey="out" name="Dépenses" fill="#c45c26" isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h4 className="font-semibold">Timeline des chefs</h4>
          <ol className="mt-4 space-y-3">
            {db.timeline.map((item) => (
              <li key={item.year} className="flex items-center gap-3">
                <span
                  className={`h-3 w-3 rounded-full ${
                    item.status === "current" ? "bg-[#00965e]" : "bg-slate-300"
                  }`}
                />
                <span className="w-12 text-sm text-slate-500">{item.year}</span>
                <span className="font-medium">{item.chiefName}</span>
                {item.status === "current" && (
                  <span className="rounded-full bg-[#00965e]/10 px-2 py-0.5 text-xs text-[#00965e]">
                    Moi
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h4 className="font-semibold">Dernières opérations</h4>
          <ul className="mt-4 divide-y">
            {db.transactions.map((tx) => (
              <li key={tx.date + tx.label} className="flex justify-between py-2 text-sm">
                <span>
                  <span className="text-slate-500">{tx.date}</span> · {tx.label}
                </span>
                <span className={tx.amount < 0 ? "text-orange-700" : "text-[#00965e]"}>
                  {euro(tx.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

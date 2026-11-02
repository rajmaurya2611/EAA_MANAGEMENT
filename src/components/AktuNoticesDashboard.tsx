import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebaseConfig";

// Same env var your other dashboard page already uses for direct Firebase REST reads.
const FIREBASE_DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string;

// Matches firebase_registry.py's FIREBASE_COLLECTION_PATH default.
const AKTU_NODE_PATH = "version12/AKTU/circulars/documents";

type AiSummaryStatus = "processing" | "ready" | "failed";

// derived/ai_summary — exactly what Gemini wrote back, nothing added.
type AiSummary = {
  heading?: string;
  subheading?: string;
  summary?: string;
  category?: string;
  audience?: string;
  action_required?: string;
  important_dates?: string[];
  key_points?: string[];
  truncated?: boolean;
  source_text_chars?: number;
  status?: AiSummaryStatus;
  error?: string | null;
  model?: string;
  generated_at?: string;
};

type RawOcr = {
  text?: string;
  page_count?: number;
  char_count?: number;
};

type RawDerived = {
  ai_summary?: AiSummary;
};

// Raw shape of version12/AKTU/circulars/documents/{id} as written by
// /download-pdfs + /extract-paddle. attempts/claimed_by/claim_token/
// lease_until_ts etc. exist on the node but are pipeline bookkeeping, not
// rendered here — they don't help a user decide anything about the notice.
type RawDocument = {
  filename?: string;
  title?: string;
  pdf_url?: string;
  posted_on?: string;
  downloaded_at?: string;
  extracted_at?: string;
  status?: string;
  ocr?: RawOcr;
  derived?: RawDerived;
};

type AktuDocument = RawDocument & { id: string };

function buildFirebaseRestUrl(baseUrl: string, nodePath: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = nodePath.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}.json`;
}

async function buildAuthedUrl(nodePath: string): Promise<string> {
  if (!FIREBASE_DB_URL) {
    throw new Error("Missing VITE_FIREBASE_DATABASE_URL in .env");
  }
  const url = buildFirebaseRestUrl(FIREBASE_DB_URL, nodePath);
  const user = auth.currentUser;
  if (!user) return url;
  const token = await user.getIdToken();
  return `${url}?auth=${encodeURIComponent(token)}`;
}

async function fetchAllDocuments(): Promise<AktuDocument[]> {
  const url = await buildAuthedUrl(AKTU_NODE_PATH);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Firebase read failed: HTTP ${res.status} ${res.statusText} - ${message}`);
  }
  const payload: unknown = await res.json();
  if (!payload || typeof payload !== "object") return [];
  return Object.entries(payload as Record<string, RawDocument>).map(([id, doc]) => ({
    id,
    ...doc,
  }));
}

function recencyTimestamp(doc: AktuDocument): number {
  return (
    Date.parse(doc.posted_on ?? "") ||
    Date.parse(doc.downloaded_at ?? "") ||
    Date.parse(doc.extracted_at ?? "") ||
    0
  );
}

function sortByMostRecent(docs: AktuDocument[]): AktuDocument[] {
  return [...docs].sort((a, b) => recencyTimestamp(b) - recencyTimestamp(a));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${className}`}>
      {label}
    </span>
  );
}

const SUMMARY_STYLES: Record<AiSummaryStatus | "pending", string> = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-700",
  processing: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-rose-200 bg-rose-50 text-rose-700",
  pending: "border-slate-200 bg-slate-100 text-slate-600",
};

function SummaryStatusPill({ summary }: { summary?: AiSummary }) {
  const status = summary?.status ?? "pending";
  const label = status === "pending" ? "No summary yet" : `Summary: ${status}`;
  return <Pill label={label} className={SUMMARY_STYLES[status]} />;
}

function NoticeCard({ doc }: { doc: AktuDocument }) {
  const summary = doc.derived?.ai_summary;
  const heading = summary?.heading || doc.title || doc.filename || "Untitled notice";

  return (
    <details className="rounded-[20px] border border-slate-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <SummaryStatusPill summary={summary} />
          {summary?.category && (
            <Pill label={summary.category} className="border-indigo-200 bg-indigo-50 text-indigo-700" />
          )}
          {summary?.truncated && (
            <Pill label="Partial excerpt" className="border-amber-200 bg-amber-50 text-amber-700" />
          )}
        </div>

        <h3 className="mt-1.5 text-base font-bold text-slate-900">{heading}</h3>
        <p className="mt-1 text-sm text-slate-600">
          {summary?.summary || "Gemini summary not generated yet for this notice."}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">📅 Posted {formatDate(doc.posted_on)}</span>
          <span>{doc.ocr?.page_count ?? 0} page(s) · {(doc.ocr?.char_count ?? 0).toLocaleString()} chars</span>
          {doc.pdf_url && (
            <a
              href={doc.pdf_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-semibold text-blue-700 hover:underline"
            >
              View PDF ↗
            </a>
          )}
        </div>
      </summary>

      <div className="border-t border-slate-200 px-5 py-4">
        {summary && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Audience</div>
              <div className="mt-1 text-sm text-slate-900">{summary.audience || "-"}</div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Action required</div>
              <div className="mt-1 text-sm text-slate-900">{summary.action_required || "-"}</div>
            </div>
            {!!summary.important_dates?.length && (
              <div className="rounded-2xl bg-slate-50 p-3 sm:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Important dates</div>
                <ul className="mt-1 list-inside list-disc text-sm text-slate-900">
                  {summary.important_dates.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
            {!!summary.key_points?.length && (
              <div className="rounded-2xl bg-slate-50 p-3 sm:col-span-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Key points</div>
                <ul className="mt-1 list-inside list-disc text-sm text-slate-900">
                  {summary.key_points.map((k, i) => <li key={i}>{k}</li>)}
                </ul>
              </div>
            )}
            {summary.truncated && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">
                Only {summary.source_text_chars?.toLocaleString() ?? "part"} of the document was summarized
                (too long for a single pass) — open the original PDF for full details.
              </div>
            )}
            {summary.status === "failed" && summary.error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 sm:col-span-2">
                Summary failed: {summary.error}
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Downloaded</div>
            <div className="mt-1 text-sm text-slate-900">{formatDate(doc.downloaded_at)}</div>
          </div>
          <div className="rounded-2xl bg-slate-50 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Extracted</div>
            <div className="mt-1 text-sm text-slate-900">{formatDate(doc.extracted_at)}</div>
          </div>
        </div>

        {doc.ocr?.text && (
          <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
              Raw OCR text
            </summary>
            <pre className="max-h-[320px] overflow-auto border-t border-slate-200 bg-slate-950 p-4 text-xs leading-6 text-slate-200">
              {doc.ocr.text}
            </pre>
          </details>
        )}
      </div>
    </details>
  );
}

export default function AktuNoticesDashboard() {
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);
  const [docs, setDocs] = useState<AktuDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  useEffect(() => onAuthStateChanged(auth, setAuthUser), []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchAllDocuments();
      setDocs(sortByMostRecent(all));
      setLastFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(to_bottom,_#f8fafc,_#eef2ff)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">AKTU Notices</h1>
            <p className="mt-1 text-sm text-slate-500">
              {docs.length} notice{docs.length === 1 ? "" : "s"} · most recent first
              {lastFetchedAt && ` · refreshed ${formatDate(new Date(lastFetchedAt).toISOString())}`}
              {!authUser && " · signed out (ok only if Firebase rules allow public read on this path)"}
            </p>
          </div>
          <button
            onClick={() => void loadAll()}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {docs.map((doc) => (
            <NoticeCard key={doc.id} doc={doc} />
          ))}
        </div>

        {!docs.length && !loading && !error && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No notices found in Firebase yet.
          </div>
        )}
      </div>
    </div>
  );
}

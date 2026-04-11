import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../firebaseConfig";

type RequestStatus = "idle" | "loading" | "success" | "error";

type RawApiResponse = {
  ok?: boolean;
  baseline?: {
    node_path?: string;
    today_ist?: string;
    deleted_local_files?: number;
    expired_keys_count?: number;
    expired_deleted_from_firebase?: number;
    kept_count_after_prune?: number;
    saved_file?: string;
    existing_job_keys_count?: number;
    existing_comp_keys_count?: number;
  };
  scrape?: {
    sources?: string[];
    per_page?: number;
    max_pages?: number;
    delta_total?: number;
    delta_by_source?: Record<string, number>;
    platform_stats?: Record<
      string,
      {
        pages_fetched?: number;
        items_seen?: number;
        kept_delta?: number;
        skipped_existing?: number;
        skipped_missing_job_id?: number;
        skipped_missing_competition_id?: number;
        early_stop_all_seen_page?: number;
      }
    >;
  };
  firebase?: {
    node_path?: string;
    uploaded?: number;
    mode?: string;
    generated_keys_sample?: string[];
  };
};

type RunBy = {
  uid: string;
  name: string;
  email: string;
};

type DashboardSummary = {
  title: string;
  headline: string;
  source: string;
  pipelineStatus: "Success" | "Failed";
  lastSync: string;
  liveRecords: number;
  newThisRun: number;
  published: number;
  scanned: number;
  duplicatesSkipped: number;
  updatedAtIso: string;
  updatedAtEpochMs: number;
  runBy: RunBy;
  technicalDetails: RawApiResponse;
};

type ApiState = {
  status: RequestStatus;
  error: string | null;
  rawData: unknown | null;
  summary: DashboardSummary | null;
  dbSyncMessage: string | null;
  initialHistoryLoaded: boolean;
};

const initialState: ApiState = {
  status: "idle",
  error: null,
  rawData: null,
  summary: null,
  dbSyncMessage: null,
  initialHistoryLoaded: false,
};

const OPPORTUNITIES_API_URL = import.meta.env.VITE_JOBS_API_URL as string;
const EVENTS_API_URL = import.meta.env.VITE_COMPETITIONS_API_URL as string;
const FIREBASE_DB_URL = import.meta.env.VITE_FIREBASE_DATABASE_URL as string;

const FALLBACK_RUN_BY_NAME =
  (import.meta.env.VITE_RUN_BY_NAME as string | undefined) || "Unknown User";
const FALLBACK_RUN_BY_EMAIL =
  (import.meta.env.VITE_RUN_BY_EMAIL as string | undefined) || "";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRawApiResponse(value: unknown): value is RawApiResponse {
  return isObject(value);
}

function prettifyNameFromEmail(email?: string | null) {
  if (!email) return "";
  const prefix = email.split("@")[0];
  return prefix
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function normalizeRunnerFromFirebaseUser(user: User | null): RunBy {
  if (!user) {
    return {
      uid: "",
      name: FALLBACK_RUN_BY_NAME,
      email: FALLBACK_RUN_BY_EMAIL,
    };
  }

  const displayName = user.displayName?.trim();
  const email = user.email?.trim() || "";
  const derivedName = prettifyNameFromEmail(email);

  return {
    uid: user.uid ?? "",
    name: displayName || derivedName || FALLBACK_RUN_BY_NAME,
    email,
  };
}

function normalizeRunBy(value: unknown): RunBy {
  if (isObject(value)) {
    return {
      uid: typeof value.uid === "string" ? value.uid : "",
      name:
        typeof value.name === "string" && value.name.trim()
          ? value.name
          : FALLBACK_RUN_BY_NAME,
      email: typeof value.email === "string" ? value.email : "",
    };
  }

  return {
    uid: "",
    name: FALLBACK_RUN_BY_NAME,
    email: "",
  };
}

function normalizeDashboardSummary(value: unknown): DashboardSummary | null {
  if (!isObject(value)) return null;

  const hasBaseShape =
    typeof value.title === "string" &&
    typeof value.headline === "string" &&
    typeof value.source === "string" &&
    typeof value.pipelineStatus === "string" &&
    typeof value.lastSync === "string" &&
    typeof value.liveRecords === "number" &&
    typeof value.newThisRun === "number" &&
    typeof value.published === "number" &&
    typeof value.scanned === "number" &&
    typeof value.duplicatesSkipped === "number" &&
    typeof value.updatedAtIso === "string" &&
    typeof value.updatedAtEpochMs === "number";

  if (!hasBaseShape) return null;

  const v = value as {
    title: string;
    headline: string;
    source: string;
    pipelineStatus: string;
    lastSync: string;
    liveRecords: number;
    newThisRun: number;
    published: number;
    scanned: number;
    duplicatesSkipped: number;
    updatedAtIso: string;
    updatedAtEpochMs: number;
    runBy?: unknown;
    technicalDetails?: unknown;
  };

  return {
    title: v.title,
    headline: v.headline,
    source: v.source,
    pipelineStatus: v.pipelineStatus === "Success" ? "Success" : "Failed",
    lastSync: v.lastSync,
    liveRecords: v.liveRecords,
    newThisRun: v.newThisRun,
    published: v.published,
    scanned: v.scanned,
    duplicatesSkipped: v.duplicatesSkipped,
    updatedAtIso: v.updatedAtIso,
    updatedAtEpochMs: v.updatedAtEpochMs,
    runBy: normalizeRunBy(v.runBy),
    technicalDetails: isObject(v.technicalDetails)
      ? (v.technicalDetails as RawApiResponse)
      : {},
  };
}

function formatSavedFileTimestamp(savedFile?: string, fallbackDate?: string) {
  if (!savedFile) return fallbackDate ?? "-";

  const normalized = savedFile.replace(/\\/g, "/");
  const match = normalized.match(/_(\d{8})_(\d{6})\.json$/);
  if (!match) return fallbackDate ?? "-";

  const [, datePart, timePart] = match;
  const year = Number(datePart.slice(0, 4));
  const month = Number(datePart.slice(4, 6));
  const day = Number(datePart.slice(6, 8));
  const hour = Number(timePart.slice(0, 2));
  const minute = Number(timePart.slice(2, 4));
  const second = Number(timePart.slice(4, 6));

  const dt = new Date(year, month - 1, day, hour, minute, second);

  return dt.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getPrimaryPlatformStats(payload: RawApiResponse) {
  const stats = payload.scrape?.platform_stats;
  if (!stats) return undefined;

  const firstKey = Object.keys(stats)[0];
  if (!firstKey) return undefined;

  return {
    source: firstKey,
    stats: stats[firstKey],
  };
}

function buildHeadline(payload: RawApiResponse) {
  if (!payload.ok) return "Sync failed";

  const newCount = payload.scrape?.delta_total ?? 0;
  if (newCount > 0) return `${newCount} new items found`;
  return "No new items found";
}

function toDashboardSummary(
  title: string,
  payload: RawApiResponse,
  runBy: RunBy
): DashboardSummary {
  const primary = getPrimaryPlatformStats(payload);
  const platformStats = primary?.stats;

  return {
    title,
    headline: buildHeadline(payload),
    source: primary?.source ?? payload.scrape?.sources?.[0] ?? "-",
    pipelineStatus: payload.ok ? "Success" : "Failed",
    lastSync: formatSavedFileTimestamp(
      payload.baseline?.saved_file,
      payload.baseline?.today_ist
    ),
    liveRecords: payload.baseline?.kept_count_after_prune ?? 0,
    newThisRun: payload.scrape?.delta_total ?? 0,
    published: payload.firebase?.uploaded ?? 0,
    scanned: platformStats?.items_seen ?? 0,
    duplicatesSkipped: platformStats?.skipped_existing ?? 0,
    updatedAtIso: new Date().toISOString(),
    updatedAtEpochMs: Date.now(),
    runBy,
    technicalDetails: payload,
  };
}

function buildFirebaseRestUrl(baseUrl: string, nodePath: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = nodePath.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}.json`;
}

function getRunnerName(runBy?: RunBy | null) {
  if (!runBy) return "Unknown User";
  if (runBy.name?.trim()) return runBy.name.trim();
  if (runBy.email?.trim()) return prettifyNameFromEmail(runBy.email);
  return "Unknown User";
}

function getRelativeTime(epochMs?: number) {
  if (!epochMs) return "No recent update";

  const diffMs = Date.now() - epochMs;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hr ago`;
  return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
}

function getFreshnessMeta(epochMs?: number) {
  if (!epochMs) {
    return {
      label: "No data",
      className: "border-slate-200 bg-slate-100 text-slate-600",
    };
  }

  const diffHr = (Date.now() - epochMs) / (1000 * 60 * 60);

  if (diffHr <= 6) {
    return {
      label: "Fresh",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (diffHr <= 24) {
    return {
      label: "Today",
      className: "border-sky-200 bg-sky-50 text-sky-700",
    };
  }

  if (diffHr <= 72) {
    return {
      label: "Aging",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Stale",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  };
}

async function overwriteLatestHistory(
  nodePath: "/automation/history/opportunities" | "/automation/history/events",
  summary: DashboardSummary
) {
  if (!FIREBASE_DB_URL) {
    throw new Error("Missing VITE_FIREBASE_DATABASE_URL in .env");
  }

  const url = buildFirebaseRestUrl(FIREBASE_DB_URL, nodePath);

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(summary),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Firebase history write failed: HTTP ${response.status} ${response.statusText} - ${message}`
    );
  }
}

async function fetchLatestHistory(
  nodePath: "/automation/history/opportunities" | "/automation/history/events"
): Promise<DashboardSummary | null> {
  if (!FIREBASE_DB_URL) {
    throw new Error("Missing VITE_FIREBASE_DATABASE_URL in .env");
  }

  const url = buildFirebaseRestUrl(FIREBASE_DB_URL, nodePath);

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `Firebase history read failed: HTTP ${response.status} ${response.statusText} - ${message}`
    );
  }

  const payload: unknown = await response.json();
  if (!payload) return null;

  return normalizeDashboardSummary(payload);
}

function SmallPill({
  label,
  className = "",
}: {
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function MiniMetric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function TopCommandBar({
  authReady,
  authUser,
  totalNew,
}: {
  authReady: boolean;
  authUser: User | null;
  totalNew: number;
}) {
  const runner = normalizeRunnerFromFirebaseUser(authUser);

  return (
    <section className="mb-6 rounded-[28px] border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Latest pipeline snapshot
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
            Automation history
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Compact cards on top, details below.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Logged-in Admin
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">
              {authReady ? getRunnerName(runner) : "Checking auth session..."}
            </div>
          </div>

          <SmallPill
            label={`Total new this cycle: ${totalNew}`}
            className="border-blue-200 bg-blue-50 text-blue-700"
          />
        </div>
      </div>
    </section>
  );
}

function SnapshotCard({
  label,
  emoji,
  state,
  buttonLabel,
  buttonClassName,
  onRun,
  authReady,
  authUser,
}: {
  label: string;
  emoji: string;
  state: ApiState;
  buttonLabel: string;
  buttonClassName: string;
  onRun: () => void;
  authReady: boolean;
  authUser: User | null;
}) {
  const summary = state.summary;
  const freshness = getFreshnessMeta(summary?.updatedAtEpochMs);
  const buttonDisabled = !authReady || !authUser || state.status === "loading";

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">
            {emoji}
          </div>
          <div>
            <div className="text-lg font-bold text-slate-900">{label}</div>
            <div className="mt-1 text-sm text-slate-500">
              {summary?.headline ?? "No history yet"}
            </div>
          </div>
        </div>

        <button
          onClick={onRun}
          disabled={buttonDisabled}
          className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
        >
          {state.status === "loading" ? "Running..." : buttonLabel}
        </button>
      </div>

      {state.error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {state.error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MiniMetric label="Status" value={summary?.pipelineStatus ?? "-"} />
        <MiniMetric label="Last Sync" value={summary?.lastSync ?? "-"} />
        <MiniMetric label="Live" value={summary?.liveRecords ?? "-"} />
        <MiniMetric label="New" value={summary?.newThisRun ?? "-"} />
      </div>

      <div className="mt-4 flex flex-col gap-2 text-sm text-slate-600 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>
          Source:{" "}
          <span className="font-semibold text-slate-900">
            {summary?.source ?? "-"}
          </span>
        </span>

        <span>
          Run By:{" "}
          <span className="font-semibold text-slate-900">
            {getRunnerName(summary?.runBy)}
          </span>
        </span>

        <div className="flex items-center gap-2">
          <SmallPill label={freshness.label} className={freshness.className} />
          <span>{getRelativeTime(summary?.updatedAtEpochMs)}</span>
        </div>
      </div>
    </div>
  );
}

function DetailSection({
  title,
  endpoint,
  state,
}: {
  title: string;
  endpoint: string;
  state: ApiState;
}) {
  const summary = state.summary;
  const primaryPlatformStats = summary?.technicalDetails
    ? getPrimaryPlatformStats(summary.technicalDetails)?.stats
    : undefined;

  const freshness = useMemo(
    () => getFreshnessMeta(summary?.updatedAtEpochMs),
    [summary?.updatedAtEpochMs]
  );

  return (
    <section className="h-full rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900">{title}</h2>

            <SmallPill
              label={
                state.status === "loading"
                  ? "Running"
                  : state.status === "error"
                  ? "Failed"
                  : "Idle"
              }
              className="border-slate-200 bg-slate-50 text-slate-700"
            />

            <SmallPill label={freshness.label} className={freshness.className} />
          </div>

          <div className="mt-2 text-sm text-slate-500">
            {summary?.headline ?? "No data available yet"}
          </div>

          {state.dbSyncMessage && (
            <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {state.dbSyncMessage}
            </div>
          )}

          {state.error && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {state.error}
            </div>
          )}
        </div>

        <div className="text-sm text-slate-500">
          {getRelativeTime(summary?.updatedAtEpochMs)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-5">
        <MiniMetric label="Published" value={summary?.published ?? "-"} />
        <MiniMetric label="Scanned" value={summary?.scanned ?? "-"} />
        <MiniMetric label="Duplicates" value={summary?.duplicatesSkipped ?? "-"} />
        <MiniMetric
          label="Pages Fetched"
          value={primaryPlatformStats?.pages_fetched ?? "-"}
        />
        <MiniMetric
          label="Early Stop Page"
          value={primaryPlatformStats?.early_stop_all_seen_page ?? "-"}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Source
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {summary?.source ?? "-"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Last Sync
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {summary?.lastSync ?? "-"}
          </div>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Run By
          </div>
          <div className="mt-1 text-sm font-semibold text-slate-900">
            {getRunnerName(summary?.runBy)}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
          Technical details
        </summary>

        <div className="border-t border-slate-200 px-4 py-4">
          <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Endpoint
            </div>
            <div className="mt-1 break-all font-mono text-xs text-slate-700">
              {endpoint || "Not configured"}
            </div>
          </div>

          <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
            {typeof state.rawData === "string"
              ? state.rawData
              : JSON.stringify(
                  state.rawData ?? summary?.technicalDetails ?? {},
                  null,
                  2
                )}
          </pre>
        </div>
      </details>
    </section>
  );
}

export default function ScraperDashboard() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(auth.currentUser);

  const [opportunitiesState, setOpportunitiesState] =
    useState<ApiState>(initialState);
  const [eventsState, setEventsState] = useState<ApiState>(initialState);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const loadInitialHistory = async () => {
      try {
        const [opportunitiesHistory, eventsHistory] = await Promise.all([
          fetchLatestHistory("/automation/history/opportunities"),
          fetchLatestHistory("/automation/history/events"),
        ]);

        setOpportunitiesState((prev) => ({
          ...prev,
          summary: opportunitiesHistory,
          rawData: opportunitiesHistory?.technicalDetails ?? null,
          initialHistoryLoaded: true,
        }));

        setEventsState((prev) => ({
          ...prev,
          summary: eventsHistory,
          rawData: eventsHistory?.technicalDetails ?? null,
          initialHistoryLoaded: true,
        }));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load latest history";

        setOpportunitiesState((prev) => ({
          ...prev,
          error: message,
          initialHistoryLoaded: true,
        }));

        setEventsState((prev) => ({
          ...prev,
          error: message,
          initialHistoryLoaded: true,
        }));
      }
    };

    void loadInitialHistory();
  }, []);

  const callApi = async (
    url: string,
    title: string,
    historyNode: "/automation/history/opportunities" | "/automation/history/events",
    setState: Dispatch<SetStateAction<ApiState>>
  ) => {
    if (!url) {
      setState({
        status: "error",
        error: "Missing API URL in .env",
        rawData: null,
        summary: null,
        dbSyncMessage: null,
        initialHistoryLoaded: true,
      });
      return;
    }

    setState((prev) => ({
      ...prev,
      status: "loading",
      error: null,
      dbSyncMessage: null,
    }));

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      const contentType = res.headers.get("content-type") || "";
      const payload: unknown = contentType.includes("application/json")
        ? await res.json()
        : await res.text();

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status} ${res.statusText} - ${
            typeof payload === "string" ? payload : JSON.stringify(payload)
          }`
        );
      }

      if (!isRawApiResponse(payload)) {
        throw new Error("Unexpected API response shape");
      }

      const runBy = normalizeRunnerFromFirebaseUser(authUser);
      const summary = toDashboardSummary(title, payload, runBy);

      await overwriteLatestHistory(historyNode, summary);

      setState({
        status: "success",
        error: null,
        rawData: payload,
        summary,
        dbSyncMessage: `Latest history synced to ${historyNode}`,
        initialHistoryLoaded: true,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: error instanceof Error ? error.message : "Request failed",
        dbSyncMessage: null,
        initialHistoryLoaded: true,
      }));
    }
  };

  // const totalNew =
  //   (opportunitiesState.summary?.newThisRun ?? 0) +
  //   (eventsState.summary?.newThisRun ?? 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_28%),linear-gradient(to_bottom,_#f8fafc,_#eef2ff)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* <TopCommandBar
          authReady={authReady}
          authUser={authUser}
          totalNew={totalNew}
        /> */}

        <div className="mb-4 text-sm text-slate-600">
          Last Execution Details
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <SnapshotCard
            label="Opportunities"
            emoji="📈"
            state={opportunitiesState}
            buttonLabel="Run Opportunities"
            buttonClassName="bg-slate-900 hover:bg-slate-800"
            authReady={authReady}
            authUser={authUser}
            onRun={() =>
              callApi(
                OPPORTUNITIES_API_URL,
                "Opportunities Automation",
                "/automation/history/opportunities",
                setOpportunitiesState
              )
            }
          />

          <SnapshotCard
            label="Events"
            emoji="🗓️"
            state={eventsState}
            buttonLabel="Run Events"
            buttonClassName="bg-blue-700 hover:bg-blue-600"
            authReady={authReady}
            authUser={authUser}
            onRun={() =>
              callApi(
                EVENTS_API_URL,
                "Events Automation",
                "/automation/history/events",
                setEventsState
              )
            }
          />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
          <DetailSection
            title="Opportunities details"
            endpoint={OPPORTUNITIES_API_URL}
            state={opportunitiesState}
          />

          <DetailSection
            title="Events details"
            endpoint={EVENTS_API_URL}
            state={eventsState}
          />
        </div>
      </div>
    </div>
  );
}
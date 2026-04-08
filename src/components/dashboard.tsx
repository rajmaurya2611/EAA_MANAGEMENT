import { useEffect, useMemo, useState } from "react";

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

// Optional if your database requires auth.
// const FIREBASE_AUTH_TOKEN = import.meta.env.VITE_FIREBASE_AUTH_TOKEN as string | undefined;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRawApiResponse(value: unknown): value is RawApiResponse {
  return isObject(value);
}

function isDashboardSummary(value: unknown): value is DashboardSummary {
  if (!isObject(value)) return false;

  return (
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
    typeof value.updatedAtEpochMs === "number"
  );
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

function buildHeadline(title: string, payload: RawApiResponse) {
  if (!payload.ok) {
    return `${title} sync failed`;
  }

  const newCount = payload.scrape?.delta_total ?? 0;

  if (newCount > 0) {
    return `${title} sync completed — ${newCount} new items added`;
  }

  return `${title} sync completed — no new items found`;
}

function toDashboardSummary(
  title: string,
  payload: RawApiResponse
): DashboardSummary {
  const primary = getPrimaryPlatformStats(payload);
  const platformStats = primary?.stats;

  return {
    title,
    headline: buildHeadline(title, payload),
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
    technicalDetails: payload,
  };
}

function buildFirebaseRestUrl(baseUrl: string, nodePath: string) {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = nodePath.replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}.json`;
}

function getRelativeTime(epochMs?: number) {
  if (!epochMs) return "No recent update";

  const diffMs = Date.now() - epochMs;
  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMin < 1) return "Updated just now";
  if (diffMin < 60) return `Updated ${diffMin} min ago`;
  if (diffHr < 24) return `Updated ${diffHr} hr ago`;
  return `Updated ${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
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
      className: "border-blue-200 bg-blue-50 text-blue-700",
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
    throw new Error("Missing VITE_FIREBASE_URL in .env");
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
    throw new Error("Missing VITE_FIREBASE_URL in .env");
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
  if (!isDashboardSummary(payload)) return null;

  return payload;
}

function StatusBadge({ status }: { status: RequestStatus }) {
  const styles: Record<RequestStatus, string> = {
    idle: "border-slate-200 bg-slate-100 text-slate-600",
    loading: "border-amber-200 bg-amber-50 text-amber-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    error: "border-rose-200 bg-rose-50 text-rose-700",
  };

  const labels: Record<RequestStatus, string> = {
    idle: "Idle",
    loading: "Running",
    success: "Success",
    error: "Failed",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {status === "loading" && (
        <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-current" />
      )}
      {labels[status]}
    </span>
  );
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${accent ?? "text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function LastUpdateHero({
  opportunitiesSummary,
  eventsSummary,
}: {
  opportunitiesSummary: DashboardSummary | null;
  eventsSummary: DashboardSummary | null;
}) {
  const cards = [
    {
      key: "opportunities",
      title: "Opportunities",
      summary: opportunitiesSummary,
    },
    {
      key: "events",
      title: "Events",
      summary: eventsSummary,
    },
  ];

  return (
    <section className="mb-8 rounded-[28px] border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Last Known Update
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
            Latest pipeline snapshot
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Users can immediately see the most recent sync outcome without
            triggering the pipelines again.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map(({ key, title, summary }) => {
          const freshness = getFreshnessMeta(summary?.updatedAtEpochMs);

          return (
            <div
              key={key}
              className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-bold text-slate-900">{title}</div>
                  <div className="mt-1 text-sm text-slate-500">
                    {summary?.headline ?? "No update available yet"}
                  </div>
                </div>

                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${freshness.className}`}
                >
                  {freshness.label}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-100 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Last Sync
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {summary?.lastSync ?? "-"}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-100 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Status
                  </div>
                  <div
                    className={`mt-1 text-sm font-semibold ${
                      summary?.pipelineStatus === "Success"
                        ? "text-emerald-700"
                        : "text-rose-700"
                    }`}
                  >
                    {summary?.pipelineStatus ?? "-"}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-100 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Live Records
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {summary?.liveRecords ?? "-"}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-100 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    New This Run
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-900">
                    {summary?.newThisRun ?? "-"}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-sm">
                <div className="text-slate-600">
                  Source:{" "}
                  <span className="font-semibold text-slate-900">
                    {summary?.source ?? "-"}
                  </span>
                </div>
                <div className="text-slate-500">
                  {getRelativeTime(summary?.updatedAtEpochMs)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SummaryPanel({
  title,
  subtitle,
  endpoint,
  state,
  onRun,
  buttonClassName,
  buttonLabel,
  loadingLabel,
}: {
  title: string;
  subtitle: string;
  endpoint: string;
  state: ApiState;
  onRun: () => void;
  buttonClassName: string;
  buttonLabel: string;
  loadingLabel: string;
}) {
  const freshness = useMemo(
    () => getFreshnessMeta(state.summary?.updatedAtEpochMs),
    [state.summary?.updatedAtEpochMs]
  );

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {title}
              </h2>
              <StatusBadge status={state.status} />
              {state.summary && (
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${freshness.className}`}
                >
                  {freshness.label}
                </span>
              )}
            </div>
            <p className="max-w-2xl text-sm leading-6 text-slate-600">
              {subtitle}
            </p>
          </div>

          <button
            onClick={onRun}
            disabled={state.status === "loading"}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow transition-all disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
          >
            {state.status === "loading" ? loadingLabel : buttonLabel}
          </button>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Configured Endpoint
          </div>
          <div className="break-all font-mono text-xs leading-5 text-slate-700">
            {endpoint || "Not configured"}
          </div>
        </div>
      </div>

      <div className="p-6">
        {state.error && (
          <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <div className="mb-1 text-sm font-semibold text-rose-700">
              Request failed
            </div>
            <div className="text-sm leading-6 text-rose-700">{state.error}</div>
          </div>
        )}

        {state.dbSyncMessage && (
          <div className="mb-5 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="text-sm font-medium text-blue-700">
              {state.dbSyncMessage}
            </div>
          </div>
        )}

        {!state.initialHistoryLoaded && state.status === "idle" && (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-center">
            <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
            <h3 className="text-base font-semibold text-slate-800">
              Loading latest history
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Fetching the most recent update snapshot from Firebase.
            </p>
          </div>
        )}

        {state.initialHistoryLoaded &&
          state.status === "idle" &&
          state.summary === null &&
          !state.error && (
            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
              <div className="mb-4 rounded-2xl bg-slate-200 px-4 py-3 text-xl font-bold text-slate-700">
                {title.charAt(0)}
              </div>
              <h3 className="text-base font-semibold text-slate-800">
                No previous update found
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                Trigger the pipeline once and the latest snapshot will be stored
                in Firebase for future logins.
              </p>
            </div>
          )}

        {state.status === "loading" && (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-6 text-center">
            <div className="mb-4 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-700" />
            <h3 className="text-base font-semibold text-slate-800">
              Request in progress
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Fetching latest pipeline metrics and syncing latest history node.
            </p>
          </div>
        )}

        {state.summary !== null && state.status !== "loading" && (
          <>
            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm font-semibold text-slate-900">
                  {state.summary.headline}
                </div>
                <div className="text-sm text-slate-500">
                  {getRelativeTime(state.summary.updatedAtEpochMs)}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span>
                  Source:{" "}
                  <span className="font-semibold text-slate-800">
                    {state.summary.source}
                  </span>
                </span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                  Last sync: {state.summary.lastSync}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Pipeline Status"
                value={state.summary.pipelineStatus}
                accent={
                  state.summary.pipelineStatus === "Success"
                    ? "text-emerald-700"
                    : "text-rose-700"
                }
              />
              <MetricCard label="Last Sync" value={state.summary.lastSync} />
              <MetricCard label="Live Records" value={state.summary.liveRecords} />
              <MetricCard label="New This Run" value={state.summary.newThisRun} />
              <MetricCard label="Published" value={state.summary.published} />
              <MetricCard label="Scanned" value={state.summary.scanned} />
              <MetricCard
                label="Duplicates Skipped"
                value={state.summary.duplicatesSkipped}
              />
            </div>

            <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-800">
                Technical details
              </summary>
              <div className="border-t border-slate-200 px-4 py-4">
                <pre className="max-h-[360px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-200">
                  {typeof state.rawData === "string"
                    ? state.rawData
                    : JSON.stringify(state.rawData, null, 2)}
                </pre>
              </div>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

export default function ScraperDashboard() {
  const [opportunitiesState, setOpportunitiesState] =
    useState<ApiState>(initialState);
  const [eventsState, setEventsState] = useState<ApiState>(initialState);

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

    loadInitialHistory();
  }, []);

  const callApi = async (
    url: string,
    title: string,
    historyNode:
      | "/automation/history/opportunities"
      | "/automation/history/events",
    setState: React.Dispatch<React.SetStateAction<ApiState>>
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

      const summary = toDashboardSummary(title, payload);

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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.08),_transparent_30%),linear-gradient(to_bottom,_#f8fafc,_#eef2ff)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* <header className="mb-8 overflow-hidden rounded-[28px] border border-slate-200 bg-white/85 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Automation Control Center
              </div>

              <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                EAA Automation Dashboard
              </h1>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Show the last known update immediately on login, and let users
                trigger fresh runs only when needed.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Opportunities
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {opportunitiesState.summary?.pipelineStatus ?? "No data"}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Events
                </div>
                <div className="mt-1 text-lg font-bold text-slate-900">
                  {eventsState.summary?.pipelineStatus ?? "No data"}
                </div>
              </div>
            </div>
          </div>
        </header> */}

        <LastUpdateHero
          opportunitiesSummary={opportunitiesState.summary}
          eventsSummary={eventsState.summary}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SummaryPanel
            title="Opportunities Automation"
            subtitle="Run the opportunities pipeline, surface the important metrics, and keep the latest dashboard snapshot ready for future logins."
            endpoint={OPPORTUNITIES_API_URL}
            state={opportunitiesState}
            onRun={() =>
              callApi(
                OPPORTUNITIES_API_URL,
                "Opportunities Automation",
                "/automation/history/opportunities",
                setOpportunitiesState
              )
            }
            buttonClassName="bg-slate-900 hover:bg-slate-800"
            buttonLabel="Run Opportunities API"
            loadingLabel="Running Opportunities..."
          />

          <SummaryPanel
            title="Events Automation"
            subtitle="Run the events pipeline, show the refined summary, and let users see the last update instantly when they return."
            endpoint={EVENTS_API_URL}
            state={eventsState}
            onRun={() =>
              callApi(
                EVENTS_API_URL,
                "Events Automation",
                "/automation/history/events",
                setEventsState
              )
            }
            buttonClassName="bg-blue-700 hover:bg-blue-600"
            buttonLabel="Run Events API"
            loadingLabel="Running Events..."
          />
        </div>
      </div>
    </div>
  );
}
export type Topic = {
  id: string;
  name: string;
  keywords: string;
  color: string;
  followed: number;
  event_count: number;
};
export type Provenance = {
  publisher_type: string;
  publisher_label: string;
  delivery_type: string;
  delivery_label: string;
};
export type Source = Provenance & {
  id: string;
  name: string;
  kind: string;
  url: string;
  category: string;
  enabled: number;
  note: string;
  status: string;
  last_checked: string | null;
  last_success: string | null;
  error: string;
  failures: number;
  next_retry: string | null;
  item_count: number;
};
export type Analysis = {
  title_zh: string;
  summary_zh: string;
  why_it_matters: string;
  points: { text: string; source_ids: string[] }[];
  source_ids: string[];
  limitations: string;
  model: string;
  generated_at: string;
  evidence: string;
};
export type Article = Partial<Provenance> & {
  id: string;
  event_id: string;
  source_id: string;
  source_name: string;
  kind: string;
  title: string;
  url: string;
  summary: string;
  published_at: string;
  first_seen: string;
  last_seen: string;
  rank: number | null;
  is_read: number;
  bookmarked: number;
};
export type Event = {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  updated_at: string;
  ai_status: string;
  analysis: Analysis | null;
  analysis_error: string;
  relevance_status:
    "accepted" | "rejected" | "uncertain" | "pending" | "error" | "unreviewed";
  relevance: {
    reason: string;
    confidence: number;
    source_ids: string[];
    canonical_title: string;
    model: string;
    reviewed_at: string;
    method: string;
  } | null;
  review_error: string;
  merges?: {
    id: string;
    reason: string;
    confidence: number;
    evidence: string[];
    model: string;
    created_at: string;
  }[];
  review_history?: {
    id: string;
    status: string;
    model: string;
    created_at: string;
    result: { reason: string };
  }[];
  is_read: number;
  bookmarked: number;
  source_count: number;
  sources: (Pick<Source, "id" | "name" | "kind"> & Provenance)[];
  topics: Topic[];
  articles?: Article[];
  timeline?: { observed_at: string; rank: number; source_name: string }[];
};
export type Job = {
  id: string;
  kind: string;
  target: string;
  status: string;
  stage: string;
  progress: number;
  created_at: string;
  finished_at: string | null;
  error: string;
  result: {
    sources?: {
      id: string;
      name: string;
      status: string;
      count: number;
      error?: string;
    }[];
    successful_sources?: number;
    failed_sources?: number;
    new_events?: number;
    analyzed?: number;
    ai_failed?: number;
    count?: number;
    message?: string;
    brief_id?: string;
    review_total?: number;
    review_done?: number;
    accepted?: number;
    rejected?: number;
    uncertain?: number;
    review_failed?: number;
    merge_checked?: number;
    merged?: number;
    merge_failed?: number;
  };
};
export type Brief = {
  id: string;
  date: string;
  version: number;
  status: string;
  created_at: string;
  content: {
    title: string;
    intro: string;
    limitations: string;
    highlights?: { text: string; event_ids: string[] }[];
    items: {
      id: string;
      title: string;
      summary: string;
      source_count: number;
    }[];
  };
};
export type Settings = {
  interval_minutes: number;
  schedule_enabled: boolean;
  brief_hour: number;
  ai_enabled: boolean;
  auto_analyze_limit: number;
  initial_days: number;
  per_source_limit: number;
};
export type Meta = {
  events: number;
  articles: number;
  saved: number;
  unread: number;
  sources: number;
  healthy_sources: number;
  worker_heartbeat: string | null;
  last_update: string | null;
  ai_events: number;
  archive_events: number;
  review_pending: number;
  review_errors: number;
};
export type Page<T> = {
  current_total?: number;
  items: T[];
  total: number;
  page: number;
  limit: number;
  snapshot: string;
};
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api/v1" + path, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ detail: "服务暂时不可用" }));
    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : "输入内容不符合要求，请检查后重试",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export function time(value?: string | null, full = false) {
  if (!value) return "尚未更新";
  const d = new Date(value);
  return d.toLocaleString(
    "zh-CN",
    full
      ? {
          year:
            d.getFullYear() !== new Date().getFullYear()
              ? "numeric"
              : undefined,
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }
      : {
          year:
            d.getFullYear() !== new Date().getFullYear()
              ? "numeric"
              : undefined,
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
  );
}
export function relative(value?: string | null) {
  if (!value) return "等待更新";
  const n = Math.max(0, (Date.now() - new Date(value).getTime()) / 60000);
  return n < 1
    ? "刚刚"
    : n < 60
      ? `${Math.floor(n)} 分钟前`
      : n < 1440
        ? `${Math.floor(n / 60)} 小时前`
        : time(value);
}

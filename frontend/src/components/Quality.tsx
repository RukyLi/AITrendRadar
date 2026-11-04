import type { Event, Provenance } from "../api";
import { time } from "../api";
import { LoaderCircle } from "lucide-react";

export const reviewLabels: Record<Event["relevance_status"], string> = {
  accepted: "AI 相关",
  rejected: "非 AI 资讯",
  uncertain: "信息不足",
  pending: "待审核",
  error: "审核失败",
  unreviewed: "未命中初筛",
};

export function SourceBadge({
  source,
  channel = false,
}: {
  source?: Partial<Provenance>;
  channel?: boolean;
}) {
  return (
    <span
      className="source-identity"
      title={`${source?.publisher_label || "身份未核验"} · ${source?.delivery_label || "采集渠道未标注"}`}
    >
      <span className={`source-kind ${source?.publisher_type || "unverified"}`}>
        {source?.publisher_label || "自定义来源"}
      </span>
      {channel && (
        <span className="delivery-label">
          {source?.delivery_label || "采集渠道未标注"}
        </span>
      )}
    </span>
  );
}

export function ReviewBadge({ event }: { event: Event }) {
  return (
    <span
      className={`review-badge ${event.relevance_status}`}
      title={event.review_error || event.relevance?.reason}
    >
      {reviewLabels[event.relevance_status]}
    </span>
  );
}

export function ReviewDetails({
  event,
  onReview,
  busy,
}: {
  event: Event;
  onReview: () => void;
  busy: boolean;
}) {
  const review = event.relevance;
  return (
    <details
      className={`review-details ${event.relevance_status}`}
      key={event.id + event.relevance_status}
      open={event.relevance_status !== "accepted"}
    >
      <summary>
        <ReviewBadge event={event} />
        <span>
          {event.relevance_status === "accepted"
            ? "查看相关性审核依据"
            : "当前收录于综合归档"}
        </span>
      </summary>
      <div className="review-explanation">
        {event.relevance_status === "accepted" && (
          <small className="review-scope">
            此项审核判断 AI 主题相关性，不代表报道真实性已核验。
          </small>
        )}
        <p>
          {review?.reason ||
            (event.relevance_status === "unreviewed"
              ? "未命中 AI 候选规则，尚未调用模型审核。归档仍可搜索、阅读和收藏，也可以手动提交审核。"
              : event.relevance_status === "error"
                ? "尚未获得有效的相关性判断，新闻资料仍保留。"
                : "等待后台判断是否实质涉及 AI，通过后会进入全部事件。")}
        </p>
        {event.review_error && (
          <p className="form-error">{event.review_error}</p>
        )}
        {!!review?.source_ids.length && (
          <div className="point-citations">
            {review.source_ids.map((id) => {
              const article = event.articles?.find((a) => a.id === id);
              return article ? (
                <a
                  key={id}
                  href={article.url || undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  {article.source_name} ·{" "}
                  {article.summary ? "RSS 摘要与标题" : "仅标题"}
                </a>
              ) : null;
            })}
          </div>
        )}
        <div className="review-footnote">
          <span>
            {review
              ? `${review.model.replace("openai/", "")} · ${time(review.reviewed_at)}`
              : "关键词初筛不等于 AI 审核通过"}
          </span>
          <button className="text-btn" onClick={onReview} disabled={busy}>
            {busy ? (
              <>
                <LoaderCircle size={13} className="spin" />
                审核中
              </>
            ) : review || event.relevance_status === "error" ? (
              "重新审核"
            ) : (
              "审核相关性"
            )}
          </button>
        </div>
        {!!event.review_history?.length && (
          <details className="review-history">
            <summary>审核记录（{event.review_history.length}）</summary>
            {event.review_history.map((entry) => (
              <p key={entry.id}>
                <strong>
                  {reviewLabels[entry.status as Event["relevance_status"]] ||
                    entry.status}
                </strong>{" "}
                · {time(entry.created_at)}
                <br />
                {entry.result.reason}
              </p>
            ))}
          </details>
        )}
      </div>
    </details>
  );
}

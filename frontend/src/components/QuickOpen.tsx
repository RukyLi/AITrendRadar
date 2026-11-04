import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Search, CornerDownLeft, LoaderCircle } from "lucide-react";
import { api, type Event, type Page } from "../api";

type Command = { id: string; label: string; detail: string; run: () => void };
export function QuickOpen({
  open,
  onClose,
  onChoose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  onChoose: (event: Event) => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(0);
  const [includeArchive, setIncludeArchive] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setQuery("");
      setEvents([]);
      setSelected(0);
      setError("");
    }
  }, [open]);
  useEffect(() => {
    setSelected(0);
    setEvents([]);
    setError("");
    if (!open || !query.trim()) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      api<Page<Event>>(
        `/events?view=${includeArchive ? "library" : "all"}&limit=6&q=` +
          encodeURIComponent(query.trim()),
      )
        .then((page) => {
          if (!cancelled) setEvents(page.items);
        })
        .catch(() => {
          if (!cancelled) setError("搜索暂时不可用，请稍后重试。");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, includeArchive]);
  const actions = commands.filter(
    (c) => !query.trim() || c.label.includes(query.trim()),
  );
  const rows = [
    ...actions.map((c) => ({ ...c, kind: "操作" })),
    ...events.map((e) => ({
      id: e.id,
      label: e.analysis?.title_zh || e.title,
      detail: e.sources.map((s) => s.name).join(" · "),
      kind: e.relevance_status === "accepted" ? "AI 资讯" : "归档",
      run: () => onChoose(e),
    })),
  ];
  const run = (index: number) => {
    const item = rows[index];
    if (item) {
      onClose();
      item.run();
    }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay command-overlay" />
        <Dialog.Content
          className="command-dialog"
          aria-describedby="command-description"
        >
          <Dialog.Title className="sr-only">快速查找</Dialog.Title>
          <Dialog.Description id="command-description" className="sr-only">
            默认搜索 AI 资讯，可勾选包含综合归档。用上下方向键选择，回车打开。
          </Dialog.Description>
          <div className="command-input">
            <Search size={20} />
            <input
              autoFocus
              aria-label="搜索资讯与操作"
              placeholder="搜索文章，或前往…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={
                rows[selected] ? `command-${rows[selected].id}` : undefined
              }
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  const next = Math.max(
                    0,
                    Math.min(
                      rows.length - 1,
                      selected + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  );
                  setSelected(next);
                  list.current
                    ?.querySelector(`[data-index="${next}"]`)
                    ?.scrollIntoView({ block: "nearest" });
                }
                if (e.key === "Enter") {
                  e.preventDefault();
                  run(selected);
                }
              }}
            />
            <Dialog.Close aria-label="关闭快速查找">
              <kbd>esc</kbd>
            </Dialog.Close>
          </div>
          <div
            id="command-results"
            role="listbox"
            className="command-results"
            ref={list}
          >
            <p className="command-label">
              {query.trim() ? "搜索结果" : "快速前往"}
              {loading && <LoaderCircle size={13} className="spin" />}
            </p>
            {rows.map((item, index) => (
              <button
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={selected === index}
                id={`command-${item.id}`}
                data-index={index}
                key={item.id}
                className={selected === index ? "selected" : ""}
                onMouseMove={() => setSelected(index)}
                onClick={() => run(index)}
              >
                <span className="command-kind">{item.kind}</span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!rows.length && (
              <p className="command-empty">
                {loading
                  ? "正在搜索…"
                  : error || "没有匹配的文章，试试其他关键词。"}
              </p>
            )}
          </div>
          <footer>
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd> 选择
            </span>
            <span>
              <CornerDownLeft size={13} /> 打开
            </span>
            <label className="command-scope">
              <input
                type="checkbox"
                checked={includeArchive}
                onChange={(e) => setIncludeArchive(e.target.checked)}
              />
              包含综合归档
            </label>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

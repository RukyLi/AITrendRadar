import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowDown,
  IconArrowUpRight,
  IconBookmark,
  IconBookmarkFilled,
  IconStar,
  IconStarFilled,
  IconSearch,
  IconAdjustmentsHorizontal,
  IconX,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
  IconLayoutGrid,
  IconList,
  IconSun,
  IconMoon,
  IconSettings,
  IconRss,
  IconWorld,
  IconBolt,
  IconLayersIntersect,
  IconBook2,
  IconActivity,
  IconArchive,
  IconDots,
  IconGripVertical,
  IconMenu2,
  IconBell,
  IconClock,
  IconExternalLink,
  IconPlus,
  IconTrash,
  IconEdit,
  IconEye,
  IconCircleCheck,
  IconAlertCircle,
  IconCircleDot,
  IconPalette,
  IconRulerMeasure,
  IconKeyboard,
  IconCommand,
  IconCircleOff,
  IconPlayerPlay,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconFileText,
  IconCopy,
  IconPointFilled,
  IconCircle,
  IconChartLine,
  IconArrowBarToLeft,
} from "@tabler/icons-react";
import { useLab } from "./state";
const icons = {
  back: IconArrowLeft,
  right: IconArrowRight,
  up: IconArrowUp,
  down: IconArrowDown,
  arrow: IconArrowUpRight,
  bookmark: IconBookmark,
  bookmarked: IconBookmarkFilled,
  star: IconStar,
  starred: IconStarFilled,
  search: IconSearch,
  filter: IconAdjustmentsHorizontal,
  close: IconX,
  check: IconCheck,
  chevron: IconChevronDown,
  prev: IconChevronLeft,
  next: IconChevronRight,
  refresh: IconRefresh,
  grid: IconLayoutGrid,
  list: IconList,
  sun: IconSun,
  moon: IconMoon,
  settings: IconSettings,
  rss: IconRss,
  world: IconWorld,
  bolt: IconBolt,
  layers: IconLayersIntersect,
  book: IconBook2,
  activity: IconActivity,
  archive: IconArchive,
  more: IconDots,
  grip: IconGripVertical,
  menu: IconMenu2,
  bell: IconBell,
  clock: IconClock,
  external: IconExternalLink,
  plus: IconPlus,
  trash: IconTrash,
  edit: IconEdit,
  eye: IconEye,
  success: IconCircleCheck,
  alert: IconAlertCircle,
  dot: IconCircleDot,
  palette: IconPalette,
  ruler: IconRulerMeasure,
  keyboard: IconKeyboard,
  command: IconCommand,
  off: IconCircleOff,
  play: IconPlayerPlay,
  desktop: IconDeviceDesktop,
  mobile: IconDeviceMobile,
  file: IconFileText,
  copy: IconCopy,
  point: IconPointFilled,
  circle: IconCircle,
  chart: IconChartLine,
  collapse: IconArrowBarToLeft,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const Component = icons[name];
  return (
    <Component
      size={size}
      stroke={1.75}
      className={"lab-icon " + className}
      aria-hidden="true"
    />
  );
}
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <span className="lab-brand">
      <span className="lab-mark">
        <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="3" fill="currentColor" />
          <path
            d="M16 3v7M29 16h-7M16 29v-7M3 16h7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="23" cy="9" r="3" fill="currentColor" />
        </svg>
      </span>
      {!small && (
        <span>
          radar<span className="lab-brand-dot">.</span>
        </span>
      )}
    </span>
  );
}
export function Button({
  children,
  icon,
  tone = "quiet",
  busy = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: IconName;
  tone?: "quiet" | "primary" | "ghost" | "danger";
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={"lab-btn lab-btn-" + tone + " " + className}
    >
      {icon && (
        <Icon
          name={busy ? "refresh" : icon}
          size={18}
          className={busy ? "lab-spin" : ""}
        />
      )}
      <span>{children}</span>
    </button>
  );
}
export function IconButton({
  name,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  name: IconName;
  label: string;
}) {
  return (
    <button
      type="button"
      {...props}
      className={"lab-icon-btn " + (props.className || "")}
      aria-label={label}
      title={label}
    >
      <Icon name={name} />
    </button>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={"lab-badge " + tone}>{children}</span>;
}
export function Segments({
  value,
  items,
  onChange,
  label,
}: {
  value: string;
  items: { value: string; label: string; icon?: IconName }[];
  onChange: (value: string) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="lab-segments" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          type="button"
          role="tab"
          id={id + index}
          key={item.value}
          aria-selected={value === item.value}
          tabIndex={value === item.value ? 0 : -1}
          className={value === item.value ? "active" : ""}
          onClick={() => onChange(item.value)}
          onKeyDown={(e) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
              return;
            e.preventDefault();
            const next =
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? items.length - 1
                  : (index + (e.key === "ArrowRight" ? 1 : -1) + items.length) %
                    items.length;
            onChange(items[next].value);
            document.getElementById(id + next)?.focus();
          }}
        >
          {item.icon && <Icon name={item.icon} size={17} />}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "搜索标题、主题或来源",
  label = "搜索演示内容",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <label className="lab-search">
      <Icon name="search" size={18} />
      <input
        data-lab-search
        aria-label={label}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <IconButton
          name="close"
          label="清除搜索"
          onClick={() => onChange("")}
        />
      )}
    </label>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="lab-switch"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}
export function Empty({
  title = "这里还很安静",
  description = "试试调整筛选条件，或发现更多值得关注的内容。",
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="lab-empty">
      <div className="lab-empty-art">
        <Sticker kind="orbit" />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="lab-skeleton" role="status" aria-label="正在加载演示内容">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i}>
          <i />
          <i />
          <i />
        </div>
      ))}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  drawer = false,
  wide = false,
  scrollId = "dialog",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  drawer?: boolean;
  wide?: boolean;
  scrollId?: string;
}) {
  const { portal } = useLab();
  const focus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal container={portal || undefined}>
        <Dialog.Overlay className="lab-overlay" />
        <Dialog.Content
          className={
            "lab-dialog " +
            (drawer ? "lab-drawer " : "") +
            (wide ? "lab-dialog-wide" : "")
          }
          onOpenAutoFocus={() => {
            focus.current = document.activeElement as HTMLElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() =>
              (focus.current?.isConnected
                ? focus.current
                : document.getElementById("lab-main")
              )?.focus({ preventScroll: true }),
            );
          }}
        >
          <header className="lab-dialog-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "独立设计演示，操作不会修改正式网站数据。"}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton name="close" label="关闭弹窗" />
            </Dialog.Close>
          </header>
          <div className="lab-dialog-body" data-lab-scroll={scrollId}>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Menu({
  label,
  items,
}: {
  label: string;
  items: {
    label: string;
    action: () => void;
    icon?: IconName;
    disabled?: boolean;
  }[];
}) {
  const { portal } = useLab();
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button className="lab-icon-btn" aria-label={label} title={label}>
          <Icon name="more" />
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal container={portal || undefined}>
        <Dropdown.Content className="lab-menu" align="end" sideOffset={6}>
          {items.map((item) => (
            <Dropdown.Item
              className="lab-menu-item"
              key={item.label}
              disabled={item.disabled}
              onSelect={item.action}
            >
              {item.icon && <Icon name={item.icon} size={17} />} {item.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
export function Tip({ text, children }: { text: string; children: ReactNode }) {
  const { portal } = useLab();
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal container={portal || undefined}>
        <Tooltip.Content className="lab-tooltip" sideOffset={8}>
          {text}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function SaveButton({
  id,
  channel = false,
}: {
  id: string;
  channel?: boolean;
}) {
  const { prefs, toggle, notify, route, reduced } = useLab();
  const saved = (channel ? prefs.stars : prefs.bookmarks).includes(id);
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(false), 580);
    return () => clearTimeout(t);
  }, [burst]);
  return (
    <span className="lab-save-wrap">
      <button
        className={
          "lab-icon-btn lab-save " +
          (saved ? "is-saved " : "") +
          (burst ? "is-burst" : "")
        }
        aria-pressed={saved}
        aria-label={(saved ? "取消" : "") + (channel ? "星标频道" : "收藏资讯")}
        title={channel ? "星标频道" : "收藏资讯"}
        onClick={() => {
          toggle(channel ? "stars" : "bookmarks", id);
          if (!saved && route.concept === "d" && !reduced) setBurst(true);
          notify(
            saved
              ? "已从演示收藏中移除"
              : channel
                ? "频道已加入星标"
                : "已加入收藏，留给下一次好奇",
          );
        }}
      >
        <Icon
          name={
            channel
              ? saved
                ? "starred"
                : "star"
              : saved
                ? "bookmarked"
                : "bookmark"
          }
        />
      </button>
      {burst && !channel && (
        <span className="lab-confetti" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <i
              key={i}
              style={
                {
                  "--angle": i * 45 + "deg",
                  "--particle": ["#00ebc7", "#ff5470", "#fde24f"][i % 3],
                } as CSSProperties
              }
            />
          ))}
        </span>
      )}
    </span>
  );
}
export function Sticker({
  kind = "star",
  className = "",
}: {
  kind?: "star" | "orbit" | "flower" | "arch";
  className?: string;
}) {
  return (
    <svg
      className={"lab-sticker " + className}
      viewBox="0 0 120 120"
      fill="none"
      aria-hidden="true"
    >
      {kind === "star" && (
        <>
          <path
            d="m60 4 12 31 31-19-13 34 26 10-31 13 18 31-34-15-9 28-13-31-32 19 15-34L3 60l30-12L15 15l34 16Z"
            fill="currentColor"
            stroke="var(--lab-ink)"
            strokeWidth="2.5"
          />
          <path
            d="M46 54v8m27-8v8M49 73q12 10 23-1"
            stroke="var(--lab-ink)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "orbit" && (
        <>
          <circle
            cx="60"
            cy="60"
            r="34"
            fill="var(--lab-soft)"
            stroke="currentColor"
            strokeWidth="2"
          />
          <ellipse
            cx="60"
            cy="60"
            rx="55"
            ry="18"
            transform="rotate(-30 60 60)"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="102" cy="37" r="7" fill="var(--lab-accent)" />
          <path d="m49 50 20 10-20 10Z" fill="currentColor" />
        </>
      )}
      {kind === "flower" && (
        <>
          <path
            d="M60 32C20-8-6 34 32 60-6 90 27 127 60 87c33 40 66 3 28-27C126 31 98-8 60 32Z"
            fill="currentColor"
            stroke="var(--lab-ink)"
            strokeWidth="2.5"
          />
          <circle
            cx="60"
            cy="60"
            r="18"
            fill="var(--lab-yellow)"
            stroke="var(--lab-ink)"
            strokeWidth="2.5"
          />
          <path
            d="M54 56v4m12-4v4m-12 7q6 5 12 0"
            stroke="var(--lab-ink)"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </>
      )}
      {kind === "arch" && (
        <>
          <path
            d="M20 100V60a40 40 0 0 1 80 0v40"
            stroke="currentColor"
            strokeWidth="10"
          />
          <path
            d="M40 100V60a20 20 0 0 1 40 0v40"
            stroke="var(--lab-yellow)"
            strokeWidth="10"
          />
          <circle cx="60" cy="100" r="5" fill="var(--lab-ink)" />
        </>
      )}
    </svg>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  children,
  level = 2,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <div className="lab-section-title">
      <div>
        {eyebrow && <span className="lab-eyebrow">{eyebrow}</span>}
        <Heading>{title}</Heading>
      </div>
      {children}
    </div>
  );
}

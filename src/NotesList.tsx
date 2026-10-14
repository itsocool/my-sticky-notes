import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Plus,
  MoreHorizontal,
  Search,
  X,
  StickyNote,
  Pin,
  Trash2,
  LogOut,
} from "lucide-react";
import { notesApi, startDragging, subscribe } from "./api";
import { errorMessage, noteTitle, type Note } from "./types";
import { DeleteDialog, ErrorBanner, IconButton } from "./ui";

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
export function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const requestNumber = useRef(0);
  const query = useDeferredValue(search.trim().toLocaleLowerCase());
  const refresh = useCallback(async () => {
    const request = ++requestNumber.current;
    try {
      const rows = await notesApi.list();
      if (request === requestNumber.current) {
        setNotes(rows);
        setError("");
      }
    } catch (error) {
      if (request === requestNumber.current) setError(errorMessage(error));
    } finally {
      if (request === requestNumber.current) setLoading(false);
    }
  }, []);
  const perform = useCallback(async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      setError(errorMessage(error));
    }
  }, []);
  useEffect(() => {
    let disposed = false;
    const cleanup: Array<() => void> = [];
    async function setup() {
      try {
        const changed = await subscribe("notes:changed", () => void refresh());
        if (disposed) {
          changed();
          return;
        }
        cleanup.push(changed);
        const errors = await subscribe<string>("app:error", (message) =>
          setError(message),
        );
        if (disposed) {
          errors();
          return;
        }
        cleanup.push(errors);
      } catch (error) {
        if (!disposed) setError(errorMessage(error));
      }
      if (!disposed) await refresh();
    }
    void setup();
    return () => {
      disposed = true;
      requestNumber.current++;
      cleanup.forEach((fn) => fn());
    };
  }, [refresh]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        input.current?.focus();
      }
      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        void perform(() => notesApi.create());
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [perform]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        !event.target.closest(".menu-anchor")
      )
        setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  const visible = notes.filter((note) =>
    note.plainText.toLocaleLowerCase().includes(query),
  );
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    try {
      await notesApi.remove(deleting.id);
      setDeleting(null);
      setMenu(null);
      await refresh();
    } catch (error) {
      setError(errorMessage(error));
      setDeleting(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="notes-list">
      <header
        className="list-header"
        onMouseDown={(event) => {
          if (
            event.button === 0 &&
            event.target instanceof Element &&
            !event.target.closest("button")
          )
            void startDragging().catch((error) =>
              setError(errorMessage(error)),
            );
        }}
      >
        <IconButton
          label="새 메모"
          onClick={() => void perform(() => notesApi.create())}
        >
          <Plus />
        </IconButton>
        <h1>메모</h1>
        <div className="menu-anchor">
          <IconButton
            label="앱 옵션"
            aria-expanded={menu === "app"}
            onClick={() => setMenu(menu === "app" ? null : "app")}
          >
            <MoreHorizontal />
          </IconButton>
          {menu === "app" ? (
            <div className="popover app-menu">
              <button onClick={() => void perform(() => notesApi.quit())}>
                <LogOut size={16} />앱 종료
              </button>
            </div>
          ) : null}
        </div>
        <IconButton
          label="목록 닫기"
          onClick={() => void perform(() => notesApi.hideList())}
        >
          <X />
        </IconButton>
      </header>
      <div className="search-field">
        <Search size={17} />
        <input
          ref={input}
          type="search"
          aria-label="메모 검색"
          placeholder="검색"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search ? (
          <IconButton
            label="검색 지우기"
            onClick={() => {
              setSearch("");
              input.current?.focus();
            }}
          >
            <X size={15} />
          </IconButton>
        ) : null}
      </div>
      {error ? (
        <ErrorBanner message={error} retry={() => void refresh()} />
      ) : null}
      <div className="note-cards" aria-label="메모 목록" aria-busy={loading}>
        {loading ? (
          <div className="empty-state">
            <span className="loading-dot" />
            메모를 불러오는 중…
          </div>
        ) : visible.length === 0 ? (
          <div className="empty-state">
            <StickyNote size={38} strokeWidth={1.25} />
            <h2>{query ? "검색 결과가 없습니다" : "생각을 메모해 보세요"}</h2>
            <p>
              {query ? "다른 검색어로 찾아보세요." : "작은 생각도 잊지 않도록."}
            </p>
            {!query ? (
              <button
                className="primary-button"
                onClick={() => void perform(() => notesApi.create())}
              >
                <Plus size={16} />새 메모 만들기
              </button>
            ) : null}
          </div>
        ) : (
          visible.map((note) => (
            <article
              key={note.id}
              className="note-card"
              data-color={note.color}
            >
              <button
                className="card-open"
                aria-label={`${noteTitle(note)} 메모 열기`}
                onClick={() => void perform(() => notesApi.open(note.id))}
              >
                <div className="card-meta">
                  {note.pinned ? <Pin size={12} /> : null}
                  <time dateTime={new Date(note.updatedAt).toISOString()}>
                    {dateFormat.format(note.updatedAt)}
                  </time>
                </div>
                <h2>{noteTitle(note)}</h2>
                <p>
                  {note.plainText
                    .split("\n")
                    .filter((line) => line.trim())
                    .slice(1)
                    .join(" · ") || "메모를 열어 내용을 적어보세요."}
                </p>
              </button>
              <div className="menu-anchor card-options">
                <IconButton
                  label={`${noteTitle(note)} 메모 옵션`}
                  aria-expanded={menu === note.id}
                  onClick={() => setMenu(menu === note.id ? null : note.id)}
                >
                  <MoreHorizontal size={18} />
                </IconButton>
                {menu === note.id ? (
                  <div className="popover">
                    <button
                      className="delete-menu"
                      onClick={() => {
                        setDeleting(note);
                        setMenu(null);
                      }}
                    >
                      <Trash2 size={16} />
                      메모 삭제
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
      </div>
      {deleting ? (
        <DeleteDialog
          busy={busy}
          onCancel={() => setDeleting(null)}
          onDelete={() => void remove()}
        />
      ) : null}
    </main>
  );
}

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Editor } from "@tiptap/react";
import {
  Plus,
  Pin,
  PinOff,
  MoreHorizontal,
  X,
  Check,
  Trash2,
  PanelsTopLeft,
} from "lucide-react";
import { notesApi, startDragging } from "./api";
import { Autosave, type SaveStatus } from "./autosave";
import {
  COLORS,
  COLOR_NAMES,
  errorMessage,
  type Draft,
  type Note,
  type NoteColor,
} from "./types";
import { NoteEditor } from "./NoteEditor";
import { DeleteDialog, ErrorBanner, IconButton } from "./ui";
import { useNativeEvent } from "./useNativeEvent";

interface NoteSession {
  flushForQuit: () => Promise<void>;
  close: () => Promise<void>;
  cancelQuit: () => void;
}
export function NoteWindow({ id }: { id: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState("");
  const session = useRef<NoteSession | null>(null);
  const quitRequested = useRef(false);
  const handleError = useCallback(
    (error: unknown) => setError(errorMessage(error)),
    [],
  );
  const load = useCallback(async () => {
    try {
      setNote(await notesApi.get(id));
      setError("");
    } catch (error) {
      handleError(error);
    }
  }, [id, handleError]);
  useEffect(() => {
    let disposed = false;
    void notesApi
      .get(id)
      .then((value) => {
        if (!disposed) setNote(value);
      })
      .catch((error) => {
        if (!disposed) handleError(error);
      });
    return () => {
      disposed = true;
    };
  }, [id, handleError]);
  // Lifecycle listeners exist even when the document is still loading or unreadable.
  useNativeEvent<string>("app:error", setError, handleError);
  useNativeEvent<void>(
    "note:close-requested",
    () => {
      void (
        session.current ? session.current.close() : notesApi.close(id)
      ).catch(handleError);
    },
    handleError,
  );
  useNativeEvent<void>(
    "app:quit-cancelled",
    () => {
      quitRequested.current = false;
      session.current?.cancelQuit();
    },
    handleError,
  );
  useNativeEvent<string>(
    "app:flush",
    (token) => {
      quitRequested.current = true;
      void (async () => {
        try {
          await session.current?.flushForQuit();
          await notesApi.acknowledgeQuit(token, true);
        } catch (error) {
          handleError(error);
          await notesApi.acknowledgeQuit(token, false).catch(handleError);
        }
      })();
    },
    handleError,
  );
  if (!note)
    return (
      <main className="note-window" data-color="yellow">
        <header className="note-header">
          <span className="window-caption">메모</span>
          <span className="header-spacer" />
          <IconButton
            label="메모 닫기"
            onClick={() => void notesApi.close(id).catch(handleError)}
          >
            <X />
          </IconButton>
        </header>
        {error ? (
          <ErrorBanner message={error} retry={() => void load()} />
        ) : (
          <div className="empty-state">메모를 불러오는 중…</div>
        )}
      </main>
    );
  return (
    <LoadedNote
      key={note.id}
      initialNote={note}
      sessionRef={session}
      quitRequested={quitRequested}
      externalError={error}
    />
  );
}

function LoadedNote({
  initialNote,
  sessionRef,
  quitRequested,
  externalError,
}: {
  initialNote: Note;
  sessionRef: RefObject<NoteSession | null>;
  quitRequested: RefObject<boolean>;
  externalError: string;
}) {
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [saveError, setSaveError] = useState("");
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const editor = useRef<Editor | null>(null);
  const [quitting, setQuitting] = useState(quitRequested.current);
  const lastDocument = useRef(JSON.stringify(initialNote.document));
  const mounted = useRef(true);
  const [queue] = useState(
    () =>
      new Autosave<Draft>(
        (draft) => notesApi.save(initialNote.id, draft),
        (next, error) => {
          if (!mounted.current) return;
          setStatus(next);
          setSaveError(next === "error" ? errorMessage(error) : "");
        },
      ),
  );
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const onReady = useCallback(
    (value: Editor | null) => {
      editor.current = value;
      if (quitRequested.current) value?.setEditable(false, false);
    },
    [quitRequested],
  );
  const onDraft = useCallback(
    (draft: Draft) => {
      lastDocument.current = JSON.stringify(draft.document);
      queue.update(draft);
    },
    [queue],
  );
  const onComposing = useCallback(
    (value: boolean) => queue.setComposing(value),
    [queue],
  );
  const handleError = useCallback(
    (error: unknown) => setError(errorMessage(error)),
    [],
  );
  const unlock = useCallback(() => {
    if (quitRequested.current) return;
    editor.current?.setEditable(true, false);
    setBusy(false);
  }, [quitRequested]);
  const flush = useCallback(async () => {
    setBusy(true);
    const current = editor.current;
    // Hidden WKWebViews need no animation frames. Only an active IME needs settling.
    if (current?.view.composing) {
      await new Promise<void>((resolve, reject) => {
        const dom = current.view.dom;
        const done = () => {
          clearTimeout(timer);
          dom.removeEventListener("compositionend", done);
          resolve();
        };
        const timer = setTimeout(() => {
          dom.removeEventListener("compositionend", done);
          if (current.view.composing)
            reject(new Error("입력 조합을 마친 뒤 다시 시도해 주세요."));
          else resolve();
        }, 100);
        dom.addEventListener("compositionend", done, { once: true });
        dom.blur();
      });
    } else {
      current?.view.dom.blur();
    }
    current?.setEditable(false, false);
    await Promise.resolve();
    if (current && !current.isDestroyed) {
      const document = current.getJSON();
      if (JSON.stringify(document) !== lastDocument.current) {
        lastDocument.current = JSON.stringify(document);
        queue.update({
          document,
          plainText: current.getText({ blockSeparator: "\n" }),
        });
      }
    }
    queue.setComposing(false);
    await queue.flush();
  }, [queue]);
  const perform = useCallback(
    async (action: () => Promise<unknown>) => {
      setError("");
      setBusy(true);
      try {
        await action();
      } catch (error) {
        handleError(error);
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [handleError],
  );
  const close = useCallback(
    () =>
      perform(async () => {
        try {
          await flush();
          await notesApi.close(initialNote.id);
        } finally {
          unlock();
        }
      }),
    [perform, flush, unlock, initialNote.id],
  );
  useNativeEvent<Note>(
    "note:metadata",
    (updated) =>
      setNote((previous) => ({
        ...previous,
        color: updated.color,
        pinned: updated.pinned,
      })),
    handleError,
  );
  useEffect(() => {
    sessionRef.current = {
      flushForQuit: () => {
        setQuitting(true);
        return flush();
      },
      close,
      cancelQuit: () => {
        setQuitting(false);
        unlock();
      },
    };
    return () => {
      sessionRef.current = null;
    };
  }, [sessionRef, flush, close, unlock]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
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
        setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  async function color(value: NoteColor) {
    await perform(async () => {
      const updated = await notesApi.color(note.id, value);
      setNote((previous) => ({ ...previous, color: updated.color }));
      setMenu(false);
    });
  }
  async function remove() {
    await perform(async () => {
      try {
        await flush();
        await notesApi.remove(note.id);
        queue.discard();
      } finally {
        unlock();
        setDeleting(false);
      }
    });
  }
  const savedLabel = {
    saved: "저장됨",
    pending: "저장 대기",
    saving: "저장 중…",
    error: "저장 실패",
  }[status];
  return (
    <main className="note-window" data-color={note.color}>
      <header
        className="note-header"
        onMouseDown={(event) => {
          if (
            event.button === 0 &&
            event.target instanceof Element &&
            !event.target.closest("button,.popover")
          )
            void startDragging().catch(handleError);
        }}
      >
        <IconButton
          label="새 메모"
          disabled={busy || quitting}
          onClick={() => void perform(() => notesApi.create())}
        >
          <Plus />
        </IconButton>
        <span className="header-spacer" />
        <IconButton
          label={note.pinned ? "상단 고정 해제" : "상단 고정"}
          aria-pressed={note.pinned}
          disabled={busy || quitting}
          onClick={() =>
            void perform(async () => {
              const updated = await notesApi.pin(note.id, !note.pinned);
              setNote((previous) => ({ ...previous, pinned: updated.pinned }));
            })
          }
        >
          {note.pinned ? <PinOff /> : <Pin />}
        </IconButton>
        <div className="menu-anchor">
          <IconButton
            label="메모 옵션"
            aria-expanded={menu}
            disabled={busy || quitting}
            onClick={() => setMenu(!menu)}
          >
            <MoreHorizontal />
          </IconButton>
          {menu ? (
            <div className="popover note-menu">
              <div className="color-palette" aria-label="메모 색상">
                {COLORS.map((value) => (
                  <button
                    key={value}
                    className="color-swatch"
                    data-color={value}
                    aria-label={`${COLOR_NAMES[value]} 색상`}
                    title={COLOR_NAMES[value]}
                    aria-pressed={note.color === value}
                    disabled={busy || quitting}
                    onClick={() => void color(value)}
                  >
                    {note.color === value ? <Check size={15} /> : null}
                  </button>
                ))}
              </div>
              <div className="menu-divider" />
              <button onClick={() => void perform(() => notesApi.showList())}>
                <PanelsTopLeft size={16} />
                메모 목록
              </button>
              <button
                className="delete-menu"
                onClick={() => {
                  setMenu(false);
                  setDeleting(true);
                }}
              >
                <Trash2 size={16} />
                메모 삭제
              </button>
            </div>
          ) : null}
        </div>
        <IconButton
          label="메모 닫기"
          disabled={busy || quitting}
          onClick={() => void close()}
        >
          <X />
        </IconButton>
      </header>
      {error || externalError ? (
        <ErrorBanner message={error || externalError} />
      ) : null}
      {saveError ? (
        <ErrorBanner
          message={`저장하지 못했습니다: ${saveError}`}
          retry={() =>
            void perform(async () => {
              await queue.flush();
            })
          }
        />
      ) : null}
      <NoteEditor
        initialDocument={initialNote.document}
        onDraft={onDraft}
        onComposing={onComposing}
        onReady={onReady}
        disabled={busy || quitting}
      />
      <span
        className="save-status"
        role="status"
        aria-live="polite"
        data-status={status}
      >
        {savedLabel}
      </span>
      {deleting ? (
        <DeleteDialog
          busy={busy}
          onCancel={() => setDeleting(false)}
          onDelete={() => void remove()}
        />
      ) : null}
    </main>
  );
}

import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";

export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
export function ErrorBanner({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-banner">
      <span>{message}</span>
      {retry ? <button onClick={retry}>다시 시도</button> : null}
    </div>
  );
}
export function DeleteDialog({
  onCancel,
  onDelete,
  busy = false,
}: {
  onCancel: () => void;
  onDelete: () => void;
  busy?: boolean;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    cancel.current?.focus();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <div className="dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-title"
        className="dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) onCancel();
          if (event.key === "Tab") {
            event.preventDefault();
            const buttons =
              event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
            const target =
              document.activeElement === buttons[0] ? buttons[1] : buttons[0];
            target?.focus();
          }
        }}
      >
        <h2 id="delete-title">메모를 삭제할까요?</h2>
        <p>삭제한 메모는 되돌릴 수 없습니다.</p>
        <div className="dialog-actions">
          <button ref={cancel} disabled={busy} onClick={onCancel}>
            취소
          </button>
          <button className="danger-button" disabled={busy} onClick={onDelete}>
            {busy ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </section>
    </div>
  );
}

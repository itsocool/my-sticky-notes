import { lazy, Suspense } from "react";
import { NotesList } from "./NotesList";
import "./App.css";

const NoteWindow = lazy(() =>
  import("./NoteWindow").then((module) => ({ default: module.NoteWindow })),
);
declare global {
  interface Window {
    __STICKY_NOTE_ID__?: string;
  }
}
function App() {
  const id = window.__STICKY_NOTE_ID__;
  return id ? (
    <Suspense
      fallback={
        <main className="note-window" data-color="yellow">
          <div className="empty-state">메모를 불러오는 중…</div>
        </main>
      }
    >
      <NoteWindow id={id} />
    </Suspense>
  ) : (
    <NotesList />
  );
}
export default App;

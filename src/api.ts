import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Draft, Note, NoteColor } from "./types";

function command<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject(
      new Error(
        "데스크톱 앱에서 열어주세요. npm run tauri dev로 실행할 수 있습니다.",
      ),
    );
  return invoke<T>(name, args);
}
export const notesApi = {
  list: () => command<Note[]>("list_notes"),
  get: (id: string) => command<Note>("get_note", { id }),
  create: () => command<Note>("create_note"),
  save: (id: string, draft: Draft) =>
    command<Note>("save_note", { id, ...draft }),
  color: (id: string, color: NoteColor) =>
    command<Note>("set_note_color", { id, color }),
  pin: (id: string, pinned: boolean) =>
    command<Note>("set_note_pinned", { id, pinned }),
  remove: (id: string) => command<void>("delete_note", { id }),
  open: (id: string) => command<void>("open_note", { id }),
  close: (id: string) => command<void>("close_note", { id }),
  showList: () => command<void>("show_notes"),
  hideList: () => command<void>("hide_notes"),
  quit: () => command<void>("request_quit"),
  acknowledgeQuit: (token: string, success: boolean) =>
    command<void>("acknowledge_quit", { token, success }),
};
export function subscribe<T>(event: string, callback: (payload: T) => void) {
  if (!isTauri())
    return Promise.reject(new Error("데스크톱 앱에서 열어주세요."));
  return listen<T>(event, (event) => callback(event.payload));
}
export async function startDragging() {
  if (isTauri()) await getCurrentWindow().startDragging();
}

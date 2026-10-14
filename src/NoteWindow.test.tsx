import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoteWindow } from "./NoteWindow";

const boundary = vi.hoisted(() => ({
  failLoad: true,
  listeners: new Map<string, (value: unknown) => void>(),
  acknowledgements: [] as { token: string; success: boolean }[],
  closed: [] as string[],
  releasePin: undefined as (() => void) | undefined,
}));
const initial = {
  id: "one",
  document: { type: "doc", content: [{ type: "paragraph" }] },
  plainText: "",
  color: "yellow",
  pinned: false,
  createdAt: 1,
  updatedAt: 1,
};
vi.mock("./api", () => ({
  notesApi: {
    get: async () => {
      if (boundary.failLoad) throw new Error("저장소 읽기 실패");
      return initial;
    },
    save: async () => initial,
    close: async (id: string) => {
      boundary.closed.push(id);
    },
    acknowledgeQuit: async (token: string, success: boolean) => {
      boundary.acknowledgements.push({ token, success });
    },
    pin: async () => {
      await new Promise<void>((resolve) => {
        boundary.releasePin = resolve;
      });
      return { ...initial, pinned: true };
    },
    create: async () => initial,
  },
  subscribe: async (event: string, callback: (value: unknown) => void) => {
    boundary.listeners.set(event, callback);
    return () => boundary.listeners.delete(event);
  },
  startDragging: async () => {},
}));
beforeEach(() => {
  boundary.failLoad = true;
  boundary.listeners.clear();
  boundary.acknowledgements = [];
  boundary.closed = [];
  boundary.releasePin = undefined;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0),
  );
});

describe("NoteWindow lifecycle", () => {
  it("acknowledges safe shutdown even when loading its document failed", async () => {
    render(<NoteWindow id="one" />);
    await screen.findByText("저장소 읽기 실패");
    await waitFor(() => expect(boundary.listeners.has("app:flush")).toBe(true));
    act(() => boundary.listeners.get("app:flush")?.("quit-token"));
    await waitFor(() =>
      expect(boundary.acknowledgements).toEqual([
        { token: "quit-token", success: true },
      ]),
    );
  });
  it("can close the error shell without an unsaved editor draft", async () => {
    render(<NoteWindow id="one" />);
    await screen.findByText("저장소 읽기 실패");
    await waitFor(() =>
      expect(boundary.listeners.has("note:close-requested")).toBe(true),
    );
    act(() => boundary.listeners.get("note:close-requested")?.(undefined));
    await waitFor(() => expect(boundary.closed).toEqual(["one"]));
  });
  it("keeps formatting locked after another action finishes during quit", async () => {
    boundary.failLoad = false;
    render(<NoteWindow id="one" />);
    await screen.findByRole("textbox", { name: "메모 내용" });
    fireEvent.click(screen.getByRole("button", { name: "상단 고정" }));
    act(() => boundary.listeners.get("app:flush")?.("quit-token"));
    await waitFor(() => expect(boundary.acknowledgements).toHaveLength(1));
    act(() => boundary.releasePin?.());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "상단 고정 해제" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "굵게 (⌘B)" })).toBeDisabled();
    act(() => boundary.listeners.get("app:quit-cancelled")?.(undefined));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "굵게 (⌘B)" })).toBeEnabled(),
    );
  });
  it("does not confirm quit while an IME composition remains unfinished", async () => {
    boundary.failLoad = false;
    render(<NoteWindow id="one" />);
    const textbox = await screen.findByRole("textbox", { name: "메모 내용" });
    fireEvent.compositionStart(textbox);
    act(() => boundary.listeners.get("app:flush")?.("ime-quit"));
    await waitFor(() =>
      expect(boundary.acknowledgements).toEqual([
        { token: "ime-quit", success: false },
      ]),
    );
  });
});

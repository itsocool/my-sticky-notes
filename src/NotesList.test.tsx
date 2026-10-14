import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotesList } from "./NotesList";

const db = vi.hoisted(() => ({
  notes: [
    {
      id: "one",
      document: { type: "doc" },
      plainText: "이번 주 할 일\n프로젝트 마무리",
      color: "yellow",
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: "two",
      document: { type: "doc" },
      plainText: "장보기\n우유와 커피",
      color: "green",
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  listeners: new Map<string, () => void>(),
}));
vi.mock("./api", () => ({
  notesApi: {
    list: async () => [...db.notes],
    create: async () => {
      const note = {
        id: "new",
        document: { type: "doc" },
        plainText: "",
        color: "yellow",
        pinned: false,
        createdAt: 3,
        updatedAt: 3,
      };
      db.notes.unshift(note);
      db.listeners.get("notes:changed")?.();
      return note;
    },
    open: async () => {},
    hideList: async () => {},
    quit: async () => {},
    remove: async (id: string) => {
      db.notes = db.notes.filter((n) => n.id !== id);
      db.listeners.get("notes:changed")?.();
    },
  },
  subscribe: async (event: string, callback: () => void) => {
    db.listeners.set(event, callback);
    return () => db.listeners.delete(event);
  },
  startDragging: async () => {},
}));

beforeEach(() => {
  db.listeners.clear();
  db.notes = [
    {
      id: "one",
      document: { type: "doc" },
      plainText: "이번 주 할 일\n프로젝트 마무리",
      color: "yellow",
      pinned: false,
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: "two",
      document: { type: "doc" },
      plainText: "장보기\n우유와 커피",
      color: "green",
      pinned: false,
      createdAt: 1,
      updatedAt: 1,
    },
  ];
});
describe("NotesList", () => {
  it("searches both the first line and body and distinguishes no results", async () => {
    render(<NotesList />);
    await screen.findByText("이번 주 할 일");
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox"), "커피");
    expect(screen.getByText("장보기")).toBeInTheDocument();
    expect(screen.queryByText("이번 주 할 일")).not.toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "없는단어");
    expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
  });
  it("creating a note updates the list from the storage event", async () => {
    render(<NotesList />);
    await screen.findByText("이번 주 할 일");
    await userEvent.click(screen.getByRole("button", { name: "새 메모" }));
    await screen.findByText("새 메모");
    expect(db.notes[0].id).toBe("new");
  });
  it("deletion requires confirmation before removing stored content", async () => {
    render(<NotesList />);
    await screen.findByText("장보기");
    await userEvent.click(
      screen.getByRole("button", { name: "장보기 메모 옵션" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "메모 삭제" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(db.notes.some((n) => n.id === "two")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() =>
      expect(screen.queryByText("장보기")).not.toBeInTheDocument(),
    );
  });
});

import { describe, expect, it, vi } from "vitest";
import { Autosave } from "./autosave";

describe("Autosave", () => {
  it("coalesces typing and persists the newest document", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const queue = new Autosave<string>(async (value) => {
      saved.push(value);
    });
    queue.update("first");
    queue.update("한글 메모");
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual(["한글 메모"]);
    vi.useRealTimers();
  });

  it("serializes saves and flush waits for the latest value", async () => {
    const saved: string[] = [];
    let release: (() => void) | undefined;
    const firstSave = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new Autosave<string>(async (value) => {
      if (value === "first") await firstSave;
      saved.push(value);
    });
    queue.update("first");
    const first = queue.flush();
    queue.update("latest");
    const last = queue.flush();
    expect(saved).toEqual([]);
    release?.();
    await Promise.all([first, last]);
    expect(saved).toEqual(["first", "latest"]);
  });

  it("retains a failed draft so retry can persist it", async () => {
    let failing = true;
    let persisted = "";
    const queue = new Autosave<string>(async (value) => {
      if (failing) throw new Error("disk full");
      persisted = value;
    });
    queue.update("keep this draft");
    await expect(queue.flush()).rejects.toThrow("disk full");
    failing = false;
    await queue.flush();
    expect(persisted).toBe("keep this draft");
  });

  it("discard prevents delayed saves from resurrecting deleted notes", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    const queue = new Autosave<string>(async (value) => {
      saved.push(value);
    });
    queue.update("deleted");
    queue.discard();
    await vi.advanceTimersByTimeAsync(1000);
    await queue.flush();
    expect(saved).toEqual([]);
    vi.useRealTimers();
  });
  it("does not drain an unfinished IME composition after an earlier save completes", async () => {
    vi.useFakeTimers();
    const saved: string[] = [];
    let release: (() => void) | undefined;
    const writing = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new Autosave<string>(async (value) => {
      if (value === "A") await writing;
      saved.push(value);
    });
    queue.update("A");
    const first = queue.flush();
    queue.setComposing(true);
    queue.update("unfinished IME");
    release?.();
    await first;
    expect(saved).toEqual(["A"]);
    queue.update("완성된 한글");
    queue.setComposing(false);
    await vi.advanceTimersByTimeAsync(500);
    expect(saved).toEqual(["A", "완성된 한글"]);
    vi.useRealTimers();
  });
});

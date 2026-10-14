export type SaveStatus = "saved" | "pending" | "saving" | "error";

/** One writer per note: coalesce keystrokes, serialize disk writes, retain failed drafts. */
export class Autosave<T> {
  private pending: T | undefined;
  private running: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private discarded = false;
  private composing = false;

  constructor(
    private readonly save: (value: T) => Promise<unknown>,
    private readonly onStatus: (
      status: SaveStatus,
      error?: unknown,
    ) => void = () => {},
  ) {}

  update(value: T) {
    if (this.discarded) return;
    this.pending = value;
    this.onStatus("pending");
    this.schedule();
  }

  setComposing(value: boolean) {
    this.composing = value;
    this.cancelTimer();
    if (!value && this.pending !== undefined) this.schedule();
  }

  private schedule() {
    this.cancelTimer();
    if (!this.composing) {
      this.timer = setTimeout(() => {
        void this.flush().catch(() => {});
      }, 500);
    }
  }

  private cancelTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  flush(): Promise<void> {
    this.cancelTimer();
    if (this.discarded || this.composing) return Promise.resolve();
    if (this.running) return this.running;
    if (this.pending === undefined) return Promise.resolve();
    this.running = this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async drain() {
    while (!this.discarded && !this.composing && this.pending !== undefined) {
      const value = this.pending;
      this.pending = undefined;
      this.onStatus("saving");
      try {
        await this.save(value);
      } catch (error) {
        if (this.pending === undefined) this.pending = value;
        this.onStatus("error", error);
        throw error;
      }
    }
    if (!this.discarded)
      this.onStatus(this.pending === undefined ? "saved" : "pending");
  }

  discard() {
    this.cancelTimer();
    this.pending = undefined;
    this.discarded = true;
  }
}

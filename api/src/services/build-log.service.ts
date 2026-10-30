// Collects `docker build` output and saves it as deployment log rows, in
// batches and with limits, so a chatty build cannot flood the database or make
// the logs page slow.

export type BuildLogRow = {
  stage: string;
  message: string;
  createdAt: Date;
};

export type BuildLogOptions = {
  /** Most build lines saved per deployment. */
  maxLines?: number;
  /** Longer lines are cut and end with "…". */
  maxLineLength?: number;
  /** How many of the last lines are kept, to show the real error on failure. */
  tailSize?: number;
  /** How often collected lines are written. */
  flushIntervalMs?: number;
  /** Return true to stop writing (for example the worker lost its job). */
  shouldStop?: () => boolean;
};

// Strips terminal control characters (colours, carriage returns, ...) that
// would show up as garbage in the UI.
function sanitize(line: string, maxLength: number) {
  const clean = line
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "")
    .trimEnd();

  return clean.length > maxLength ? `${clean.slice(0, maxLength)}…` : clean;
}

export class BuildLogWriter {
  private readonly maxLines: number;
  private readonly maxLineLength: number;
  private readonly tailSize: number;
  private readonly flushIntervalMs: number;
  private readonly shouldStop: () => boolean;

  private pending: string[] = [];
  private lineCount = 0;
  private tail: { n: number; text: string }[] = [];
  private lastTimestamp = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly sink: (rows: BuildLogRow[]) => Promise<unknown>,
    options: BuildLogOptions = {},
  ) {
    this.maxLines = options.maxLines ?? 500;
    this.maxLineLength = options.maxLineLength ?? 500;
    this.tailSize = options.tailSize ?? 25;
    this.flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.shouldStop = options.shouldStop ?? (() => false);
  }

  /** Starts writing collected lines every `flushIntervalMs`. */
  start() {
    this.timer ??= setInterval(() => {
      void this.flush();
    }, this.flushIntervalMs);
  }

  push(rawLine: string) {
    const text = sanitize(rawLine, this.maxLineLength);

    if (!text) {
      return;
    }

    this.lineCount += 1;

    // Always remember the most recent lines, even once saving has stopped.
    this.tail.push({ n: this.lineCount, text });

    if (this.tail.length > this.tailSize) {
      this.tail.shift();
    }

    if (this.lineCount <= this.maxLines) {
      this.pending.push(text);
    }
  }

  /** Writes what has been collected so far. Never throws. */
  flush(extra: string[] = []): Promise<void> {
    const lines = [...this.pending, ...extra];
    this.pending = [];

    if (lines.length === 0) {
      return this.flushing;
    }

    // Chain writes so batches reach the database in order.
    this.flushing = this.flushing.then(async () => {
      if (this.shouldStop()) {
        return;
      }

      // One millisecond apart and always increasing, so the logs page can sort
      // them back into the order they were printed.
      const rows = lines.map((message) => {
        this.lastTimestamp = Math.max(Date.now(), this.lastTimestamp + 1);

        return {
          stage: "BUILD",
          message,
          createdAt: new Date(this.lastTimestamp),
        };
      });

      try {
        await this.sink(rows);
      } catch (error) {
        // A failed log write must never fail the deployment.
        console.error("Failed to save build logs", error);
      }
    });

    return this.flushing;
  }

  /**
   * Stops the timer and writes everything that is left. If output was cut off,
   * adds a note, and on failure also the last lines (usually the real error).
   */
  async finish(failed: boolean) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const extra: string[] = [];
    const dropped = this.lineCount - this.maxLines;

    if (dropped > 0) {
      extra.push(
        `… build output truncated: ${dropped} more line(s) not shown${failed ? ", last lines below" : ""}`,
      );

      if (failed) {
        extra.push(
          ...this.tail
            .filter((line) => line.n > this.maxLines)
            .map((line) => line.text),
        );
      }
    }

    await this.flush(extra);
  }
}

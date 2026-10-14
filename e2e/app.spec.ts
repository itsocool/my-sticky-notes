import { expect, test, type Page } from "@playwright/test";

async function mockNative(
  page: Page,
  noteWindow = false,
  failSave = false,
  initialPlainTexts?: string[],
) {
  await page.addInitScript(
    ({ noteWindow, failSave, initialPlainTexts }) => {
      const id = "00000000-0000-4000-8000-000000000001";
      let notes = [
        {
          id,
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "이번 주 할 일",
                    marks: [{ type: "bold" }],
                  },
                ],
              },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "프로젝트 마무리" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
          plainText: "이번 주 할 일\n프로젝트 마무리",
          color: "yellow",
          pinned: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];
      if (!noteWindow) {
        if (initialPlainTexts) {
          notes = initialPlainTexts.map((plainText, index) => ({
            ...notes[0],
            id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
            plainText,
          }));
        } else {
          notes.push(
            {
              ...notes[0],
              id: "00000000-0000-4000-8000-000000000002",
              plainText: "생각을 모아두는 곳\n좋은 문장과 작은 아이디어",
              color: "green",
            },
            {
              ...notes[0],
              id: "00000000-0000-4000-8000-000000000003",
              plainText: "장보기\n우유, 달걀, 커피",
              color: "pink",
            },
            {
              ...notes[0],
              id: "00000000-0000-4000-8000-000000000004",
              plainText: "작은 아이디어\n언젠가 해보고 싶은 것들",
              color: "blue",
            },
          );
        }
      }
      const callbacks = new Map<number, (value: unknown) => void>();
      const listeners = new Map<string, number[]>();
      let sequence = 0;
      const emit = (event: string, payload: unknown) =>
        listeners
          .get(event)
          ?.forEach((id) => callbacks.get(id)?.({ event, id, payload }));
      const target = window as unknown as Record<string, unknown>;
      target.isTauri = true;
      target.__STICKY_TEST_FAIL_SAVE__ = failSave;
      const commands: string[] = [];
      target.__STICKY_TEST_COMMANDS__ = commands;
      if (noteWindow) target.__STICKY_NOTE_ID__ = id;
      target.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
        unregisterListener: () => {},
      };
      target.__TAURI_INTERNALS__ = {
        metadata: {
          currentWindow: { label: noteWindow ? `note-${id}` : "main" },
          currentWebview: { label: noteWindow ? `note-${id}` : "main" },
        },
        transformCallback: (callback: (value: unknown) => void) => {
          const id = ++sequence;
          callbacks.set(id, callback);
          return id;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        invoke: async (command: string, args: Record<string, unknown> = {}) => {
          commands.push(command);
          if (command === "save_note" && target.__STICKY_TEST_FAIL_SAVE__)
            throw new Error("디스크 공간 부족");
          if (command === "plugin:event|listen") {
            const event = String(args.event);
            listeners.set(event, [
              ...(listeners.get(event) || []),
              Number(args.handler),
            ]);
            return Number(args.handler);
          }
          if (command === "plugin:event|unlisten") {
            listeners.set(
              String(args.event),
              (listeners.get(String(args.event)) || []).filter(
                (id) => id !== args.eventId,
              ),
            );
            return;
          }
          if (command === "list_notes") return structuredClone(notes);
          if (command === "get_note")
            return structuredClone(notes.find((n) => n.id === args.id));
          if (command === "create_note") {
            const note = {
              id: crypto.randomUUID(),
              document: { type: "doc", content: [] },
              plainText: "",
              color: "yellow",
              pinned: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            notes.unshift(note);
            emit("notes:changed", null);
            return structuredClone(note);
          }
          if (command === "delete_note") {
            notes = notes.filter((n) => n.id !== args.id);
            emit("notes:changed", null);
            return;
          }
          const note = notes.find((n) => n.id === args.id);
          if (command === "save_note" && note) {
            note.document = args.document as typeof note.document;
            note.plainText = String(args.plainText);
            note.updatedAt = Date.now();
            emit("notes:changed", null);
            return structuredClone(note);
          }
          if (command === "set_note_color" && note) {
            note.color = String(args.color);
            emit("note:metadata", structuredClone(note));
            return structuredClone(note);
          }
          if (command === "set_note_pinned" && note) {
            note.pinned = Boolean(args.pinned);
            emit("note:metadata", structuredClone(note));
            return structuredClone(note);
          }
        },
      };
    },
    { noteWindow, failSave, initialPlainTexts },
  );
}

test("short saved notes omit the prompt while empty notes keep it", async ({
  page,
}) => {
  await mockNative(page, false, false, ["짧은 메모", ""]);
  await page.goto("/");
  const shortCard = page.getByRole("button", {
    name: "짧은 메모 메모 열기",
  });
  const emptyCard = page.getByRole("button", {
    name: "새 메모 메모 열기",
  });
  await expect(shortCard).toBeVisible();
  await expect(
    shortCard.getByText("메모를 열어 내용을 적어보세요."),
  ).toHaveCount(0);
  await expect(
    emptyCard.getByText("메모를 열어 내용을 적어보세요."),
  ).toBeVisible();
});

test("list search, create and confirmed deletion", async ({ page }) => {
  await mockNative(page);
  await page.goto("/");
  await expect(page).toHaveTitle("My Sticky Notes");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expect(page.getByText("이번 주 할 일", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("프로젝트");
  await expect(page.getByText("이번 주 할 일", { exact: true })).toBeVisible();
  await page.getByRole("searchbox").fill("없는단어");
  await expect(page.getByText("검색 결과가 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "검색 지우기" }).click();
  await page.getByRole("button", { name: "새 메모", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "새 메모", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "새 메모 메모 옵션", exact: true })
    .click();
  await page.getByRole("button", { name: "메모 삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "새 메모", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "/tmp/sticky-list.png" });
});

test("rich-text, color, pin and small-window layout", async ({ page }) => {
  await mockNative(page, true);
  await page.setViewportSize({ width: 320, height: 360 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("My Sticky Notes");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "메모 내용" });
  await expect(editor.locator("strong")).toHaveText("이번 주 할 일");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" 한글 메모");
  await expect(page.getByRole("status")).toHaveText("저장됨");
  await page.getByRole("button", { name: "상단 고정", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "상단 고정 해제" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "메모 옵션", exact: true }).click();
  await page.getByRole("button", { name: "분홍 색상" }).click();
  await expect(page.locator("main")).toHaveAttribute("data-color", "pink");
  await page.screenshot({ path: "/tmp/sticky-note.png" });
  await page.setViewportSize({ width: 240, height: 200 });
  await page.getByRole("button", { name: "메모 옵션", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "짙은 회색 색상" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "글머리 목록" }),
  ).toBeInViewport();
  expect(errors).toEqual([]);
});

test("failed save keeps the draft and prevents close until retry succeeds", async ({
  page,
}) => {
  await mockNative(page, true, true);
  await page.setViewportSize({ width: 320, height: 360 });
  await page.goto("/");
  await expect(page).toHaveTitle("My Sticky Notes");
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  const editor = page.getByRole("textbox", { name: "메모 내용" });
  await editor.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" 저장 실패 테스트");
  await expect(page.getByRole("status")).toHaveText("저장 실패");
  await page.getByRole("button", { name: "메모 닫기", exact: true }).click();
  await expect(editor).toBeEditable();
  await expect(editor).toContainText("저장 실패 테스트");
  expect(
    await page.evaluate(() => {
      const target = window as unknown as Record<string, unknown>;
      return (target.__STICKY_TEST_COMMANDS__ as string[]).includes(
        "close_note",
      );
    }),
  ).toBe(false);
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__STICKY_TEST_FAIL_SAVE__ =
      false;
  });
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  await page.getByRole("button", { name: "메모 닫기", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const target = window as unknown as Record<string, unknown>;
        return (target.__STICKY_TEST_COMMANDS__ as string[]).includes(
          "close_note",
        );
      }),
    )
    .toBe(true);
});

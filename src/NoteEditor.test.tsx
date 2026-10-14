import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NoteEditor } from "./NoteEditor";

describe("NoteEditor", () => {
  it("provides the supported formatting controls and updates selection state", async () => {
    render(
      <NoteEditor
        initialDocument={{ type: "doc", content: [{ type: "paragraph" }] }}
        onDraft={() => {}}
        onComposing={() => {}}
        onReady={() => {}}
      />,
    );
    const bold = await screen.findByRole("button", { name: "굵게 (⌘B)" });
    expect(bold).toHaveAttribute("aria-pressed", "false");
    fireEvent.mouseDown(bold);
    fireEvent.click(bold);
    expect(bold).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "밑줄 (⌘U)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "취소선" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "글머리 목록" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "메모 내용" })).toHaveAttribute(
      "contenteditable",
      "true",
    );
  });
});

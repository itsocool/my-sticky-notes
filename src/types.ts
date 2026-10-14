import type { JSONContent } from "@tiptap/react";
export const COLORS = [
  "yellow",
  "green",
  "pink",
  "purple",
  "blue",
  "gray",
  "charcoal",
] as const;
export type NoteColor = (typeof COLORS)[number];
export const COLOR_NAMES: Record<NoteColor, string> = {
  yellow: "노랑",
  green: "초록",
  pink: "분홍",
  purple: "보라",
  blue: "파랑",
  gray: "회색",
  charcoal: "짙은 회색",
};
export interface Note {
  id: string;
  document: JSONContent;
  plainText: string;
  color: NoteColor;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface Draft {
  document: JSONContent;
  plainText: string;
}
export function noteTitle(note: Note) {
  return (
    note.plainText
      .split("\n")
      .find((line) => line.trim())
      ?.trim() || "새 메모"
  );
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "작업을 완료하지 못했습니다. 다시 시도해 주세요.";
}

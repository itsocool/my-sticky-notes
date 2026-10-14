import { useEffect } from "react";
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, Strikethrough, List } from "lucide-react";
import type { Draft } from "./types";
import { IconButton } from "./ui";

const extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    orderedList: false,
    link: false,
  }),
];
export function NoteEditor({
  initialDocument,
  onDraft,
  onComposing,
  onReady,
  disabled = false,
}: {
  initialDocument: JSONContent;
  onDraft: (draft: Draft) => void;
  onComposing: (value: boolean) => void;
  onReady: (editor: Editor | null) => void;
  disabled?: boolean;
}) {
  const editor = useEditor({
    extensions,
    content: initialDocument,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-label": "메모 내용",
        "aria-multiline": "true",
        spellcheck: "false",
      },
    },
    onUpdate: ({ editor }) =>
      onDraft({
        document: editor.getJSON(),
        plainText: editor.getText({ blockSeparator: "\n" }),
      }),
  });
  useEffect(() => {
    onReady(editor);
    return () => onReady(null);
  }, [editor, onReady]);
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      strike: editor?.isActive("strike") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      empty: editor?.isEmpty ?? true,
    }),
  });
  const tools = [
    {
      label: "굵게 (⌘B)",
      active: state?.bold,
      icon: <Bold />,
      run: () => editor?.chain().focus().toggleBold().run(),
    },
    {
      label: "기울임 (⌘I)",
      active: state?.italic,
      icon: <Italic />,
      run: () => editor?.chain().focus().toggleItalic().run(),
    },
    {
      label: "밑줄 (⌘U)",
      active: state?.underline,
      icon: <Underline />,
      run: () => editor?.chain().focus().toggleUnderline().run(),
    },
    {
      label: "취소선",
      active: state?.strike,
      icon: <Strikethrough />,
      run: () => editor?.chain().focus().toggleStrike().run(),
    },
    {
      label: "글머리 목록",
      active: state?.bulletList,
      icon: <List />,
      run: () => editor?.chain().focus().toggleBulletList().run(),
    },
  ];
  return (
    <>
      <div
        className="editor-scroll"
        onCompositionStart={() => onComposing(true)}
        onCompositionEnd={() => onComposing(false)}
      >
        {state?.empty ? (
          <span className="editor-placeholder" aria-hidden="true">
            메모를 입력하세요…
          </span>
        ) : null}
        <EditorContent editor={editor} />
      </div>
      <div className="format-toolbar" role="toolbar" aria-label="텍스트 서식">
        {tools.map((tool) => (
          <IconButton
            key={tool.label}
            label={tool.label}
            aria-pressed={Boolean(tool.active)}
            disabled={!editor || disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={tool.run}
          >
            {tool.icon}
          </IconButton>
        ))}
      </div>
    </>
  );
}

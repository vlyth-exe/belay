import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  FileIcon,
  FileCode,
  FileText,
  Image,
  Braces,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextMenu } from "@/components/ui/context-menu";
import type { AcpAvailableCommand } from "@/types/acp";
import { searchFiles } from "@/lib/file-search";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Mention } from "@tiptap/extension-mention";
import { Placeholder } from "@tiptap/extension-placeholder";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

type JSONContent = {
  type?: string;
  content?: JSONContent[];
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{
    type: string;
    attrs?: Record<string, unknown>;
  }>;
};

interface ChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
  slashCommands?: AcpAvailableCommand[];
  controls?: ReactNode;
  projectPath?: string;
}

function getFileIcon(path: string): LucideIcon {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const fileName = path.split("/").pop()?.toLowerCase() ?? "";
  
  if (fileName.startsWith(".") || fileName.includes("config")) {
    return FileText;
  }
  
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
      return FileCode;
    case "py":
    case "rb":
    case "go":
    case "rs":
    case "java":
    case "kt":
    case "swift":
    case "c":
    case "cpp":
    case "h":
    case "hpp":
      return FileCode;
    case "json":
    case "yaml":
    case "yml":
    case "toml":
    case "xml":
      return Braces;
    case "css":
    case "scss":
    case "sass":
    case "less":
      return Braces;
    case "html":
    case "htm":
    case "svg":
      return FileCode;
    case "md":
    case "markdown":
    case "txt":
    case "rst":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "ico":
    case "bmp":
      return Image;
    default:
      return FileIcon;
  }
}

function FileMentionView({ node }: { node: { attrs: Record<string, unknown> } }) {
  const path = (node.attrs.id as string | null) ?? "";
  const fileName = path.split("/").pop() ?? path;
  const IconComponent = getFileIcon(path);
  
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex items-center gap-1 rounded border border-primary/20 bg-primary/10 px-1.5 py-px align-middle text-[11px] font-medium text-primary"
      title={path}
      data-type="file-mention"
      data-id={path}
    >
      <IconComponent className="size-3 shrink-0" />
      <span>{fileName}</span>
    </NodeViewWrapper>
  );
}

function SuggestionList({
  items,
  selectedIndex,
  onSelect,
  type,
}: {
  items: Array<{ id: string; label: string }> | AcpAvailableCommand[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  type: "file" | "slash";
}) {
  return (
    <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
      <div className="p-1">
        {type === "file" && (
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Files
          </div>
        )}
        {items.length === 0 && type === "file" && (
          <div className="px-3 py-2 text-[12px] text-muted-foreground/60">
            No files found
          </div>
        )}
        {items.map((item, i) => {
          const isFile = type === "file";
          const id = isFile ? (item as { id: string }).id : (item as AcpAvailableCommand).name;
          const displayPath = isFile ? (item as { id: string }).id : undefined;
          const cmd = !isFile ? (item as AcpAvailableCommand) : undefined;
          
          return (
            <button
              key={id}
              type="button"
              data-selected={i === selectedIndex ? "" : undefined}
              onClick={() => onSelect(i)}
              className={[
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors",
                i === selectedIndex
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground",
              ].join(" ")}
            >
              {isFile && displayPath && (
                <>
                  <FileIcon className="size-3.5 shrink-0 text-primary/80" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium leading-snug">
                      {displayPath}
                    </p>
                  </div>
                </>
              )}
              {cmd && (
                <>
                  <span className="shrink-0 pt-px font-mono text-[13px] font-medium text-primary/80">
                    /{cmd.name}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug">
                      {cmd.description}
                    </p>
                    {cmd.input?.hint && (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground/60">
                        {cmd.input.hint}
                      </p>
                    )}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Message Belay…",
  slashCommands = [],
  controls,
  projectPath,
}: ChatInputProps) {
  const [slashDropdownOpen, setSlashDropdownOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const slashDropdownRef = useRef<HTMLDivElement>(null);

  // ── Context menu state ─────────────────────────────────────────
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [hasInputSelection, setHasInputSelection] = useState(false);
  const [clipboardHasText, setClipboardHasText] = useState(false);

  const handleInputContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const selection = window.getSelection()?.toString() ?? "";
    setHasInputSelection(selection.length > 0);
    navigator.clipboard.readText().then((text) => {
      setClipboardHasText(!!text && text.length > 0);
    });
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const hasSlash = slashCommands.length > 0;
  const hasFiles = !!projectPath;
  let dynamicPlaceholder = placeholder;
  if (hasSlash && hasFiles) {
    dynamicPlaceholder = "Type / for commands, @ for files…";
  } else if (hasSlash) {
    dynamicPlaceholder = "Type / for commands, or message…";
  } else if (hasFiles) {
    dynamicPlaceholder = "Type @ for files, or message…";
  }

  const filteredCommands = useMemo(() => {
    if (!slashDropdownOpen) return [];
    const filter = slashFilter.toLowerCase();
    return slashCommands.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(filter)
    );
  }, [slashCommands, slashDropdownOpen, slashFilter]);

  const fileMentionExtension = useMemo(() => {
    return Mention.extend({
      name: "fileMention",
      addNodeView() {
        return ReactNodeViewRenderer(FileMentionView);
      },
    }).configure({
      HTMLAttributes: {
        class: "file-mention",
      },
      suggestion: {
        char: "@",
        allowedPrefixes: [" ", ""],
        items: async ({ query }) => {
          if (!projectPath) return [];
          const results = await searchFiles(projectPath, query);
          return results.map((r) => ({ id: r.path, label: r.name }));
        },
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, [
              {
                type: "fileMention",
                attrs: props,
              },
              {
                type: "text",
                text: " ",
              },
            ])
            .run();
        },
        render: () => {
          let popup: HTMLDivElement | null = null;
          let root: ReturnType<typeof createRoot> | null = null;
          let selectedIndex = 0;
          let items: Array<{ id: string; label: string }> = [];
          let commandFn: ((props: { id: string; label: string }) => void) | null = null;

          const renderPopup = () => {
            if (!popup || !root) return;
            root.render(
              <SuggestionList
                items={items}
                selectedIndex={selectedIndex}
                onSelect={(i) => {
                  const item = items[i];
                  if (item && commandFn) {
                    commandFn(item);
                  }
                }}
                type="file"
              />
            );
          };

          return {
            onStart: (props) => {
              items = props.items as Array<{ id: string; label: string }>;
              commandFn = props.command;
              selectedIndex = 0;
              popup = document.createElement("div");
              popup.className = "absolute z-50 mb-1";
              root = createRoot(popup);
              const rect = props.clientRect?.() ?? null;
              if (rect) {
                popup.style.bottom = `${window.innerHeight - rect.top}px`;
                popup.style.left = `${rect.left}px`;
              }
              document.body.appendChild(popup);
              renderPopup();
            },
            onUpdate: (props) => {
              items = props.items as Array<{ id: string; label: string }>;
              commandFn = props.command;
              selectedIndex = 0;
              if (popup) {
                const rect = props.clientRect?.() ?? null;
                if (rect) {
                  popup.style.bottom = `${window.innerHeight - rect.top}px`;
                  popup.style.left = `${rect.left}px`;
                }
              }
              renderPopup();
            },
            onKeyDown: (props) => {              
              if (props.event.key === "ArrowDown") {
                props.event.preventDefault();
                selectedIndex = (selectedIndex + 1) % items.length;
                renderPopup();
                return true;
              }
              if (props.event.key === "ArrowUp") {
                props.event.preventDefault();
                selectedIndex = selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
                renderPopup();
                return true;
              }
              if (props.event.key === "Enter" || props.event.key === "Tab") {
                props.event.preventDefault();
                const item = items[selectedIndex];
                if (item && commandFn) {
                  commandFn(item);
                }
                return true;
              }
              if (props.event.key === "Escape") {
                props.event.preventDefault();
                return true;
              }
              return false;
            },
            onExit: () => {
              if (root) {
                root.unmount();
                root = null;
              }
              if (popup) {
                popup.remove();
                popup = null;
              }
            },
          };
        },
      },
    });
  }, [projectPath]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: dynamicPlaceholder,
      }),
      fileMentionExtension,
    ],
    editorProps: {
      attributes: {
        class:
          "tiptap max-h-[200px] min-h-[24px] w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-foreground focus:outline-none disabled:opacity-50",
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          if (slashDropdownOpen) {
            return false;
          }
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const text = editor.getText();
      const slashMatch = text.match(/^\/([^\s]*)$/);
      if (slashMatch && slashCommands.length > 0) {
        setSlashDropdownOpen(true);
        setSlashFilter(slashMatch[1]);
        setSlashIndex(0);
      } else {
        setSlashDropdownOpen(false);
      }
    },
    immediatelyRender: false,
  });

  const handleInputCopy = useCallback(() => {
    if (!editor) return;
    const selection = window.getSelection()?.toString() ?? "";
    if (selection) {
      navigator.clipboard.writeText(selection);
    }
  }, [editor]);

  const handleInputPaste = useCallback(async () => {
    if (!editor) return;
    const text = await navigator.clipboard.readText();
    if (text) {
      editor.chain().focus().insertContent(text).run();
    }
  }, [editor]);

  const handleSend = useCallback(() => {
    if (!editor || disabled) return;

    const plainText = editor.getText().trim();
    if (!plainText) return;

    const json = editor.getJSON() as JSONContent;
    const mentions: string[] = [];
    
    // Reconstruct text with inline file references [filename]
    let reconstructedText = "";
    
    if (json.content) {
      for (const node of json.content) {
        if (node.type === "paragraph") {
          if (node.content) {
            for (const child of node.content) {
              if (child.type === "text" && child.text) {
                reconstructedText += child.text;
              } else if (child.type === "fileMention") {
                const attrs = child.attrs as { id?: string } | undefined;
                if (attrs?.id) {
                  mentions.push(attrs.id);
                  const fileName = attrs.id.split("/").pop() ?? attrs.id;
                  reconstructedText += `[${fileName}]`;
                }
              }
            }
          }
          reconstructedText += "\n";
        }
      }
    }

    reconstructedText = reconstructedText.trim();

    onSend(reconstructedText);
    editor.commands.clearContent();
  }, [editor, disabled, onSend]);

  const selectSlashCommand = useCallback(
    (cmd: AcpAvailableCommand) => {
      if (!editor) return;
      editor.commands.clearContent();
      editor.commands.insertContent(`/${cmd.name} `);
      editor.commands.focus();
      setSlashDropdownOpen(false);
    },
    [editor]
  );

  useEffect(() => {
    if (!slashDropdownOpen || !slashDropdownRef.current) return;
    const selected = slashDropdownRef.current.querySelector("[data-selected]");
    selected?.scrollIntoView({ block: "nearest" });
  }, [slashIndex, slashDropdownOpen]);

  useEffect(() => {
    if (!slashDropdownOpen || filteredCommands.length === 0) return;
    
    const handleSlashKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!slashDropdownOpen) return;
      
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSlashIndex((i) => (i < filteredCommands.length - 1 ? i + 1 : 0));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSlashIndex((i) => (i > 0 ? i - 1 : filteredCommands.length - 1));
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (filteredCommands[slashIndex]) {
            selectSlashCommand(filteredCommands[slashIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          setSlashDropdownOpen(false);
          break;
      }
    };

    document.addEventListener("keydown", handleSlashKeyDown);
    return () => document.removeEventListener("keydown", handleSlashKeyDown);
  }, [slashDropdownOpen, filteredCommands, slashIndex, selectSlashCommand]);

  const canSend = !disabled && editor && editor.getText().trim().length > 0;

  return (
    <div className="px-3 pb-3">
      <style>{`
        .tiptap p.is-editor-empty:first-child::before {
          color: var(--muted-foreground, rgb(128, 128, 128));
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
      <div className="relative">
        {slashDropdownOpen && filteredCommands.length > 0 && (
          <div
            ref={slashDropdownRef}
            className="absolute bottom-full left-0 right-0 z-50 mb-1"
          >
            <SuggestionList
              items={filteredCommands}
              selectedIndex={slashIndex}
              onSelect={(i) => selectSlashCommand(filteredCommands[i])}
              type="slash"
            />
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-muted/30 focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/20">
          <div ref={editorContainerRef} className="relative px-3 pt-2 pb-2" onContextMenu={handleInputContextMenu}>
            <EditorContent
              editor={editor}
              disabled={disabled}
              className="outline-none"
            />
          </div>
          <div className="px-3 py-1.5">
            <div className="flex items-center gap-2">
              {controls}
              <div className="flex-1" />
              <Button
                size="icon-sm"
                onClick={handleSend}
                disabled={!canSend}
                aria-label="Send message"
                className="shrink-0 rounded-lg"
              >
                <ArrowUp className="size-4" strokeWidth={2.5} />
              </Button>
            </div>
          </div>
        </div>
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            canCopy={hasInputSelection}
            canPaste={clipboardHasText}
            onCopy={handleInputCopy}
            onPaste={handleInputPaste}
            onClose={handleCloseContextMenu}
          />
        )}
      </div>
    </div>
  );
}
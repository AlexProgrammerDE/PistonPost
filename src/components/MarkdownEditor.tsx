"use client"

import {
  Bold,
  Code2,
  Eye,
  EyeOff,
  Heading2,
  Info,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  ListCollapse,
  Quote,
  SquarePen,
  Strikethrough,
  Table2,
  type LucideIcon,
} from "lucide-react"
import {
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentProps,
  type KeyboardEvent,
} from "react"

import { MarkdownContent } from "@/components/MarkdownContent"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Kbd } from "@/components/ui/kbd"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  applyMarkdownCommand,
  applyMarkdownPaste,
  type MarkdownCommand,
  type MarkdownEdit,
} from "@/lib/markdown-editor"

type MarkdownEditorProps = Omit<
  ComponentProps<typeof Textarea>,
  "onChange" | "value" | "defaultValue"
> & {
  readonly value: string
  readonly onValueChange: (value: string) => void
}

type ToolbarAction = {
  readonly command: MarkdownCommand
  readonly icon: LucideIcon
  readonly label: string
  readonly shortcut?: {
    readonly accessible: string
    readonly display: string
  }
}

const toolbarGroups: ReadonlyArray<{
  readonly label: string
  readonly actions: ReadonlyArray<ToolbarAction>
}> = [
  {
    label: "Text formatting",
    actions: [
      { command: "heading", icon: Heading2, label: "Heading" },
      {
        command: "bold",
        icon: Bold,
        label: "Bold",
        shortcut: { accessible: "Control+B", display: "Ctrl+B" },
      },
      {
        command: "italic",
        icon: Italic,
        label: "Italic",
        shortcut: { accessible: "Control+I", display: "Ctrl+I" },
      },
      { command: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
      {
        command: "link",
        icon: Link2,
        label: "Link",
        shortcut: { accessible: "Control+K", display: "Ctrl+K" },
      },
      { command: "inline-code", icon: Code2, label: "Inline code" },
    ],
  },
  {
    label: "Blocks and lists",
    actions: [
      { command: "quote", icon: Quote, label: "Quote" },
      { command: "bullet-list", icon: List, label: "Bulleted list" },
      { command: "ordered-list", icon: ListOrdered, label: "Numbered list" },
      { command: "task-list", icon: ListTodo, label: "Task list" },
      { command: "code-block", icon: SquarePen, label: "Code block" },
      { command: "table", icon: Table2, label: "Table" },
    ],
  },
  {
    label: "Post extras",
    actions: [
      { command: "spoiler", icon: EyeOff, label: "Spoiler" },
      { command: "details", icon: ListCollapse, label: "Collapsible details" },
      { command: "callout", icon: Info, label: "Callout" },
    ],
  },
]

export function MarkdownEditor({
  value,
  onValueChange,
  onBlur,
  onPaste,
  maxLength,
  disabled,
  ...props
}: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState("write")

  function applyEdit(edit: MarkdownEdit) {
    if (typeof maxLength === "number" && edit.value.length > maxLength) return false
    onValueChange(edit.value)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return
      textarea.focus()
      textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd)
    })
    return true
  }

  function runCommand(command: MarkdownCommand) {
    const textarea = textareaRef.current
    if (!textarea || disabled) return
    const edit = applyMarkdownCommand(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      command,
    )
    applyEdit(edit)
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!event.ctrlKey && !event.metaKey) return
    const command =
      event.key.toLocaleLowerCase("en-US") === "b"
        ? "bold"
        : event.key.toLocaleLowerCase("en-US") === "i"
          ? "italic"
          : event.key.toLocaleLowerCase("en-US") === "k"
            ? "link"
            : null
    if (!command) return
    event.preventDefault()
    runCommand(command)
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    onPaste?.(event)
    if (event.defaultPrevented || disabled) return

    const textarea = event.currentTarget
    const edit = applyMarkdownPaste(
      value,
      textarea.selectionStart,
      textarea.selectionEnd,
      event.clipboardData.getData("text/plain"),
    )
    if (!edit || !applyEdit(edit)) return
    event.preventDefault()
  }

  return (
    <Tabs value={mode} onValueChange={setMode} className="gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList variant="line" aria-label="Markdown editor view">
          <TabsTrigger value="write">
            <SquarePen aria-hidden="true" data-icon="inline-start" />
            Write
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Eye aria-hidden="true" data-icon="inline-start" />
            Preview
          </TabsTrigger>
        </TabsList>
        <p className="text-xs text-muted-foreground">
          {value.length.toLocaleString()} / {maxLength?.toLocaleString() ?? "∞"}
        </p>
      </div>

      <TabsContent value="write" className="grid gap-2">
        <TooltipProvider>
          <div
            role="toolbar"
            aria-label="Markdown formatting"
            className="flex flex-wrap items-center gap-2"
          >
            {toolbarGroups.map((group) => (
              <ButtonGroup key={group.label} aria-label={group.label}>
                {group.actions.map(({ command, icon: Icon, label, shortcut }) => (
                  <Tooltip key={command}>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={label}
                          aria-keyshortcuts={shortcut?.accessible}
                          disabled={disabled}
                          onClick={() => runCommand(command)}
                        />
                      }
                    >
                      <Icon aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>
                      {label}
                      {shortcut ? <Kbd>{shortcut.display}</Kbd> : null}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </ButtonGroup>
            ))}
          </div>
        </TooltipProvider>
        <Textarea
          {...props}
          ref={textareaRef}
          value={value}
          maxLength={maxLength}
          disabled={disabled}
          className="min-h-72 resize-y"
          onBlur={onBlur}
          onChange={(event) => onValueChange(event.currentTarget.value)}
          onKeyDown={handleShortcut}
          onPaste={handlePaste}
        />
      </TabsContent>

      <TabsContent value="preview" className="min-h-72 border bg-background p-4">
        {value.trim() ? (
          <MarkdownContent className="typeset-post">{value}</MarkdownContent>
        ) : (
          <Empty className="min-h-64 p-6">
            <EmptyHeader>
              <EmptyTitle>Nothing to preview yet</EmptyTitle>
              <EmptyDescription>Write some Markdown, then check it here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </TabsContent>
      <p className="text-xs text-muted-foreground">
        GitHub-flavored Markdown is supported. The toolbar also adds spoilers, details, and
        callouts. Paste a supported media link on an empty line to add an embed.
      </p>
    </Tabs>
  )
}

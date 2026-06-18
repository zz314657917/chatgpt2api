"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

type MarkdownMessageProps = {
  children: string;
  className?: string;
  copyable?: boolean;
};

type MarkdownBlock =
  | {
      type: "heading";
      level: number;
      text: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: string[];
    }
  | {
      type: "paragraph";
      lines: string[];
    }
  | {
      type: "code";
      language: string;
      code: string;
    };

const BARE_LINK_PATTERN = /^(https?:\/\/[^\s<>"']+|mailto:[^\s<>"']+|tel:[^\s<>"']+)/i;
const TRAILING_URL_PUNCTUATION_PATTERN = /[),.;:!?，。！？；：、]+$/;
const LINK_CLASS_NAME =
  "font-medium text-[#1456f0] underline underline-offset-2 transition hover:text-[#17437d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1456f0]/25 dark:text-blue-300 dark:hover:text-blue-200";

export function MarkdownMessage({
  children,
  className,
  copyable = true,
}: MarkdownMessageProps) {
  const content = children.trim();

  if (!content) {
    return null;
  }

  return (
    <div className={cn("group/message relative min-w-0 break-words text-sm leading-6 text-foreground", className)}>
      {copyable ? <CopyMessageButton text={content} /> : null}
      <div className={cn(copyable && "pr-9", "space-y-3")}>
        {parseBlocks(content).map((block, index) => renderBlock(block, `markdown-block-${index}`))}
      </div>
    </div>
  );
}

function parseBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const currentLine = lines[index];
    if (!currentLine.trim()) {
      index += 1;
      continue;
    }

    const codeFence = parseCodeFenceStart(currentLine);
    if (codeFence) {
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !isCodeFenceEnd(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: "code",
        language: codeFence.language,
        code: trimTrailingBlankLines(codeLines).join("\n"),
      });
      continue;
    }

    const heading = parseHeading(currentLine);
    if (heading) {
      blocks.push(heading);
      index += 1;
      continue;
    }

    const listItem = parseListItem(currentLine);
    if (listItem) {
      const items: string[] = [];
      const ordered = listItem.ordered;

      while (index < lines.length) {
        const item = parseListItem(lines[index]);
        if (!item || item.ordered !== ordered) {
          break;
        }
        items.push(item.text);
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (parseCodeFenceStart(lines[index]) || parseHeading(lines[index]) || parseListItem(lines[index])) {
        break;
      }
      paragraphLines.push(lines[index]);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraphLines });
    }
  }

  return blocks;
}

function parseCodeFenceStart(line: string) {
  const match = /^\s*```[ \t]*([^\s`]*)?.*$/.exec(line);
  if (!match) {
    return null;
  }
  return { language: match[1] || "" };
}

function isCodeFenceEnd(line: string) {
  return /^\s*```\s*$/.test(line);
}

function trimTrailingBlankLines(lines: string[]) {
  let end = lines.length;
  while (end > 0 && !lines[end - 1].trim()) {
    end -= 1;
  }
  return lines.slice(0, end);
}

function parseHeading(line: string): MarkdownBlock | null {
  const match = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
  if (!match) {
    return null;
  }
  return {
    type: "heading",
    level: match[1].length,
    text: match[2],
  };
}

function parseListItem(line: string): { ordered: boolean; text: string } | null {
  const unordered = /^\s{0,3}[-*+]\s+(.+)$/.exec(line);
  if (unordered) {
    return { ordered: false, text: unordered[1] };
  }

  const ordered = /^\s{0,3}\d+[.)]\s+(.+)$/.exec(line);
  if (ordered) {
    return { ordered: true, text: ordered[1] };
  }

  return null;
}

function renderBlock(block: MarkdownBlock, key: string) {
  if (block.type === "heading") {
    const HeadingTag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
    return (
      <HeadingTag
        key={key}
        className={cn(
          "font-semibold tracking-normal text-current",
          block.level === 1 ? "text-base leading-7" : "text-sm leading-6",
        )}
      >
        {renderInline(block.text, key)}
      </HeadingTag>
    );
  }

  if (block.type === "list") {
    const ListTag = block.ordered ? "ol" : "ul";
    return (
      <ListTag
        key={key}
        className={cn("space-y-1 pl-5 text-sm leading-6 text-current", block.ordered ? "list-decimal" : "list-disc")}
      >
        {block.items.map((item, index) => (
          <li key={`${key}-item-${index}`} className="pl-1">
            {renderInline(item, `${key}-item-${index}`)}
          </li>
        ))}
      </ListTag>
    );
  }

  if (block.type === "code") {
    return <CodeBlock key={key} language={block.language} code={block.code} />;
  }

  return (
    <p key={key} className="whitespace-pre-wrap text-sm leading-6 text-current">
      {renderInlineLines(block.lines, key)}
    </p>
  );
}

function renderInlineLines(lines: string[], keyPrefix: string) {
  return lines.flatMap((line, index) => {
    const nodes = renderInline(line, `${keyPrefix}-line-${index}`);
    if (index === lines.length - 1) {
      return nodes;
    }
    return [...nodes, <br key={`${keyPrefix}-line-${index}-break`} />];
  });
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let textBuffer = "";

  const flushText = () => {
    if (!textBuffer) {
      return;
    }
    nodes.push(textBuffer);
    textBuffer = "";
  };

  const pushNode = (node: ReactNode) => {
    flushText();
    nodes.push(node);
  };

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === "`") {
      const end = text.indexOf("`", cursor + 1);
      if (end > cursor + 1) {
        pushNode(
          <code
            key={`${keyPrefix}-code-${cursor}`}
            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.9em] text-current"
          >
            {text.slice(cursor + 1, end)}
          </code>,
        );
        cursor = end + 1;
        continue;
      }
    }

    if (text.startsWith("**", cursor)) {
      const end = text.indexOf("**", cursor + 2);
      if (end > cursor + 2) {
        pushNode(
          <strong key={`${keyPrefix}-strong-${cursor}`} className="font-semibold text-current">
            {renderInline(text.slice(cursor + 2, end), `${keyPrefix}-strong-${cursor}`)}
          </strong>,
        );
        cursor = end + 2;
        continue;
      }
    }

    const markdownLink = parseMarkdownLink(text, cursor);
    if (markdownLink) {
      pushNode(
        <MarkdownLink key={`${keyPrefix}-link-${cursor}`} href={markdownLink.href}>
          {renderInline(markdownLink.label, `${keyPrefix}-link-${cursor}-label`)}
        </MarkdownLink>,
      );
      cursor = markdownLink.end;
      continue;
    }

    const autoLink = parseAutoLink(text, cursor);
    if (autoLink) {
      pushNode(
        <MarkdownLink key={`${keyPrefix}-autolink-${cursor}`} href={autoLink.href}>
          {autoLink.href}
        </MarkdownLink>,
      );
      cursor = autoLink.end;
      continue;
    }

    const bareLink = parseBareLink(text, cursor);
    if (bareLink) {
      pushNode(
        <MarkdownLink key={`${keyPrefix}-barelink-${cursor}`} href={bareLink.href}>
          {bareLink.href}
        </MarkdownLink>,
      );
      if (bareLink.trailing) {
        textBuffer += bareLink.trailing;
      }
      cursor = bareLink.end;
      continue;
    }

    textBuffer += char;
    cursor += 1;
  }

  flushText();
  return nodes;
}

function parseMarkdownLink(text: string, start: number) {
  if (text[start] !== "[" || text[start - 1] === "!") {
    return null;
  }

  const labelEnd = text.indexOf("]", start + 1);
  if (labelEnd <= start + 1 || text[labelEnd + 1] !== "(") {
    return null;
  }

  const hrefStart = labelEnd + 2;
  const hrefEnd = findClosingParen(text, hrefStart);
  if (hrefEnd <= hrefStart) {
    return null;
  }

  const href = sanitizeHref(text.slice(hrefStart, hrefEnd));
  if (!href) {
    return null;
  }

  return {
    label: text.slice(start + 1, labelEnd),
    href,
    end: hrefEnd + 1,
  };
}

function findClosingParen(text: string, start: number) {
  let depth = 0;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char !== ")") {
      continue;
    }
    if (depth === 0) {
      return index;
    }
    depth -= 1;
  }

  return -1;
}

function parseAutoLink(text: string, start: number) {
  if (text[start] !== "<") {
    return null;
  }

  const end = text.indexOf(">", start + 1);
  if (end <= start + 1) {
    return null;
  }

  const href = sanitizeHref(text.slice(start + 1, end));
  if (!href) {
    return null;
  }

  return { href, end: end + 1 };
}

function parseBareLink(text: string, start: number) {
  const match = BARE_LINK_PATTERN.exec(text.slice(start));
  if (!match) {
    return null;
  }

  const rawHref = match[0];
  const href = sanitizeHref(rawHref.replace(TRAILING_URL_PUNCTUATION_PATTERN, ""));
  if (!href) {
    return null;
  }

  return {
    href,
    trailing: rawHref.slice(href.length),
    end: start + rawHref.length,
  };
}

function sanitizeHref(rawHref: string) {
  const href = rawHref.trim().replace(/^<|>$/g, "");
  if (!href || hasControlCharacter(href)) {
    return "";
  }

  if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) {
    return href;
  }

  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:") {
      return href;
    }
  } catch {
    return "";
  }

  return "";
}

function hasControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) {
      return true;
    }
  }
  return false;
}

function MarkdownLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const external = /^https?:\/\//i.test(href);

  return (
    <a
      className={LINK_CLASS_NAME}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
    >
      {children}
    </a>
  );
}

function CopyMessageButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="absolute top-2 right-2 inline-flex size-7 items-center justify-center rounded-full border border-border bg-background/90 text-muted-foreground shadow-sm opacity-80 transition hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover/message:opacity-100"
      title="复制全文"
      aria-label="复制全文"
      onClick={() => void copyToClipboard(text, "内容已复制", setCopied)}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const label = language.trim();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-slate-950 text-slate-100 shadow-sm">
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-white/10 bg-white/[0.04] px-3 py-1.5">
        <span className="truncate font-mono text-[11px] text-slate-300">{label || "code"}</span>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
          onClick={() => void copyToClipboard(code, "代码已复制", setCopied)}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-3 text-xs leading-5">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

async function copyToClipboard(
  text: string,
  successMessage: string,
  setCopied: (value: boolean) => void,
) {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(successMessage);
    window.setTimeout(() => setCopied(false), 1200);
  } catch {
    toast.error("复制失败");
  }
}

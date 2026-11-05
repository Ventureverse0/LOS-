import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

interface MarkdownRendererProps {
  markdown: string;
}

function renderInlineTokens(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    const key = `${match.index}-${token.slice(0, 8)}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={key} className="font-semibold text-on-surface">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={key}
          className="font-mono text-[12px] px-1.5 py-0.5 rounded bg-surface-lowest text-primary border border-outline-variant/40"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      parts.push(
        <em key={key} className="italic text-on-surface-variant">
          {token.slice(1, -1)}
        </em>
      );
    } else if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        parts.push(
          <a
            key={key}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary-container transition-colors"
          >
            {linkMatch[1]}
          </a>
        );
      } else {
        parts.push(token);
      }
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function CodeBlockCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="rounded-md bg-surface-lowest border border-outline-variant/40 overflow-hidden my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-low border-b border-outline-variant/30">
        <span className="font-mono text-[11px] uppercase tracking-wider text-outline">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 font-mono text-[11px] text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-tertiary" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-on-surface">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ markdown }: MarkdownRendererProps) {
  if (!markdown || !markdown.trim()) {
    return (
      <div className="text-sm text-outline italic py-4">
        No Markdown notes recorded yet. Start typing in the editor to capture technical invariants.
      </div>
    );
  }

  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code blocks
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(<CodeBlockCard key={`code-${i}`} lang={lang} code={codeLines.join("\n")} />);
      i++;
      continue;
    }

    // Block Math $$ ... $$
    if (line.trim().startsWith("$$")) {
      const singleLineMath = line.trim().endsWith("$$") && line.trim().length > 4;
      let mathBody = "";
      if (singleLineMath) {
        mathBody = line.trim().slice(2, -2).trim();
      } else {
        const mathLines: string[] = [line.trim().slice(2)];
        i++;
        while (i < lines.length && !lines[i].trim().endsWith("$$")) {
          mathLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) {
          mathLines.push(lines[i].trim().slice(0, -2));
        }
        mathBody = mathLines.join("\n").trim();
      }
      elements.push(
        <div
          key={`math-${i}`}
          className="my-2 px-3.5 py-2.5 rounded-md bg-surface-lowest border border-primary/30 font-mono text-[13px] text-primary overflow-x-auto"
        >
          {mathBody}
        </div>
      );
      i++;
      continue;
    }

    // Headings
    if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={`h1-${i}`}
          className="text-xl font-semibold text-on-surface tracking-tight pt-2 pb-1 border-b border-outline-variant/30"
        >
          {renderInlineTokens(line.slice(2))}
        </h1>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={`h2-${i}`} className="text-base font-semibold text-on-surface tracking-tight pt-3 pb-0.5">
          {renderInlineTokens(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-semibold text-primary pt-2">
          {renderInlineTokens(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }

    // Blockquotes
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="my-1.5 px-3 py-2 rounded bg-surface-lowest border border-outline-variant/40 text-on-surface-variant text-[13px]"
        >
          {renderInlineTokens(line.slice(2))}
        </blockquote>
      );
      i++;
      continue;
    }

    // Unordered Lists
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="space-y-1.5 my-1.5 pl-4 list-disc marker:text-primary text-[13.5px] text-on-surface-variant">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineTokens(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered Lists
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-1.5 my-1.5 pl-5 list-decimal marker:text-primary marker:font-mono text-[13.5px] text-on-surface-variant">
          {items.map((item, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInlineTokens(item)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    elements.push(
      <p key={`p-${i}`} className="text-[13.5px] leading-relaxed text-on-surface-variant my-1.5">
        {renderInlineTokens(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

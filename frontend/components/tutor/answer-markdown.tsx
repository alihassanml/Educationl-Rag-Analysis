import type { ReactNode } from "react";
import type { Block, Inline } from "@/lib/markdown";

type Props = {
  blocks: Block[];
  /** Renders a `[n]` citation. Only markers that match a source ever reach here. */
  cite: (marker: number, key: string) => ReactNode;
  /** The blinking caret shown at the end of the text while it is still being written. */
  cursor?: ReactNode;
};

function renderInline(nodes: Inline[], cite: Props["cite"], prefix: string): ReactNode[] {
  return nodes.map((node, i) => {
    const key = `${prefix}.${i}`;
    switch (node.type) {
      case "text":
        return node.text;
      case "cite":
        return cite(node.marker, key);
      case "bold":
        return (
          <strong key={key} className="font-semibold">
            {renderInline(node.children, cite, key)}
          </strong>
        );
      case "italic":
        return <em key={key}>{renderInline(node.children, cite, key)}</em>;
      case "code":
        return (
          <code key={key} className="rounded-md bg-stone-100 px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
            {node.text}
          </code>
        );
    }
  });
}

/** Answer text as real typography. Everything is rendered as React text, so nothing the model writes
 *  can become markup. */
export function AnswerMarkdown({ blocks, cite, cursor }: Props) {
  return (
    <div className="flex min-w-0 max-w-[720px] flex-col gap-3 text-base text-ink [overflow-wrap:anywhere]">
      {blocks.map((block, i) => {
        const last = i === blocks.length - 1;
        const tail = last ? cursor : null;
        const key = `b${i}`;
        switch (block.type) {
          case "heading":
            return (
              <h3 key={key} className={block.level === 1 ? "mt-1 text-lg font-semibold" : "mt-1 text-base font-semibold"}>
                {renderInline(block.inline, cite, key)}
                {tail}
              </h3>
            );
          case "ul":
          case "ol": {
            const List = block.type;
            return (
              <List key={key} className={`flex flex-col gap-1.5 pl-6 marker:text-ink-2 ${block.type === "ul" ? "list-disc" : "list-decimal"}`}>
                {block.items.map((item, j) => (
                  <li key={j} className="pl-1">
                    {renderInline(item, cite, `${key}.${j}`)}
                    {j === block.items.length - 1 ? tail : null}
                  </li>
                ))}
              </List>
            );
          }
          case "code":
            return (
              <pre key={key} className="overflow-x-auto rounded-lg bg-stone-100 p-3 font-mono text-small leading-5 text-ink">
                <code>{block.text}</code>
                {tail}
              </pre>
            );
          case "p":
            return (
              <p key={key} className="whitespace-pre-wrap">
                {renderInline(block.inline, cite, key)}
                {tail}
              </p>
            );
        }
      })}
    </div>
  );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Sizes are relative so each caller keeps its own base font size. */
const PROSE = [
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2 [&_p]:leading-relaxed",
  "[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-[1.3em] [&_h1]:font-semibold",
  "[&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-[1.15em] [&_h2]:font-semibold",
  "[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:font-semibold",
  "[&_h4]:mt-4 [&_h4]:mb-1.5 [&_h4]:font-semibold",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5 [&_li>p]:my-0",
  "[&_strong]:font-semibold [&_strong]:text-ink",
  "[&_a]:underline [&_a]:underline-offset-2",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-3 [&_blockquote]:text-dim",
  "[&_code]:rounded [&_code]:bg-raised [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-raised [&_pre]:px-3 [&_pre]:py-2",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_hr]:my-4 [&_hr]:border-hairline",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.92em]",
  "[&_th]:border [&_th]:border-hairline [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-medium",
  "[&_td]:border [&_td]:border-hairline [&_td]:px-2 [&_td]:py-1 [&_td]:align-top",
].join(" ");

// A link written by a model shouldn't drag the workspace off the page.
const COMPONENTS = {
  a: (props: React.ComponentPropsWithoutRef<"a">) => (
    <a {...props} target="_blank" rel="noreferrer" />
  ),
};

export default function Markdown({
  children,
  className = "",
}: {
  children: string;
  className?: string;
}) {
  return (
    <div className={`${PROSE} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

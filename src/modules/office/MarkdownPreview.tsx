import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '@/shared/utils';

/** Compact rendered markdown for role prompts and results in the office panels. */
export default function MarkdownPreview({ markdown, className }: { markdown: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm max-w-none text-[12.5px] dark:prose-invert prose-headings:mb-1 prose-headings:mt-2.5 prose-h1:text-sm prose-h2:text-[13px] prose-h3:text-[12.5px] prose-p:my-1.5 prose-ul:my-1.5 prose-li:my-0 prose-pre:text-[11px]',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
    </div>
  );
}

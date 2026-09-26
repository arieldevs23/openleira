import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Copy, Check, Terminal } from 'lucide-react';

import { cn,copyTextToClipboard } from '@/shared/utils';
import { ToolStatusBadge } from '@/modules/chat/tools/ToolStatusBadge';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import { summarizeToolText } from '@/modules/chat/utils/chatFormatting';
import type { ToolStatus } from '@/shared/types';

type BashCommandDisplayProps = {
  command: string;
  description?: string;
  /** Combined stdout/stderr from the tool result (empty while running). */
  output?: string;
  isError?: boolean;
  status?: ToolStatus;
  defaultOpen?: boolean;
};

/**
 * Compact command row: icon, tool name and a 60-char summary of the command on
 * one muted 28px line. When the command produced output, clicking the row
 * expands the full command and its output inline.
 *
 * Rendered by chat's ToolRenderer for shell tools (Bash and friends).
 */
export const BashCommandDisplay: React.FC<BashCommandDisplayProps> = ({
  command,
  description,
  output,
  isError = false,
  status,
  defaultOpen = false,
}) => {
  const { t } = useTranslation();
  const trimmedOutput = (output || '').replace(/\s+$/, '');
  const hasOutput = trimmedOutput.length > 0;
  const isRunning = status === 'running';
  // `open` is raised by an effect once output arrives (below). A document is
  // rendered without effects, so it would show every command and no output.
  const isExporting = useIsExportingTranscript();
  const [openState, setOpen] = useState(false);
  const open = openState || isExporting;
  const [copied, setCopied] = useState(false);

  // Output often arrives after this component first mounts, so apply the
  // auto-open intent once when there is finally something to show. After that
  // the user is in control of the toggle. Errors intentionally do NOT
  // auto-expand — the red icon and status label already signal the failure,
  // and the output stays one click away.
  const autoAppliedRef = useRef(false);
  useEffect(() => {
    if (!autoAppliedRef.current && hasOutput && defaultOpen) {
      autoAppliedRef.current = true;
      setOpen(true);
    }
  }, [hasOutput, defaultOpen]);

  const toggle = () => {
    if (hasOutput) {
      setOpen((prev) => !prev);
    }
  };

  const handleCopy = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const didCopy = await copyTextToClipboard(command);
    if (!didCopy) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const summary = summarizeToolText(command);

  return (
    <div className="group/cmd my-px">
      {/* Compact single-line header — clickable when there is output to expand */}
      <div
        role={hasOutput ? 'button' : undefined}
        tabIndex={hasOutput ? 0 : undefined}
        aria-expanded={hasOutput ? open : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (hasOutput && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            toggle();
          }
        }}
        title={command}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] leading-none text-muted-foreground outline-none transition-colors duration-150',
          hasOutput && 'cursor-pointer hover:bg-muted/60 hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
        )}
      >
        <ChevronRight
          className={cn(
            'h-3 w-3 flex-shrink-0 opacity-60 transition-transform duration-150',
            open && 'rotate-90',
            !hasOutput && 'opacity-0',
          )}
        />
        <Terminal className={cn('h-3 w-3 flex-shrink-0 opacity-70', isError && 'text-err opacity-100')} />
        <span className="flex-shrink-0 font-medium text-foreground/70">Bash</span>
        {/* Not a <code> tag: the global `.chat-message code` rule forces
            `white-space: pre-wrap !important`, which would defeat `truncate`. */}
        <span className="min-w-0 flex-1 truncate">{summary}</span>

        {isRunning && (
          <span className="h-2.5 w-2.5 flex-shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-muted-foreground" />
        )}
        {status && status !== 'running' && <ToolStatusBadge status={status} className="flex-shrink-0" />}

        <button
          onClick={handleCopy}
          onKeyDown={(event) => event.stopPropagation()}
          className="flex-shrink-0 rounded p-0.5 opacity-0 transition-opacity duration-150 hover:text-foreground focus:opacity-100 group-hover/cmd:opacity-100"
          title={t('chat:misc.copyCommand')}
          aria-label={t('chat:misc.copyCommand')}
        >
          {copied ? <Check className="h-3 w-3 text-ok" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {/* Expanded detail: full command, description and output */}
      {open && hasOutput && (
        <div className="settings-content-enter mb-1 ml-[1.1rem] mt-0.5 rounded-md bg-muted/40 font-mono text-[11px]">
          {description && (
            <div className="px-2.5 pt-2 font-sans italic text-muted-foreground">{description}</div>
          )}
          <pre className="whitespace-pre-wrap break-all px-2.5 pt-2 text-foreground/80">
            <span className="select-none text-muted-foreground">$ </span>{command}
          </pre>
          <pre
            className={cn(
              'max-h-80 overflow-auto whitespace-pre-wrap break-all px-2.5 py-2 leading-relaxed',
              isError ? 'text-err' : 'text-muted-foreground',
            )}
          >
            {trimmedOutput}
          </pre>
        </div>
      )}
    </div>
  );
};

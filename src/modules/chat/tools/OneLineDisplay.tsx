import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, FileText, Search, Terminal, Wrench } from 'lucide-react';

import { copyTextToClipboard } from '@/shared/utils';
import { ToolStatusBadge } from '@/modules/chat/tools/ToolStatusBadge';
import { summarizeToolText } from '@/modules/chat/utils/chatFormatting';
import type { ToolStatus } from '@/shared/types';

type ActionType = 'copy' | 'open-file' | 'jump-to-results' | 'none';

type OneLineDisplayProps = {
  toolName: string;
  icon?: string;
  label?: string;
  value: string;
  secondary?: string;
  action?: ActionType;
  onAction?: () => void;
  style?: string;
  /** Kept for config compatibility; compact rows always truncate to one line. */
  wrapText?: boolean;
  colorScheme?: {
    primary?: string;
    secondary?: string;
    background?: string;
    border?: string;
    icon?: string;
  };
  resultId?: string;
  toolResult?: any;
  toolId?: string;
  status?: ToolStatus;
};

/**
 * Unified one-line display for simple tool inputs and results
 * Used by: Bash, Read, Grep/Glob (minimized), TodoRead, etc.
 *
 * Rendered by chat's ToolRenderer for tools configured as single-line.
 */
export const OneLineDisplay: React.FC<OneLineDisplayProps> = ({
  toolName,
  icon,
  label,
  value,
  secondary,
  action = 'none',
  onAction,
  style,
  colorScheme = {
    primary: 'text-foreground',
    secondary: 'text-muted-foreground',
    background: '',
    border: 'border-border',
    icon: 'text-muted-foreground',
  },
  toolResult,
  toolId,
  status,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const isTerminal = style === 'terminal';

  const handleAction = async () => {
    if (action === 'copy' && value) {
      const didCopy = await copyTextToClipboard(value);
      if (!didCopy) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else if (onAction) {
      onAction();
    }
  };

  const renderCopyButton = () => (
    <button
      onClick={handleAction}
      className="ml-1 flex-shrink-0 text-muted-foreground/40 opacity-0 transition-all hover:text-muted-foreground group-hover:opacity-100"
      title={t('chat:misc.copyToClipboard')}
      aria-label={t('chat:misc.copyToClipboard')}
    >
      {copied ? (
        <svg className="h-3 w-3 text-ok" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );

  const rowClassName = 'group my-px flex h-7 items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] leading-none text-muted-foreground transition-colors duration-150 hover:bg-muted/60';
  const nameLabel = label || toolName;
  const summary = summarizeToolText(value);

  // Terminal style: same compact row as Bash, prefixed with a terminal icon
  if (isTerminal) {
    return (
      <div className={rowClassName} title={value}>
        <Terminal className="h-3 w-3 flex-shrink-0 opacity-70" />
        {nameLabel && <span className="flex-shrink-0 font-medium text-foreground/70">{nameLabel}</span>}
        <span className="min-w-0 flex-1 truncate">{summary}</span>
        {secondary && <span className="flex-shrink-0 truncate font-sans italic opacity-70">{secondary}</span>}
        {status && <ToolStatusBadge status={status} />}
        {action === 'copy' && renderCopyButton()}
      </div>
    );
  }

  // File open style
  if (action === 'open-file') {
    const displayName = value.split('/').pop() || value;
    return (
      <div className={rowClassName}>
        <FileText className="h-3 w-3 flex-shrink-0 opacity-70" />
        <span className="flex-shrink-0 font-medium text-foreground/70">{nameLabel}</span>
        <button
          onClick={handleAction}
          className="min-w-0 truncate text-left text-primary/90 transition-colors hover:text-primary hover:underline"
          title={value}
        >
          {summarizeToolText(displayName)}
        </button>
        {status && <ToolStatusBadge status={status} className="ml-auto" />}
      </div>
    );
  }

  // Search / jump-to-results style
  if (action === 'jump-to-results') {
    return (
      <div className={rowClassName} title={value}>
        <Search className="h-3 w-3 flex-shrink-0 opacity-70" />
        <span className="flex-shrink-0 font-medium text-foreground/70">{nameLabel}</span>
        <span className={`min-w-0 flex-1 truncate ${colorScheme.primary === 'text-foreground' ? '' : colorScheme.primary ?? ''}`}>
          {summary}
        </span>
        {secondary && (
          <span className="flex-shrink-0 truncate font-sans italic opacity-70">{secondary}</span>
        )}
        {status && <ToolStatusBadge status={status} />}
        {toolResult && (
          <a
            href={`#tool-result-${toolId}`}
            className="flex flex-shrink-0 items-center text-primary/80 transition-colors hover:text-primary"
          >
            <ChevronDown className="h-3 w-3" />
          </a>
        )}
      </div>
    );
  }

  // Default one-line style
  return (
    <div className={rowClassName} title={value}>
      {icon && icon !== 'terminal' ? (
        <span className="flex-shrink-0 opacity-70">{icon}</span>
      ) : (
        <Wrench className="h-3 w-3 flex-shrink-0 opacity-70" />
      )}
      {nameLabel && <span className="flex-shrink-0 font-medium text-foreground/70">{nameLabel}</span>}
      <span className="min-w-0 flex-1 truncate">
        {summary}
      </span>
      {secondary && (
        <span className="flex-shrink-0 truncate font-sans italic opacity-70">{secondary}</span>
      )}
      {status && <ToolStatusBadge status={status} />}
      {action === 'copy' && renderCopyButton()}
    </div>
  );
};

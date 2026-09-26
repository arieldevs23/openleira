import React, { useMemo } from 'react';

import type { DiffLine } from '@/shared/types';

type ToolDiffViewerProps = {
  oldContent: string;
  newContent: string;
  filePath: string;
  createDiff: (oldStr: string, newStr: string) => DiffLine[];
  onFileClick?: () => void;
  badge?: string;
  badgeColor?: 'gray' | 'green';
};

/**
 * Compact diff viewer — VS Code-style.
 *
 * Rendered by chat's ToolRenderer for edit/write tools so a turn's file changes
 * are reviewable inline.
 */
export const ToolDiffViewer: React.FC<ToolDiffViewerProps> = ({
  oldContent,
  newContent,
  filePath,
  createDiff,
  onFileClick,
  badge = 'Diff',
  badgeColor = 'gray'
}) => {
  const badgeClasses = badgeColor === 'green'
    ? 'bg-ok/10 text-ok'
    : 'bg-muted text-muted-foreground';

  const diffLines = useMemo(
    () => {
      if (oldContent === undefined || newContent === undefined) {
        return [];
      }
      return createDiff(oldContent, newContent)
    },
    [createDiff, oldContent, newContent]
  );

  return (
    <div className="overflow-hidden rounded border border-border/60">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/80 px-2.5 py-1">
        {onFileClick ? (
          <button
            onClick={onFileClick}
            className="cursor-pointer truncate font-mono text-[11px] text-primary transition-colors hover:text-primary"
          >
            {filePath}
          </button>
        ) : (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {filePath}
          </span>
        )}
        <span className={`rounded px-1.5 py-px text-[10px] font-medium ${badgeClasses} ml-2 flex-shrink-0`}>
          {badge}
        </span>
      </div>

      {/* Diff lines */}
      <div className="font-mono text-[11px] leading-[18px]">
        {diffLines.map((diffLine, i) => (
          <div key={i} className="flex">
            <span
              className={`w-6 flex-shrink-0 select-none text-center ${
                diffLine.type === 'removed'
                  ? 'bg-err/10 text-err'
                  : 'bg-ok/10 text-ok'
              }`}
            >
              {diffLine.type === 'removed' ? '-' : '+'}
            </span>
            <span
              className={`flex-1 whitespace-pre-wrap px-2 ${
                diffLine.type === 'removed'
                  ? 'bg-err/10 text-err'
                  : 'bg-ok/10 text-ok'
              }`}
            >
              {diffLine.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

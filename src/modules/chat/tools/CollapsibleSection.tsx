import React from 'react';

import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/shared/ui';
import { cn } from '@/shared/utils';
import { useIsExportingTranscript } from '@/modules/chat/context/TranscriptRenderContext';
import { summarizeToolText } from '@/modules/chat/utils/chatFormatting';

type CollapsibleSectionProps = {
  title: string;
  toolName?: string;
  open?: boolean;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  onTitleClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

/**
 * Reusable collapsible section with consistent styling.
 *
 * Used by chat's CollapsibleDisplay so every expandable tool block shares one
 * header, chevron and border treatment.
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  toolName,
  open = false,
  action,
  badge,
  onTitleClick,
  children,
  className = '',
}) => {
  // A document has no chevron to click, so a section that stays collapsed in
  // an export is simply content the reader can never reach.
  const isExporting = useIsExportingTranscript();

  return (
    <Collapsible defaultOpen={open || isExporting} className={cn('group/section', className)}>
      {/* When there's a clickable title (Edit/Write), only the chevron toggles collapse */}
      {onTitleClick ? (
        <div className="flex h-7 cursor-default select-none items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] leading-none text-muted-foreground transition-colors duration-150 hover:bg-muted/60 group-data-[state=open]/section:sticky group-data-[state=open]/section:top-0 group-data-[state=open]/section:z-10 group-data-[state=open]/section:-mx-1 group-data-[state=open]/section:bg-background group-data-[state=open]/section:px-1">
          <CollapsibleTrigger className="flex flex-shrink-0 items-center p-0.5 text-muted-foreground hover:text-foreground">
            <svg
              className="h-3 w-3 transition-transform duration-150 group-data-[state=open]/section:rotate-90"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </CollapsibleTrigger>
          {toolName && (
            <span className="flex-shrink-0 font-medium text-foreground/70">{toolName}</span>
          )}
          <button
            onClick={onTitleClick}
            className="flex-1 truncate text-left text-primary/90 transition-colors hover:text-primary hover:underline"
            title={title}
          >
            {summarizeToolText(title)}
          </button>
          {badge && <span className="ml-auto flex-shrink-0">{badge}</span>}
          {action && <span className="ml-1 flex-shrink-0">{action}</span>}
        </div>
      ) : (
        <CollapsibleTrigger className="flex h-7 w-full select-none items-center gap-1.5 rounded-md px-1.5 font-mono text-[11px] leading-none text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground group-data-[state=open]/section:sticky group-data-[state=open]/section:top-0 group-data-[state=open]/section:z-10 group-data-[state=open]/section:-mx-1 group-data-[state=open]/section:bg-background group-data-[state=open]/section:px-1">
          <svg
            className="h-3 w-3 flex-shrink-0 transition-transform duration-150 group-data-[state=open]/section:rotate-90"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {toolName && (
            <span className="flex-shrink-0 font-medium text-foreground/70">{toolName}</span>
          )}
          <span className="flex-1 truncate text-left" title={title}>{summarizeToolText(title)}</span>
          {badge && <span className="ml-auto flex-shrink-0">{badge}</span>}
          {action && <span className="ml-1 flex-shrink-0">{action}</span>}
        </CollapsibleTrigger>
      )}

      <CollapsibleContent>
        <div className="mb-1 mt-0.5 pl-[1.1rem]">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

import * as React from 'react';

import { cn } from '@/shared/utils';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/** The application-wide text input, used by the chat, file-tree, mcp, project-creation-wizard, settings, sidebar and skills modules. */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-muted px-3 py-1 text-[13px] text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';


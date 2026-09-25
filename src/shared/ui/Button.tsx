import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/shared/utils';

// Keep visual variants centralized so all button usages stay consistent.
// Variants follow DESIGN.md §7: primary is the silver accent with --on-accent
// text at weight 600; secondary/outline are transparent with a 1px border;
// ghost is muted text with an --accent-dim hover; destructive is --err text
// and border (a solid red fill is reserved for delete confirmations in a
// modal, which pass their own classes). Focus uses the global 2px accent ring.
export const buttonVariants = cva(
  'inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
        destructive:
          'border border-err bg-transparent text-err hover:bg-err/10 active:bg-err/20',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-accent active:bg-accent',
        secondary: 'border border-border bg-transparent text-foreground hover:bg-accent active:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent',
        link: 'text-foreground underline underline-offset-4 hover:text-foreground-dim',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-lg px-3 text-sm',
        lg: 'h-11 rounded-lg px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

/** The application-wide button, used by nearly every feature module and by the shared ActionMenu, Confirmation and PromptInput primitives. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  }
);

Button.displayName = 'Button';


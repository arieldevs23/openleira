import { CalendarCheck, ClipboardList, Code2, GraduationCap, Headset, Languages, LineChart, Megaphone, Scale, Search, ShoppingBag, SlidersHorizontal, UserRound } from 'lucide-react';

import type { OfficeWorkspaceKind } from '@/shared/types';
import { cn } from '@/shared/utils';

const ICON_BY_KIND = {
  coding: Code2,
  content: Megaphone,
  finance: LineChart,
  admin: ClipboardList,
  research: Search,
  education: GraduationCap,
  support: Headset,
  hr: UserRound,
  legal: Scale,
  ecommerce: ShoppingBag,
  translation: Languages,
  project: CalendarCheck,
  custom: SlidersHorizontal,
} as const;

/**
 * The icon of a workspace kind. Used by the add-workspace dialog's kind
 * picker and the workspace sidebar, so a workspace's kind reads the same in both.
 */
export default function WorkspaceKindIcon({ kind, className }: { kind: OfficeWorkspaceKind; className?: string }) {
  const Icon = ICON_BY_KIND[kind] ?? Code2;
  return <Icon className={cn('h-4 w-4 shrink-0', className)} aria-hidden="true" />;
}

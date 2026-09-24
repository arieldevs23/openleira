import { useTranslation } from 'react-i18next';
import { ClipboardCopy, FileCode2 } from 'lucide-react';

import { ContextMenu, useContextMenu } from '@/shared/ui';
import { copyTextToClipboard } from '@/shared/utils';

// Converts markdown into readable plain text for "Copy text".
const convertMarkdownToPlainText = (markdown: string): string => {
  let plainText = markdown.replace(/\r\n/g, '\n');
  const codeBlocks: string[] = [];
  plainText = plainText.replace(/```[\w-]*\n([\s\S]*?)```/g, (_match, code: string) => {
    const placeholder = `@@CODEBLOCK${codeBlocks.length}@@`;
    codeBlocks.push(code.replace(/\n$/, ''));
    return placeholder;
  });
  plainText = plainText.replace(/`([^`]+)`/g, '$1');
  plainText = plainText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1');
  plainText = plainText.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  plainText = plainText.replace(/^>\s?/gm, '');
  plainText = plainText.replace(/^#{1,6}\s+/gm, '');
  plainText = plainText.replace(/^[-*+]\s+/gm, '');
  plainText = plainText.replace(/^\d+\.\s+/gm, '');
  plainText = plainText.replace(/(\*\*|__)(.*?)\1/g, '$2');
  plainText = plainText.replace(/(\*|_)(.*?)\1/g, '$2');
  plainText = plainText.replace(/~~(.*?)~~/g, '$1');
  plainText = plainText.replace(/<\/?[^>]+(>|$)/g, '');
  plainText = plainText.replace(/\n{3,}/g, '\n\n');
  plainText = plainText.replace(/@@CODEBLOCK(\d+)@@/g, (_match, index: string) => codeBlocks[Number(index)] ?? '');
  return plainText.trim();
};

/**
 * Used by chat's MessageComponent to attach a copy menu to a message bubble:
 * right-click on desktop, or a ~500ms long-press on touch. Spread
 * `bubbleHandlers` onto the bubble and render `menu` anywhere inside it.
 *
 * Backs off when a text selection already exists inside the bubble, so the
 * native menu keeps working for partial copies.
 */
export function useMessageContextMenu(content: string, enabled = true) {
  const { t } = useTranslation('chat');
  const { triggerHandlers, position, close } = useContextMenu({ enabled, yieldToSelection: true });

  const copyAs = (format: 'text' | 'markdown') => {
    void copyTextToClipboard(format === 'markdown' ? content : convertMarkdownToPlainText(content));
  };

  const menu = position ? (
    <ContextMenu
      position={position}
      onClose={close}
      ariaLabel={t('copyMessage.menuLabel')}
      items={[
        { key: 'text', label: t('copyMessage.copyText'), icon: ClipboardCopy, onSelect: () => copyAs('text') },
        { key: 'markdown', label: t('copyMessage.copyMarkdown'), icon: FileCode2, onSelect: () => copyAs('markdown') },
      ]}
    />
  ) : null;

  return { bubbleHandlers: triggerHandlers, menu };
}

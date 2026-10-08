import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import '@/modules/i18n';
import ComposerModelMenu from '@/modules/chat/composer/ComposerModelMenu';
import type { ProviderModelOption } from '@/shared/types';

const MODELS: ProviderModelOption[] = [
  { value: 'default', label: 'Default (recommended)' },
  { value: 'best', label: 'Best available' },
  { value: 'fable', label: 'Fable 5.1' },
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'sonnet[1m]', label: 'Sonnet (1M context)' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
  { value: 'opusplan', label: 'Opus Plan' },
];

const renderMenu = (overrides: Partial<React.ComponentProps<typeof ComposerModelMenu>> = {}) => {
  const onSelectModel = vi.fn();
  const onSelectEffort = vi.fn();
  render(
    <ComposerModelMenu
      model="sonnet"
      modelOptions={MODELS}
      onSelectModel={onSelectModel}
      modelsLoading={false}
      effort="medium"
      effortOptions={[{ value: 'low' }, { value: 'medium' }, { value: 'high' }, { value: 'ultracode', description: 'Highest effort plus workflows.' }]}
      onSelectEffort={onSelectEffort}
      {...overrides}
    />,
  );
  return { onSelectModel, onSelectEffort };
};

describe('composer model menu', () => {
  it('keeps one entry per model family in the short list and the rest under "more models"', () => {
    renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /pilih model|select model/i }));

    const shortList = screen.getAllByRole('menuitemradio').map((item) => item.textContent);
    expect(shortList).toEqual(['Fable 5.11', 'Sonnet', 'Opus3', 'Haiku4']);

    fireEvent.click(screen.getByRole('menuitem', { name: /model lainnya|more models/i }));
    const more = screen.getAllByRole('menuitemradio').map((item) => item.textContent).slice(4);
    expect(more).toEqual(['Default (recommended)', 'Best available', 'Sonnet (1M context)', 'Opus Plan']);
  });

  it('picks a model from the short list with its number key', () => {
    const { onSelectModel } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: /pilih model|select model/i }));
    fireEvent.keyDown(window, { key: '3' });
    expect(onSelectModel).toHaveBeenCalledWith('opus');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the effort as a plain word and lists the levels by name', () => {
    const { onSelectEffort } = renderMenu();
    const effortButton = screen.getByRole('button', { name: /reasoning/i });
    expect(effortButton.textContent).toMatch(/Sedang|Medium/);

    fireEvent.click(effortButton);
    const levels = screen.getAllByRole('menuitemradio').map((item) => item.textContent);
    expect(levels[0]).toMatch(/Otomatis|Auto/);
    expect(levels.at(-1)).toMatch(/^Ultracode/);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^(Tinggi|High)$/ }));
    expect(onSelectEffort).toHaveBeenCalledWith('high');
  });
});

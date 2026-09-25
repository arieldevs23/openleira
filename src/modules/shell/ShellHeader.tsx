import { RotateCcw, Shield, ShieldOff, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { StatusMark } from '@/shared/ui';

type ShellHeaderProps = {
  isConnected: boolean;
  isInitialized: boolean;
  isRestarting: boolean;
  hasSession: boolean;
  sessionDisplayNameShort: string | null;
  onDisconnect: () => void;
  onRestart: () => void;
  statusNewSessionText: string;
  statusInitializingText: string;
  statusRestartingText: string;
  disconnectLabel: string;
  disconnectTitle: string;
  restartLabel: string;
  restartTitle: string;
  disableRestart: boolean;
  showBypassToggle: boolean;
  bypassEnabled: boolean;
  onToggleBypass: () => void;
  bypassLabel: string;
  bypassTitle: string;
};

/** Rendered by Shell above the terminal to show connection status and the restart/disconnect actions. */
export default function ShellHeader({
  isConnected,
  isInitialized,
  isRestarting,
  hasSession,
  sessionDisplayNameShort,
  onDisconnect,
  onRestart,
  statusNewSessionText,
  statusInitializingText,
  statusRestartingText,
  disconnectLabel,
  disconnectTitle,
  restartLabel,
  restartTitle,
  disableRestart,
  showBypassToggle,
  bypassEnabled,
  onToggleBypass,
  bypassLabel,
  bypassTitle,
}: ShellHeaderProps) {
  const { t } = useTranslation('settings');
  return (
    <div className="flex-shrink-0 border-b border-border bg-surface-3 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <StatusMark kind={isConnected ? 'done' : 'idle'} label={isConnected ? t('mcp.connected') : t('mcp.disconnected')} />

          {hasSession && sessionDisplayNameShort && (
            <span className="text-xs text-primary">({sessionDisplayNameShort}...)</span>
          )}

          {!hasSession && <span className="text-xs text-muted-foreground">{statusNewSessionText}</span>}

          {!isInitialized && <span className="text-xs text-warn">{statusInitializingText}</span>}

          {isRestarting && <span className="text-xs text-primary">{statusRestartingText}</span>}
        </div>

        <div className="flex items-center gap-2">
          {showBypassToggle && (
            <button
              type="button"
              onClick={onToggleBypass}
              aria-pressed={bypassEnabled}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background ${
                bypassEnabled
                  ? 'border-warn bg-warn text-on-status hover:bg-warn/90 focus:ring-warn/70'
                  : 'border-border-strong/80 bg-surface-3/70 text-foreground hover:border-warn/70 hover:bg-warn/10 hover:text-foreground focus:ring-warn/70'
              }`}
              title={bypassTitle}
            >
              {bypassEnabled ? (
                <ShieldOff className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{bypassLabel}</span>
            </button>
          )}

          {isConnected && (
            <button
              type="button"
              onClick={onDisconnect}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-err px-3 text-xs font-medium text-on-status transition-colors hover:bg-err/90 focus:outline-none focus:ring-2 focus:ring-err/70 focus:ring-offset-2 focus:ring-offset-background"
              title={disconnectTitle}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{disconnectLabel}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRestart}
            disabled={disableRestart}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong/80 bg-surface-3/70 px-3 text-xs font-medium text-foreground transition-colors hover:border-primary/70 hover:bg-primary/80 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/70 focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:border-transparent disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60"
            title={restartTitle}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRestarting ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{restartLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

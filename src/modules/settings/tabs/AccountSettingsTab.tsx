import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/modules/auth';
import { api } from '@/shared/api';
import { Button, Input } from '@/shared/ui';
import { getApiErrorCode } from '@/shared/utils';
import SettingsCard from '@/modules/settings/SettingsCard';
import SettingsSection from '@/modules/settings/SettingsSection';

const MIN_PASSWORD_LENGTH = 8;

// Server error codes from POST /api/auth/change-password mapped to settings i18n keys.
const CHANGE_PASSWORD_ERROR_MESSAGES: Record<string, string> = {
  AUTH_CURRENT_PASSWORD_INVALID: 'account.password.errors.currentInvalid',
  AUTH_PASSWORD_TOO_SHORT: 'account.password.errors.tooShort',
  AUTH_CREDENTIALS_REQUIRED: 'account.password.errors.requiredFields',
  AUTH_RATE_LIMITED: 'account.password.errors.rateLimited',
};

type PasswordFields = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const EMPTY_FIELDS: PasswordFields = { currentPassword: '', newPassword: '', confirmPassword: '' };

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  autoComplete: 'current-password' | 'new-password';
  isDisabled: boolean;
  onChange: (value: string) => void;
};

function PasswordField({ id, label, value, autoComplete, isDisabled, onChange }: PasswordFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={isDisabled}
        className="w-full"
      />
    </div>
  );
}

function validatePasswordFields(fields: PasswordFields): string | null {
  if (!fields.currentPassword || !fields.newPassword || !fields.confirmPassword) {
    return 'account.password.errors.requiredFields';
  }
  if (fields.newPassword.length < MIN_PASSWORD_LENGTH) {
    return 'account.password.errors.tooShort';
  }
  if (fields.newPassword !== fields.confirmPassword) {
    return 'account.password.errors.mismatch';
  }
  return null;
}

/** Rendered by Settings for the "account" tab: shows the signed-in user and changes their password. */
export default function AccountSettingsTab() {
  const { t } = useTranslation('settings');
  const { user } = useAuth();

  // Controlled values of the three password inputs; cleared after a successful change.
  const [fields, setFields] = useState<PasswordFields>(EMPTY_FIELDS);
  // Disables the form while the request is in flight so it cannot be double-submitted.
  const [isSaving, setIsSaving] = useState(false);
  // Outcome of the last submit: an i18n key for the error, or 'success'; null before any submit.
  const [result, setResult] = useState<{ kind: 'success' } | { kind: 'error'; messageKey: string } | null>(null);

  const updateField = (field: keyof PasswordFields, value: string) => {
    setFields((previous) => ({ ...previous, [field]: value }));
    setResult(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrorKey = validatePasswordFields(fields);
    if (validationErrorKey) {
      setResult({ kind: 'error', messageKey: validationErrorKey });
      return;
    }

    setIsSaving(true);
    try {
      const response = await api.auth.changePassword(fields.currentPassword, fields.newPassword);
      if (response.ok) {
        setFields(EMPTY_FIELDS);
        setResult({ kind: 'success' });
      } else {
        const payload: unknown = await response.json().catch(() => null);
        const messageKey = CHANGE_PASSWORD_ERROR_MESSAGES[getApiErrorCode(payload) ?? '']
          ?? 'account.password.errors.failed';
        setResult({ kind: 'error', messageKey });
      }
    } catch {
      setResult({ kind: 'error', messageKey: 'account.password.errors.failed' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsSection
        title={t('account.title')}
        description={user ? t('account.description', { username: user.username }) : undefined}
      >
        <SettingsCard className="p-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{t('account.password.title')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('account.password.description')}</p>
            </div>

            {/* Hidden username lets password managers attach the new password to the right account. */}
            <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />

            <PasswordField
              id="settings-current-password"
              label={t('account.password.current')}
              value={fields.currentPassword}
              autoComplete="current-password"
              isDisabled={isSaving}
              onChange={(value) => updateField('currentPassword', value)}
            />
            <PasswordField
              id="settings-new-password"
              label={t('account.password.new')}
              value={fields.newPassword}
              autoComplete="new-password"
              isDisabled={isSaving}
              onChange={(value) => updateField('newPassword', value)}
            />
            <PasswordField
              id="settings-confirm-password"
              label={t('account.password.confirm')}
              value={fields.confirmPassword}
              autoComplete="new-password"
              isDisabled={isSaving}
              onChange={(value) => updateField('confirmPassword', value)}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? t('account.password.saving') : t('account.password.save')}
              </Button>

              {result?.kind === 'success' && (
                <p role="status" className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Check className="h-4 w-4" />
                  {t('account.password.success')}
                </p>
              )}
              {result?.kind === 'error' && (
                <p role="alert" className="text-sm text-destructive">
                  {t(result.messageKey)}
                </p>
              )}
            </div>
          </form>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}

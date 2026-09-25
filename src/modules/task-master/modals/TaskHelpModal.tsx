import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type TaskHelpModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreatePrd: () => void;
};

type HelpStep = {
  index: number;
  title: string;
  description: string;
  accent: string;
};

/** Rendered by TaskBoard to walk through the PRD-to-tasks workflow. */
export default function TaskHelpModal({ isOpen, onClose, onCreatePrd }: TaskHelpModalProps) {
  const { t } = useTranslation('tasks');

  if (!isOpen) {
    return null;
  }

  const steps: HelpStep[] = [
    {
      index: 1,
      title: t('gettingStarted.steps.createPRD.title'),
      description: t('gettingStarted.steps.createPRD.description'),
      accent: 'border-primary/30 bg-primary/10',
    },
    {
      index: 2,
      title: t('gettingStarted.steps.generateTasks.title'),
      description: t('gettingStarted.steps.generateTasks.description'),
      accent: 'border-ok/30 bg-ok/10',
    },
    {
      index: 3,
      title: t('gettingStarted.steps.analyzeTasks.title'),
      description: t('gettingStarted.steps.analyzeTasks.description'),
      accent: 'border-warn/30 bg-warn/10',
    },
    {
      index: 4,
      title: t('gettingStarted.steps.startBuilding.title'),
      description: t('gettingStarted.steps.startBuilding.description'),
      accent: 'border-primary/30 bg-primary/10',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{t('helpGuide.title')}</h2>
              <p className="text-sm text-muted-foreground">{t('helpGuide.subtitle')}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-muted-foreground"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-120px)] space-y-4 overflow-y-auto p-6">
          {steps.map((step) => (
            <div key={step.index} className={`rounded-lg border p-4 ${step.accent}`}>
              <div className="flex gap-4">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {step.index}
                </div>
                <div>
                  <h4 className="mb-2 font-medium text-foreground">{step.title}</h4>
                  <p className="text-sm text-foreground">{step.description}</p>

                  {step.index === 1 && (
                    <button
                      onClick={() => {
                        onCreatePrd();
                        onClose();
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-sm text-primary hover:bg-primary/20"
                    >
                      <FileText className="h-4 w-4" />
                      {t('buttons.addPRD')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-border bg-muted p-4">
            <h4 className="mb-2 font-medium text-foreground">{t('helpGuide.proTips.title')}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>{t('helpGuide.proTips.search')}</li>
              <li>{t('helpGuide.proTips.views')}</li>
              <li>{t('helpGuide.proTips.filters')}</li>
              <li>{t('helpGuide.proTips.details')}</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
}

import { providerRuntimeService } from '@/modules/providers/index.js';
import { createOfficeRouter } from '@/modules/office/office.routes.js';
import { createOfficeAgentRunner } from '@/modules/office/services/office-agent-runner.service.js';
import { createOfficeOrchestrator } from '@/modules/office/services/office-orchestrator.service.js';
import { officeService } from '@/modules/office/services/office.service.js';

/**
 * Composition root of the Office (Kantor AI) module: one orchestrator for the
 * whole server, running its agents through the shared provider runtime.
 */
const orchestrator = createOfficeOrchestrator({
  runner: createOfficeAgentRunner({ runtime: providerRuntimeService }),
});

/** Used by the server entrypoint to mount the Kantor AI API at `/api/office`. */
export const officeRoutes = createOfficeRouter({ office: officeService, orchestrator });

/**
 * Used by the server entrypoint once the database is ready. Cases that were
 * running when the server stopped have no live sessions any more, so they are
 * parked as `waiting_user` (interrupted) for the user to resume.
 */
export function initializeOffice(): void {
  const parked = orchestrator.recoverInterruptedCases();
  if (parked > 0) {
    console.log(`[Office] Parked ${parked} interrupted case(s) until the user resumes them`);
  }
}

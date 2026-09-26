import { useEffect, useState } from 'react';

import { api } from '@/shared/api';
import type { OfficeInstalledSkill } from '@/shared/types';

/**
 * Skills installed for Claude in `~/.claude/skills` and in the project's
 * `.claude/skills`, read through the providers module's existing skills API.
 */
export function useInstalledSkills(projectPath: string) {
  // Installed skills, de-duplicated by name (a project skill shadows a user one).
  const [skills, setSkills] = useState<OfficeInstalledSkill[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.providers.skills('claude', { workspacePath: projectPath });
        const body = await response.json() as {
          data?: { skills?: Array<{ name?: string; description?: string; scope?: string }> };
        };
        const byName = new Map<string, OfficeInstalledSkill>();
        for (const skill of body.data?.skills ?? []) {
          if (skill.name) {
            byName.set(skill.name, { name: skill.name, description: skill.description ?? '', scope: skill.scope ?? 'user' });
          }
        }
        if (!cancelled) {
          setSkills([...byName.values()].sort((left, right) => left.name.localeCompare(right.name)));
        }
      } catch (error) {
        console.error('[Office] Failed to load skills', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return skills;
}

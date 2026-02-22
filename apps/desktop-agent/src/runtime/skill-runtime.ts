import { watch } from 'node:fs';
import { loadSkillManifest } from './skill-manifest-loader.js';
import { createRunner } from './skill-runners.js';
import type { SkillExecutionResult, SkillManifest } from './skill-types.js';

export interface SkillRuntime {
  executeByCommandType: (input: {
    commandType: string;
    payload: Record<string, unknown>;
  }) => Promise<{ skill: SkillManifest; result: SkillExecutionResult }>;
  close: () => void;
}

export function createSkillRuntime(manifestPath: string): SkillRuntime {
  let skillMap = new Map<string, SkillManifest>();

  const load = (): void => {
    const manifest = loadSkillManifest(manifestPath);
    skillMap = new Map(manifest.skills.map((skill) => [skill.commandType, skill]));
  };

  load();

  const watcher = watch(manifestPath, () => {
    try {
      load();
    } catch {
      // keep previous valid manifest.
    }
  });

  return {
    executeByCommandType: async ({ commandType, payload }) => {
      const skill = skillMap.get(commandType);
      if (!skill) {
        return {
          skill: {
            name: 'missing_skill',
            commandType,
            runner: 'claude',
            command: 'echo',
            args: [`No skill found for ${commandType}`],
          },
          result: {
            status: 'failed',
            output: `No skill found for ${commandType}`,
            artifacts: [],
          },
        };
      }

      const runner = createRunner(skill.runner);
      const result = await runner.run({
        skillName: skill.name,
        command: skill.command,
        args: skill.args,
        payload,
      });

      return { skill, result };
    },
    close: () => {
      watcher.close();
    },
  };
}

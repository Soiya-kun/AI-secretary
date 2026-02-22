import { watch } from 'node:fs';
import { loadSkillManifest } from './skill-manifest-loader.js';
import { createRunner } from './skill-runners.js';
import type { SkillExecutionResult, SkillManifest } from './skill-types.js';
import { createWorkerOrchestrator } from './worker-orchestrator.js';

export interface SkillRuntime {
  executeByCommandType: (input: {
    commandType: string;
    payload: Record<string, unknown>;
  }) => Promise<{ skill: SkillManifest; result: SkillExecutionResult }>;
  close: () => void;
}

function createUnsupportedSkill(commandType: string): SkillManifest {
  return {
    name: 'unsupported_command',
    owner: 'system',
    commandType,
    runner: 'claude',
    command: 'echo',
    args: [`No skill found for ${commandType}`],
    timeoutSec: 1,
    retryPolicy: {
      maxAttempts: 1,
    },
  };
}

export function createSkillRuntime(manifestPath: string): SkillRuntime {
  let skillMap = new Map<string, SkillManifest>();
  const workerOrchestrator = createWorkerOrchestrator();

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
          skill: createUnsupportedSkill(commandType),
          result: {
            status: 'failed',
            exitCode: 1,
            stdout: '',
            stderr: `No skill found for ${commandType}`,
            output: `No skill found for ${commandType}`,
            artifacts: [],
          },
        };
      }

      const runner = createRunner(skill.runner);
      let result: SkillExecutionResult = {
        status: 'failed',
        exitCode: 1,
        stdout: '',
        stderr: 'skill execution was not started',
        output: 'skill execution was not started',
        artifacts: [],
      };

      for (let attempt = 1; attempt <= skill.retryPolicy.maxAttempts; attempt += 1) {
        const launchRequest = workerOrchestrator.createLaunchRequest({
          skill,
          payload,
        });
        result = await runner.run({
          skillName: launchRequest.skillName,
          command: launchRequest.command,
          args: launchRequest.args,
          timeoutSec: launchRequest.timeoutSec,
          payload: launchRequest.payload,
        });

        if (result.status === 'succeeded') {
          break;
        }
      }

      return { skill, result };
    },
    close: () => {
      watcher.close();
    },
  };
}

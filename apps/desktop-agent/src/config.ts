import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface AgentConfig {
  sqlitePath: string;
  appName: string;
  skillManifestPath: string;
  notesRootPath: string;
  startInTray: boolean;
}

const DEFAULT_CONFIG_PATH = './config/local.json';

export function loadAgentConfig(configPath = process.env.DESKTOP_CONFIG_PATH ?? DEFAULT_CONFIG_PATH): AgentConfig {
  const absolutePath = resolve(configPath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<AgentConfig>;

  if (!parsed.sqlitePath || !parsed.appName || !parsed.skillManifestPath) {
    throw new Error(
      `Invalid config: sqlitePath, appName and skillManifestPath are required (${absolutePath})`,
    );
  }

  return {
    sqlitePath: parsed.sqlitePath,
    appName: parsed.appName,
    skillManifestPath: parsed.skillManifestPath,
    notesRootPath: parsed.notesRootPath ?? './apps/desktop-agent/data',
    startInTray: parsed.startInTray ?? false,
  };
}

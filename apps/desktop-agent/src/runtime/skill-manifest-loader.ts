import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SkillManifest, SkillRunnerType } from './skill-types.js';

interface SkillManifestFile {
  skills: SkillManifest[];
}

const VALID_RUNNERS: SkillRunnerType[] = ['claude', 'codex', 'gemini'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requireString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid manifest: ${key} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid manifest: ${key} must be a string array`);
  }
  return value;
}

function requirePositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid manifest: ${key} must be a positive integer`);
  }

  return value;
}

function parseOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid manifest: ${key} must be a boolean`);
  }
  return value;
}

function parseRetryPolicy(skillRaw: Record<string, unknown>): { maxAttempts: number } {
  const retryPolicy = skillRaw.retryPolicy;
  if (!isRecord(retryPolicy)) {
    throw new Error('Invalid manifest: retryPolicy must be an object');
  }

  return {
    maxAttempts: requirePositiveInteger(retryPolicy, 'maxAttempts'),
  };
}

function parseSkillManifest(skillRaw: unknown): SkillManifest {
  if (!isRecord(skillRaw)) {
    throw new Error('Invalid manifest: each skill must be an object');
  }

  const runner = requireString(skillRaw, 'runner');
  if (!VALID_RUNNERS.includes(runner as SkillRunnerType)) {
    throw new Error(`Invalid manifest: runner must be one of ${VALID_RUNNERS.join(', ')}`);
  }

  return {
    name: requireString(skillRaw, 'name'),
    owner: requireString(skillRaw, 'owner'),
    commandType: requireString(skillRaw, 'commandType'),
    runner: runner as SkillRunnerType,
    command: requireString(skillRaw, 'command'),
    args: requireStringArray(skillRaw, 'args'),
    timeoutSec: requirePositiveInteger(skillRaw, 'timeoutSec'),
    openInNewWindow: parseOptionalBoolean(skillRaw, 'openInNewWindow'),
    retryPolicy: parseRetryPolicy(skillRaw),
  };
}

export function loadSkillManifest(manifestPath: string): SkillManifestFile {
  const absolutePath = resolve(manifestPath);
  const raw = readFileSync(absolutePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;

  if (!isRecord(parsed) || !Array.isArray(parsed.skills)) {
    throw new Error('Invalid manifest: skills array is required');
  }

  return {
    skills: parsed.skills.map((skill) => parseSkillManifest(skill)),
  };
}

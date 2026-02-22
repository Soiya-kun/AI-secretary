import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const NOTE_SECTION_TITLES = [
  '会議目的',
  '主要論点',
  '決定事項',
  'ToDo',
  '懸念/リスク',
  '保留事項',
  '追加メモ',
] as const;

export type NoteSectionTitle = (typeof NOTE_SECTION_TITLES)[number];

export interface NoteSectionInput {
  title: NoteSectionTitle;
  lines: string[];
}

export interface MeetingNoteInput {
  sections: NoteSectionInput[];
}

export interface NotesModule {
  extractRepoFromText: (input: string) => string | undefined;
  generateMarkdown: (input: MeetingNoteInput) => string;
  saveUnknownRepoNote: (input: { markdown: string; fileName: string }) => string;
  ensureDevtaskDirectory: (repo: string) => string;
  commitAndPushNote: (input: { repo: string; markdown: string; fileName: string }) => {
    repo: string;
    branch: string;
    commitHash: string;
    directory: string;
  };
}

function normalizeRepo(repo: string): string {
  const normalized = repo.trim().replace(/^repo:/, '');
  if (!/^[\w.-]+\/[\w.-]+$/.test(normalized)) {
    throw new Error(`Invalid repo format: ${repo}`);
  }

  return normalized;
}

function runGitCommand(args: string[], cwd: string): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args.join(' ')} failed`);
  }

  return result.stdout.trim();
}

export function createNotesModule(notesRootPath: string): NotesModule {
  const rootPath = resolve(notesRootPath);

  const extractRepoFromText = (input: string): string | undefined => {
    const matched = input.match(/repo:([\w.-]+\/[\w.-]+)/);
    return matched ? matched[1] : undefined;
  };

  const generateMarkdown = (input: MeetingNoteInput): string => {
    const sectionMap = new Map(input.sections.map((section) => [section.title, section.lines]));
    return NOTE_SECTION_TITLES.map((title) => {
      const lines = sectionMap.get(title) ?? ['未記入'];
      const body = lines.length > 0 ? lines.map((line) => `- ${line}`).join('\n') : '- 未記入';
      return `## ${title}\n${body}`;
    }).join('\n\n');
  };

  const saveUnknownRepoNote = (input: { markdown: string; fileName: string }): string => {
    const inboxDir = resolve(rootPath, 'notes/inbox-notes');
    mkdirSync(inboxDir, { recursive: true });

    const filePath = resolve(inboxDir, `${input.fileName}.md`);
    writeFileSync(filePath, input.markdown, 'utf-8');
    return filePath;
  };

  const ensureDevtaskDirectory = (repo: string): string => {
    const normalizedRepo = normalizeRepo(repo);
    const targetDir = resolve(rootPath, 'repos', normalizedRepo);
    mkdirSync(targetDir, { recursive: true });
    return targetDir;
  };

  const commitAndPushNote = (input: { repo: string; markdown: string; fileName: string }) => {
    const normalizedRepo = normalizeRepo(input.repo);
    const repoDir = ensureDevtaskDirectory(normalizedRepo);

    const notePath = resolve(repoDir, `${input.fileName}.md`);
    writeFileSync(notePath, input.markdown, 'utf-8');

    runGitCommand(['add', notePath], repoDir);

    const commitMessage = `docs: add meeting note ${input.fileName}`;
    runGitCommand(['commit', '-m', commitMessage], repoDir);

    const branch = runGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], repoDir);
    runGitCommand(['push', 'origin', branch], repoDir);
    const commitHash = runGitCommand(['rev-parse', 'HEAD'], repoDir);

    return {
      repo: normalizedRepo,
      branch,
      commitHash,
      directory: repoDir,
    };
  };

  return {
    extractRepoFromText,
    generateMarkdown,
    saveUnknownRepoNote,
    ensureDevtaskDirectory,
    commitAndPushNote,
  };
}

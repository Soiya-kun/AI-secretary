import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createNotesModule } from './notes-module.js';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();
}

test('generateMarkdown creates fixed 7 sections and fills missing sections with 未記入', () => {
  const notesModule = createNotesModule('/tmp/notes-module-test');
  const markdown = notesModule.generateMarkdown({
    sections: [
      { title: '会議目的', lines: ['新機能の優先順位を確定する'] },
      { title: '決定事項', lines: ['来週までにプロトタイプを提出'] },
    ],
  });

  assert.match(markdown, /## 会議目的\n- 新機能の優先順位を確定する/);
  assert.match(markdown, /## 決定事項\n- 来週までにプロトタイプを提出/);
  assert.match(markdown, /## 主要論点\n- 未記入/);
  assert.match(markdown, /## 追加メモ\n- 未記入/);
});

test('saveUnknownRepoNote writes markdown under notes/inbox-notes', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'ai-secretary-notes-'));
  try {
    const notesModule = createNotesModule(tempRoot);
    const path = notesModule.saveUnknownRepoNote({
      markdown: '## 会議目的\n- テスト',
      fileName: '2026-01-15-standup',
    });

    assert.match(path, /notes\/inbox-notes\/2026-01-15-standup\.md$/);
    assert.equal(readFileSync(path, 'utf-8'), '## 会議目的\n- テスト');
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('syncNoteToGit commits and pushes for direct mode', () => {
  const tempRoot = mkdtempSync(resolve(tmpdir(), 'ai-secretary-direct-'));
  const remoteDir = mkdtempSync(resolve(tmpdir(), 'ai-secretary-remote-'));

  try {
    const workingRepo = resolve(tempRoot, 'repos', 'owner/repo');
    const notesModule = createNotesModule(tempRoot);

    notesModule.ensureDevtaskDirectory('owner/repo');
    git(workingRepo, 'init');
    git(workingRepo, 'config', 'user.email', 'bot@example.com');
    git(workingRepo, 'config', 'user.name', 'ai-secretary-bot');
    git(workingRepo, 'checkout', '-b', 'main');

    const bareRemote = resolve(remoteDir, 'repo.git');
    git(remoteDir, 'init', '--bare', bareRemote);
    git(workingRepo, 'remote', 'add', 'origin', bareRemote);

    const result = notesModule.syncNoteToGit({
      repo: 'owner/repo',
      markdown: '## 会議目的\n- API仕様確認',
      fileName: '2026-01-15-standup',
      mode: 'direct',
    });

    assert.equal(result.status, 'succeeded');
    assert.equal(result.branch, 'main');
    assert.ok(result.commitHash);
    const pushedHead = git(remoteDir, '--git-dir', bareRemote, 'rev-parse', 'refs/heads/main');
    assert.equal(pushedHead, result.commitHash);
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(remoteDir, { recursive: true, force: true });
  }
});

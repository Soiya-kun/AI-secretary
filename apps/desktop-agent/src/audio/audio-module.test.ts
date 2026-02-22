import assert from 'node:assert/strict';
import { mkdtempSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAudioModule, readRawAudio, type SttClient, type TtsClient, type VirtualMicOutput } from './audio-module.js';

test('ingestFrame splits chunks and sends each chunk to STT', async () => {
  const rawDir = mkdtempSync(join(tmpdir(), 'ai-secretary-audio-'));
  const transcribed: number[] = [];

  const sttClient: SttClient = {
    transcribe: async ({ pcm16le }) => {
      transcribed.push(pcm16le.length);
      return { text: `len:${pcm16le.length}` };
    },
  };

  const module = createAudioModule({
    sttClient,
    ttsClient: { synthesize: async () => ({ pcm16le: new Uint8Array([1, 2]) }) },
    virtualMicOutput: { play: async () => undefined },
    rawAudioDir: rawDir,
    chunkBytes: 8,
  });

  const result = await module.ingestFrame({
    source: 'meeting',
    pcm16le: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
    timestampMs: 10,
  });

  assert.equal(result.chunks.length, 1);
  assert.deepEqual(transcribed, [8]);
  assert.deepEqual(result.transcripts, ['len:8']);
});

test('maybeRespond only responds after wake word and exits conversation after 20 seconds of silence', async () => {
  const rawDir = mkdtempSync(join(tmpdir(), 'ai-secretary-audio-'));
  let now = 1000;
  const spoken: string[] = [];

  const ttsClient: TtsClient = {
    synthesize: async ({ text }) => ({ pcm16le: new TextEncoder().encode(text) }),
  };
  const virtualMicOutput: VirtualMicOutput = {
    play: async ({ pcm16le }) => {
      spoken.push(new TextDecoder().decode(pcm16le));
    },
  };

  const module = createAudioModule({
    sttClient: { transcribe: async () => ({ text: '' }) },
    ttsClient,
    virtualMicOutput,
    rawAudioDir: rawDir,
    nowMs: () => now,
  });

  const first = await module.maybeRespond({ text: 'こんにちは' });
  assert.equal(first.responded, false);
  assert.equal(module.getConversationMode(), 'idle');

  const wake = await module.maybeRespond({ text: '秘書 今日の予定は？' });
  assert.equal(wake.responded, true);
  assert.equal(module.getConversationMode(), 'conversation');

  const continued = await module.maybeRespond({ text: '続けて教えて' });
  assert.equal(continued.responded, true);

  now += 20_001;
  assert.equal(module.getConversationMode(), 'idle');

  const afterTimeout = await module.maybeRespond({ text: '続けて教えて' });
  assert.equal(afterTimeout.responded, false);
  assert.deepEqual(spoken, ['秘書 今日の予定は？', '続けて教えて']);
});

test('saveRawAudio and cleanupExpiredRawAudio delete files older than 5 minutes', () => {
  const rawDir = mkdtempSync(join(tmpdir(), 'ai-secretary-audio-'));
  const now = Date.UTC(2026, 0, 1, 0, 10, 0);

  const module = createAudioModule({
    sttClient: { transcribe: async () => ({ text: '' }) },
    ttsClient: { synthesize: async () => ({ pcm16le: new Uint8Array() }) },
    virtualMicOutput: { play: async () => undefined },
    rawAudioDir: rawDir,
    nowMs: () => now,
  });

  const oldPath = module.saveRawAudio({ id: 'old-audio', pcm16le: new Uint8Array([1]) });
  const freshPath = module.saveRawAudio({ id: 'fresh-audio', pcm16le: new Uint8Array([2, 3]) });

  utimesSync(oldPath, new Date(now - 301_000), new Date(now - 301_000));
  utimesSync(freshPath, new Date(now - 299_000), new Date(now - 299_000));

  const cleanup = module.cleanupExpiredRawAudio();

  assert.deepEqual(cleanup.deleted, [oldPath]);
  assert.deepEqual([...readRawAudio(freshPath)], [2, 3]);
});

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type AudioSource = 'meeting' | 'microphone';

export interface AudioFrame {
  source: AudioSource;
  pcm16le: Uint8Array;
  timestampMs: number;
}

export interface AudioChunk {
  source: AudioSource;
  pcm16le: Uint8Array;
  startMs: number;
  endMs: number;
}

export interface SttClient {
  transcribe: (input: { pcm16le: Uint8Array; sampleRateHz: number }) => Promise<{ text: string }>;
}

export interface TtsClient {
  synthesize: (input: { text: string; sampleRateHz: number }) => Promise<{ pcm16le: Uint8Array }>;
}

export interface VirtualMicOutput {
  play: (input: { pcm16le: Uint8Array; sampleRateHz: number }) => Promise<void>;
}

export interface AudioModule {
  ingestFrame: (frame: AudioFrame) => Promise<{ chunks: AudioChunk[]; transcripts: string[] }>;
  maybeRespond: (input: { text: string }) => Promise<{ responded: boolean; mode: 'idle' | 'conversation' }>;
  saveRawAudio: (input: { id: string; pcm16le: Uint8Array }) => string;
  cleanupExpiredRawAudio: () => { deleted: string[] };
  getConversationMode: () => 'idle' | 'conversation';
}

interface PendingBuffer {
  source: AudioSource;
  startMs: number;
  endMs: number;
  bytes: number[];
}

const WAKE_WORD = '秘書';
const CONVERSATION_TIMEOUT_MS = 20_000;
const RAW_AUDIO_TTL_MS = 5 * 60 * 1000;

function concatBytes(bytes: number[]): Uint8Array {
  return Uint8Array.from(bytes);
}

export function createAudioModule(input: {
  sttClient: SttClient;
  ttsClient: TtsClient;
  virtualMicOutput: VirtualMicOutput;
  rawAudioDir: string;
  sampleRateHz?: number;
  chunkBytes?: number;
  nowMs?: () => number;
}): AudioModule {
  const sampleRateHz = input.sampleRateHz ?? 16_000;
  const chunkBytes = input.chunkBytes ?? 32_000;
  const nowMs = input.nowMs ?? (() => Date.now());
  const rawAudioDir = resolve(input.rawAudioDir);

  mkdirSync(rawAudioDir, { recursive: true });

  const pendingBySource: Record<AudioSource, PendingBuffer | undefined> = {
    meeting: undefined,
    microphone: undefined,
  };

  let conversationMode: 'idle' | 'conversation' = 'idle';
  let lastConversationActivityMs = 0;

  const ingestFrame = async (frame: AudioFrame): Promise<{ chunks: AudioChunk[]; transcripts: string[] }> => {
    let pending = pendingBySource[frame.source];
    if (!pending) {
      pending = {
        source: frame.source,
        startMs: frame.timestampMs,
        endMs: frame.timestampMs,
        bytes: [],
      };
      pendingBySource[frame.source] = pending;
    }

    pending.endMs = frame.timestampMs;
    pending.bytes.push(...frame.pcm16le);

    const chunks: AudioChunk[] = [];
    const transcripts: string[] = [];

    while (pending.bytes.length >= chunkBytes) {
      const bytes = pending.bytes.splice(0, chunkBytes);
      const chunk: AudioChunk = {
        source: frame.source,
        pcm16le: concatBytes(bytes),
        startMs: pending.startMs,
        endMs: frame.timestampMs,
      };

      pending.startMs = frame.timestampMs;
      chunks.push(chunk);

      const stt = await input.sttClient.transcribe({
        pcm16le: chunk.pcm16le,
        sampleRateHz,
      });
      transcripts.push(stt.text);
    }

    if (conversationMode === 'conversation' && nowMs() - lastConversationActivityMs >= CONVERSATION_TIMEOUT_MS) {
      conversationMode = 'idle';
    }

    return { chunks, transcripts };
  };

  const maybeRespond = async (request: { text: string }): Promise<{ responded: boolean; mode: 'idle' | 'conversation' }> => {
    const text = request.text.trim();

    if (conversationMode === 'conversation' && nowMs() - lastConversationActivityMs >= CONVERSATION_TIMEOUT_MS) {
      conversationMode = 'idle';
    }

    const shouldRespond = conversationMode === 'conversation' || text.includes(WAKE_WORD);
    if (!shouldRespond) {
      return { responded: false, mode: conversationMode };
    }

    const tts = await input.ttsClient.synthesize({
      text,
      sampleRateHz,
    });
    await input.virtualMicOutput.play({
      pcm16le: tts.pcm16le,
      sampleRateHz,
    });

    conversationMode = 'conversation';
    lastConversationActivityMs = nowMs();
    return { responded: true, mode: conversationMode };
  };

  const saveRawAudio = (request: { id: string; pcm16le: Uint8Array }): string => {
    if (!/^[a-zA-Z0-9_.-]+$/.test(request.id)) {
      throw new Error(`Invalid raw audio id: ${request.id}`);
    }

    const path = resolve(rawAudioDir, `${request.id}.pcm`);
    writeFileSync(path, request.pcm16le);
    return path;
  };

  const cleanupExpiredRawAudio = (): { deleted: string[] } => {
    const threshold = nowMs() - RAW_AUDIO_TTL_MS;
    const deleted: string[] = [];

    for (const entry of readdirSync(rawAudioDir)) {
      const path = resolve(rawAudioDir, entry);
      const stats = statSync(path);
      if (!stats.isFile()) {
        continue;
      }

      if (stats.mtimeMs <= threshold) {
        rmSync(path);
        deleted.push(path);
      }
    }

    return { deleted };
  };

  const getConversationMode = () => {
    if (conversationMode === 'conversation' && nowMs() - lastConversationActivityMs >= CONVERSATION_TIMEOUT_MS) {
      conversationMode = 'idle';
    }

    return conversationMode;
  };

  return {
    ingestFrame,
    maybeRespond,
    saveRawAudio,
    cleanupExpiredRawAudio,
    getConversationMode,
  };
}

export function readRawAudio(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

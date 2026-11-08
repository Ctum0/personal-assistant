import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/**
 * Regression tests for the microphone capture worklet.
 *
 * Two historical defects are pinned here:
 *
 * 1. The processor used to hand-roll a box-average decimator (sum of `ratio`
 *    samples / count). At 48 kHz that is every third sample: a zero-order-hold
 *    filter with no anti-alias rolloff, so everything above 8 kHz folded back
 *    into the speech band and the effective sample clock jittered at 44.1 kHz.
 *    Capture now runs on a 16 kHz AudioContext and this worklet is a
 *    pass-through framer — the browser's own resampler does the work.
 *
 * 2. The processor used to call `btoa()` itself. btoa/atob/TextEncoder do NOT
 *    exist in AudioWorkletGlobalScope, and a worklet that throws inside
 *    process() is torn down silently: zero frames ever reached the page while
 *    the UI reported "Listening". Frames are now raw Float32 and the main
 *    thread does Int16 + base64.
 *
 * Tests run against the real shipped asset (public/worklets/pcm-16k.js), not a
 * copy, so production cannot drift from its tests.
 */

const WORKLET_PATH = join(process.cwd(), 'public', 'worklets', 'pcm-16k.js');
const RENDER_QUANTUM = 128; // Web Audio spec: 128 frames per process() call

type Frame = { samples: Float32Array; rms: number };

function loadWorklet(sampleRate: number) {
  const source = readFileSync(WORKLET_PATH, 'utf8');
  const frames: Frame[] = [];

  let Processor: new (options?: unknown) => {
    process: (inputs: Float32Array[][]) => boolean;
  };

  const sandbox = {
    sampleRate,
    Float32Array,
    Int16Array,
    Uint8Array,
    Math,
    Number,
    String,
    // Deliberately NOT provided: btoa, atob, TextEncoder. If the worklet calls
    // one of them, this suite throws exactly like the browser does today.
    AudioWorkletProcessor: class {
      port = {
        postMessage: (payload: { type: string; data: Float32Array; rms: number }) => {
          expect(payload.type).toBe('audio');
          frames.push({ samples: Float32Array.from(payload.data), rms: payload.rms });
        },
      };
    },
    registerProcessor: (_name: string, ctor: unknown) => {
      Processor = ctor as typeof Processor;
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);

  return {
    frames,
    instantiate: (frameSamples: number) => new Processor({ processorOptions: { frameSamples } }),
  };
}

/** Feed `totalSeconds` of a pure sine into the processor in render quanta. */
function feedSine(
  proc: { process: (inputs: Float32Array[][]) => boolean },
  sampleRate: number,
  freqHz: number,
  totalSeconds: number,
  amplitude = 0.5,
) {
  const total = Math.round(sampleRate * totalSeconds);
  let written = 0;
  while (written < total) {
    const n = Math.min(RENDER_QUANTUM, total - written);
    const block = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      block[i] = amplitude * Math.sin((2 * Math.PI * freqHz * (written + i)) / sampleRate);
    }
    proc.process([[block]]);
    written += n;
  }
}

function flatten(frames: Frame[]) {
  const total = frames.reduce((sum, f) => sum + f.samples.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame.samples, offset);
    offset += frame.samples.length;
  }
  return out;
}

/** Frequency estimate from zero crossings — adequate for a clean sine. */
function estimateFreqHz(samples: Float32Array, sampleRate: number) {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] < 0 && samples[i] >= 0) || (samples[i - 1] >= 0 && samples[i] < 0)) {
      crossings++;
    }
  }
  return (crossings / 2) * (sampleRate / samples.length);
}

describe('pcm-16k capture worklet', () => {
  it('runs without btoa/atob/TextEncoder (calling one kills the processor)', () => {
    const rate = 16_000;
    const { frames, instantiate } = loadWorklet(rate);
    const proc = instantiate(512);

    expect(() => feedSine(proc, rate, 440, 0.5)).not.toThrow();
    // The pre-fix processor threw on its first flush and posted nothing at all.
    expect(frames.length).toBeGreaterThan(0);
  });

  it('is sample-preserving at 48 kHz — it must not decimate', () => {
    const rate = 48_000;
    const { frames, instantiate } = loadWorklet(rate);
    const proc = instantiate(1536); // 32 ms at 48 kHz

    feedSine(proc, rate, 1000, 1);

    // Whole 1536-sample frames only: the tail stays buffered for the next frame,
    // so allow one frame of slack. The old box-decimator produced exactly one
    // third of these samples (16000), which is what this assertion catches.
    const out = flatten(frames);
    expect(out.length).toBeGreaterThan(rate - 1536);
    expect(out.length).toBeLessThanOrEqual(rate);
  });

  it('does not alias a 9 kHz tone at 48 kHz (old code folded it to 7 kHz)', () => {
    const rate = 48_000;
    const { frames, instantiate } = loadWorklet(rate);
    const proc = instantiate(1536);

    feedSine(proc, rate, 9000, 1);

    const measured = estimateFreqHz(flatten(frames), rate);
    expect(measured).toBeGreaterThan(8_500);
    expect(measured).toBeLessThan(9_500);
  });

  it('frames at 32 ms and preserves a 1 kHz tone at 16 kHz', () => {
    const rate = 16_000;
    const { frames, instantiate } = loadWorklet(rate);
    const proc = instantiate(512);

    feedSine(proc, rate, 1000, 1);

    expect(frames.every((f) => f.samples.length === 512)).toBe(true);
    expect(frames.length).toBe(31); // 16000 / 512 → 31 full frames per second

    const measured = estimateFreqHz(flatten(frames), rate);
    expect(measured).toBeGreaterThan(950);
    expect(measured).toBeLessThan(1050);
  });

  it('reports RMS for a full-scale sine close to 1/sqrt(2)', () => {
    const rate = 16_000;
    const { frames, instantiate } = loadWorklet(rate);
    const proc = instantiate(512);

    feedSine(proc, rate, 440, 0.5, 1.0);

    const mean = frames.reduce((a, b) => a + b.rms, 0) / frames.length;
    expect(mean).toBeGreaterThan(0.68);
    expect(mean).toBeLessThan(0.73); // 0.7071
  });

  it('passes float samples through untouched (clamping is the main thread job)', () => {
    const rate = 16_000;
    const { frames, instantiate } = loadWorklet(rate);
    const proc = instantiate(128);

    proc.process([[new Float32Array(128).fill(1.5)]]);

    expect(frames.length).toBe(1);
    expect(frames[0].samples[0]).toBeCloseTo(1.5, 5);
  });
});

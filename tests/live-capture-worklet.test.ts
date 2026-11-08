import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

/**
 * Regression tests for the microphone capture worklet.
 *
 * These exist because the original processor hand-rolled a box-average
 * decimator. On a 48 kHz context that means every third sample (and a
 * fractional window at 44.1 kHz), which aliases anything above 8 kHz back into
 * the speech band — sibilants and room noise arrive as phantom low-frequency
 * energy, and the effective sample clock jitters. The fix is to capture on a
 * 16 kHz AudioContext and let the browser resample, so the worklet must now be
 * a pass-through framer.
 *
 * The tests are written against the real shipped file (public/worklets/
 * pcm-16k.js), not a copy, so the production asset cannot drift from its tests.
 */

const WORKLET_PATH = join(process.cwd(), 'public', 'worklets', 'pcm-16k.js');
const RENDER_QUANTUM = 128; // Web Audio spec: 128 frames per process() call

type Captured = { samples: Int16Array[]; rms: number[] };

function loadWorklet(sampleRate: number) {
  const source = readFileSync(WORKLET_PATH, 'utf8');
  const captured: Captured = { samples: [], rms: [] };

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
    btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    AudioWorkletProcessor: class {
      port = {
        postMessage: (payload: { b64: string; rms: number }) => {
          const bytes = Buffer.from(payload.b64, 'base64');
          const view = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
          captured.samples.push(Int16Array.from(view));
          captured.rms.push(payload.rms);
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
    captured,
    instantiate: (frameSamples: number) =>
      new Processor({ processorOptions: { frameSamples } }),
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

function flatten(frames: Int16Array[]) {
  const total = frames.reduce((sum, f) => sum + f.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

/** Frequency estimate from zero crossings — adequate for a clean sine. */
function estimateFreqHz(samples: Int16Array, sampleRate: number) {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] < 0 && samples[i] >= 0) || (samples[i - 1] >= 0 && samples[i] < 0)) {
      crossings++;
    }
  }
  return (crossings / 2) * (sampleRate / samples.length);
}

describe('pcm-16k capture worklet', () => {
  it('is sample-preserving at 48 kHz — it must not decimate', () => {
    const rate = 48_000;
    const { captured, instantiate } = loadWorklet(rate);
    const proc = instantiate(1920); // 40 ms at 48 kHz

    feedSine(proc, rate, 1000, 1);

    const out = flatten(captured.samples);
    // Old box-decimator behaviour produced exactly one third of the samples.
    expect(out.length).toBe(rate);
  });

  it('does not alias a 9 kHz tone at 48 kHz (old code folded it to 7 kHz)', () => {
    const rate = 48_000;
    const { captured, instantiate } = loadWorklet(rate);
    const proc = instantiate(1920);

    feedSine(proc, rate, 9000, 1);

    const out = flatten(captured.samples);
    const measured = estimateFreqHz(out, rate);
    expect(measured).toBeGreaterThan(8_500);
    expect(measured).toBeLessThan(9_500);
  });

  it('frames at 40 ms and preserves a 1 kHz tone at 16 kHz', () => {
    const rate = 16_000;
    const { captured, instantiate } = loadWorklet(rate);
    const proc = instantiate(640);

    feedSine(proc, rate, 1000, 1);

    // 1 second at 16 kHz in 640-sample frames = 25 frames, none short.
    expect(captured.samples.every((f) => f.length === 640)).toBe(true);
    expect(captured.samples.length).toBe(25);

    const out = flatten(captured.samples);
    expect(out.length).toBe(rate);
    const measured = estimateFreqHz(out, rate);
    expect(measured).toBeGreaterThan(950);
    expect(measured).toBeLessThan(1050);
  });

  it('reports RMS for a full-scale sine close to 1/sqrt(2)', () => {
    const rate = 16_000;
    const { captured, instantiate } = loadWorklet(rate);
    const proc = instantiate(640);

    feedSine(proc, rate, 440, 0.4, 1.0); // amplitude 1.0

    const mean = captured.rms.reduce((a, b) => a + b, 0) / captured.rms.length;
    expect(mean).toBeGreaterThan(0.68);
    expect(mean).toBeLessThan(0.73); // 0.7071
  });

  it('clamps out-of-range float samples instead of wrapping them', () => {
    const rate = 16_000;
    const { captured, instantiate } = loadWorklet(rate);
    const proc = instantiate(640);

    for (let f = 0; f < 5; f++) {
      const block = new Float32Array(RENDER_QUANTUM).fill(1.8);
      proc.process([[block]]);
    }

    const out = flatten(captured.samples);
    expect(Math.max(...Array.from(out))).toBe(32767);
    expect(Math.min(...Array.from(out))).toBe(32767);
  });
});

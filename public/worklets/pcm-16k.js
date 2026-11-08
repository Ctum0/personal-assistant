/**
 * PCM capture worklet — framing only, deliberately NO resampling.
 *
 * Capture runs on an AudioContext pinned to 16 kHz (see lib/live/session.ts), so
 * `sampleRate` here is already the rate the Live API wants. The previous version
 * hand-rolled a box-average decimator (sum of `ratio` samples / count): a
 * zero-order-hold filter that lets everything above 8 kHz alias straight back
 * into the speech band, plus timing jitter at 44.1 kHz where the ratio is
 * fractional. The browser's own resampler is spec-defined and far better than
 * anything hand-rolled here, so this processor only converts Float32 -> Int16
 * and frames it.
 *
 * If a browser ignores the requested context rate, frames are still correct:
 * the session labels them with the rate actually captured (the Live API
 * resamples any input rate).
 *
 * Frame size comes from `processorOptions.frameSamples` (~40 ms at the capture
 * rate) and falls back to 40 ms of the current context.
 */
class PCM16K extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requested = options && options.processorOptions && options.processorOptions.frameSamples;
    this.frameSamples =
      Number.isFinite(requested) && requested > 0 ? Math.round(requested) : Math.round(sampleRate * 0.04);
    this.buffer = new Float32Array(this.frameSamples);
    this.filled = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) {
      this.buffer[this.filled++] = ch[i];
      if (this.filled === this.frameSamples) {
        this.flush();
      }
    }
    return true;
  }

  flush() {
    const n = this.frameSamples;
    const pcm = new Int16Array(n);
    let sumSq = 0;

    for (let i = 0; i < n; i++) {
      const v = Math.max(-1, Math.min(1, this.buffer[i]));
      sumSq += v * v;
      // Asymmetric scaling keeps full-scale negative samples inside Int16.
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }

    // RMS is computed on the audio thread so the main thread never has to
    // base64-decode a frame just to measure loudness.
    const rms = Math.sqrt(sumSq / n);
    this.port.postMessage({ b64: this.toBase64(pcm), rms });
    this.filled = 0;
  }

  toBase64(int16) {
    const bytes = new Uint8Array(int16.buffer);
    let out = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(out);
  }
}

registerProcessor('pcm-16k', PCM16K);

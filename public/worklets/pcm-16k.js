/**
 * PCM capture worklet — framing only. NO resampling, NO base64.
 *
 * Two hard constraints drive this file:
 *
 * 1. `btoa`, `atob` and `TextEncoder` DO NOT EXIST inside AudioWorkletGlobalScope
 *    (verified in Chromium: all three are undefined). The previous version called
 *    btoa() on the first full frame, which threw inside process(); a worklet that
 *    throws is torn down silently, so not one frame ever reached the page — the
 *    microphone was deaf while the UI happily said "Listening".
 *
 * 2. Capture runs on its own AudioContext pinned to 16 kHz, so the browser's
 *    spec-defined resampler converts the mic stream instead of a hand-rolled
 *    box-average decimator (which folded everything above 8 kHz back into the
 *    speech band).
 *
 * The processor therefore posts raw Float32 samples plus an RMS (cheap here) and
 * the main thread does Int16 + base64 — the same split Google's reference capture
 * worklet uses.
 *
 * Frame size comes from `processorOptions.frameSamples` (~32 ms at the capture
 * rate, inside the 20-40 ms window the Live API asks for).
 */
class PCM16K extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requested = options && options.processorOptions && options.processorOptions.frameSamples;
    this.frameSamples =
      Number.isFinite(requested) && requested > 0 ? Math.round(requested) : Math.round(sampleRate * 0.032);
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
    let sumSq = 0;
    for (let i = 0; i < this.frameSamples; i++) {
      const v = this.buffer[i];
      sumSq += v * v;
    }

    // slice(): the buffer is reused immediately for the next frame.
    this.port.postMessage({
      type: 'audio',
      data: this.buffer.slice(),
      rms: Math.sqrt(sumSq / this.frameSamples),
    });

    this.filled = 0;
  }
}

registerProcessor('pcm-16k', PCM16K);

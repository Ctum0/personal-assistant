class PCM16K extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.n = 0;
    this.out = [];
  }

  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) {
      this.acc += ch[i];
      this.n++;
      if (this.n >= this.ratio) {
        const v = Math.max(-1, Math.min(1, this.acc / this.n));
        this.out.push(v < 0 ? v * 0x8000 : v * 0x7fff);
        this.acc = 0;
        this.n = 0;
      }
    }

    while (this.out.length >= 1600) {
      const pcm = new Int16Array(this.out.splice(0, 1600));
      const b = new Uint8Array(pcm.buffer);
      let s = '';
      for (let i = 0; i < b.length; i++) {
        s += String.fromCharCode(b[i]);
      }
      this.port.postMessage(btoa(s));
    }

    return true;
  }
}

registerProcessor('pcm-16k', PCM16K);

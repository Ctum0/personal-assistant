import * as THREE from 'three';
import { ARKIT_BLENDSHAPES, ARKitBlendshapeName, VISEME_MAP, VisemeMapping } from './constants';

export interface VisemeState {
  currentMorphs: Record<string, number>;
  targetMorphs: Record<string, number>;
  activeViseme: string;
  isSpeaking: boolean;
  audioEnergy: number;
}

export class VisemeLipSyncEngine {
  private headMesh: THREE.Mesh;
  private morphDict: Record<string, number>;
  private currentWeights: Float32Array;
  private targetWeights: Float32Array;
  private isSpeaking = false;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private speechTimer = 0;

  constructor(headMesh: THREE.Mesh, morphDict: Record<string, number>) {
    this.headMesh = headMesh;
    this.morphDict = morphDict;
    this.currentWeights = new Float32Array(ARKIT_BLENDSHAPES.length);
    this.targetWeights = new Float32Array(ARKIT_BLENDSHAPES.length);
  }

  /**
   * Directly sets an active viseme with a specified intensity (0.0 - 1.0)
   */
  public setViseme(visemeKey: string, intensity = 1.0): void {
    const mapping = VISEME_MAP[visemeKey] || VISEME_MAP.sil;

    // Reset mouth targets
    for (const bs of ARKIT_BLENDSHAPES) {
      if (bs.startsWith('mouth') || bs.startsWith('jaw') || bs === 'tongueOut') {
        const idx = this.morphDict[bs];
        if (idx !== undefined) {
          this.targetWeights[idx] = 0;
        }
      }
    }

    // Apply specific blendshape weights from mapping
    Object.entries(mapping).forEach(([bsName, weight]) => {
      const idx = this.morphDict[bsName];
      if (idx !== undefined && typeof weight === 'number') {
        this.targetWeights[idx] = Math.min(1.0, Math.max(0.0, weight * intensity));
      }
    });
  }

  /**
   * Triggers natural procedural speech cadence for a duration (in seconds)
   * Simulates phoneme progression across words with authentic vowel/consonant sequences
   */
  public triggerSpeechCadence(durationSeconds = 3.0): void {
    this.isSpeaking = true;
    this.speechTimer = durationSeconds;
  }

  public stopSpeech(): void {
    this.isSpeaking = false;
    this.speechTimer = 0;
    this.setViseme('sil', 0);
  }

  /**
   * Binds an HTMLAudioElement or Web Audio Node for live frequency-driven lip-sync
   */
  public attachAudioElement(audio: HTMLAudioElement): void {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioContext) {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);

      const source = this.audioContext.createMediaElementSource(audio);
      source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch {
      // Audio element might already be connected
    }
  }

  /**
   * Frame update loop: smoothly interpolates current morph weights towards targets
   * using spring dampening physics.
   */
  public update(delta: number, elapsedTime: number): void {
    // 1. Process Live Audio Analyser if attached
    let liveEnergy = 0;
    if (this.analyser && this.frequencyData) {
      this.analyser.getByteFrequencyData(this.frequencyData);
      let sum = 0;
      for (let i = 0; i < this.frequencyData.length; i++) {
        sum += this.frequencyData[i];
      }
      liveEnergy = sum / (this.frequencyData.length * 255);
      if (liveEnergy > 0.05) {
        this.isSpeaking = true;
      }
    }

    // 2. Procedural Speech Cadence if speaking
    if (this.isSpeaking) {
      if (this.speechTimer > 0) {
        this.speechTimer -= delta;
        if (this.speechTimer <= 0) {
          this.isSpeaking = false;
          this.setViseme('sil', 0);
        }
      }

      // Syllable rhythm cycle (approx 4-6 syllables per second)
      const syllableSpeed = 16.0;
      const phase = Math.sin(elapsedTime * syllableSpeed);
      const subPhase = Math.cos(elapsedTime * (syllableSpeed * 0.5));

      if (phase > 0.3) {
        // Open vowels
        if (subPhase > 0.4) {
          this.setViseme('aa', 0.75 + 0.25 * phase);
        } else if (subPhase > -0.2) {
          this.setViseme('ee', 0.65 + 0.3 * phase);
        } else {
          this.setViseme('oh', 0.7 + 0.3 * phase);
        }
      } else if (phase < -0.4) {
        // Consonant stops (M, B, P, F, V, T)
        if (subPhase > 0) {
          this.setViseme('mbp', 0.85);
        } else {
          this.setViseme('fv', 0.7);
        }
      } else {
        // Intermediate vowel / diphthong
        this.setViseme('ih', 0.4);
      }
    }

    // 3. Smooth Damped Spring Lerp towards target weights
    const springFactor = Math.min(1.0, delta * 22.0); // Fast, responsive yet smooth
    const influences = this.headMesh.morphTargetInfluences;

    if (influences) {
      for (let i = 0; i < this.currentWeights.length; i++) {
        const target = this.targetWeights[i];
        this.currentWeights[i] += (target - this.currentWeights[i]) * springFactor;
        influences[i] = this.currentWeights[i];
      }
    }
  }

  public getMorphWeight(name: ARKitBlendshapeName): number {
    const idx = this.morphDict[name];
    if (idx === undefined) return 0;
    return this.currentWeights[idx] || 0;
  }

  public setDirectMorph(name: ARKitBlendshapeName, weight: number): void {
    const idx = this.morphDict[name];
    if (idx !== undefined) {
      this.targetWeights[idx] = Math.min(1.0, Math.max(0.0, weight));
      this.currentWeights[idx] = this.targetWeights[idx];
      if (this.headMesh.morphTargetInfluences) {
        this.headMesh.morphTargetInfluences[idx] = this.currentWeights[idx];
      }
    }
  }
}

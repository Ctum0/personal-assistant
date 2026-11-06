import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, VRM, VRMExpressionPresetName } from '@pixiv/three-vrm';
import { SofiaExpression } from '../types';

export interface VRMControllerOptions {
  modelUrl?: string;
  onProgress?: (progress: number) => void;
  onLoaded?: (vrm: VRM) => void;
  onError?: (error: Error) => void;
}

interface BoneRotationTargets {
  leftUpperArm: THREE.Quaternion;
  rightUpperArm: THREE.Quaternion;
  leftLowerArm: THREE.Quaternion;
  rightLowerArm: THREE.Quaternion;
  leftHand: THREE.Quaternion;
  rightHand: THREE.Quaternion;
  chest: THREE.Quaternion;
  spine: THREE.Quaternion;
}

export class VRMAvatarController {
  public vrm: VRM | null = null;
  public isLoaded = false;
  public isSpeaking = false;

  // Animation & Physics Clock
  private clock = new THREE.Clock();

  // Natural Autonomous Blinking (3.5 to 6.0 seconds interval)
  private blinkTimer = 4.2;
  private isBlinking = false;
  private blinkProgress = 0;
  
  // Autonomous Head & Posture State (Semi-random natural weight/head shifts every 10-20s)
  private autonomousShiftTimer = 12.0;
  private currentHeadEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private targetHeadEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Procedural Conversational Hand & Arm Gestures Engine
  private currentGestureIndex = 0;
  private gestureTimer = 0.0;
  private targetBoneRotations: BoneRotationTargets = {
    leftUpperArm: new THREE.Quaternion(),
    rightUpperArm: new THREE.Quaternion(),
    leftLowerArm: new THREE.Quaternion(),
    rightLowerArm: new THREE.Quaternion(),
    leftHand: new THREE.Quaternion(),
    rightHand: new THREE.Quaternion(),
    chest: new THREE.Quaternion(),
    spine: new THREE.Quaternion(),
  };

  // Viseme Lip-Sync State
  private currentVisemes: Record<string, number> = {
    aa: 0,
    ee: 0,
    ih: 0,
    oh: 0,
    ou: 0,
  };
  private targetVisemes: Record<string, number> = {
    aa: 0,
    ee: 0,
    ih: 0,
    oh: 0,
    ou: 0,
  };

  // Companion Emotional State
  private currentMood: SofiaExpression = 'focused';
  private targetMoodWeights: Record<string, number> = {
    happy: 0,
    angry: 0,
    sad: 0,
    relaxed: 0,
  };
  private currentMoodWeights: Record<string, number> = {
    happy: 0,
    angry: 0,
    sad: 0,
    relaxed: 0,
  };

  // Speech cadence timer
  private speechTimer = 0;

  // Ambient Glowing Ember Particles (Swirling Helical Vortex)
  private particles: THREE.Points | null = null;
  private particlePositions: Float32Array | null = null;
  private particleSeeds: Float32Array | null = null;
  private particleAngles: Float32Array | null = null;
  private particleRadii: Float32Array | null = null;
  private particleCount = 180;
  private particleMaterial: THREE.PointsMaterial | null = null;

  constructor() {}

  /**
   * Loads the VRM model into the Three.js scene
   */
  public async load(scene: THREE.Scene, options: VRMControllerOptions = {}): Promise<VRM> {
    const url = options.modelUrl || '/models/sofia.vrm';

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm as VRM;
          if (!vrm) {
            const err = new Error('GLTF model is missing VRM extension data');
            options.onError?.(err);
            return reject(err);
          }

          this.vrm = vrm;
          this.isLoaded = true;

          // VRM optimization utilities
          VRMUtils.removeUnnecessaryVertices(gltf.scene);
          VRMUtils.removeUnnecessaryJoints(gltf.scene);

          // VRM 0.0 models face -Z, rotate 180 to face +Z (towards camera)
          vrm.scene.rotation.y = Math.PI;

          // Sinking model by -0.16m lowers head/fox-ears/cowlick safely into the center of the circular dais
          vrm.scene.position.y = -0.16;

          // Enable shadow casting and ensure frustum culling doesn't clip hair
          vrm.scene.traverse((obj) => {
            if ((obj as THREE.Mesh).isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
              obj.frustumCulled = false;
            }
          });

          // Initialize relaxed A-pose
          this.setNaturalAPose(vrm);

          // Initialize ambient particle field
          this.initAmbientParticles(scene);

          scene.add(vrm.scene);
          options.onLoaded?.(vrm);
          resolve(vrm);
        },
        (progressEvent) => {
          if (progressEvent.total > 0) {
            const pct = progressEvent.loaded / progressEvent.total;
            options.onProgress?.(pct);
          }
        },
        (error) => {
          const err = error instanceof Error ? error : new Error(String(error));
          console.error('Failed to load VRM model:', err);
          options.onError?.(err);
          reject(err);
        }
      );
    });
  }

  /**
   * Initializes soft-glowing ethereal ember particles in an orbital double-helix vortex around Sofia
   */
  private initAmbientParticles(scene: THREE.Scene): void {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(this.particleCount * 3);
    const seeds = new Float32Array(this.particleCount);
    const angles = new Float32Array(this.particleCount);
    const radii = new Float32Array(this.particleCount);

    for (let i = 0; i < this.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 0.35 + Math.random() * 0.55;
      angles[i] = angle;
      radii[i] = radius;
      seeds[i] = Math.random() * Math.PI * 2;

      pos[i * 3 + 0] = Math.cos(angle) * radius;
      pos[i * 3 + 1] = 0.20 + Math.random() * 1.45;
      pos[i * 3 + 2] = Math.sin(angle) * radius;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particlePositions = pos;
    this.particleSeeds = seeds;
    this.particleAngles = angles;
    this.particleRadii = radii;

    // Glowing ember circle texture
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 220, 235, 1.0)');
      grad.addColorStop(0.3, 'rgba(244, 63, 94, 0.85)');
      grad.addColorStop(0.7, 'rgba(180, 20, 80, 0.35)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.PointsMaterial({
      size: 0.045,
      map: tex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.70,
    });
    this.particleMaterial = mat;

    const points = new THREE.Points(geo, mat);
    this.particles = points;
    scene.add(points);
  }

  /**
   * Poses humanoid arms downward into a relaxed companion A-pose
   */
  private setNaturalAPose(vrm: VRM): void {
    if (!vrm.humanoid) return;

    const leftUpperArm = vrm.humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightUpperArm = vrm.humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftLowerArm = vrm.humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightLowerArm = vrm.humanoid.getNormalizedBoneNode('rightLowerArm');

    if (leftUpperArm) {
      leftUpperArm.rotation.set(0.06, -0.05, 1.25);
    }
    if (rightUpperArm) {
      rightUpperArm.rotation.set(0.06, 0.05, -1.25);
    }
    if (leftLowerArm) {
      leftLowerArm.rotation.set(0.12, 0.22, 0.35);
    }
    if (rightLowerArm) {
      rightLowerArm.rotation.set(0.12, -0.22, -0.35);
    }
  }

  /**
   * Sets the companion's emotional mood based on Sofia's cognitive state
   */
  public setMood(expression: SofiaExpression): void {
    this.currentMood = expression;

    this.targetMoodWeights.happy = 0;
    this.targetMoodWeights.angry = 0;
    this.targetMoodWeights.sad = 0;
    this.targetMoodWeights.relaxed = 0;

    switch (expression) {
      case 'pleased':
      case 'amused':
        this.targetMoodWeights.happy = 0.45;
        this.targetMoodWeights.relaxed = 0.35;
        break;
      case 'stern':
      case 'disappointed':
        this.targetMoodWeights.angry = 0.32; // Composed, firm demeanor
        break;
      case 'concerned':
        this.targetMoodWeights.sad = 0.35;
        break;
      case 'sleepy':
        this.targetMoodWeights.relaxed = 0.40;
        break;
      case 'focused':
      case 'neutral':
      default:
        break;
    }
  }

  /**
   * Sets a specific viseme target weight (0.0 to 1.0)
   */
  public setViseme(viseme: 'aa' | 'ee' | 'ih' | 'oh' | 'ou' | 'sil', weight = 1.0): void {
    Object.keys(this.targetVisemes).forEach((k) => {
      this.targetVisemes[k] = 0;
    });

    if (viseme !== 'sil' && this.targetVisemes[viseme] !== undefined) {
      this.targetVisemes[viseme] = Math.min(1.0, Math.max(0.0, weight));
    }
  }

  /**
   * Triggers a natural procedural speech cadence for a duration
   */
  public triggerSpeechCadence(duration = 4.0): void {
    this.isSpeaking = true;
    this.speechTimer = duration;
    this.gestureTimer = 0.2; // Start gesture immediately
  }

  /**
   * Stops speech and gracefully returns mouth & arms to relaxed baseline
   */
  public stopSpeech(): void {
    this.isSpeaking = false;
    this.speechTimer = 0;
    this.setViseme('sil', 0);
  }

  /**
   * Calculates procedural target rotations for conversational hand/arm gestures
   */
  private updateConversationalGestures(dt: number, elapsedTime: number): void {
    // 4 Communicative Gestures + 1 Relaxed Idle Pose
    // 0: Right Hand Open Palm Accent
    // 1: Both Hands Expressive Modulation (Thoughtful Explanation)
    // 2: Left Hand Soft Accent (Intimate Cadence)
    // 3: Attentive Mid-Speech Pause
    if (this.isSpeaking) {
      this.gestureTimer -= dt;
      if (this.gestureTimer <= 0) {
        // Cycle to next gesture with varying duration (2.4s to 4.0s)
        this.currentGestureIndex = (this.currentGestureIndex + 1) % 4;
        this.gestureTimer = 2.4 + Math.random() * 1.6;
      }
    } else {
      // In idle, return to baseline posture
      this.currentGestureIndex = -1;
    }

    // Dynamic wave modulation based on speech cadence
    const speechCadence = this.isSpeaking ? Math.sin(elapsedTime * 3.8) * 0.04 : 0;
    const microSway = Math.sin(elapsedTime * 1.2) * 0.015;

    const euler = new THREE.Euler();

    // Default Relaxed Baseline Rotations
    let lua = [0.06 + microSway, -0.05, 1.25];
    let rua = [0.06 + microSway, 0.05, -1.25];
    let lla = [0.12, 0.22, 0.35 + microSway];
    let rla = [0.12, -0.22, -0.35 - microSway];
    let lh = [0.05, 0.0, 0.10];
    let rh = [0.05, 0.0, -0.10];
    let ch = [0.0, 0.0, 0.0];

    if (this.currentGestureIndex === 0) {
      // Gesture 0: Right hand open palm accent
      rua = [-0.18 + speechCadence, 0.18, -0.82];
      rla = [0.42 + speechCadence * 1.2, -0.32, -0.70];
      rh = [0.15, -0.20, -0.12];
      lua = [0.08, -0.05, 1.20];
      lla = [0.15, 0.25, 0.38];
      ch = [0.02, -0.03, -0.02];
    } else if (this.currentGestureIndex === 1) {
      // Gesture 1: Both hands expressive mid-chest modulation
      lua = [-0.12 + speechCadence, -0.15, 0.92];
      rua = [-0.12 + speechCadence, 0.15, -0.92];
      lla = [0.38 + speechCadence, 0.38, 0.65];
      rla = [0.38 + speechCadence, -0.38, -0.65];
      lh = [0.12, 0.15, 0.18];
      rh = [0.12, -0.15, -0.18];
      ch = [0.03 + speechCadence * 0.5, 0.0, 0.0];
    } else if (this.currentGestureIndex === 2) {
      // Gesture 2: Left hand soft accent
      lua = [-0.16 + speechCadence, -0.18, 0.82];
      lla = [0.40 + speechCadence * 1.2, 0.32, 0.68];
      lh = [0.15, 0.20, 0.12];
      rua = [0.08, 0.05, -1.20];
      rla = [0.15, -0.25, -0.38];
      ch = [0.02, 0.03, 0.02];
    } else if (this.currentGestureIndex === 3) {
      // Gesture 3: Receptive mid-speech pause (hands near waist)
      lua = [0.04, -0.08, 1.15];
      rua = [0.04, 0.08, -1.15];
      lla = [0.25, 0.32, 0.50];
      rla = [0.25, -0.32, -0.50];
      ch = [0.01, 0.0, 0.0];
    }

    // Set Target Quaternions
    euler.set(lua[0], lua[1], lua[2]);
    this.targetBoneRotations.leftUpperArm.setFromEuler(euler);

    euler.set(rua[0], rua[1], rua[2]);
    this.targetBoneRotations.rightUpperArm.setFromEuler(euler);

    euler.set(lla[0], lla[1], lla[2]);
    this.targetBoneRotations.leftLowerArm.setFromEuler(euler);

    euler.set(rla[0], rla[1], rla[2]);
    this.targetBoneRotations.rightLowerArm.setFromEuler(euler);

    euler.set(lh[0], lh[1], lh[2]);
    this.targetBoneRotations.leftHand.setFromEuler(euler);

    euler.set(rh[0], rh[1], rh[2]);
    this.targetBoneRotations.rightHand.setFromEuler(euler);

    euler.set(ch[0], ch[1], ch[2]);
    this.targetBoneRotations.chest.setFromEuler(euler);
  }

  /**
   * Applies smooth spherical linear interpolation (slerp) to bone nodes
   */
  private applyBoneSlerp(dt: number, breathCycle: number): void {
    if (!this.vrm?.humanoid) return;

    // Damping factor: fluid, weight-bearing, zero twitching (0.06 per frame at 60fps)
    const slerpFactor = Math.min(1.0, 3.8 * dt);

    const bones = [
      { name: 'leftUpperArm', target: this.targetBoneRotations.leftUpperArm },
      { name: 'rightUpperArm', target: this.targetBoneRotations.rightUpperArm },
      { name: 'leftLowerArm', target: this.targetBoneRotations.leftLowerArm },
      { name: 'rightLowerArm', target: this.targetBoneRotations.rightLowerArm },
      { name: 'leftHand', target: this.targetBoneRotations.leftHand },
      { name: 'rightHand', target: this.targetBoneRotations.rightHand },
    ] as const;

    bones.forEach(({ name, target }) => {
      const node = this.vrm?.humanoid?.getNormalizedBoneNode(name);
      if (node) {
        node.quaternion.slerp(target, slerpFactor);
      }
    });

    // Breathing pitch on chest & spine
    const chestNode = this.vrm.humanoid.getNormalizedBoneNode('chest');
    const spineNode = this.vrm.humanoid.getNormalizedBoneNode('spine');
    if (chestNode) {
      chestNode.quaternion.slerp(this.targetBoneRotations.chest, slerpFactor);
      chestNode.rotation.x += breathCycle * 0.015;
    }
    if (spineNode) {
      spineNode.rotation.x = breathCycle * 0.008;
    }
  }

  /**
   * Updates ambient glowing particle vortex in a swirling double-helix around Sofia
   */
  private updateParticles(dt: number, elapsedTime: number): void {
    if (!this.particles || !this.particlePositions || !this.particleSeeds || !this.particleAngles || !this.particleRadii) return;

    const pos = this.particlePositions;
    const seeds = this.particleSeeds;
    const angles = this.particleAngles;
    const radii = this.particleRadii;
    const speedMult = this.isSpeaking ? 1.65 : 1.0;

    for (let i = 0; i < this.particleCount; i++) {
      const idx = i * 3;
      const seed = seeds[i];

      // Swirling double-helix rotational movement
      angles[i] += (0.42 + (seed % 0.35)) * speedMult * dt;
      const currentRadius = radii[i] + Math.sin(elapsedTime * 0.9 + seed) * 0.045;

      pos[idx + 0] = Math.cos(angles[i]) * currentRadius;
      pos[idx + 2] = Math.sin(angles[i]) * currentRadius;

      // Drift upward with gentle sine flutter
      pos[idx + 1] += (0.09 * speedMult + 0.03 * Math.cos(seed)) * dt;

      // Wrap around when rising past bust ceiling
      if (pos[idx + 1] > 1.68) {
        pos[idx + 1] = 0.22;
        angles[i] = Math.random() * Math.PI * 2;
        radii[i] = 0.35 + Math.random() * 0.55;
      }
    }

    this.particles.geometry.attributes.position.needsUpdate = true;

    // Vocal shimmer resonance
    if (this.particleMaterial) {
      const targetOpacity = this.isSpeaking ? 0.92 : 0.62;
      this.particleMaterial.opacity += (targetOpacity - this.particleMaterial.opacity) * (4.0 * dt);
    }
  }

  /**
   * Main per-frame autonomous life and animation loop
   */
  public update(delta: number): void {
    if (!this.vrm || !this.isLoaded) return;

    const dt = Math.min(0.1, delta);
    const elapsedTime = this.clock.getElapsedTime();

    // 1. Organic Living Breathing Cycle
    const breathCycle = Math.sin(elapsedTime * 1.5);

    // 2. Procedural Conversational Gestures & Bone Slerp
    this.updateConversationalGestures(dt, elapsedTime);
    this.applyBoneSlerp(dt, breathCycle);

    // 3. Autonomous Living Companion Micro-Posture Shifts (Every 10-20 seconds)
    this.autonomousShiftTimer -= dt;
    if (this.autonomousShiftTimer <= 0) {
      this.autonomousShiftTimer = 10.0 + Math.random() * 10.0;
      
      const newYaw = (Math.random() - 0.5) * 0.12;   // ~±3.5 degrees
      const newPitch = (Math.random() - 0.5) * 0.06; // ~±1.7 degrees
      const newRoll = (Math.random() - 0.5) * 0.04;  // ~±1.1 degrees
      this.targetHeadEuler.set(newPitch, newYaw, newRoll, 'YXZ');
    }

    const postureDamping = Math.min(1.0, 1.8 * dt);
    this.currentHeadEuler.x += (this.targetHeadEuler.x - this.currentHeadEuler.x) * postureDamping;
    this.currentHeadEuler.y += (this.targetHeadEuler.y - this.currentHeadEuler.y) * postureDamping;
    this.currentHeadEuler.z += (this.targetHeadEuler.z - this.currentHeadEuler.z) * postureDamping;

    const microYaw = Math.sin(elapsedTime * 0.6) * 0.012;
    const microPitch = Math.cos(elapsedTime * 0.8) * 0.008;

    const headNode = this.vrm.humanoid?.getNormalizedBoneNode('head');
    const neckNode = this.vrm.humanoid?.getNormalizedBoneNode('neck');

    if (headNode) {
      headNode.rotation.set(
        this.currentHeadEuler.x * 0.75 + microPitch,
        this.currentHeadEuler.y * 0.75 + microYaw,
        this.currentHeadEuler.z * 0.75
      );
    }
    if (neckNode) {
      neckNode.rotation.set(
        this.currentHeadEuler.x * 0.25,
        this.currentHeadEuler.y * 0.25,
        this.currentHeadEuler.z * 0.25
      );
    }

    // 4. Natural Rhythmic Blinking (smooth blendshape closure every 3.5 to 6.0s)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && !this.isBlinking) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.blinkTimer = 3.5 + Math.random() * 2.5;
    }

    if (this.isBlinking) {
      this.blinkProgress += dt * 8.0;
      if (this.blinkProgress >= Math.PI) {
        this.isBlinking = false;
        this.vrm.expressionManager?.setValue('blink', 0);
      } else {
        const blinkVal = Math.sin(this.blinkProgress);
        this.vrm.expressionManager?.setValue('blink', blinkVal);
      }
    }

    // 5. Emotional Expression Transition
    const moodLerp = Math.min(1.0, dt * 3.5);
    (['happy', 'angry', 'sad', 'relaxed'] as const).forEach((preset) => {
      const target = this.targetMoodWeights[preset] || 0;
      this.currentMoodWeights[preset] += (target - this.currentMoodWeights[preset]) * moodLerp;
      this.vrm?.expressionManager?.setValue(preset as VRMExpressionPresetName, this.currentMoodWeights[preset]);
    });

    // 6. Audio-Driven Phoneme-to-Viseme Speech Cadence
    if (this.isSpeaking) {
      if (this.speechTimer > 0) {
        this.speechTimer -= dt;
        if (this.speechTimer <= 0) {
          this.isSpeaking = false;
          this.setViseme('sil', 0);
        }
      }

      const syllable = Math.sin(elapsedTime * 14.0);
      const formant = Math.cos(elapsedTime * 8.5);

      if (syllable > 0.3) {
        if (formant > 0.2) {
          this.setViseme('aa', 0.75 * syllable);
        } else if (formant > -0.3) {
          this.setViseme('ee', 0.60 * syllable);
        } else {
          this.setViseme('oh', 0.70 * syllable);
        }
      } else if (syllable < -0.4) {
        this.setViseme('ou', 0.40);
      } else {
        this.setViseme('ih', 0.30);
      }
    }

    // Smooth Viseme Interpolation
    const visemeSpeed = Math.min(1.0, dt * 24.0);
    Object.keys(this.currentVisemes).forEach((vKey) => {
      const target = this.targetVisemes[vKey] || 0;
      this.currentVisemes[vKey] += (target - this.currentVisemes[vKey]) * visemeSpeed;
      this.vrm?.expressionManager?.setValue(vKey as VRMExpressionPresetName, this.currentVisemes[vKey]);
    });

    // 7. Update Ambient Particles
    this.updateParticles(dt, elapsedTime);

    // 8. Update VRM Runtime (MToon shaders, SpringBone physics)
    this.vrm.update(dt);
  }
}

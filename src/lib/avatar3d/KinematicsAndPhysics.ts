import * as THREE from 'three';
import { VisemeLipSyncEngine } from './VisemeLipSync';

export interface LookAtTarget {
  x: number;
  y: number;
  z: number;
}

export class KinematicsAndPhysicsEngine {
  private bones: Record<string, THREE.Bone>;
  private eyeLeft: THREE.Mesh;
  private eyeRight: THREE.Mesh;
  private visemeEngine: VisemeLipSyncEngine;

  // Head Look-At IK State
  private targetEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private currentHeadEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private currentNeckEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Eye Saccades State
  private saccadeTimer = 2.0;
  private currentEyeLook = new THREE.Vector2(0, 0);
  private targetEyeLook = new THREE.Vector2(0, 0);

  // Blinking State
  private blinkTimer = 3.5;
  private isBlinking = false;
  private blinkProgress = 0;

  // Secondary Spring Physics for Twintails & Drawstrings
  private hairLVelocity = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private hairRVelocity = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private stringLVelocity = [new THREE.Vector3(), new THREE.Vector3()];
  private stringRVelocity = [new THREE.Vector3(), new THREE.Vector3()];

  private prevHeadRot = new THREE.Quaternion();

  constructor(
    bones: Record<string, THREE.Bone>,
    eyeLeft: THREE.Mesh,
    eyeRight: THREE.Mesh,
    visemeEngine: VisemeLipSyncEngine
  ) {
    this.bones = bones;
    this.eyeLeft = eyeLeft;
    this.eyeRight = eyeRight;
    this.visemeEngine = visemeEngine;
  }

  /**
   * Sets the 3D look-at target (e.g., from mouse cursor or interactive focus)
   * Normalized screen coords: x in [-1, 1], y in [-1, 1]
   */
  public setLookAtNormalized(normX: number, normY: number): void {
    // Biomechanical anatomical limits:
    // Yaw: max ±35 degrees (0.61 rad)
    // Pitch: max ±20 degrees (0.35 rad)
    const yaw = -normX * 0.55;
    const pitch = -normY * 0.35;
    this.targetEuler.set(pitch, yaw, 0, 'YXZ');
  }

  /**
   * Frame update loop: Solves IK look-at, saccades, blinking, breathing, and secondary hair spring physics
   */
  public update(delta: number, elapsedTime: number): void {
    const dt = Math.min(0.1, delta);

    // 1. Rhythmic Breathing Idle (4.0s respiratory cycle)
    const breathCycle = Math.sin(elapsedTime * 1.57); // 2 * PI / 4.0s
    if (this.bones.Chest) {
      // Subtle chest expansion and lift
      this.bones.Chest.scale.set(
        1.0 + 0.015 * breathCycle,
        1.0 + 0.012 * breathCycle,
        1.0 + 0.02 * breathCycle
      );
      this.bones.Chest.rotation.x = 0.02 * breathCycle;
    }
    if (this.bones.Spine) {
      this.bones.Spine.rotation.x = 0.01 * breathCycle;
    }

    // 2. Head & Neck Look-At IK Solver (Damped Euler interpolation)
    const ikSpeed = 7.0; // Responsive natural damping
    const headFactor = 0.7; // Head carries 70% of rotation
    const neckFactor = 0.3; // Neck carries 30% of rotation

    // Idle micro-drift (subtle living subconscious motion)
    const microYaw = Math.sin(elapsedTime * 0.8) * 0.025;
    const microPitch = Math.cos(elapsedTime * 1.1) * 0.018;

    this.currentNeckEuler.y += (this.targetEuler.y * neckFactor + microYaw * 0.3 - this.currentNeckEuler.y) * ikSpeed * dt;
    this.currentNeckEuler.x += (this.targetEuler.x * neckFactor + microPitch * 0.3 - this.currentNeckEuler.x) * ikSpeed * dt;

    this.currentHeadEuler.y += (this.targetEuler.y * headFactor + microYaw * 0.7 - this.currentHeadEuler.y) * ikSpeed * dt;
    this.currentHeadEuler.x += (this.targetEuler.x * headFactor + microPitch * 0.7 - this.currentHeadEuler.x) * ikSpeed * dt;

    if (this.bones.Neck) {
      this.bones.Neck.rotation.set(this.currentNeckEuler.x, this.currentNeckEuler.y, 0);
    }
    if (this.bones.Head) {
      this.bones.Head.rotation.set(this.currentHeadEuler.x, this.currentHeadEuler.y, 0);
    }

    // 3. Autonomous Eye Saccades (Rapid subconscious eye darts)
    this.saccadeTimer -= dt;
    if (this.saccadeTimer <= 0) {
      // Pick next saccadic fixation point
      this.saccadeTimer = 1.2 + Math.random() * 2.5; // Every 1.2 to 3.7 seconds
      const saccadeMagnitude = Math.random() < 0.3 ? 0.12 : 0.04;
      this.targetEyeLook.set(
        (Math.random() - 0.5) * saccadeMagnitude,
        (Math.random() - 0.5) * (saccadeMagnitude * 0.6)
      );
    }
    // High-speed saccadic glide
    this.currentEyeLook.lerp(this.targetEyeLook, Math.min(1.0, dt * 18.0));

    if (this.eyeLeft && this.eyeRight) {
      this.eyeLeft.rotation.y = this.currentEyeLook.x - 0.1;
      this.eyeLeft.rotation.x = this.currentEyeLook.y;

      this.eyeRight.rotation.y = this.currentEyeLook.x + 0.1;
      this.eyeRight.rotation.x = this.currentEyeLook.y;
    }

    // 4. Natural Blinking Micro-Expressions (Poisson distribution, 2.5s - 5.5s)
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && !this.isBlinking) {
      this.isBlinking = true;
      this.blinkProgress = 0;
      this.blinkTimer = 2.5 + Math.random() * 3.0; // Reset next interval
    }

    if (this.isBlinking) {
      this.blinkProgress += dt * 8.5; // Fast blink (~140ms total)
      if (this.blinkProgress >= Math.PI) {
        this.isBlinking = false;
        this.visemeEngine.setDirectMorph('eyeBlinkLeft', 0);
        this.visemeEngine.setDirectMorph('eyeBlinkRight', 0);
      } else {
        // Smooth sine wave closure and opening
        const blinkWeight = Math.sin(this.blinkProgress);
        this.visemeEngine.setDirectMorph('eyeBlinkLeft', blinkWeight);
        this.visemeEngine.setDirectMorph('eyeBlinkRight', blinkWeight);
      }
    }

    // 5. Real-Time Secondary Physics: Twin-tail Hair Chains & Drawstrings
    // Compute head rotational angular delta for inertia
    if (this.bones.Head) {
      const curHeadRot = this.bones.Head.quaternion;
      const rotDelta = new THREE.Quaternion().copy(curHeadRot).multiply(this.prevHeadRot.clone().invert());
      this.prevHeadRot.copy(curHeadRot);

      // Spring damper parameters:
      const hairStiffness = 32.0;
      const hairDamping = 6.5;

      const hairBonesL = [this.bones.Hair_L_01, this.bones.Hair_L_02, this.bones.Hair_L_03];
      const hairBonesR = [this.bones.Hair_R_01, this.bones.Hair_R_02, this.bones.Hair_R_03];

      hairBonesL.forEach((bone, idx) => {
        if (!bone) return;
        const vel = this.hairLVelocity[idx];
        // Target rest rotation + momentum reaction to head yaw
        const targetZ = Math.sin(elapsedTime * 2.0 + idx) * 0.04 - this.currentHeadEuler.y * 0.25;
        const targetX = Math.cos(elapsedTime * 1.5 + idx) * 0.03 - this.currentHeadEuler.x * 0.2;

        const forceZ = (targetZ - bone.rotation.z) * hairStiffness;
        const forceX = (targetX - bone.rotation.x) * hairStiffness;

        vel.z = (vel.z + forceZ * dt) * Math.max(0, 1 - hairDamping * dt);
        vel.x = (vel.x + forceX * dt) * Math.max(0, 1 - hairDamping * dt);

        bone.rotation.z += vel.z * dt;
        bone.rotation.x += vel.x * dt;
      });

      hairBonesR.forEach((bone, idx) => {
        if (!bone) return;
        const vel = this.hairRVelocity[idx];
        const targetZ = -Math.sin(elapsedTime * 2.0 + idx) * 0.04 - this.currentHeadEuler.y * 0.25;
        const targetX = Math.cos(elapsedTime * 1.5 + idx) * 0.03 - this.currentHeadEuler.x * 0.2;

        const forceZ = (targetZ - bone.rotation.z) * hairStiffness;
        const forceX = (targetX - bone.rotation.x) * hairStiffness;

        vel.z = (vel.z + forceZ * dt) * Math.max(0, 1 - hairDamping * dt);
        vel.x = (vel.x + forceX * dt) * Math.max(0, 1 - hairDamping * dt);

        bone.rotation.z += vel.z * dt;
        bone.rotation.x += vel.x * dt;
      });

      // Drawstrings secondary motion
      const stringBones = [this.bones.String_L_01, this.bones.String_R_01];
      stringBones.forEach((bone, idx) => {
        if (!bone) return;
        const vel = idx === 0 ? this.stringLVelocity[0] : this.stringRVelocity[0];
        const targetX = Math.sin(elapsedTime * 2.2 + idx) * 0.05 - this.currentNeckEuler.x * 0.3;
        const forceX = (targetX - bone.rotation.x) * 45.0;
        vel.x = (vel.x + forceX * dt) * Math.max(0, 1 - 8.0 * dt);
        bone.rotation.x += vel.x * dt;
      });
    }
  }
}

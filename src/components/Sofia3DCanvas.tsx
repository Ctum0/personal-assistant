'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { VRMAvatarController } from '../lib/avatar3d/VRMAvatarController';
import { SofiaExpression } from '@/lib/types';

interface Sofia3DCanvasProps {
  expression?: SofiaExpression;
  isSpeaking?: boolean;
  dialogue?: string;
  onOpenVoiceModal?: () => void;
  audioRef?: React.RefObject<HTMLAudioElement | null>;
}

export default function Sofia3DCanvas({
  expression = 'focused',
  isSpeaking = false,
  dialogue = '',
  onOpenVoiceModal,
}: Sofia3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Engines & Controllers
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const vrmControllerRef = useRef<VRMAvatarController | null>(null);

  // Loading state
  const [loading, setLoading] = useState(true);

  // Keep live speaking ref for animation loop
  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // 1. Initialize Seamless Three.js Scene, Studio Lighting & VRM Controller
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = containerRef.current.clientWidth || 560;
    const height = containerRef.current.clientHeight || 560;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Cinematic Bust-Up / Waist-Up Camera
    // Focal length ~45mm (FOV 36°). Position: (0, 1.16, 1.88), lookAt: (0, 1.08, 0).
    // Provides generous vertical headroom (>30cm) so Sofia's hair, fox ears, and cowlick never clip at the top of the circle!
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 50);
    camera.position.set(0, 1.16, 1.88);
    camera.lookAt(0, 1.08, 0);
    cameraRef.current = camera;

    // 100% Transparent WebGL Renderer with ACES Filmic Tone Mapping
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82; // Mysterious, eye-friendly, velvet cinematic tone
    rendererRef.current = renderer;

    // Mysterious, Eye-Friendly Luxury Studio Lighting Setup
    // Soft Warm Ivory Key Light (calibrated intensity preserves facial details, eye gradients, and cheek blush)
    const keyLight = new THREE.DirectionalLight(0xfff0ea, 0.95);
    keyLight.position.set(1.0, 2.0, 1.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    // Moody Crimson-Rose Silhouette Rim Light (highlights hair silhouette without washing out face)
    const rimLight = new THREE.DirectionalLight(0xe11d48, 1.25);
    rimLight.position.set(-1.3, 1.8, -1.3);
    scene.add(rimLight);

    // Deep Nocturnal Wine Fill Light (soft shadow illumination)
    const fillLight = new THREE.DirectionalLight(0x881337, 0.35);
    fillLight.position.set(-0.8, 1.0, 1.2);
    scene.add(fillLight);

    // Subtle Overhead Sky Warmth & Velvet Shadow Base
    const hemiLight = new THREE.HemisphereLight(0xfecdd3, 0x050103, 0.35);
    scene.add(hemiLight);

    // Load High-Fidelity VRM Digital Human
    const vrmController = new VRMAvatarController();
    vrmControllerRef.current = vrmController;

    vrmController.load(scene, {
      modelUrl: '/models/sofia.vrm',
      onLoaded: () => {
        setLoading(false);
        vrmController.setMood(expression);
      },
      onError: (err) => {
        console.error('Error loading VRM:', err);
        setLoading(false);
      },
    });

    // Window Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Autonomous Life & Gesture Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = clock.getDelta();

      // Update Autonomous VRM (breathing, gestures, slerp, micro-shifts, particles)
      vrmController.update(delta);

      // Render Scene
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
    };
  }, []);

  // 2. React to speaking state changes
  useEffect(() => {
    if (!vrmControllerRef.current) return;
    if (isSpeaking) {
      vrmControllerRef.current.triggerSpeechCadence(5.0);
    } else {
      vrmControllerRef.current.stopSpeech();
    }
  }, [isSpeaking]);

  // 3. React to brain emotional state changes
  useEffect(() => {
    if (!vrmControllerRef.current) return;
    vrmControllerRef.current.setMood(expression);
  }, [expression]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center overflow-visible select-none pointer-events-none"
    >
      {/* 3D WebGL Canvas — 100% transparent, seamlessly rendered in center dais */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block relative z-10"
        aria-label="Sofia — Autonomous 3D Digital Companion"
      />

      {/* Discreet Minimal Loading Indicator */}
      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center space-y-2 pointer-events-none">
          <div className="w-8 h-8 rounded-full border-2 border-rose-500/20 border-t-rose-400 animate-spin" />
          <span className="text-[10px] font-mono tracking-widest text-rose-300/80 uppercase">
            Sofia Initializing...
          </span>
        </div>
      )}
    </div>
  );
}

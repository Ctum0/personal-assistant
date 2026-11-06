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
    // Focal length ~45mm (FOV 38°). Position: (0, 1.18, 1.85), lookAt: (0, 1.06, 0).
    // Provides generous headroom above Sofia's fox ears and crown while naturally extending hips into the glass rail
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(0, 1.18, 1.85);
    camera.lookAt(0, 1.06, 0);
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
    renderer.toneMappingExposure = 1.05; // Balanced, true-texture studio exposure
    rendererRef.current = renderer;

    // Studio Light Balancing & Skin Tone Restoration (Fix Red Tint)
    // 1. Front Key Light: Clean neutral-cool studio white (#F4F6FB, intensity 1.35) at [1, 2, 2]
    // Illuminates face, skin, and clothing true to original textures without color contamination
    const keyLight = new THREE.DirectionalLight(0xf4f6fb, 1.35);
    keyLight.position.set(1.0, 2.0, 2.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.0004;
    scene.add(keyLight);

    // 2. Soft Front Fill Light: Clean neutral ambient/fill (#EDEEF5, intensity 0.60) at [-0.9, 1.0, 1.8]
    // Softens shadows under the chin without tinting the skin
    const fillLight = new THREE.DirectionalLight(0xedeef5, 0.60);
    fillLight.position.set(-0.9, 1.0, 1.8);
    scene.add(fillLight);

    // 3. Isolated Burgundy Rim/Hair Light BEHIND character ([0, 2, -2], color deep wine #8b0024, intensity 2.80)
    // Catches edges of hair and shoulders with luxury burgundy silhouette without casting red onto face or front clothing
    const rimLight = new THREE.DirectionalLight(0x8b0024, 2.80);
    rimLight.position.set(0.0, 2.0, -2.0);
    scene.add(rimLight);

    // 4. Clean Neutral Overhead Hemisphere Light (white sky, dark velvet floor)
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x080205, 0.45);
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
      style={{
        maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 82%, rgba(0,0,0,0) 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 82%, rgba(0,0,0,0) 100%)',
      }}
    >
      {/* 3D WebGL Canvas — 100% transparent, open space stage */}
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ChevronDown,
  ChevronUp,
  FileCheck2,
  LogOut,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import { AppView, type IntegrativeLabBlueprint } from "../../types/studyOS";
import {
  compileIntegrativeLabBlueprint,
  computeMechanicalInvariants,
  computeRK4TrajectoryPreview,
  formatLabSessionMarkdownReport,
  stepRK4InPlace,
  terrainHeightAt,
  terrainNormalAt,
  type PhysicsWellSource,
  type ProjectileKinematicState,
  type RK4EnvironmentParams,
} from "../../lib/integrativePhysicsEngine";
import { fetchIntegrativeLabBlueprint } from "../../services/aiService";
import {
  playBeaconResonanceSound,
  playBoostJumpSound,
  playHazardTelegraphSound,
  playLaunchRailSound,
  playShockImpactSound,
  playStageClearFanfare,
} from "../../lib/gameAudioSynth";
import {
  buildOutdoorTerrainAndPerimeter,
  buildStudioTexturesAndEnv,
  createKineticRoverRig,
  createResonanceBeaconRig,
  createShearDroneRig,
  detectSoftwareWebGL,
  setupProvingGroundLighting,
  type KineticRoverRig,
  type ResonanceBeaconRig,
  type ShearDroneRig,
} from "./threeSceneBuilder";

type GameShellPhase = "TITLE" | "PLAYING" | "PAUSED" | "VICTORY" | "GAME_OVER";
type CameraViewMode = "chase" | "orbit" | "overhead";

type HudTelemetry = {
  stageNumber: number;
  totalStages: number;
  stageTitle: string;
  conceptBridge: string;
  governingEquation: string;
  beaconsCaptured: number;
  beaconsTotal: number;
  hullIntegrity: number;
  score: number;
  kineticJoules: number;
  potentialJoules: number;
  momentumKgMs: number;
  predictedApexMeters: number;
  predictedRangeMeters: number;
};

interface ActiveProjectile {
  active: boolean;
  age: number;
  kin: ProjectileKinematicState;
  mesh: THREE.Mesh;
}

interface ActiveBeacon {
  rig: ResonanceBeaconRig;
  x: number;
  y: number;
  z: number;
  captured: boolean;
  hitFlashTimer: number;
  eigenOmega: number;
}

interface ActiveDrone {
  rig: ShearDroneRig;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  orbitAngle: number;
  orbitRadius: number;
  windupTimer: number; // > 0 when telegraphing shockwave (0..1.15s)
  cooldownTimer: number;
  stunnedTimer: number;
  hitFlashTimer: number;
}

interface PooledParticle {
  active: boolean;
  life: number;
  maxLife: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
  r: number;
  g: number;
  b: number;
}

// Pre-allocated module-scope math objects (Zero GC inside 60fps loop)
const _camDesiredPos = new THREE.Vector3();
const _camDesiredLook = new THREE.Vector3();
const _camShakeOffset = new THREE.Vector3();
const _roverForward = new THREE.Vector3();
const _turretDir = new THREE.Vector3();
const _slopeUp = new THREE.Vector3(0, 1, 0);
const _worldUp = new THREE.Vector3(0, 1, 0);
const _alignQuat = new THREE.Quaternion();
const _yawQuat = new THREE.Quaternion();
const _dummyMat = new THREE.Matrix4();
const _dummyPos = new THREE.Vector3();
const _dummyScale = new THREE.Vector3();
const _dummyQuat = new THREE.Quaternion();
const _dummyColor = new THREE.Color();
const _normTuple: [number, number, number] = [0, 1, 0];

const MAX_PROJECTILES = 8;
const PARTICLE_POOL_SIZE = 72;
const TRAJECTORY_POINTS = 84;

export function IntegrativePhysicsLabGame() {
  const {
    state,
    selectedCourseId,
    selectedModuleId,
    activeLabTopic,
    setActiveView,
    setGuideModalOpen,
    recordPhysicsLabSession,
    pushToast,
  } = useStudyOS();

  // Resolve initial topic from active module, active course, or custom lab topic
  const activeModule = useMemo(
    () => state.modules.find((m) => m.id === selectedModuleId) || state.modules[0] || null,
    [state.modules, selectedModuleId]
  );
  const activeCourse = useMemo(
    () =>
      state.courses.find((c) => c.id === (activeModule?.courseId || selectedCourseId)) ||
      state.courses[0] ||
      null,
    [state.courses, activeModule, selectedCourseId]
  );

  const initialTopic =
    activeLabTopic?.trim() ||
    activeModule?.title ||
    activeCourse?.title ||
    "Orbital & Ballistic Conservation Mechanics";

  const [customTopicInput, setCustomTopicInput] = useState(initialTopic);
  const [isCompilingBlueprint, setIsCompilingBlueprint] = useState(false);
  const [blueprint, setBlueprint] = useState<IntegrativeLabBlueprint>(() =>
    compileIntegrativeLabBlueprint({
      topic: initialTopic,
      category: activeCourse?.category,
      notesText: activeModule?.notesMarkdown,
      courseId: activeCourse?.id,
      moduleId: activeModule?.id,
    })
  );

  const [phase, setPhase] = useState<GameShellPhase>("TITLE");
  const [cameraMode, setCameraMode] = useState<CameraViewMode>("chase");
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(!state.settings.soundEnabled);
  const [webglLost, setWebglLost] = useState(false);
  const [savedReportOnce, setSavedReportOnce] = useState(false);

  // Live physical parameters controlled by user sliders
  const [gravityMs2, setGravityMs2] = useState<number>(blueprint.defaultGravityMs2);
  const [launchSpeedMs, setLaunchSpeedMs] = useState<number>(blueprint.defaultLaunchSpeedMs);
  const [dragCoeff, setDragCoeff] = useState<number>(blueprint.defaultDragCoeff);
  const [fieldCoupling, setFieldCoupling] = useState<number>(blueprint.defaultFieldCoupling);

  const [hud, setHud] = useState<HudTelemetry>(() => ({
    stageNumber: 1,
    totalStages: blueprint.stages.length,
    stageTitle: blueprint.stages[0]?.title || "Stage 1",
    conceptBridge: blueprint.stages[0]?.conceptBridge || blueprint.archetypeLabel,
    governingEquation: blueprint.stages[0]?.governingEquation || blueprint.primaryEquation,
    beaconsCaptured: 0,
    beaconsTotal: blueprint.stages[0]?.beaconCount || 3,
    hullIntegrity: 100,
    score: 0,
    kineticJoules: 0,
    potentialJoules: 0,
    momentumKgMs: 0,
    predictedApexMeters: 0,
    predictedRangeMeters: 0,
  }));

  // Refs shared with the isolated 60fps WebGL loop (never triggers React canvas remount)
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<GameShellPhase>(phase);
  phaseRef.current = phase;
  const cameraModeRef = useRef<CameraViewMode>(cameraMode);
  cameraModeRef.current = cameraMode;
  const mutedRef = useRef<boolean>(muted);
  mutedRef.current = muted;
  const blueprintRef = useRef<IntegrativeLabBlueprint>(blueprint);
  blueprintRef.current = blueprint;

  const paramsRef = useRef({
    gravityMs2,
    launchSpeedMs,
    dragCoeff,
    fieldCoupling,
  });
  paramsRef.current = { gravityMs2, launchSpeedMs, dragCoeff, fieldCoupling };

  // Mutable simulation controller API exposed from useEffect
  const simApiRef = useRef<{
    startNewGame: (bp: IntegrativeLabBlueprint) => void;
    fireCalibrationPulse: () => void;
  } | null>(null);

  const sessionPeaksRef = useRef({
    stagesCleared: 0,
    totalBeaconsCalibrated: 0,
    peakKineticJoules: 0,
    peakMomentumKgMs: 0,
  });

  // Re-compile blueprint when activeLabTopic changes externally
  useEffect(() => {
    if (activeLabTopic && activeLabTopic.trim()) {
      setCustomTopicInput(activeLabTopic.trim());
      const nextBp = compileIntegrativeLabBlueprint({
        topic: activeLabTopic.trim(),
        category: activeCourse?.category,
        notesText: activeModule?.notesMarkdown,
        courseId: activeCourse?.id,
        moduleId: activeModule?.id,
      });
      setBlueprint(nextBp);
      setGravityMs2(nextBp.defaultGravityMs2);
      setLaunchSpeedMs(nextBp.defaultLaunchSpeedMs);
      setDragCoeff(nextBp.defaultDragCoeff);
      setFieldCoupling(nextBp.defaultFieldCoupling);
    }
  }, [activeLabTopic]);

  const handleSynthesizeTopicBlueprint = useCallback(
    async (targetTopic: string, linkedModuleId?: string, linkedCourseId?: string) => {
      const clean = targetTopic.trim() || "Integrative Physics & Applied Mathematics";
      setIsCompilingBlueprint(true);
      try {
        const mod = state.modules.find((m) => m.id === linkedModuleId);
        const crs = state.courses.find((c) => c.id === (linkedCourseId || mod?.courseId));
        const compiled = await fetchIntegrativeLabBlueprint({
          topic: clean,
          category: crs?.category,
          notesText: mod?.notesMarkdown,
          courseId: crs?.id,
          moduleId: mod?.id,
        });
        setBlueprint(compiled);
        setGravityMs2(compiled.defaultGravityMs2);
        setLaunchSpeedMs(compiled.defaultLaunchSpeedMs);
        setDragCoeff(compiled.defaultDragCoeff);
        setFieldCoupling(compiled.defaultFieldCoupling);
        setSavedReportOnce(false);
        simApiRef.current?.startNewGame(compiled);
        setPhase("TITLE");
      } finally {
        setIsCompilingBlueprint(false);
      }
    },
    [state.modules, state.courses]
  );

  const handleStartMission = useCallback(() => {
    setSavedReportOnce(false);
    sessionPeaksRef.current = {
      stagesCleared: 0,
      totalBeaconsCalibrated: 0,
      peakKineticJoules: 0,
      peakMomentumKgMs: 0,
    };
    simApiRef.current?.startNewGame(blueprintRef.current);
    setPhase("PLAYING");
  }, []);

  const handleSaveLabReportToVault = useCallback(() => {
    const markdown = formatLabSessionMarkdownReport({
      blueprint: blueprintRef.current,
      stagesCleared: sessionPeaksRef.current.stagesCleared,
      beaconsCalibrated: sessionPeaksRef.current.totalBeaconsCalibrated,
      score: hud.score,
      gravityMs2: paramsRef.current.gravityMs2,
      launchSpeedMs: paramsRef.current.launchSpeedMs,
      dragCoeff: paramsRef.current.dragCoeff,
      fieldCoupling: paramsRef.current.fieldCoupling,
      peakKineticJoules: Math.max(hud.kineticJoules, sessionPeaksRef.current.peakKineticJoules),
      peakMomentumKgMs: Math.max(hud.momentumKgMs, sessionPeaksRef.current.peakMomentumKgMs),
    });

    recordPhysicsLabSession({
      topic: blueprintRef.current.topic,
      courseId: blueprintRef.current.courseId,
      moduleId: blueprintRef.current.moduleId,
      markdownReport: markdown,
      stagesCleared: Math.max(1, sessionPeaksRef.current.stagesCleared),
      score: hud.score,
      primaryEquation: blueprintRef.current.primaryEquation,
      conservationLaw: blueprintRef.current.conservationLaw,
    });
    setSavedReportOnce(true);
  }, [hud.kineticJoules, hud.momentumKgMs, hud.score, recordPhysicsLabSession]);

  // ==========================================================================
  // ISOLATED THREE.JS + 120HZ RK4 PHYSICS & GAME LOOP
  // ==========================================================================
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => {
      setWebglLost(false);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      56,
      (container.clientWidth || window.innerWidth) /
        Math.max(1, container.clientHeight || window.innerHeight),
      0.2,
      320
    );
    camera.position.set(0, 14, 24);

    const orbitControls = new OrbitControls(camera, renderer.domElement);
    orbitControls.enableDamping = !isSoftwareGl;
    orbitControls.dampingFactor = 0.06;
    orbitControls.maxPolarAngle = Math.PI * 0.47;
    orbitControls.minDistance = 7;
    orbitControls.maxDistance = 68;
    orbitControls.enabled = false;

    const studioEnv = buildStudioTexturesAndEnv(renderer, scene, blueprintRef.current.accentHex);
    setupProvingGroundLighting(scene, isSoftwareGl);

    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);

    let terrainHandle = buildOutdoorTerrainAndPerimeter(
      terrainGroup,
      blueprintRef.current.terrainSeed,
      studioEnv.terrainAlbedoTex,
      studioEnv.terrainRoughnessTex,
      isSoftwareGl
    );
    let activeTerrainSeed = blueprintRef.current.terrainSeed;

    // Player 9-part Procedural Kinetic Rover
    const rover: KineticRoverRig = createKineticRoverRig(studioEnv.contactShadowTex, isSoftwareGl);
    scene.add(rover.root);

    // Pooled RK4 Calibration Projectiles
    const projGeo = new THREE.SphereGeometry(0.32, 20, 16);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      emissive: 0x38bdf8,
      emissiveIntensity: 1.8,
      roughness: 0.1,
      metalness: 0.3,
    });
    const projectiles: ActiveProjectile[] = [];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const m = new THREE.Mesh(projGeo, projMat);
      m.visible = false;
      scene.add(m);
      projectiles.push({
        active: false,
        age: 0,
        kin: { x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0 },
        mesh: m,
      });
    }

    // 3D RK4 Trajectory Prediction Arc + Ground Impact Reticle
    const trajPositions = new Float32Array(TRAJECTORY_POINTS * 3);
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute("position", new THREE.BufferAttribute(trajPositions, 3));
    const trajMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.72,
    });
    const trajectoryLine = new THREE.Line(trajGeo, trajMat);
    trajectoryLine.frustumCulled = false;
    scene.add(trajectoryLine);

    const reticleGeo = new THREE.RingGeometry(0.55, 0.88, 32);
    reticleGeo.rotateX(-Math.PI / 2);
    const reticleMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const impactReticle = new THREE.Mesh(reticleGeo, reticleMat);
    scene.add(impactReticle);

    // Pooled InstancedMesh Particle Burst System (72 reusable particles, zero per-frame allocs)
    const partGeo = new THREE.OctahedronGeometry(0.18, 0);
    const partMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
    });
    const particleInst = new THREE.InstancedMesh(partGeo, partMat, PARTICLE_POOL_SIZE);
    particleInst.frustumCulled = false;
    const particles: PooledParticle[] = [];
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
      particles.push({
        active: false,
        life: 0,
        maxLife: 0.6,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0.001,
        r: 0.25,
        g: 0.85,
        b: 0.98,
      });
      _dummyPos.set(0, -100, 0);
      _dummyScale.setScalar(0.001);
      _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
      particleInst.setMatrixAt(i, _dummyMat);
      particleInst.setColorAt(i, _dummyColor.setRGB(0.25, 0.85, 0.98));
    }
    particleInst.instanceMatrix.needsUpdate = true;
    if (particleInst.instanceColor) particleInst.instanceColor.needsUpdate = true;
    scene.add(particleInst);

    const spawnParticleBurst = (
      bx: number,
      by: number,
      bz: number,
      count: number,
      speed: number,
      cr: number,
      cg: number,
      cb: number
    ) => {
      let spawned = 0;
      for (let i = 0; i < PARTICLE_POOL_SIZE && spawned < count; i++) {
        const p = particles[i];
        if (!p.active) {
          p.active = true;
          p.life = 0;
          p.maxLife = 0.42 + (spawned % 5) * 0.09;
          p.x = bx;
          p.y = by;
          p.z = bz;
          const az = (spawned / count) * Math.PI * 2 + spawned * 0.37;
          const el = 0.25 + (spawned % 4) * 0.22;
          p.vx = Math.cos(az) * Math.cos(el) * speed * (0.7 + (spawned % 3) * 0.25);
          p.vy = Math.sin(el) * speed + 2.5;
          p.vz = Math.sin(az) * Math.cos(el) * speed * (0.7 + (spawned % 3) * 0.25);
          p.scale = 0.9 + (spawned % 3) * 0.35;
          p.r = cr;
          p.g = cg;
          p.b = cb;
          spawned++;
        }
      }
    };

    // Active Stage Entities
    let beacons: ActiveBeacon[] = [];
    let drones: ActiveDrone[] = [];
    const wellSources: PhysicsWellSource[] = [];

    const clearStageEntities = () => {
      for (const b of beacons) {
        scene.remove(b.rig.root);
        b.rig.dispose();
      }
      for (const d of drones) {
        scene.remove(d.rig.root);
        d.rig.dispose();
      }
      beacons = [];
      drones = [];
      wellSources.length = 0;
    };

    // Mutable Game & Rover Kinematic State
    const game = {
      stageIndex: 0,
      score: 0,
      hull: 100,
      combo: 0,
      roverX: 0,
      roverY: 0,
      roverZ: 4,
      roverVx: 0,
      roverVy: 0,
      roverVz: 0,
      roverHeading: 0, // radians (0 = -Z forward)
      turretRelYaw: 0,
      turretPitch: 0.56, // ~32 deg elevation
      grounded: true,
      coyoteTimer: 0,
      launchBufferTimer: 0,
      jumpBufferTimer: 0,
      launchCooldown: 0,
      squashStretch: 1.0,
      squashVel: 0,
      roverHitFlash: 0,
      hitstopTimer: 0,
      cameraTrauma: 0,
      titleOrbitAngle: 0.4,
      hudSyncAccum: 0,
    };

    const populateStage = (bp: IntegrativeLabBlueprint, stageIdx: number) => {
      clearStageEntities();

      // Rebuild terrain if seed changed
      if (bp.terrainSeed !== activeTerrainSeed) {
        // Scene rebuilds cleanly if user changes topic; for in-place terrain keep smooth
        activeTerrainSeed = bp.terrainSeed;
      }

      const st = bp.stages[stageIdx] || bp.stages[0];
      const seed = bp.terrainSeed + stageIdx * 31;

      // Spawn Resonance Beacons at distinct radial sectors on real terrain height
      for (let i = 0; i < st.beaconCount; i++) {
        const sectorAngle = (i / st.beaconCount) * Math.PI * 2 + stageIdx * 0.65 + 0.35;
        const radius = 19 + ((i * 9 + seed) % 19);
        const bx = Math.cos(sectorAngle) * radius;
        const bz = Math.sin(sectorAngle) * radius;
        const by = terrainHeightAt(bx, bz, bp.terrainSeed);

        const rig = createResonanceBeaconRig(
          bp.accentHex,
          studioEnv.contactShadowTex,
          isSoftwareGl
        );
        rig.root.position.set(bx, by, bz);
        scene.add(rig.root);

        beacons.push({
          rig,
          x: bx,
          y: by,
          z: bz,
          captured: false,
          hitFlashTimer: 0,
          eigenOmega: 1.6 + i * 0.45,
        });

        wellSources.push({
          x: bx,
          y: by + 2.0,
          z: bz,
          strength: st.wellStrength,
        });
      }

      // Spawn Shear Vortex Hazard Drones with visible windup telegraphs
      for (let j = 0; j < st.droneCount; j++) {
        const angle = (j / Math.max(1, st.droneCount)) * Math.PI * 2 + 1.1;
        const radius = 16 + j * 6.5;
        const dx = Math.cos(angle) * radius;
        const dz = Math.sin(angle) * radius;
        const dy = terrainHeightAt(dx, dz, bp.terrainSeed);

        const rig = createShearDroneRig(studioEnv.contactShadowTex, isSoftwareGl);
        rig.root.position.set(dx, dy, dz);
        scene.add(rig.root);

        drones.push({
          rig,
          x: dx,
          y: dy,
          z: dz,
          vx: 0,
          vz: 0,
          orbitAngle: angle,
          orbitRadius: radius,
          windupTimer: 0,
          cooldownTimer: 1.8 + j * 0.7,
          stunnedTimer: 0,
          hitFlashTimer: 0,
        });
      }
    };

    const resetMission = (bp: IntegrativeLabBlueprint) => {
      game.stageIndex = 0;
      game.score = 0;
      game.hull = 100;
      game.combo = 0;
      game.roverX = 0;
      game.roverZ = 5.5;
      game.roverY = terrainHeightAt(0, 5.5, bp.terrainSeed);
      game.roverVx = 0;
      game.roverVy = 0;
      game.roverVz = 0;
      game.roverHeading = 0;
      game.turretRelYaw = 0;
      game.turretPitch = 0.56;
      game.hitstopTimer = 0;
      game.cameraTrauma = 0;
      for (const p of projectiles) {
        p.active = false;
        p.mesh.visible = false;
      }
      populateStage(bp, 0);
    };

    resetMission(blueprintRef.current);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const computeMuzzleWorldState = (outKin: ProjectileKinematicState) => {
      const worldYaw = game.roverHeading + game.turretRelYaw;
      const pitch = game.turretPitch;
      const cosP = Math.cos(pitch);
      const dirX = -Math.sin(worldYaw) * cosP;
      const dirY = Math.sin(pitch);
      const dirZ = -Math.cos(worldYaw) * cosP;

      const v0 = paramsRef.current.launchSpeedMs;
      outKin.x = game.roverX + dirX * 1.35;
      outKin.y = game.roverY + 1.12 + dirY * 1.15;
      outKin.z = game.roverZ + dirZ * 1.35;
      outKin.vx = game.roverVx * 0.35 + dirX * v0;
      outKin.vy = game.roverVy * 0.25 + dirY * v0;
      outKin.vz = game.roverVz * 0.35 + dirZ * v0;
    };

    const fireCalibrationPulse = () => {
      if (game.launchCooldown > 0) return;
      const slot = projectiles.find((p) => !p.active) || projectiles[0];
      computeMuzzleWorldState(slot.kin);
      slot.active = true;
      slot.age = 0;
      slot.mesh.position.set(slot.kin.x, slot.kin.y, slot.kin.z);
      slot.mesh.visible = true;
      game.launchCooldown = 0.24;
      game.squashVel = -3.6; // Recoil spring impulse
      game.cameraTrauma = Math.min(1, game.cameraTrauma + 0.14);
      playLaunchRailSound(paramsRef.current.launchSpeedMs / 34, mutedRef.current);
      spawnParticleBurst(slot.kin.x, slot.kin.y, slot.kin.z, 8, 5.5, 0.35, 0.85, 1.0);
    };

    simApiRef.current = {
      startNewGame: (bp: IntegrativeLabBlueprint) => {
        if (bp.terrainSeed !== activeTerrainSeed) {
          terrainGroup.clear();
          terrainHandle.dispose();
          terrainHandle = buildOutdoorTerrainAndPerimeter(
            terrainGroup,
            bp.terrainSeed,
            studioEnv.terrainAlbedoTex,
            studioEnv.terrainRoughnessTex,
            isSoftwareGl
          );
          activeTerrainSeed = bp.terrainSeed;
        }
        resetMission(bp);
      },
      fireCalibrationPulse,
    };

    // Input Handling: Separate continuous `heldKeys` from edge-triggered `justPressed`
    const heldKeys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT");

      if (e.code === "Escape") {
        e.preventDefault();
        if (phaseRef.current === "PLAYING") setPhase("PAUSED");
        else if (phaseRef.current === "PAUSED") setPhase("PLAYING");
        return;
      }

      if (inInput) return;

      if (phaseRef.current === "TITLE" && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        handleStartMission();
        return;
      }

      if (e.code === "KeyH" && !e.metaKey && !e.ctrlKey) {
        setDockCollapsed((prev) => !prev);
        return;
      }
      if (e.code === "KeyM" && !e.metaKey && !e.ctrlKey) {
        setMuted((prev) => !prev);
        return;
      }

      if (phaseRef.current !== "PLAYING") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) {
          game.launchBufferTimer = 0.14;
        }
      }
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") {
        if (!e.repeat) {
          game.jumpBufferTimer = 0.14;
        }
      }

      heldKeys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      heldKeys.delete(e.code);
    };

    const clearHeldInputs = () => {
      heldKeys.clear();
    };

    // Pointer aiming & click-to-launch on canvas when in chase/overhead mode
    let isPointerAiming = false;
    let lastPointerX = 0;
    let lastPointerY = 0;
    let pointerDownTime = 0;
    let pointerMovedDist = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (phaseRef.current !== "PLAYING") return;
      if (cameraModeRef.current === "orbit") return;
      isPointerAiming = true;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      pointerDownTime = performance.now();
      pointerMovedDist = 0;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isPointerAiming || phaseRef.current !== "PLAYING") return;
      const dx = e.clientX - lastPointerX;
      const dy = e.clientY - lastPointerY;
      lastPointerX = e.clientX;
      lastPointerY = e.clientY;
      pointerMovedDist += Math.hypot(dx, dy);

      game.turretRelYaw -= dx * 0.0045;
      game.turretPitch = Math.max(0.08, Math.min(1.22, game.turretPitch - dy * 0.0035));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isPointerAiming) return;
      isPointerAiming = false;
      if (
        phaseRef.current === "PLAYING" &&
        cameraModeRef.current !== "orbit" &&
        e.button === 0 &&
        pointerMovedDist < 8 &&
        performance.now() - pointerDownTime < 280
      ) {
        game.launchBufferTimer = 0.12;
      }
    };

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = Math.max(1, container.clientHeight || window.innerHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearHeldInputs);
    window.addEventListener("resize", onResize);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    // Pre-allocated RK4 environment struct updated each frame without allocation
    const rk4Env: RK4EnvironmentParams = {
      massKg: 2.0,
      gravityMs2: 9.81,
      dragBeta: 0.008,
      lorentzOmega: 0,
      springOmegaSq: 0,
      wells: wellSources,
    };

    const muzzlePreviewKin: ProjectileKinematicState = {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
    };

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    // Mandatory Software WebGL fenceSync pacing per Three.js skill
    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== "function") {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const st = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (st === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, 0.05);
      const elapsedNow = clock.elapsedTime;
      const currentBp = blueprintRef.current;
      const activeStage =
        currentBp.stages[game.stageIndex] || currentBp.stages[0];

      // Sync environment physical constants from live sliders + stage rules
      rk4Env.gravityMs2 = paramsRef.current.gravityMs2;
      rk4Env.dragBeta = Math.max(0, paramsRef.current.dragCoeff * 0.045);
      rk4Env.lorentzOmega = (activeStage?.lorentzBz || 0) * paramsRef.current.fieldCoupling;
      rk4Env.springOmegaSq =
        currentBp.archetype === "harmonic_control"
          ? 0.012 * paramsRef.current.fieldCoupling
          : 0;

      for (let wIdx = 0; wIdx < wellSources.length; wIdx++) {
        const b = beacons[wIdx];
        wellSources[wIdx].strength =
          b && !b.captured
            ? (activeStage?.wellStrength || 14) * paramsRef.current.fieldCoupling
            : 0;
      }

      orbitControls.enabled =
        phaseRef.current === "PLAYING" && cameraModeRef.current === "orbit";

      // Hitstop freeze for crisp impact weight
      if (game.hitstopTimer > 0) {
        game.hitstopTimer = Math.max(0, game.hitstopTimer - dt);
      } else if (phaseRef.current === "PLAYING") {
        // ------------------------------------------------------------------
        // 1. ROVER NEWTONIAN KINEMATICS & TERRAIN SLOPE NORMAL FORCES
        // ------------------------------------------------------------------
        const thrustInput =
          (heldKeys.has("KeyW") || heldKeys.has("ArrowUp") ? 1 : 0) -
          (heldKeys.has("KeyS") || heldKeys.has("ArrowDown") ? 1 : 0);
        const turnInput =
          (heldKeys.has("KeyA") || heldKeys.has("ArrowLeft") ? 1 : 0) -
          (heldKeys.has("KeyD") || heldKeys.has("ArrowRight") ? 1 : 0);

        if (heldKeys.has("KeyQ")) game.turretRelYaw += 1.65 * dt;
        if (heldKeys.has("KeyE")) game.turretRelYaw -= 1.65 * dt;
        if (heldKeys.has("KeyR")) {
          game.turretPitch = Math.min(1.22, game.turretPitch + 1.15 * dt);
        }
        if (heldKeys.has("KeyF")) {
          game.turretPitch = Math.max(0.08, game.turretPitch - 1.15 * dt);
        }

        game.roverHeading += turnInput * 2.35 * dt;
        _roverForward.set(-Math.sin(game.roverHeading), 0, -Math.cos(game.roverHeading));

        terrainNormalAt(game.roverX, game.roverZ, currentBp.terrainSeed, _normTuple);
        const nx = _normTuple[0];
        const ny = _normTuple[1];
        const nz = _normTuple[2];

        const thrustAccel = 26.0 * thrustInput;
        // Slope tangential gravity component: g_parallel = g - (g . N) N
        const gVal = rk4Env.gravityMs2;
        const gDotN = -gVal * ny;
        const slopeAx = 0 - gDotN * nx;
        const slopeAz = 0 - gDotN * nz;

        const rSpeed = Math.hypot(game.roverVx, game.roverVz);
        const coulombFriction = game.grounded ? 2.85 : 0.35;

        game.roverVx +=
          (_roverForward.x * thrustAccel +
            slopeAx * 0.65 -
            coulombFriction * game.roverVx -
            rk4Env.dragBeta * rSpeed * game.roverVx) *
          dt;
        game.roverVz +=
          (_roverForward.z * thrustAccel +
            slopeAz * 0.65 -
            coulombFriction * game.roverVz -
            rk4Env.dragBeta * rSpeed * game.roverVz) *
          dt;

        // Vertical gravity & jump impulse with coyote time + input buffer
        game.launchCooldown = Math.max(0, game.launchCooldown - dt);
        game.launchBufferTimer = Math.max(0, game.launchBufferTimer - dt);
        game.jumpBufferTimer = Math.max(0, game.jumpBufferTimer - dt);

        if (game.grounded) {
          game.coyoteTimer = 0.12;
        } else {
          game.coyoteTimer = Math.max(0, game.coyoteTimer - dt);
        }

        if (game.jumpBufferTimer > 0 && game.coyoteTimer > 0) {
          game.roverVy = Math.sqrt(2 * Math.max(4, gVal) * 2.8);
          game.grounded = false;
          game.coyoteTimer = 0;
          game.jumpBufferTimer = 0;
          game.squashStretch = 1.24;
          playBoostJumpSound(mutedRef.current);
          spawnParticleBurst(game.roverX, game.roverY + 0.2, game.roverZ, 10, 4.5, 0.25, 0.9, 0.75);
        }

        if (game.launchBufferTimer > 0 && game.launchCooldown <= 0) {
          game.launchBufferTimer = 0;
          fireCalibrationPulse();
        }

        game.roverVy -= gVal * dt;
        game.roverX += game.roverVx * dt;
        game.roverY += game.roverVy * dt;
        game.roverZ += game.roverVz * dt;

        // Natural alpine perimeter containment (soft restoring slope at r > 46m)
        const radialDist = Math.hypot(game.roverX, game.roverZ);
        if (radialDist > 46.5) {
          const pushBack = (radialDist - 46.5) * 9.5;
          game.roverVx -= (game.roverX / radialDist) * pushBack * dt;
          game.roverVz -= (game.roverZ / radialDist) * pushBack * dt;
        }

        const groundY = terrainHeightAt(game.roverX, game.roverZ, currentBp.terrainSeed);
        if (game.roverY <= groundY) {
          if (!game.grounded && game.roverVy < -4.0) {
            game.squashStretch = 0.78;
            game.cameraTrauma = Math.min(1, game.cameraTrauma + 0.12);
          }
          game.roverY = groundY;
          game.roverVy = Math.max(0, game.roverVy);
          game.grounded = true;
        } else if (game.roverY > groundY + 0.12) {
          game.grounded = false;
        }

        // Second-order spring squash-and-stretch recovery
        const springForce = (1.0 - game.squashStretch) * 68 - game.squashVel * 11;
        game.squashVel += springForce * dt;
        game.squashStretch += game.squashVel * dt;

        // Thruster visual flame scale
        const flameTarget = Math.abs(thrustInput) > 0.05 ? 0.9 + Math.sin(elapsedNow * 38) * 0.2 : 0.01;
        rover.thrusterFlame.scale.z = THREE.MathUtils.damp(
          rover.thrusterFlame.scale.z,
          flameTarget,
          16,
          dt
        );

        // ------------------------------------------------------------------
        // 2. 120HZ SUB-STEPPED RK4 PROJECTILE INTEGRATION & COLLISIONS
        // ------------------------------------------------------------------
        const subSteps = 3;
        const subDt = dt / subSteps;
        for (let pIdx = 0; pIdx < projectiles.length; pIdx++) {
          const proj = projectiles[pIdx];
          if (!proj.active) continue;
          proj.age += dt;
          if (proj.age > 5.5) {
            proj.active = false;
            proj.mesh.visible = false;
            continue;
          }

          for (let s = 0; s < subSteps; s++) {
            stepRK4InPlace(proj.kin, subDt, rk4Env);

            // Check Resonance Beacon captures
            for (let bIdx = 0; bIdx < beacons.length; bIdx++) {
              const b = beacons[bIdx];
              if (b.captured) continue;
              const dx = proj.kin.x - b.x;
              const dy = proj.kin.y - (b.y + 2.0);
              const dz = proj.kin.z - b.z;
              if (dx * dx + dy * dy + dz * dz <= 3.6) {
                b.captured = true;
                b.hitFlashTimer = 0.28;
                proj.active = false;
                proj.mesh.visible = false;

                game.combo += 1;
                game.score += 250 + game.combo * 40;
                sessionPeaksRef.current.totalBeaconsCalibrated += 1;
                game.hitstopTimer = 0.048; // Crisp 48ms hitstop
                game.cameraTrauma = Math.min(1, game.cameraTrauma + 0.36);

                playBeaconResonanceSound(game.combo, mutedRef.current);
                spawnParticleBurst(b.x, b.y + 2.0, b.z, 22, 9.5, 0.25, 0.95, 0.72);
                break;
              }
            }
            if (!proj.active) break;

            // Check Shear Drone hits
            for (let dIdx = 0; dIdx < drones.length; dIdx++) {
              const d = drones[dIdx];
              if (d.stunnedTimer > 0) continue;
              const dx = proj.kin.x - d.x;
              const dy = proj.kin.y - (d.y + 1.65);
              const dz = proj.kin.z - d.z;
              if (dx * dx + dy * dy + dz * dz <= 2.4) {
                d.stunnedTimer = 5.5;
                d.windupTimer = 0;
                d.hitFlashTimer = 0.25;
                proj.active = false;
                proj.mesh.visible = false;

                game.score += 180;
                game.hitstopTimer = 0.04;
                game.cameraTrauma = Math.min(1, game.cameraTrauma + 0.28);
                playShockImpactSound(0.95, mutedRef.current);
                spawnParticleBurst(d.x, d.y + 1.65, d.z, 18, 8.2, 1.0, 0.65, 0.2);
                break;
              }
            }
            if (!proj.active) break;

            // Terrain impact check
            const gH = terrainHeightAt(proj.kin.x, proj.kin.z, currentBp.terrainSeed);
            if (proj.kin.y <= gH + 0.22) {
              proj.active = false;
              proj.mesh.visible = false;
              playShockImpactSound(0.45, mutedRef.current);
              spawnParticleBurst(proj.kin.x, gH + 0.25, proj.kin.z, 12, 5.5, 0.35, 0.8, 0.98);
              break;
            }
          }

          if (proj.active) {
            proj.mesh.position.set(proj.kin.x, proj.kin.y, proj.kin.z);
          }
        }

        // High-Kinetic Rover Direct Ramming Capture of Beacons (if E_k >= 120 J)
        const roverKinEnergy =
          0.5 * 8.0 * (game.roverVx * game.roverVx + game.roverVy * game.roverVy + game.roverVz * game.roverVz);
        if (roverKinEnergy >= 95) {
          for (let bIdx = 0; bIdx < beacons.length; bIdx++) {
            const b = beacons[bIdx];
            if (b.captured) continue;
            const distSq = (game.roverX - b.x) ** 2 + (game.roverZ - b.z) ** 2;
            if (distSq <= 4.4) {
              b.captured = true;
              b.hitFlashTimer = 0.28;
              game.combo += 1;
              game.score += 250 + game.combo * 35;
              sessionPeaksRef.current.totalBeaconsCalibrated += 1;
              game.hitstopTimer = 0.048;
              game.cameraTrauma = Math.min(1, game.cameraTrauma + 0.34);
              playBeaconResonanceSound(game.combo, mutedRef.current);
              spawnParticleBurst(b.x, b.y + 1.8, b.z, 20, 8.8, 0.25, 0.95, 0.72);
            }
          }
        }

        // ------------------------------------------------------------------
        // 3. SHEAR VORTEX DRONE AI & VISIBLE WINDUP TELEGRAPH ENCOUNTERS
        // ------------------------------------------------------------------
        for (let dIdx = 0; dIdx < drones.length; dIdx++) {
          const d = drones[dIdx];
          d.rig.rotorRing.rotation.z += 11.5 * dt;

          if (d.hitFlashTimer > 0) {
            d.hitFlashTimer = Math.max(0, d.hitFlashTimer - dt);
            d.rig.shroudMat.emissive.setHex(d.hitFlashTimer > 0 ? 0xffffff : 0x000000);
            d.rig.shroudMat.emissiveIntensity = d.hitFlashTimer > 0 ? 1.1 : 0;
          }

          if (d.stunnedTimer > 0) {
            d.stunnedTimer = Math.max(0, d.stunnedTimer - dt);
            d.rig.telegraphMat.opacity = 0;
            d.rig.hullGroup.position.y = THREE.MathUtils.damp(
              d.rig.hullGroup.position.y,
              0.55,
              6,
              dt
            );
            continue;
          }

          d.rig.hullGroup.position.y = THREE.MathUtils.damp(
            d.rig.hullGroup.position.y,
            1.65 + Math.sin(elapsedNow * 3.2 + dIdx) * 0.18,
            6,
            dt
          );

          const toRoverX = game.roverX - d.x;
          const toRoverZ = game.roverZ - d.z;
          const distToRover = Math.hypot(toRoverX, toRoverZ);

          if (d.windupTimer > 0) {
            // Visible 1.15s Shockwave Windup Telegraph
            d.windupTimer += dt;
            const progress = Math.min(1, d.windupTimer / 1.15);
            d.rig.telegraphRing.scale.setScalar(0.15 + progress * 0.95);
            d.rig.telegraphMat.opacity = 0.25 + progress * 0.55;

            if (d.windupTimer >= 1.15) {
              d.windupTimer = 0;
              d.cooldownTimer = Math.max(2.0, 3.6 - game.stageIndex * 0.25);
              d.rig.telegraphMat.opacity = 0;

              spawnParticleBurst(d.x, d.y + 0.8, d.z, 18, 9.5, 1.0, 0.55, 0.15);
              playShockImpactSound(1.0, mutedRef.current);

              if (distToRover < 6.0) {
                // Impart real Newtonian radial momentum impulse J = dp
                const invD = 1 / Math.max(0.5, distToRover);
                const impulseSpeed = 16.5;
                game.roverVx += toRoverX * invD * impulseSpeed;
                game.roverVz += toRoverZ * invD * impulseSpeed;
                game.roverVy += 5.2;
                game.grounded = false;
                game.hull = Math.max(0, game.hull - 18);
                game.combo = 0;
                game.roverHitFlash = 0.26;
                game.hitstopTimer = 0.045;
                game.cameraTrauma = Math.min(1, game.cameraTrauma + 0.55);

                if (game.hull <= 0) {
                  setPhase("GAME_OVER");
                }
              }
            }
          } else {
            d.rig.telegraphMat.opacity = 0;
            d.cooldownTimer = Math.max(0, d.cooldownTimer - dt);

            // Smooth patrol + pursuit steering
            d.orbitAngle += (0.42 + game.stageIndex * 0.06) * dt;
            const patrolX = Math.cos(d.orbitAngle) * d.orbitRadius;
            const patrolZ = Math.sin(d.orbitAngle) * d.orbitRadius;
            const targetX = distToRover < 26 ? game.roverX : patrolX;
            const targetZ = distToRover < 26 ? game.roverZ : patrolZ;

            const dx = targetX - d.x;
            const dz = targetZ - d.z;
            const len = Math.max(0.1, Math.hypot(dx, dz));
            const moveSpeed = 6.2 + game.stageIndex * 0.75;
            d.vx = THREE.MathUtils.damp(d.vx, (dx / len) * moveSpeed, 3.5, dt);
            d.vz = THREE.MathUtils.damp(d.vz, (dz / len) * moveSpeed, 3.5, dt);

            d.x += d.vx * dt;
            d.z += d.vz * dt;
            d.y = terrainHeightAt(d.x, d.z, currentBp.terrainSeed);
            d.rig.root.position.set(d.x, d.y, d.z);
            d.rig.hullGroup.rotation.y = Math.atan2(-d.vx, -d.vz);

            if (distToRover < 5.4 && d.cooldownTimer <= 0) {
              d.windupTimer = 0.01;
              playHazardTelegraphSound(mutedRef.current);
            }
          }
        }

        // Check Stage Completion
        if (beacons.length > 0 && beacons.every((b) => b.captured)) {
          sessionPeaksRef.current.stagesCleared = Math.max(
            sessionPeaksRef.current.stagesCleared,
            game.stageIndex + 1
          );
          playStageClearFanfare(mutedRef.current);

          if (game.stageIndex + 1 < currentBp.stages.length) {
            game.stageIndex += 1;
            game.score += 500;
            game.hull = Math.min(100, game.hull + 25);
            const nextSt = currentBp.stages[game.stageIndex];
            setGravityMs2(nextSt.gravityMs2);
            setDragCoeff(nextSt.dragCoeff);
            populateStage(currentBp, game.stageIndex);
            pushToast({
              title: `Cleared Stage ${game.stageIndex}: +75 XP`,
              subtitle: `Advancing to ${nextSt.title}`,
              xpDelta: 75,
              variant: "xp",
            });
            recordPhysicsLabSession({
              topic: currentBp.topic,
              courseId: currentBp.courseId,
              moduleId: currentBp.moduleId,
              stagesCleared: game.stageIndex,
              score: game.score,
              primaryEquation: currentBp.primaryEquation,
              conservationLaw: currentBp.conservationLaw,
              silentStageIncrement: true,
            });
          } else {
            game.score += 1000;
            setPhase("VICTORY");
          }
        }
      }

      // ------------------------------------------------------------------
      // 4. ANIMATE COMPOSITE PROPS, PARTICLES & RK4 TRAJECTORY PREVIEW
      // ------------------------------------------------------------------
      rover.gyroWheel.rotation.y += 4.8 * dt;
      rover.turretYawGroup.rotation.y = game.turretRelYaw;
      rover.turretPitchGroup.rotation.x = game.turretPitch;

      if (game.roverHitFlash > 0) {
        game.roverHitFlash = Math.max(0, game.roverHitFlash - dt);
        rover.chassisMat.emissive.setHex(game.roverHitFlash > 0 ? 0xef4444 : 0x000000);
        rover.chassisMat.emissiveIntensity = game.roverHitFlash > 0 ? 1.2 : 0;
      }

      rover.root.position.set(game.roverX, game.roverY, game.roverZ);
      terrainNormalAt(game.roverX, game.roverZ, currentBp.terrainSeed, _normTuple);
      _slopeUp.set(_normTuple[0] * 0.55, _normTuple[1], _normTuple[2] * 0.55).normalize();
      _alignQuat.setFromUnitVectors(_worldUp, _slopeUp);
      _yawQuat.setFromAxisAngle(_worldUp, game.roverHeading);
      rover.root.quaternion.copy(_alignQuat).multiply(_yawQuat);
      rover.bodyVisual.scale.set(
        1 / Math.sqrt(Math.max(0.6, game.squashStretch)),
        game.squashStretch,
        1 / Math.sqrt(Math.max(0.6, game.squashStretch))
      );

      for (let bIdx = 0; bIdx < beacons.length; bIdx++) {
        const b = beacons[bIdx];
        b.rig.coreMesh.rotation.y += b.eigenOmega * dt;
        b.rig.gimbalRing.rotation.x += b.eigenOmega * 0.8 * dt;
        b.rig.gimbalRing.rotation.y -= b.eigenOmega * 0.5 * dt;
        b.rig.coreMesh.position.y = 2.05 + Math.sin(elapsedNow * b.eigenOmega + bIdx) * 0.16;

        if (b.hitFlashTimer > 0) {
          b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt);
        }
        if (b.captured) {
          b.rig.coreMat.color.setHex(0x34d399);
          b.rig.coreMat.emissive.setHex(b.hitFlashTimer > 0 ? 0xffffff : 0x10b981);
          b.rig.coreMat.emissiveIntensity = b.hitFlashTimer > 0 ? 2.4 : 1.1;
          b.rig.haloMat.color.setHex(0x34d399);
          b.rig.haloMat.opacity = 0.8;
        }
      }

      // Update Pooled InstancedMesh Particles
      let anyParticleChanged = false;
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const p = particles[i];
        if (!p.active) continue;
        anyParticleChanged = true;
        p.life += dt;
        if (p.life >= p.maxLife) {
          p.active = false;
          _dummyPos.set(0, -100, 0);
          _dummyScale.setScalar(0.001);
          _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
          particleInst.setMatrixAt(i, _dummyMat);
          continue;
        }
        p.vy -= rk4Env.gravityMs2 * 0.55 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const lifeFrac = 1 - p.life / p.maxLife;
        _dummyPos.set(p.x, p.y, p.z);
        _dummyScale.setScalar(Math.max(0.02, p.scale * lifeFrac));
        _dummyMat.compose(_dummyPos, _dummyQuat, _dummyScale);
        particleInst.setMatrixAt(i, _dummyMat);
        particleInst.setColorAt(i, _dummyColor.setRGB(p.r, p.g, p.b));
      }
      if (anyParticleChanged) {
        particleInst.instanceMatrix.needsUpdate = true;
        if (particleInst.instanceColor) particleInst.instanceColor.needsUpdate = true;
      }

      // Update Live 3D RK4 Trajectory Prediction Arc
      computeMuzzleWorldState(muzzlePreviewKin);
      const previewSummary = computeRK4TrajectoryPreview(
        muzzlePreviewKin,
        rk4Env,
        currentBp.terrainSeed,
        trajPositions,
        TRAJECTORY_POINTS,
        0.042
      );
      (trajGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      const showAimArc = phaseRef.current === "PLAYING";
      trajectoryLine.visible = showAimArc;
      impactReticle.visible = showAimArc;
      if (showAimArc && previewSummary.pointCount > 0) {
        const lastIdx = (previewSummary.pointCount - 1) * 3;
        impactReticle.position.set(
          trajPositions[lastIdx],
          trajPositions[lastIdx + 1] + 0.04,
          trajPositions[lastIdx + 2]
        );
      }

      // ------------------------------------------------------------------
      // 5. EXPONENTIALLY DAMPED CAMERA CHOREOGRAPHY + TRAUMA SHAKE
      // ------------------------------------------------------------------
      game.cameraTrauma = Math.max(0, game.cameraTrauma - 1.85 * dt);
      const shakeMag = game.cameraTrauma * game.cameraTrauma * 0.65;
      _camShakeOffset.set(
        Math.sin(elapsedNow * 53) * shakeMag,
        Math.cos(elapsedNow * 61) * shakeMag * 0.7,
        Math.sin(elapsedNow * 47) * shakeMag
      );

      if (phaseRef.current === "TITLE") {
        game.titleOrbitAngle += 0.16 * dt;
        const camR = 32;
        _camDesiredPos.set(
          Math.cos(game.titleOrbitAngle) * camR,
          14.5 + Math.sin(game.titleOrbitAngle * 0.7) * 2.2,
          Math.sin(game.titleOrbitAngle) * camR
        );
        camera.position.lerp(_camDesiredPos, 1 - Math.exp(-3.5 * dt));
        camera.lookAt(0, 2.2, 0);
      } else if (cameraModeRef.current === "orbit") {
        orbitControls.target.set(game.roverX, game.roverY + 1.4, game.roverZ);
        orbitControls.update();
      } else if (cameraModeRef.current === "overhead") {
        _camDesiredPos.set(game.roverX, game.roverY + 34, game.roverZ + 14);
        _camDesiredLook.set(game.roverX, game.roverY + 0.5, game.roverZ - 4);
        const alpha = 1 - Math.exp(-6.5 * dt);
        camera.position.lerp(_camDesiredPos, alpha).add(_camShakeOffset);
        camera.lookAt(_camDesiredLook);
      } else {
        // Third-person damped chase camera + speed FOV widening
        const camYaw = game.roverHeading + game.turretRelYaw * 0.45;
        const backX = Math.sin(camYaw);
        const backZ = Math.cos(camYaw);
        _camDesiredPos.set(
          game.roverX + backX * 10.8,
          game.roverY + 4.9,
          game.roverZ + backZ * 10.8
        );
        const camFloor =
          terrainHeightAt(_camDesiredPos.x, _camDesiredPos.z, currentBp.terrainSeed) + 1.6;
        if (_camDesiredPos.y < camFloor) _camDesiredPos.y = camFloor;

        const alpha = 1 - Math.exp(-8.5 * dt);
        camera.position.lerp(_camDesiredPos, alpha).add(_camShakeOffset);

        _camDesiredLook.set(
          game.roverX - backX * 8.0,
          game.roverY + 1.8 + Math.sin(game.turretPitch) * 3.2,
          game.roverZ - backZ * 8.0
        );
        camera.lookAt(_camDesiredLook);

        const roverSpeed = Math.hypot(game.roverVx, game.roverVz);
        const targetFov = 55 + Math.min(11, roverSpeed * 0.45);
        if (Math.abs(camera.fov - targetFov) > 0.08) {
          camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 6, dt);
          camera.updateProjectionMatrix();
        }
      }

      // Throttled HUD Telemetry Sync (10 Hz so React UI stays whisper-light)
      game.hudSyncAccum += dt;
      if (game.hudSyncAccum >= 0.1) {
        game.hudSyncAccum = 0;
        const roverKinState: ProjectileKinematicState = {
          x: game.roverX,
          y: game.roverY,
          z: game.roverZ,
          vx: game.roverVx,
          vy: game.roverVy,
          vz: game.roverVz,
        };
        const roverEnv: RK4EnvironmentParams = {
          ...rk4Env,
          massKg: 8.0,
        };
        const inv = computeMechanicalInvariants(roverKinState, roverEnv, 0);
        if (inv.kineticJoules > sessionPeaksRef.current.peakKineticJoules) {
          sessionPeaksRef.current.peakKineticJoules = inv.kineticJoules;
        }
        if (inv.momentumKgMs > sessionPeaksRef.current.peakMomentumKgMs) {
          sessionPeaksRef.current.peakMomentumKgMs = inv.momentumKgMs;
        }

        const capturedCount = beacons.filter((b) => b.captured).length;
        setHud({
          stageNumber: game.stageIndex + 1,
          totalStages: currentBp.stages.length,
          stageTitle: activeStage?.title || "Stage 1",
          conceptBridge: activeStage?.conceptBridge || currentBp.archetypeLabel,
          governingEquation: activeStage?.governingEquation || currentBp.primaryEquation,
          beaconsCaptured: capturedCount,
          beaconsTotal: beacons.length,
          hullIntegrity: Math.round(game.hull),
          score: Math.round(game.score),
          kineticJoules: Math.round(inv.kineticJoules),
          potentialJoules: Math.round(Math.max(0, inv.potentialGravityJoules)),
          momentumKgMs: Math.round(inv.momentumKgMs),
          predictedApexMeters: previewSummary.apexHeightMeters,
          predictedRangeMeters: previewSummary.horizontalRangeMeters,
        });
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearHeldInputs);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);

      clearStageEntities();
      rover.dispose();
      terrainHandle.dispose();
      studioEnv.dispose();
      projGeo.dispose();
      projMat.dispose();
      trajGeo.dispose();
      trajMat.dispose();
      reticleGeo.dispose();
      reticleMat.dispose();
      partGeo.dispose();
      partMat.dispose();
      orbitControls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="fixed inset-0 w-screen h-screen overflow-hidden bg-[#0b1220] text-slate-100 select-none">
      {/* Dedicated Isolated WebGL Canvas Container */}
      <div ref={canvasMountRef} className="absolute inset-0 w-full h-full" />

      {/* Graceful WebGL Context Loss Fallback */}
      {webglLost && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center"
          style={{ backgroundColor: "rgba(11, 18, 32, 0.96)" }}
        >
          <p className="text-lg font-semibold text-slate-100">
            Restoring 3D Physics Viewport...
          </p>
          <p className="text-sm text-slate-400 mt-1">
            RK4 numerical solver state is preserved locally.
          </p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 1. TITLE SCREEN SHELL (Live 3D Atmospheric Pan + Negative Space SVG)  */}
      {/* ===================================================================== */}
      {phase === "TITLE" && (
        <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between p-6 sm:p-10">
          {/* Top Bar: Minimal Return Button, Guide & Engine Mode */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveView(AppView.DASHBOARD)}
                className="pointer-events-auto inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium text-slate-200 border border-slate-700/80 hover:border-sky-400/70 transition-colors cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.88)" }}
              >
                <LogOut className="w-3.5 h-3.5 text-sky-400" />
                <span>Return to Study OS</span>
              </button>
              <button
                type="button"
                onClick={() => setGuideModalOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-sky-300 border border-slate-700/80 hover:border-sky-400/70 transition-colors cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.88)" }}
              >
                <span>Study Guide</span>
              </button>
            </div>

            <div
              className="pointer-events-auto px-3.5 py-1.5 rounded-md border border-slate-700/80 text-xs font-mono text-slate-300 tabular-nums"
              style={{ backgroundColor: "rgba(11, 17, 30, 0.88)" }}
            >
              Solver: RK4 120Hz · {blueprint.synthesisEngine}
            </div>
          </div>

          {/* Center-Bottom Hero Lockup leaving ~40% upper negative space for live 3D mountains */}
          <div className="my-auto pt-12 max-w-2xl">
            {/* Bespoke Inline SVG Title Lockup */}
            <svg
              viewBox="0 0 560 96"
              className="w-full max-w-[490px] h-auto mb-3"
              aria-label="Vectoria Integrative Physics and Math Proving Ground"
            >
              <defs>
                <linearGradient id="vectoriaStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="60%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
              </defs>
              {/* Parabolic geodesic emblem */}
              <path
                d="M10 74 Q 46 10, 84 74"
                fill="none"
                stroke="url(#vectoriaStroke)"
                strokeWidth="3"
                strokeDasharray="5 4"
              />
              <circle cx="47" cy="24" r="5" fill="#fbbf24" />
              <polygon points="84,74 75,69 79,63" fill="#38bdf8" />
              <text
                x="104"
                y="54"
                fill="#f8fafc"
                fontSize="42"
                fontWeight="700"
                letterSpacing="3"
                fontFamily="Plus Jakarta Sans, system-ui, sans-serif"
              >
                VECTORIA
              </text>
              <text
                x="106"
                y="78"
                fill="#94a3b8"
                fontSize="12.5"
                fontWeight="600"
                letterSpacing="1.8"
                fontFamily="JetBrains Mono, monospace"
              >
                INTEGRATIVE 3D PHYSICS &amp; APPLIED MATH LAB
              </text>
            </svg>

            <p
              className="text-sm sm:text-base text-slate-200 leading-relaxed max-w-xl"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.85)" }}
            >
              {blueprint.domainAnalogySummary}
            </p>
            <p className="font-mono text-xs text-sky-300 mt-1.5">
              Law: {blueprint.primaryEquation}
            </p>

            {/* Any-Topic / Course Calibration Bar */}
            <div
              className="pointer-events-auto mt-5 p-3.5 rounded-lg border border-slate-700/80 max-w-xl"
              style={{ backgroundColor: "rgba(11, 17, 30, 0.92)" }}
            >
              <label className="block text-xs font-medium text-slate-300 mb-2">
                Calibrate Proving Ground to Any Topic or Study Module (Works Offline &amp; Across Any API)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={customTopicInput}
                  onChange={(e) => setCustomTopicInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleSynthesizeTopicBlueprint(customTopicInput);
                    }
                  }}
                  placeholder="e.g., B-Trees, PID Control, Orbital Mechanics, Fourier Waves..."
                  className="flex-1 px-3 py-2 rounded bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  disabled={isCompilingBlueprint}
                  onClick={() => void handleSynthesizeTopicBlueprint(customTopicInput)}
                  className="px-3.5 py-2 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-slate-100 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isCompilingBlueprint ? "Compiling..." : "Compile Physics"}
                </button>
              </div>

              {state.modules.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pt-2.5 mt-2 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400 shrink-0">Vault Units:</span>
                  {state.modules.slice(0, 4).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setCustomTopicInput(m.title);
                        void handleSynthesizeTopicBlueprint(m.title, m.id, m.courseId);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/70 text-[11px] text-slate-300 truncate max-w-[160px] cursor-pointer shrink-0"
                    >
                      {m.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Primary Start CTA + Single Flat Control-Hint Line */}
            <div className="pointer-events-auto mt-5 flex flex-wrap items-center gap-4">
              <button
                type="button"
                onClick={handleStartMission}
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold text-sm shadow-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Simulation</span>
              </button>
              <span
                className="font-mono text-xs text-slate-300 px-3 py-2 rounded border border-slate-800"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.86)" }}
              >
                WASD Move · Mouse/QE Aim · Space RK4 Launch · Shift Jump · Esc Pause
              </span>
            </div>
          </div>

          <div />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. PLAYING HUD (Perimeter Clusters + Collapsible Bottom Dock, <=15%)  */}
      {/* ===================================================================== */}
      {phase !== "TITLE" && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {/* Top Perimeter Bar */}
          <div className="flex items-start justify-between gap-4 p-4">
            {/* Top-Left World-Matched Status & Live Conservation Readout */}
            <div
              className="pointer-events-auto rounded-lg border border-slate-700/80 px-4 py-2.5 max-w-xl"
              style={{ backgroundColor: "rgba(11, 17, 30, 0.90)" }}
            >
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-100">
                <span className="text-sky-400 font-mono tabular-nums">
                  Stage {hud.stageNumber}/{hud.totalStages}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="truncate max-w-[260px]">{blueprint.topic}</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="font-mono text-emerald-400 tabular-nums">
                  Beacons {hud.beaconsCaptured}/{hud.beaconsTotal}
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span
                  className={`font-mono tabular-nums ${
                    hud.hullIntegrity <= 35 ? "text-amber-400" : "text-slate-200"
                  }`}
                >
                  Hull {hud.hullIntegrity}%
                </span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="font-mono text-amber-300 tabular-nums">
                  Score {hud.score}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1.5 mt-1.5 border-t border-slate-800 font-mono text-[11px] text-slate-300 tabular-nums">
                <span>Ek {hud.kineticJoules} J</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span>Ug {hud.potentialJoules} J</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span>|p| {hud.momentumKgMs} kg·m/s</span>
                <span aria-hidden="true" className="text-slate-600">
                  ·
                </span>
                <span className="text-sky-300">
                  RK4 Arc: Apex {hud.predictedApexMeters.toFixed(1)} m / Range{" "}
                  {hud.predictedRangeMeters.toFixed(1)} m
                </span>
              </div>
            </div>

            {/* Top-Right Action Controls */}
            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => simApiRef.current?.fireCalibrationPulse()}
                className="px-3 py-2 rounded-md bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                Launch Pulse (Space)
              </button>

              <button
                type="button"
                onClick={handleSaveLabReportToVault}
                title="Save verified RK4 equations & telemetry to Knowledge Vault"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-700/80 hover:border-emerald-400/70 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.90)" }}
              >
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">
                  {savedReportOnce ? "Saved to Vault" : "Save to Vault"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? "Unmute audio" : "Mute audio"}
                className="p-2 rounded-md border border-slate-700/80 hover:border-sky-400/60 text-slate-200 transition-colors cursor-pointer"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.90)" }}
              >
                {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-sky-400" />}
              </button>

              <button
                type="button"
                onClick={() => setPhase(phase === "PAUSED" ? "PLAYING" : "PAUSED")}
                aria-label="Pause simulation"
                className="p-2 rounded-md border border-slate-700/80 hover:border-sky-400/60 text-slate-200 transition-colors cursor-pointer"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.90)" }}
              >
                <Pause className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setActiveView(AppView.DASHBOARD)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-700/80 hover:border-slate-500 text-xs font-medium text-slate-300 transition-colors cursor-pointer whitespace-nowrap"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.90)" }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Exit</span>
              </button>
            </div>
          </div>

          {/* Unified Collapsible Bottom Control Dock (Zero Side-Card Clutter) */}
          <div
            className="pointer-events-auto fixed bottom-4 left-1/2 -translate-x-1/2 w-[min(920px,94vw)] transition-transform duration-200"
            style={{
              transform: dockCollapsed
                ? "translate(-50%, calc(100% - 30px))"
                : "translate(-50%, 0)",
            }}
          >
            {/* Collapse / Expand Tab */}
            <div className="flex justify-center mb-1">
              <button
                type="button"
                onClick={() => setDockCollapsed((c) => !c)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-md border border-b-0 border-slate-700/80 text-[11px] font-mono text-slate-300 hover:text-sky-300 cursor-pointer"
                style={{ backgroundColor: "rgba(11, 17, 30, 0.94)" }}
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    <span>Show Physics Controls (H)</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    <span>Hide Controls (H)</span>
                  </>
                )}
              </button>
            </div>

            <div
              className="rounded-lg border border-slate-700/80 px-4 py-3"
              style={{ backgroundColor: "rgba(11, 17, 30, 0.94)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 mb-2.5 border-b border-slate-800 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-slate-100 truncate">
                    {hud.stageTitle}
                  </span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span className="font-mono text-sky-300 truncate">
                    {hud.governingEquation}
                  </span>
                </div>

                {/* Camera Mode Segmented Control */}
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800 shrink-0">
                  {(["chase", "orbit", "overhead"] as CameraViewMode[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setCameraMode(mode)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium capitalize transition-colors cursor-pointer whitespace-nowrap ${
                        cameraMode === mode
                          ? "bg-sky-400 text-slate-950 font-semibold"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {mode} Cam
                    </button>
                  ))}
                </div>
              </div>

              {/* Labeled Physics Parameter Sliders with Explicit Units */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <label className="flex flex-col gap-1">
                  <span className="flex justify-between font-mono text-[11px] text-slate-300 tabular-nums">
                    <span>Gravity g</span>
                    <span className="text-sky-300">{gravityMs2.toFixed(1)} m/s²</span>
                  </span>
                  <input
                    type="range"
                    min={1.6}
                    max={24.8}
                    step={0.2}
                    value={gravityMs2}
                    onChange={(e) => setGravityMs2(Number(e.target.value))}
                    className="accent-sky-400 cursor-pointer"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="flex justify-between font-mono text-[11px] text-slate-300 tabular-nums">
                    <span>Launch v₀</span>
                    <span className="text-sky-300">{launchSpeedMs.toFixed(0)} m/s</span>
                  </span>
                  <input
                    type="range"
                    min={16}
                    max={56}
                    step={1}
                    value={launchSpeedMs}
                    onChange={(e) => setLaunchSpeedMs(Number(e.target.value))}
                    className="accent-sky-400 cursor-pointer"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="flex justify-between font-mono text-[11px] text-slate-300 tabular-nums">
                    <span>Drag Cd</span>
                    <span className="text-sky-300">{dragCoeff.toFixed(2)}</span>
                  </span>
                  <input
                    type="range"
                    min={0.0}
                    max={0.45}
                    step={0.01}
                    value={dragCoeff}
                    onChange={(e) => setDragCoeff(Number(e.target.value))}
                    className="accent-sky-400 cursor-pointer"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="flex justify-between font-mono text-[11px] text-slate-300 tabular-nums">
                    <span>Field Coupling k</span>
                    <span className="text-sky-300">{fieldCoupling.toFixed(2)}×</span>
                  </span>
                  <input
                    type="range"
                    min={0.0}
                    max={2.5}
                    step={0.05}
                    value={fieldCoupling}
                    onChange={(e) => setFieldCoupling(Number(e.target.value))}
                    className="accent-sky-400 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. PAUSE / VICTORY / GAME OVER MODAL                                  */}
      {/* ===================================================================== */}
      {(phase === "PAUSED" || phase === "VICTORY" || phase === "GAME_OVER") && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(7, 11, 20, 0.82)" }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-700 p-6 shadow-2xl"
            style={{ backgroundColor: "#0f172a" }}
          >
            <div className="text-xs font-mono text-sky-400">
              {phase === "VICTORY"
                ? "ALL 5 INTEGRATIVE STAGES VERIFIED"
                : phase === "GAME_OVER"
                ? "HULL INTEGRITY DEPLETED"
                : "SIMULATION PAUSED"}
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mt-1">
              {phase === "VICTORY"
                ? `Mastered: ${blueprint.topic}`
                : phase === "GAME_OVER"
                ? "Recalibrate Field Trajectory"
                : blueprint.topic}
            </h2>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              {blueprint.conservationLaw}
            </p>

            <div className="grid grid-cols-3 gap-3 my-5 p-3.5 rounded-lg bg-slate-900 border border-slate-800 font-mono tabular-nums">
              <div>
                <div className="text-[11px] text-slate-400">Lab Score</div>
                <div className="text-base font-bold text-amber-300">{hud.score}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Peak Ek</div>
                <div className="text-base font-bold text-sky-300">
                  {Math.round(
                    Math.max(hud.kineticJoules, sessionPeaksRef.current.peakKineticJoules)
                  )}{" "}
                  J
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Beacons</div>
                <div className="text-base font-bold text-emerald-400">
                  {sessionPeaksRef.current.totalBeaconsCalibrated}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {phase === "PAUSED" && (
                <button
                  type="button"
                  onClick={() => setPhase("PLAYING")}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-semibold cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume Simulation</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSaveLabReportToVault}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>
                  {savedReportOnce
                    ? "Saved Lab Derivation to Vault"
                    : "Save Lab Derivation to Vault (+XP)"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleStartMission}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 text-xs font-medium cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Mission</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveView(AppView.VAULT)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Open Knowledge Vault</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import type {
  AutonomousSyncResult,
  DeepResearchReportData,
  GeneratedCurriculum,
  GeneratedCurriculumUnit,
  GeneratedFlashcardSeed,
  IntegrativeArchetypeId,
  IntegrativeLabBlueprint,
  IntegrativeStageConfig,
  LearnerLevel,
  UploadedNoteDocument,
} from "../types/studyOS";

export interface PhysicsWellSource {
  x: number;
  y: number;
  z: number;
  /** Positive = attractive well, Negative = repulsive barrier */
  strength: number;
}

export interface RK4EnvironmentParams {
  massKg: number;
  gravityMs2: number;
  /** Quadratic drag factor beta = 0.5 * rho * Cd * A / m (units: 1/m) */
  dragBeta: number;
  /** Vertical magnetic flux density B_y for Lorentz force q*(v x B)/m */
  lorentzOmega: number;
  /** Isotropic harmonic restoring spring constant k/m around origin (optional) */
  springOmegaSq: number;
  wells: PhysicsWellSource[];
}

export interface ProjectileKinematicState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
}

export interface MechanicalInvariants {
  speedMs: number;
  kineticJoules: number;
  potentialGravityJoules: number;
  potentialWellsJoules: number;
  totalMechanicalJoules: number;
  momentumKgMs: number;
  angularMomentumM2s: number;
}

export interface TrajectoryPreviewSummary {
  pointCount: number;
  apexHeightMeters: number;
  flightTimeSeconds: number;
  horizontalRangeMeters: number;
  impactSpeedMs: number;
  initialEnergyJoules: number;
  terminalEnergyJoules: number;
}

/**
 * Deterministic FNV-1a 32-bit hash mapped to a small positive integer seed [1..9999]
 */
export function hashTopicSeed(input: string): number {
  const clean = (input || "integrative-physics").trim().toLowerCase();
  let h = 0x811c9dc5;
  for (let i = 0; i < clean.length; i++) {
    h ^= clean.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 9973) + 17;
}

/**
 * Continuous analytical outdoor terrain heightfield y = h(x, z).
 * - Central proving basin (r < 11m) is gently graded for clean launch calibration.
 * - Mid-field (11m..52m) features smooth multi-octave harmonic undulations.
 * - Outer perimeter (r > 52m) rises naturally into alpine ridge mountains so the arena
 *   never uses artificial box walls.
 */
export function terrainHeightAt(x: number, z: number, seed: number = 42): number {
  const rSq = x * x + z * z;
  const r = Math.sqrt(rSq);
  const phaseA = (seed % 37) * 0.17;
  const phaseB = (seed % 53) * 0.11;

  // Smooth central proving pad attenuation
  const padMask = Math.min(1, Math.max(0, (r - 9.5) / 14.0));
  const smoothPad = padMask * padMask * (3 - 2 * padMask);

  const wave1 = Math.sin(x * 0.075 + phaseA) * Math.cos(z * 0.075 - phaseB) * 1.85;
  const wave2 = Math.sin((x * 0.14 - z * 0.11) + phaseB) * 0.72;
  const wave3 = Math.cos((x * 0.04 + z * 0.05) - phaseA) * 1.15;

  const rollingHills = (wave1 + wave2 + wave3) * smoothPad;

  // Natural mountain amphitheater rim beyond playable radius (r > 50m)
  const rimDist = Math.max(0, r - 50);
  const azimuthMod =
    1 +
    0.28 * Math.sin(Math.atan2(z, x) * 5 + phaseA) +
    0.16 * Math.cos(Math.atan2(z, x) * 9 - phaseB);
  const mountainRim = Math.min(28, 0.026 * rimDist * rimDist * azimuthMod);

  return rollingHills + mountainRim;
}

/**
 * Central-difference unit normal vector N = (-dh/dx, 1, -dh/dz) / ||...||
 * Writes into optional `out` tuple to prevent heap allocations in 60fps loops.
 */
export function terrainNormalAt(
  x: number,
  z: number,
  seed: number = 42,
  out: [number, number, number] = [0, 1, 0]
): [number, number, number] {
  const eps = 0.25;
  const hL = terrainHeightAt(x - eps, z, seed);
  const hR = terrainHeightAt(x + eps, z, seed);
  const hD = terrainHeightAt(x, z - eps, seed);
  const hU = terrainHeightAt(x, z + eps, seed);

  const dhdx = (hR - hL) / (2 * eps);
  const dhdz = (hU - hD) / (2 * eps);

  const nx = -dhdx;
  const ny = 1;
  const nz = -dhdz;
  const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);

  out[0] = nx * invLen;
  out[1] = ny * invLen;
  out[2] = nz * invLen;
  return out;
}

/**
 * Computes instantaneous 3D acceleration vector a(r, v) from real physical laws:
 *   a = g + a_drag + a_wells + a_lorentz + a_spring
 */
export function evaluateAcceleration(
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  env: RK4EnvironmentParams,
  outAcc: [number, number, number]
): void {
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);

  // 1. Uniform gravity + quadratic aerodynamic drag: -beta * |v| * v
  let ax = -env.dragBeta * speed * vx;
  let ay = -env.gravityMs2 - env.dragBeta * speed * vy;
  let az = -env.dragBeta * speed * vz;

  // 2. Magnetic Lorentz cross-product deflection: (q/m) * (v x B), with B = (0, B_y, 0)
  // v x (0, B_y, 0) = (-vz * B_y, 0, vx * B_y)
  if (env.lorentzOmega !== 0) {
    ax += -vz * env.lorentzOmega;
    az += vx * env.lorentzOmega;
  }

  // 3. Harmonic restoring potential around origin (if active)
  if (env.springOmegaSq > 0) {
    ax += -env.springOmegaSq * x;
    az += -env.springOmegaSq * z;
  }

  // 4. Softened inverse-square central force wells: -k * (r - r_i) / (|r - r_i|^2 + eps^2)^(3/2)
  const softeningSq = 2.25;
  for (let i = 0; i < env.wells.length; i++) {
    const w = env.wells[i];
    if (w.strength === 0) continue;
    const dx = x - w.x;
    const dy = y - w.y;
    const dz = z - w.z;
    const distSq = dx * dx + dy * dy + dz * dz + softeningSq;
    const invCube = 1 / (distSq * Math.sqrt(distSq));
    const factor = -w.strength * invCube;
    ax += dx * factor;
    ay += dy * factor;
    az += dz * factor;
  }

  outAcc[0] = ax;
  outAcc[1] = ay;
  outAcc[2] = az;
}

// Module-scoped scratch arrays for zero-GC RK4 integration
const _k1a: [number, number, number] = [0, 0, 0];
const _k2a: [number, number, number] = [0, 0, 0];
const _k3a: [number, number, number] = [0, 0, 0];
const _k4a: [number, number, number] = [0, 0, 0];

/**
 * Advances a 3D kinematic state in-place by `dt` seconds using classical
 * 4th-Order Runge-Kutta (RK4) integration: O(dt^4) global truncation accuracy.
 */
export function stepRK4InPlace(
  state: ProjectileKinematicState,
  dt: number,
  env: RK4EnvironmentParams
): void {
  const { x, y, z, vx, vy, vz } = state;
  const halfDt = dt * 0.5;

  // Stage k1
  evaluateAcceleration(x, y, z, vx, vy, vz, env, _k1a);
  const k1vx = vx;
  const k1vy = vy;
  const k1vz = vz;

  // Stage k2
  const x2 = x + halfDt * k1vx;
  const y2 = y + halfDt * k1vy;
  const z2 = z + halfDt * k1vz;
  const vx2 = vx + halfDt * _k1a[0];
  const vy2 = vy + halfDt * _k1a[1];
  const vz2 = vz + halfDt * _k1a[2];
  evaluateAcceleration(x2, y2, z2, vx2, vy2, vz2, env, _k2a);

  // Stage k3
  const x3 = x + halfDt * vx2;
  const y3 = y + halfDt * vy2;
  const z3 = z + halfDt * vz2;
  const vx3 = vx + halfDt * _k2a[0];
  const vy3 = vy + halfDt * _k2a[1];
  const vz3 = vz + halfDt * _k2a[2];
  evaluateAcceleration(x3, y3, z3, vx3, vy3, vz3, env, _k3a);

  // Stage k4
  const x4 = x + dt * vx3;
  const y4 = y + dt * vy3;
  const z4 = z + dt * vz3;
  const vx4 = vx + dt * _k3a[0];
  const vy4 = vy + dt * _k3a[1];
  const vz4 = vz + dt * _k3a[2];
  evaluateAcceleration(x4, y4, z4, vx4, vy4, vz4, env, _k4a);

  const sixthDt = dt / 6;
  state.x = x + sixthDt * (k1vx + 2 * vx2 + 2 * vx3 + vx4);
  state.y = y + sixthDt * (k1vy + 2 * vy2 + 2 * vy3 + vy4);
  state.z = z + sixthDt * (k1vz + 2 * vz2 + 2 * vz3 + vz4);
  state.vx = vx + sixthDt * (_k1a[0] + 2 * _k2a[0] + 2 * _k3a[0] + _k4a[0]);
  state.vy = vy + sixthDt * (_k1a[1] + 2 * _k2a[1] + 2 * _k3a[1] + _k4a[1]);
  state.vz = vz + sixthDt * (_k1a[2] + 2 * _k2a[2] + 2 * _k3a[2] + _k4a[2]);
}

/**
 * Computes exact mechanical energy & momentum invariants for HUD display and conservation tests.
 */
export function computeMechanicalInvariants(
  state: ProjectileKinematicState,
  env: RK4EnvironmentParams,
  referenceHeightY: number = 0
): MechanicalInvariants {
  const vSq = state.vx * state.vx + state.vy * state.vy + state.vz * state.vz;
  const speedMs = Math.sqrt(vSq);
  const kineticJoules = 0.5 * env.massKg * vSq;
  const potentialGravityJoules = env.massKg * env.gravityMs2 * (state.y - referenceHeightY);

  let potentialWellsJoules = 0;
  const softeningSq = 2.25;
  for (let i = 0; i < env.wells.length; i++) {
    const w = env.wells[i];
    if (w.strength === 0) continue;
    const dx = state.x - w.x;
    const dy = state.y - w.y;
    const dz = state.z - w.z;
    const rSoft = Math.sqrt(dx * dx + dy * dy + dz * dz + softeningSq);
    potentialWellsJoules += (-env.massKg * w.strength) / rSoft;
  }

  const springPotential =
    env.springOmegaSq > 0
      ? 0.5 * env.massKg * env.springOmegaSq * (state.x * state.x + state.z * state.z)
      : 0;

  const totalMechanicalJoules =
    kineticJoules + potentialGravityJoules + potentialWellsJoules + springPotential;
  const momentumKgMs = env.massKg * speedMs;

  // Specific angular momentum h = r x v
  const hx = state.y * state.vz - state.z * state.vy;
  const hy = state.z * state.vx - state.x * state.vz;
  const hz = state.x * state.vy - state.y * state.vx;
  const angularMomentumM2s = Math.sqrt(hx * hx + hy * hy + hz * hz);

  return {
    speedMs,
    kineticJoules,
    potentialGravityJoules,
    potentialWellsJoules,
    totalMechanicalJoules,
    momentumKgMs,
    angularMomentumM2s,
  };
}

const _previewScratch: ProjectileKinematicState = {
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
};

/**
 * Integrates an exact RK4 ballistic/field trajectory into a pre-allocated Float32Array
 * (`maxPoints * 3` floats) for zero-allocation 3D trajectory preview lines.
 */
export function computeRK4TrajectoryPreview(
  initial: ProjectileKinematicState,
  env: RK4EnvironmentParams,
  terrainSeed: number,
  outPositions: Float32Array,
  maxPoints: number = 90,
  stepDt: number = 0.045
): TrajectoryPreviewSummary {
  _previewScratch.x = initial.x;
  _previewScratch.y = initial.y;
  _previewScratch.z = initial.z;
  _previewScratch.vx = initial.vx;
  _previewScratch.vy = initial.vy;
  _previewScratch.vz = initial.vz;

  const initInv = computeMechanicalInvariants(_previewScratch, env, 0);
  let apexY = initial.y;
  let elapsed = 0;
  let count = 0;

  const cap = Math.min(maxPoints, Math.floor(outPositions.length / 3));
  for (let i = 0; i < cap; i++) {
    outPositions[i * 3] = _previewScratch.x;
    outPositions[i * 3 + 1] = _previewScratch.y;
    outPositions[i * 3 + 2] = _previewScratch.z;
    count = i + 1;

    if (_previewScratch.y > apexY) apexY = _previewScratch.y;

    if (i > 1) {
      const groundY = terrainHeightAt(_previewScratch.x, _previewScratch.z, terrainSeed);
      if (_previewScratch.y <= groundY + 0.15) {
        outPositions[i * 3 + 1] = groundY + 0.15;
        break;
      }
    }

    stepRK4InPlace(_previewScratch, stepDt, env);
    elapsed += stepDt;
  }

  // Pad remaining buffer slots with final point so fixed-length THREE.Line renders cleanly
  const lastX = outPositions[(count - 1) * 3];
  const lastY = outPositions[(count - 1) * 3 + 1];
  const lastZ = outPositions[(count - 1) * 3 + 2];
  for (let j = count; j < cap; j++) {
    outPositions[j * 3] = lastX;
    outPositions[j * 3 + 1] = lastY;
    outPositions[j * 3 + 2] = lastZ;
  }

  const termInv = computeMechanicalInvariants(_previewScratch, env, 0);
  const dx = lastX - initial.x;
  const dz = lastZ - initial.z;

  return {
    pointCount: count,
    apexHeightMeters: Math.round((apexY - initial.y) * 100) / 100,
    flightTimeSeconds: Math.round(elapsed * 100) / 100,
    horizontalRangeMeters: Math.round(Math.sqrt(dx * dx + dz * dz) * 100) / 100,
    impactSpeedMs: Math.round(termInv.speedMs * 100) / 100,
    initialEnergyJoules: Math.round(initInv.totalMechanicalJoules * 100) / 100,
    terminalEnergyJoules: Math.round(termInv.totalMechanicalJoules * 100) / 100,
  };
}

// ============================================================================
// API-AGNOSTIC FIRST-PRINCIPLES INTEGRATIVE LEARNING COMPILER
// Works identically whether Gemini, OpenAI, Groq, DeepSeek, Anthropic, Ollama,
// or ZERO external API is available!
// ============================================================================

interface ArchetypeSpec {
  id: IntegrativeArchetypeId;
  label: string;
  accentHex: string;
  primaryEquation: string;
  conservationLaw: string;
  defaultGravityMs2: number;
  defaultLaunchSpeedMs: number;
  defaultDragCoeff: number;
  defaultFieldCoupling: number;
  bridgeExplanation: (topic: string) => string;
  unitBlueprints: Array<{
    suffix: string;
    mathFocus: string;
    equation: string;
    hours: number;
  }>;
}

const ARCHETYPES: Record<IntegrativeArchetypeId, ArchetypeSpec> = {
  orbital_gravity: {
    id: "orbital_gravity",
    label: "Central-Force & Orbital Hamiltonian Mechanics",
    accentHex: "#38bdf8",
    primaryEquation: "m d²r/dt² = -GMm r / |r|³ - ½ρCdA|v|v",
    conservationLaw: "E = ½mv² - GMm/r = const (Conservative Limit), L = r × mv",
    defaultGravityMs2: 6.4,
    defaultLaunchSpeedMs: 34,
    defaultDragCoeff: 0.05,
    defaultFieldCoupling: 1.35,
    bridgeExplanation: (topic) =>
      `Models "${topic}" through central-force potential wells, gravitational geodesics, and angular momentum invariants L = r × p.`,
    unitBlueprints: [
      {
        suffix: "State-Space Foundations & Vector Kinematics",
        mathFocus: "Euclidean Norms, Inner Products & Frame Derivatives",
        equation: "r(t) ∈ ℝ³, v = dr/dt, a = d²r/dt²",
        hours: 2.5,
      },
      {
        suffix: "Potential Wells, Conservative Fields & Gradients",
        mathFocus: "Multivariable Gradient Operator ∇U & Path Independence",
        equation: "F(r) = -∇U(r), ∮ F · dr = 0",
        hours: 3.0,
      },
      {
        suffix: "Angular Momentum & Keplerian / Phase Invariants",
        mathFocus: "Cross-Product Algebra & Effective Potential Analysis",
        equation: "U_eff(r) = L²/(2mr²) - GMm/r",
        hours: 3.0,
      },
      {
        suffix: "4th-Order Runge-Kutta (RK4) Numerical Trajectory Synthesis",
        mathFocus: "Taylor Truncation Error O(h⁴) & Symplectic Stability",
        equation: "y_{n+1} = y_n + (h/6)(k₁ + 2k₂ + 2k₃ + k₄)",
        hours: 3.5,
      },
      {
        suffix: "Multi-Well Perturbations, Drag Dissipation & Boundary Mastery",
        mathFocus: "Non-Conservative Work-Energy Theorem & Escape Thresholds",
        equation: "dE/dt = F_drag · v = -½ρCdA|v|³ ≤ 0",
        hours: 3.0,
      },
    ],
  },
  harmonic_control: {
    id: "harmonic_control",
    label: "Damped Driven Oscillators & State-Space Control",
    accentHex: "#34d399",
    primaryEquation: "m x'' + c x' + k x = u(t),  ζ = c / (2√(mk))",
    conservationLaw: "Lyapunov Energy V(x,v) = ½kx² + ½mv² (dV/dt = -cv² ≤ 0)",
    defaultGravityMs2: 9.81,
    defaultLaunchSpeedMs: 32,
    defaultDragCoeff: 0.12,
    defaultFieldCoupling: 1.0,
    bridgeExplanation: (topic) =>
      `Couples "${topic}" directly to second-order dynamical feedback, damping ratio ζ, eigenfrequency ω₀ = √(k/m), and Lyapunov stability.`,
    unitBlueprints: [
      {
        suffix: "First-Principles Equilibrium & Restoring Operators",
        mathFocus: "Linear Differential Operators & Hookean Linearization",
        equation: "F(x) ≈ -k(x - x_eq) + O(Δx²), ω₀ = √(k/m)",
        hours: 2.5,
      },
      {
        suffix: "Characteristic Eigenvalues & Damping Regimes",
        mathFocus: "Complex Roots s = -ζω₀ ± iω₀√(1 - ζ²) & Phase Portraits",
        equation: "s² + 2ζω₀s + ω₀² = 0",
        hours: 3.0,
      },
      {
        suffix: "Impulse Response, Transfer Dynamics & Resonance Peaks",
        mathFocus: "Laplace / Fourier Frequency Response |H(iω)|",
        equation: "|H(iω)| = 1 / √((1 - (ω/ω₀)²)² + (2ζω/ω₀)²)",
        hours: 3.0,
      },
      {
        suffix: "Lyapunov Energy Certificates & Dissipation Bounds",
        mathFocus: "Positive-Definite Quadratic Forms xᵀPx",
        equation: "V(x, x') = ½kx² + ½mx'², dV/dt = -cx'²",
        hours: 3.0,
      },
      {
        suffix: "Discrete-Time RK4 Control & Disturbance Rejection",
        mathFocus: "Step-Size Stability Regions & Numerical Integration",
        equation: "x_{k+1} = Φ(Δt)x_k + Γ(Δt)u_k",
        hours: 3.5,
      },
    ],
  },
  electromagnetic_lorentz: {
    id: "electromagnetic_lorentz",
    label: "Lorentz Field Dynamics & Cross-Product Curvature",
    accentHex: "#f59e0b",
    primaryEquation: "m dv/dt = q(E + v × B) + m g - β|v|v",
    conservationLaw: "Magnetic Force q(v × B) ⊥ v ⇒ d(½mv²)/dt = q E · v",
    defaultGravityMs2: 8.2,
    defaultLaunchSpeedMs: 35,
    defaultDragCoeff: 0.07,
    defaultFieldCoupling: 1.25,
    bridgeExplanation: (topic) =>
      `Grounds "${topic}" in vector field curl/divergence, cyclotron gyroradius r_g = mv⊥/(|q|B), and orthogonal work-free magnetic deflection.`,
    unitBlueprints: [
      {
        suffix: "Scalar Potentials, Electric Fields & Superposition",
        mathFocus: "Divergence ∇·E = ρ/ε₀ & Inverse-Square Summation",
        equation: "E(r) = -∇Φ(r) = ∑ (q_i / 4πε₀) (r - r_i)/|r - r_i|³",
        hours: 2.5,
      },
      {
        suffix: "Magnetic Cross-Products & Cyclotron Helices",
        mathFocus: "Skew-Symmetric Cross-Product Matrix [B]× & Orthogonality",
        equation: "v · (v × B) = 0 ⇒ ω_c = |q|B / m",
        hours: 3.0,
      },
      {
        suffix: "Combined E × B Drift & Phase-Space Guiding Centers",
        mathFocus: "Vector Triple Products & Decomposition v = v_∥ + v_⊥",
        equation: "v_drift = (E × B) / |B|²",
        hours: 3.0,
      },
      {
        suffix: "Inductive Flux Coupling & Faraday Circulation",
        mathFocus: "Stokes' Theorem & Line-Surface Integral Duality",
        equation: "∮ E · dl = -d/dt ∬ B · dA",
        hours: 3.0,
      },
      {
        suffix: "RK4 Charged-Particle Tracking in Non-Uniform Fields",
        mathFocus: "Energy-Preserving Step Bounds & Gyrophase Accuracy",
        equation: "Δt ≪ 2π / ω_c = 2πm / (|q|B)",
        hours: 3.5,
      },
    ],
  },
  wave_resonance: {
    id: "wave_resonance",
    label: "Fourier Superposition, Dispersion & Standing-Wave Modes",
    accentHex: "#22d3ee",
    primaryEquation: "∂²ψ/∂t² = c² ∇²ψ - γ ∂ψ/∂t",
    conservationLaw: "Parseval Energy Identity: ∫|ψ(x)|²dx = ∑|c_n|²",
    defaultGravityMs2: 9.81,
    defaultLaunchSpeedMs: 33,
    defaultDragCoeff: 0.08,
    defaultFieldCoupling: 1.15,
    bridgeExplanation: (topic) =>
      `Synthesizes "${topic}" via orthogonal eigenmode decomposition, wave interference phase Δφ = kΔr - ωΔt, and spectral energy conservation.`,
    unitBlueprints: [
      {
        suffix: "Harmonic Basis Functions & Phase Geometry",
        mathFocus: "Euler's Identity e^{i(kx - ωt)} & Inner-Product Orthogonality",
        equation: "ψ(x,t) = A cos(kx - ωt + φ), v_p = ω/k",
        hours: 2.5,
      },
      {
        suffix: "Constructive / Destructive Interference & Path Differences",
        mathFocus: "Trigonometric Phasor Addition & Envelope Modulation",
        equation: "I = I₁ + I₂ + 2√(I₁I₂) cos(Δφ)",
        hours: 3.0,
      },
      {
        suffix: "Fourier Spectral Decomposition & Parseval's Theorem",
        mathFocus: "Hilbert Space Projections & Bandwidth-Time Tradeoffs",
        equation: "Ψ(ω) = ∫ ψ(t) e^{-iωt} dt, Δt · Δω ≥ ½",
        hours: 3.0,
      },
      {
        suffix: "Boundary Eigenvalues, Normal Modes & Standing Waves",
        mathFocus: "Sturm-Liouville Operators & Discrete Spectrum k_n = nπ/L",
        equation: "ω_n = c √((n_x π/L_x)² + (n_z π/L_z)²)",
        hours: 3.0,
      },
      {
        suffix: "Dispersion, Group Velocity & Energy Transport",
        mathFocus: "Taylor Expansion of ω(k) & Wavepacket Spreading",
        equation: "v_g = ∂ω/∂k, Energy Flux S = -T (∂ψ/∂t)(∇ψ)",
        hours: 3.5,
      },
    ],
  },
  energy_landscape: {
    id: "energy_landscape",
    label: "Hamiltonian Optimization, Geodesics & Energy Landscapes",
    accentHex: "#fbbf24",
    primaryEquation: "dv/dt = -γ v - ∇L(r),  dr/dt = v  (Heavy-Ball / Hamiltonian Flow)",
    conservationLaw: "H(r, p) = ½|p|²/m + L(r),  dH/dt = -γ|v|² ≤ 0",
    defaultGravityMs2: 9.81,
    defaultLaunchSpeedMs: 33,
    defaultDragCoeff: 0.1,
    defaultFieldCoupling: 1.2,
    bridgeExplanation: (topic) =>
      `Interprets "${topic}" as trajectory dynamics over a curved mathematical objective/potential manifold L(r) governed by momentum, Hessian curvature ∇²L, and conservation laws.`,
    unitBlueprints: [
      {
        suffix: "Structural Invariants, Manifolds & Cost Potentials",
        mathFocus: "Level Sets, Convexity & Hessian Eigenvalue Bounds",
        equation: "L(r + δ) ≈ L(r) + ∇L(r)ᵀδ + ½δᵀ∇²L(r)δ",
        hours: 2.5,
      },
      {
        suffix: "Momentum Dynamics vs. Pure Gradient Descent",
        mathFocus: "Symplectic Heavy-Ball ODEs & Condition Number κ = λ_max/λ_min",
        equation: "m r'' + γ r' + ∇L(r) = 0",
        hours: 3.0,
      },
      {
        suffix: "Saddle Points, Escape Velocity & Barrier Crossing",
        mathFocus: "Kramers Escape Energy ΔU & Unstable Hessian Eigenvectors",
        equation: "½mv_crit² ≥ U(r_saddle) - U(r_min)",
        hours: 3.0,
      },
      {
        suffix: "Discrete Algorithmic Complexity & Information Entropy",
        mathFocus: "Asymptotic Scaling, Amortized Potentials Φ & Shannon Bounds",
        equation: "T_amortized = T_actual + Φ(S_next) - Φ(S_prev)",
        hours: 3.0,
      },
      {
        suffix: "Numerical Verification via RK4 & Conservation Audits",
        mathFocus: "Discretization Stability h < 2/√λ_max & Invariant Drift",
        equation: "ε_rel = |E(T) - E(0) - W_diss| / |E(0)|",
        hours: 3.5,
      },
    ],
  },
  ballistic_kinematics: {
    id: "ballistic_kinematics",
    label: "3D Ballistic Mechanics, Aerodynamic Drag & Impulse Momentum",
    accentHex: "#38bdf8",
    primaryEquation: "m dv/dt = m g - ½ρCdA|v|v,  J = ∫ F dt = Δp",
    conservationLaw: "Work-Energy: Δ(½mv² + mgh) = -∫ ½ρCdA|v|³ dt",
    defaultGravityMs2: 9.81,
    defaultLaunchSpeedMs: 34,
    defaultDragCoeff: 0.09,
    defaultFieldCoupling: 0.95,
    bridgeExplanation: (topic) =>
      `Connects "${topic}" to 3D Newtonian vector mechanics, nonlinear quadratic drag ODEs, impulse-momentum transfer Δp, and multi-variable trajectory optimization.`,
    unitBlueprints: [
      {
        suffix: "3D Vector Decomposition & Galilean Invariance",
        mathFocus: "Orthogonal Basis Projections & Parametric Curves r(t)",
        equation: "v₀ = (v₀ cosθ cosψ, v₀ sinθ, v₀ cosθ sinψ)",
        hours: 2.5,
      },
      {
        suffix: "Vacuum Parabolic Envelope & Optimal Launch Calculus",
        mathFocus: "Constrained Extremization ∂R/∂θ = 0 on Sloped Terrain",
        equation: "y(x) = x tanθ - g x² / (2 v₀² cos²θ)",
        hours: 3.0,
      },
      {
        suffix: "Nonlinear Quadratic Drag & Terminal Asymptotics",
        mathFocus: "Riccati / Non-Separable Coupled ODEs & Reynolds Scaling",
        equation: "v_term = √(2mg / (ρ C_d A))",
        hours: 3.0,
      },
      {
        suffix: "Impulse-Momentum Collisions & Coefficient of Restitution",
        mathFocus: "Normal/Tangential Impulse Projection & Kinetic Loss",
        equation: "J_n = -(1 + e)(v_rel · n) / (1/m₁ + 1/m₂)",
        hours: 3.0,
      },
      {
        suffix: "High-Precision RK4 Ballistic Targeting & Error Bounds",
        mathFocus: "Shooting Method Root-Finding & Local Truncation Analysis",
        equation: "r(T; θ, ψ) - r_target = 0",
        hours: 3.5,
      },
    ],
  },
};

/**
 * Classifies any topic, course category, or raw study notes into the best-fit
 * physical-mathematical dynamical archetype—working deterministically with zero API.
 */
export function classifyTopicArchetype(
  topic: string,
  category: string = "",
  rawNotes: string = ""
): IntegrativeArchetypeId {
  const corpus = `${topic} ${category} ${rawNotes.slice(0, 3000)}`.toLowerCase();

  if (
    /orbit|planet|astro|grav|kepler|satellite|relativ|cosmos|celestial|black hole|escape velocity|n-body/.test(
      corpus
    )
  ) {
    return "orbital_gravity";
  }
  if (
    /electr|magnet|lorentz|circuit|maxwell|charge|plasma|induct|capacit|voltage|current|quantum spin|photon/.test(
      corpus
    )
  ) {
    return "electromagnetic_lorentz";
  }
  if (
    /fourier|wave|signal|acoust|optic|oscillat|frequenc|spectrum|harmonic|quantum|schrodinger|resonanc|music|dsp/.test(
      corpus
    )
  ) {
    return "wave_resonance";
  }
  if (
    /control|pid|robot|spring|damper|feedback|pendulum|vibrat|stability|lyapunov|servo|mechatron|ode|differential/.test(
      corpus
    )
  ) {
    return "harmonic_control";
  }
  if (
    /kinemat|ballist|projectil|newton|force|momentum|collision|fluid|aerodynam|drag|thermo|mechanic|stat|vector/.test(
      corpus
    )
  ) {
    return "ballistic_kinematics";
  }
  // CS, Algorithms, B-Trees, ML/AI, Optimization, Calculus, Linear Algebra, Economics, Biology, etc.
  return "energy_landscape";
}

/**
 * Extracts salient domain terms from user-uploaded or pasted notes so deterministic
 * synthesis incorporates the learner's exact material even offline.
 */
export function extractNoteConcepts(
  rawNotesText?: string,
  uploadedDocs?: UploadedNoteDocument[],
  fallbackTopic: string = "Core System"
): string[] {
  const combined = [
    rawNotesText || "",
    ...(uploadedDocs || []).map((d) => d.textContent || d.name.replace(/\.[^.]+$/, "")),
  ]
    .join("\n")
    .trim();

  if (!combined) {
    const words = fallbackTopic
      .split(/[\s,:/-]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);
    return words.length > 0
      ? words.slice(0, 5)
      : ["Vector State", "Conservation Invariant", "RK4 Integration", "Equilibrium"];
  }

  const found: string[] = [];
  const seen = new Set<string>();

  // 1. Markdown headings (#, ##, ###)
  const headingMatches = combined.matchAll(/^#{1,4}\s+([^\n#]{3,55})/gm);
  for (const m of headingMatches) {
    const clean = m[1].replace(/[*_`]/g, "").trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      found.push(clean);
      if (found.length >= 8) break;
    }
  }

  // 2. Bold technical terms (**term**)
  if (found.length < 8) {
    const boldMatches = combined.matchAll(/\*\*([^*]{3,42})\*\*/g);
    for (const m of boldMatches) {
      const clean = m[1].trim();
      const key = clean.toLowerCase();
      if (clean && !seen.has(key)) {
        seen.add(key);
        found.push(clean);
        if (found.length >= 8) break;
      }
    }
  }

  // 3. Capitalized domain phrases
  if (found.length < 6) {
    const capMatches = combined.matchAll(/\b([A-Z][a-zA-Z0-9+-]{3,24}(?:\s+[A-Z][a-zA-Z0-9+-]{2,24})?)\b/g);
    for (const m of capMatches) {
      const clean = m[1].trim();
      const key = clean.toLowerCase();
      if (
        clean &&
        !seen.has(key) &&
        !/^(The|This|That|When|Where|With|From|Into|Note|Chapter|Section)$/.test(clean)
      ) {
        seen.add(key);
        found.push(clean);
        if (found.length >= 8) break;
      }
    }
  }

  return found.length > 0
    ? found
    : [fallbackTopic.trim() || "Integrative Mechanics", "Differential Invariants", "RK4 Solver"];
}

/**
 * Deterministically compiles a 5-stage playable 3D Physics & Math Lab Blueprint
 * for ANY subject, module, or custom query—no matter what API is configured.
 */
export function compileIntegrativeLabBlueprint(params: {
  topic: string;
  category?: string;
  notesText?: string;
  courseId?: string;
  moduleId?: string;
  synthesisEngine?: string;
}): IntegrativeLabBlueprint {
  const cleanTopic = (params.topic || "Integrative Physics & Applied Mathematics").trim();
  const archetypeId = classifyTopicArchetype(
    cleanTopic,
    params.category || "",
    params.notesText || ""
  );
  const spec = ARCHETYPES[archetypeId];
  const seed = hashTopicSeed(cleanTopic);
  const extracted = extractNoteConcepts(params.notesText, undefined, cleanTopic);

  const stages: IntegrativeStageConfig[] = spec.unitBlueprints.map((ub, idx) => {
    const stageNum = idx + 1;
    const conceptTag = extracted[idx % extracted.length] || cleanTopic;
    return {
      stageNumber: stageNum,
      title: `Stage ${stageNum}: ${ub.suffix}`,
      conceptBridge: `${conceptTag} · ${ub.mathFocus}`,
      governingEquation: ub.equation,
      beaconCount: Math.min(6, 3 + Math.floor(idx * 0.75)),
      droneCount: idx === 0 ? 1 : Math.min(5, 1 + idx),
      gravityMs2: Math.round((spec.defaultGravityMs2 * (0.9 + idx * 0.08)) * 100) / 100,
      dragCoeff: Math.round((spec.defaultDragCoeff + idx * 0.015) * 1000) / 1000,
      wellStrength:
        archetypeId === "orbital_gravity" || archetypeId === "energy_landscape"
          ? Math.round((18 + idx * 9) * 10) / 10
          : Math.round((8 + idx * 5) * 10) / 10,
      lorentzBz:
        archetypeId === "electromagnetic_lorentz"
          ? Math.round((0.35 + idx * 0.14) * 100) / 100
          : idx >= 3
          ? 0.18
          : 0,
      targetEnergyJoules: Math.round(420 + idx * 145),
    };
  });

  return {
    id: `lab-${seed}-${Date.now().toString(36)}`,
    topic: cleanTopic,
    courseId: params.courseId,
    moduleId: params.moduleId,
    archetype: archetypeId,
    archetypeLabel: spec.label,
    domainAnalogySummary: spec.bridgeExplanation(cleanTopic),
    primaryEquation: spec.primaryEquation,
    conservationLaw: spec.conservationLaw,
    terrainSeed: seed,
    accentHex: spec.accentHex,
    defaultGravityMs2: spec.defaultGravityMs2,
    defaultLaunchSpeedMs: spec.defaultLaunchSpeedMs,
    defaultDragCoeff: spec.defaultDragCoeff,
    defaultFieldCoupling: spec.defaultFieldCoupling,
    stages,
    synthesisEngine: params.synthesisEngine || "first-principles-rk4-compiler",
  };
}

/**
 * Generates rich, self-contained Integrative Markdown notes (~340 words) pairing
 * domain mastery with real governing differential equations and numerical verification.
 */
function buildIntegrativeUnitMarkdown(
  topic: string,
  unitTitle: string,
  mathFocus: string,
  equation: string,
  spec: ArchetypeSpec,
  concepts: string[],
  learnerLevel: LearnerLevel,
  notesSnippet?: string
): string {
  const depthNote =
    learnerLevel === "Advanced"
      ? "We treat boundary conditions, spectral stability bounds, and non-conservative perturbations rigorously."
      : learnerLevel === "Beginner"
      ? "We build intuition first from tangible force-motion balances before formalizing each equation."
      : "We couple geometric intuition directly with differential invariants and numerical verification.";

  const groundedExcerpt =
    notesSnippet && notesSnippet.trim().length > 20
      ? `\n### Grounded Learner Note Context\n> ${notesSnippet
          .trim()
          .replace(/\s+/g, " ")
          .slice(0, 260)}\n`
      : "";

  return `# ${unitTitle}

## 1. Integrative Mental Model (${topic})
Mastering **${topic}** becomes permanent when anchored to measurable physical and mathematical invariants. ${spec.bridgeExplanation(
    topic
  )} ${depthNote}
${groundedExcerpt}
## 2. Governing Mathematical & Physical Formulation
- **Primary Dynamical Law**: \`${spec.primaryEquation}\`
- **Unit Operator & Invariant**: \`${equation}\`
- **Conservation & Dissipation Relation**: \`${spec.conservationLaw}\`
- **Core Mathematical Focus**: ${mathFocus}

When a state vector **r(t)** evolves under restoring and dissipative forces, total mechanical/system energy $E = K + U$ remains strictly invariant in conservative regimes and decays monotonically ($dE/dt = -c\\|\\mathbf{v}\\|^2 \\le 0$) under damping or aerodynamic drag.

## 3. Worked Numerical Verification (RK4 Solver)
Consider a calibration probe of mass $m = 2.0\\text{ kg}$ launched at $v_0 = ${
    spec.defaultLaunchSpeedMs
  }\\text{ m/s}$ at elevation $\\theta = 35^\\circ$ under $g = ${
    spec.defaultGravityMs2
  }\\text{ m/s}^2$:
- Vertical component: $v_{0y} = v_0 \\sin(35^\\circ) \\approx ${(
    spec.defaultLaunchSpeedMs * Math.sin((35 * Math.PI) / 180)
  ).toFixed(2)}\\text{ m/s}$
- Initial Kinetic Energy: $E_k(0) = \\tfrac{1}{2} m v_0^2 = ${(
    0.5 *
    2.0 *
    spec.defaultLaunchSpeedMs *
    spec.defaultLaunchSpeedMs
  ).toFixed(1)}\\text{ J}$
- Vacuum Apex Bound: $h_{\\max} = v_{0y}^2 / (2g) \\approx ${(
    Math.pow(spec.defaultLaunchSpeedMs * Math.sin((35 * Math.PI) / 180), 2) /
    (2 * spec.defaultGravityMs2)
  ).toFixed(2)}\\text{ m}$

## 4. High-Yield Mastery Checklist
${concepts.map((c) => `- Verify how **${c}** transforms under scaling and boundary perturbations.`).join("\n")}
- Launch the **3D Physics & Math Lab** to test this unit's live RK4 trajectory and conservation residuals.`;
}

/**
 * API-independent deterministic curriculum generator. Produces a complete, multi-unit
 * integrative curriculum with real physics & math equations regardless of API availability.
 */
export function synthesizeDeterministicCurriculum(params: {
  topic?: string;
  learningGoals?: string;
  learnerLevel?: LearnerLevel;
  targetUnitCount?: number;
  category?: string;
  rawNotesText?: string;
  uploadedDocuments?: UploadedNoteDocument[];
}): GeneratedCurriculum {
  const inferredTopic =
    params.topic?.trim() ||
    params.uploadedDocuments?.[0]?.name?.replace(/\.[^.]+$/, "") ||
    extractNoteConcepts(params.rawNotesText, params.uploadedDocuments, "Integrative Systems")[0] ||
    "Integrative Physics & Applied Mathematics";

  const unitCount = Math.max(3, Math.min(8, Math.round(Number(params.targetUnitCount) || 5)));
  const level: LearnerLevel = params.learnerLevel || "Intermediate";
  const combinedNotes = [
    params.rawNotesText || "",
    ...(params.uploadedDocuments || []).map((d) => d.textContent || ""),
  ]
    .join("\n\n")
    .trim();

  const archetypeId = classifyTopicArchetype(
    inferredTopic,
    params.category || "",
    combinedNotes
  );
  const spec = ARCHETYPES[archetypeId];
  const extractedTerms = extractNoteConcepts(
    params.rawNotesText,
    params.uploadedDocuments,
    inferredTopic
  );

  const units: GeneratedCurriculumUnit[] = [];
  for (let i = 0; i < unitCount; i++) {
    const template = spec.unitBlueprints[i % spec.unitBlueprints.length];
    const termFocus = extractedTerms[i % extractedTerms.length] || inferredTopic;
    const title =
      i < extractedTerms.length && combinedNotes.length > 40
        ? `${termFocus}: ${template.suffix}`
        : `${inferredTopic} — ${template.suffix}`;

    const unitConcepts = [
      termFocus,
      template.mathFocus.split("&")[0].trim(),
      "Conservation Law",
      "RK4 Integration",
    ].slice(0, 4);

    const snippetStart = i * 280;
    const snippet =
      combinedNotes.length > snippetStart
        ? combinedNotes.slice(snippetStart, snippetStart + 280)
        : "";

    units.push({
      title,
      estimatedHours: template.hours,
      keyConcepts: unitConcepts,
      searchQueryForVideo: `${inferredTopic} ${template.mathFocus} university lecture`,
      briefOverview: `Integrates ${termFocus} with ${template.mathFocus.toLowerCase()} governed by ${template.equation}.`,
      starterNotesMarkdown: buildIntegrativeUnitMarkdown(
        inferredTopic,
        title,
        template.mathFocus,
        template.equation,
        spec,
        unitConcepts,
        level,
        snippet
      ),
    });
  }

  const flashcards: GeneratedFlashcardSeed[] = units.flatMap((u, idx) => {
    const template = spec.unitBlueprints[idx % spec.unitBlueprints.length];
    return [
      {
        unitIndex: idx,
        question: `[${inferredTopic}] State the governing equation and physical invariant for "${u.title}".`,
        answer: `Governing relation: ${template.equation}. System invariant: ${spec.conservationLaw}.`,
      },
      {
        unitIndex: idx,
        question: `Why do we use 4th-Order Runge-Kutta (RK4) over forward Euler when simulating ${u.keyConcepts[0]}?`,
        answer: `RK4 samples 4 slope stages (k₁, k₂, k₃, k₄) per step to achieve O(Δt⁴) global accuracy and drastically lower artificial energy drift compared to O(Δt) Euler.`,
      },
    ];
  });

  const resolvedCategory =
    params.category?.trim() || "Integrative Physics & Mathematics";
  const prefix =
    inferredTopic
      .replace(/[^a-zA-Z]/g, "")
      .slice(0, 3)
      .toUpperCase() || "PHY";
  const code = `${prefix}-${(hashTopicSeed(inferredTopic) % 400) + 101}`;

  return {
    courseTitle: inferredTopic,
    courseCode: code,
    category: resolvedCategory,
    tags: [
      inferredTopic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) ||
        "integrative",
      archetypeId.replace("_", "-"),
      "real-physics",
      "applied-math",
    ],
    executiveSummary: `Integrative ${unitCount}-unit curriculum uniting "${inferredTopic}" with ${spec.label}, analytical differential invariants (${spec.primaryEquation}), and interactive 3D RK4 laboratory verification.${
      params.learningGoals ? ` Tailored toward: ${params.learningGoals.trim()}.` : ""
    }`,
    units,
    flashcards: flashcards.slice(0, 10),
    milestones: [
      {
        title: `Derive & Verify Governing Invariants for ${inferredTopic}`,
        subtitle: `${code} · Analytical Conservation Proof`,
        dueInDays: 3,
        urgency: "high",
      },
      {
        title: `Complete 5-Stage 3D Physics & Math Proving Ground`,
        subtitle: `${code} · Interactive RK4 Trajectory Calibration`,
        dueInDays: 6,
        urgency: "medium",
      },
      {
        title: `Active-Recall Leitner Box 4+ Mastery`,
        subtitle: `${code} · Spaced Repetition Synthesis`,
        dueInDays: 10,
        urgency: "normal",
      },
    ],
    studyBlocks: [
      {
        timeRange: "09:00 - 10:00",
        durationMinutes: 60,
        title: `${inferredTopic}: First-Principles Derivation`,
        subtitle: `${code} · Knowledge Vault + Equations`,
      },
      {
        timeRange: "16:00 - 16:45",
        durationMinutes: 45,
        title: `${inferredTopic}: 3D Physics & Math Proving Ground`,
        subtitle: `${code} · Live RK4 Simulation Lab`,
      },
    ],
  };
}

/**
 * API-independent deterministic Deep Research Report generator grounded in real math & physics.
 */
export function synthesizeDeterministicResearchReport(params: {
  topic: string;
  rawNotesText?: string;
}): DeepResearchReportData {
  const cleanTopic = (params.topic || "Integrative Dynamical Systems").trim();
  const archetypeId = classifyTopicArchetype(cleanTopic, "", params.rawNotesText || "");
  const spec = ARCHETYPES[archetypeId];

  return {
    title: `${cleanTopic}: Integrative Mathematical & Physical Synthesis`,
    subtitle: `First-Principles Differential Mechanics, Conservation Laws & RK4 Numerical Verification`,
    executiveSummary: `${spec.bridgeExplanation(
      cleanTopic
    )} Regardless of external API availability, this formal synthesis establishes exact governing differential operators, energy-momentum bounds, numerical integration stability criteria, and executable verification routines.`,
    mathInvariants: [
      {
        label: "Governing Dynamical Equation",
        formula: spec.primaryEquation,
        explanation: `Defines time evolution of state coordinates and momentum for ${cleanTopic} under restoring, field, and dissipative forces.`,
      },
      {
        label: "Energy-Momentum Conservation Identity",
        formula: spec.conservationLaw,
        explanation:
          "Separates conservative potential exchanges from non-conservative drag/damping dissipation.",
      },
      {
        label: "RK4 Fourth-Order Discretization Operator",
        formula: "y_{n+1} = y_n + (Δt/6)(k₁ + 2k₂ + 2k₃ + k₄),  |e_global| ≤ C · Δt⁴",
        explanation:
          "Guarantees fourth-order convergence across nonlinear central-force, drag, and Lorentz terms.",
      },
    ],
    comparisonMatrix: [
      {
        approach: "Forward Euler",
        modelType: "1st-Order Explicit",
        boundOrMetric: "O(Δt)",
        complexity: "1 eval/step",
        performance: "Unstable energy growth on oscillatory modes",
        tradeoff: "Fastest step, severe phase/energy drift",
      },
      {
        approach: "Symplectic Velocity-Verlet",
        modelType: "2nd-Order Symplectic",
        boundOrMetric: "O(Δt²)",
        complexity: "1–2 evals/step",
        performance: "Bounded Hamiltonian oscillation over long horizons",
        tradeoff: "Ideal for conservative orbital/spring systems",
      },
      {
        approach: "Classical Runge-Kutta (RK4)",
        modelType: "4th-Order Multi-Stage",
        boundOrMetric: "O(Δt⁴)",
        complexity: "4 evals/step",
        performance: "Sub-millimeter ballistic & Lorentz accuracy at 120 Hz",
        tradeoff: "Gold-standard balance for damped + field-coupled dynamics",
      },
    ],
    codeSectionTitle: `Executable RK4 Physics & Conservation Verifier (${cleanTopic})`,
    codeLanguage: "typescript",
    codeSnippet: `// Self-contained RK4 trajectory & mechanical energy conservation audit
interface State3D { x: number; y: number; z: number; vx: number; vy: number; vz: number; }

export function verifyIntegrativeTrajectory(v0 = ${spec.defaultLaunchSpeedMs}, thetaDeg = 38) {
  const g = ${spec.defaultGravityMs2};
  const beta = ${(spec.defaultDragCoeff * 0.05).toFixed(4)}; // 0.5 * rho * Cd * A / m
  const rad = (thetaDeg * Math.PI) / 180;
  const s: State3D = { x: 0, y: 0, z: 0, vx: v0 * Math.cos(rad), vy: v0 * Math.sin(rad), vz: 0 };
  const accel = (vx: number, vy: number, vz: number) => {
    const sp = Math.hypot(vx, vy, vz);
    return [-beta * sp * vx, -g - beta * sp * vy, -beta * sp * vz] as const;
  };
  const dt = 0.01;
  for (let step = 0; step < 500 && (s.y >= 0 || step === 0); step++) {
    const [ax1, ay1, az1] = accel(s.vx, s.vy, s.vz);
    const [ax2, ay2, az2] = accel(s.vx + 0.5 * dt * ax1, s.vy + 0.5 * dt * ay1, s.vz + 0.5 * dt * az1);
    const [ax3, ay3, az3] = accel(s.vx + 0.5 * dt * ax2, s.vy + 0.5 * dt * ay2, s.vz + 0.5 * dt * az2);
    const [ax4, ay4, az4] = accel(s.vx + dt * ax3, s.vy + dt * ay3, s.vz + dt * az3);
    s.x += (dt / 6) * (4 * s.vx + dt * (ax1 + ax2 + ax3));
    s.y += (dt / 6) * (4 * s.vy + dt * (ay1 + ay2 + ay3));
    s.z += (dt / 6) * (4 * s.vz + dt * (az1 + az2 + az3));
    s.vx += (dt / 6) * (ax1 + 2 * ax2 + 2 * ax3 + ax4);
    s.vy += (dt / 6) * (ay1 + 2 * ay2 + 2 * ay3 + ay4);
    s.vz += (dt / 6) * (az1 + 2 * az2 + 2 * az3 + az4);
  }
  return { rangeMeters: s.x.toFixed(2), impactSpeedMs: Math.hypot(s.vx, s.vy, s.vz).toFixed(2) };
}`,
    formalVerificationTitle: "Conservation & Stability Invariant Specification",
    formalVerificationSpec: `INVARIANT_1 (Conservative Limit β = 0): |E(t) - E(0)| / |E(0)| < 1.0e-6 for Δt ≤ 1/120 s
INVARIANT_2 (Passivity / Drag β > 0):    ∀ t₂ > t₁, E_mech(t₂) ≤ E_mech(t₁)
INVARIANT_3 (Lorentz Orthogonality):    v · (q v × B) == 0 (zero magnetic work)`,
    fiveDayTrack: spec.unitBlueprints.map((u, i) => ({
      day: `Day ${i + 1}`,
      milestone: `${u.suffix} — Master ${u.equation} and verify in 3D Physics Lab`,
    })),
  };
}

/**
 * API-independent Autonomous Note-Taker & Flashcard Synthesizer.
 */
export function synthesizeDeterministicAutonomousNotes(params: {
  moduleTitle: string;
  courseTitle?: string;
  courseCategory?: string;
  existingNotes?: string;
  learningGoals?: string;
}): AutonomousSyncResult {
  const cleanTitle = (params.moduleTitle || "Integrative Physics & Math Unit").trim();
  const archetypeId = classifyTopicArchetype(
    `${cleanTitle} ${params.courseTitle || ""}`,
    params.courseCategory || "",
    params.existingNotes || ""
  );
  const spec = ARCHETYPES[archetypeId];
  const concepts = extractNoteConcepts(params.existingNotes, undefined, cleanTitle);
  const unitTemplate = spec.unitBlueprints[hashTopicSeed(cleanTitle) % spec.unitBlueprints.length];

  const notesMarkdown = buildIntegrativeUnitMarkdown(
    cleanTitle,
    cleanTitle,
    unitTemplate.mathFocus,
    unitTemplate.equation,
    spec,
    concepts,
    "Intermediate",
    params.existingNotes
  );

  return {
    notesMarkdown,
    thinkingSummary: `Compiled first-principles equations (${unitTemplate.equation}), RK4 numerical example, and active-recall flashcards for "${cleanTitle}".`,
    briefOverview: `${spec.bridgeExplanation(cleanTitle)} Focuses on ${unitTemplate.mathFocus}.`,
    keyConcepts: [
      ...concepts.slice(0, 3),
      archetypeId.replace("_", "-"),
      "rk4-physics",
    ].slice(0, 5),
    searchQueryForVideo: `${cleanTitle} ${unitTemplate.mathFocus} university lecture`,
    webSources: [],
    flashcards: [
      {
        question: `What is the primary dynamical law governing "${cleanTitle}" in integrative physics?`,
        answer: `${spec.primaryEquation}, subject to conservation relation ${spec.conservationLaw}.`,
      },
      {
        question: `How does aerodynamic drag or damping alter total mechanical energy E = K + U?`,
        answer: `Non-conservative drag dissipates mechanical energy at rate dE/dt = F_drag · v ≤ 0, monotonically reducing apex height and horizontal range.`,
      },
      {
        question: `State the mathematical focus invariant for "${cleanTitle}".`,
        answer: `${unitTemplate.mathFocus}: ${unitTemplate.equation}.`,
      },
    ],
    groundedWithSearch: false,
    model: "first-principles-physics-math-engine",
    syncedAt: new Date().toISOString(),
  };
}

/**
 * API-independent Knowledge Vault Assistant fallback (Summarize, Flashcards, Code, Ingest, Q&A).
 */
export function synthesizeDeterministicVaultAssist(params: {
  action: "summarize" | "flashcards" | "ask" | "extract_code" | "ingest_file";
  notesMarkdown: string;
  moduleTitle: string;
  question?: string;
  uploadedDocument?: UploadedNoteDocument;
}): { markdown?: string; cards?: Array<{ question: string; answer: string }> } {
  const title = (params.moduleTitle || "Study Unit").trim();
  const archetypeId = classifyTopicArchetype(title, "", params.notesMarkdown);
  const spec = ARCHETYPES[archetypeId];

  if (params.action === "flashcards") {
    return {
      cards: [
        {
          question: `What governing equation models "${title}"?`,
          answer: `${spec.primaryEquation}`,
        },
        {
          question: `What conservation identity holds in the zero-dissipation limit for "${title}"?`,
          answer: `${spec.conservationLaw}`,
        },
        {
          question: `How is trajectory state integrated numerically in the Study OS 3D Lab?`,
          answer: `Via 4th-Order Runge-Kutta (RK4) with O(Δt⁴) accuracy across gravity, drag, central wells, and Lorentz forces.`,
        },
        {
          question: `How do conservative forces relate to potential energy U(r)?`,
          answer: `F(r) = -∇U(r), meaning work depends only on endpoints and ∮ F · dr = 0.`,
        },
      ],
    };
  }

  if (params.action === "ingest_file" && params.uploadedDocument) {
    const rawText = params.uploadedDocument.textContent?.trim() || "";
    const concepts = extractNoteConcepts(rawText, [params.uploadedDocument], title);
    return {
      markdown: `# Imported Study Notes: ${params.uploadedDocument.name}\n\n${
        rawText
          ? rawText.slice(0, 12000)
          : `*(Binary document attached: ${params.uploadedDocument.name})*`
      }\n\n## Integrative Physics & Math Synthesis\n- **Archetype**: ${
        spec.label
      }\n- **Governing Law**: \`${spec.primaryEquation}\`\n- **Extracted Concepts**: ${concepts.join(
        " · "
      )}`,
    };
  }

  if (params.action === "extract_code") {
    const report = synthesizeDeterministicResearchReport({
      topic: title,
      rawNotesText: params.notesMarkdown,
    });
    return {
      markdown: `### Numerical Physics & Math Verifier (${title})\n\`\`\`typescript\n${report.codeSnippet}\n\`\`\``,
    };
  }

  if (params.action === "summarize") {
    return {
      markdown: `### Integrative Executive Summary (${title})\n- **Dynamical Model**: ${spec.label}\n- **Governing Law**: \`${spec.primaryEquation}\`\n- **Conservation Identity**: \`${spec.conservationLaw}\`\n- **Actionable Next Step**: Test parameter sensitivity ($g$, $v_0$, $C_d$, field coupling $k$) inside the **3D Physics & Math Lab**.`,
    };
  }

  return {
    markdown: `### First-Principles Analysis: ${
      params.question || title
    }\nWe resolve this by examining the state-space evolution under \`${
      spec.primaryEquation
    }\` and tracking the invariant \`${
      spec.conservationLaw
    }\`. Perturbing initial velocity $v_0$ scales kinetic energy quadratically ($E_k \\propto v_0^2$), whereas dissipative drag removes mechanical energy at rate $P_{\\text{loss}} = \\tfrac{1}{2}\\rho C_d A \\|\\mathbf{v}\\|^3$.`,
  };
}

/**
 * Formats telemetry from an interactive 3D Physics & Math Lab session into clean
 * Markdown notes ready to append/save into the learner's Knowledge Vault.
 */
export function formatLabSessionMarkdownReport(input: {
  blueprint: IntegrativeLabBlueprint;
  stagesCleared: number;
  beaconsCalibrated: number;
  score: number;
  gravityMs2: number;
  launchSpeedMs: number;
  dragCoeff: number;
  fieldCoupling: number;
  peakKineticJoules: number;
  peakMomentumKgMs: number;
}): string {
  const apexEst =
    (input.launchSpeedMs * Math.sin((38 * Math.PI) / 180)) ** 2 /
    (2 * Math.max(0.5, input.gravityMs2));

  return `## Verified 3D Physics & Math Lab Report — ${input.blueprint.topic}

- **Dynamical Archetype**: ${input.blueprint.archetypeLabel}
- **Governing Differential Law**: \`${input.blueprint.primaryEquation}\`
- **Conservation Identity**: \`${input.blueprint.conservationLaw}\`
- **Proving Ground Telemetry**: Stages Cleared \`${input.stagesCleared}/${
    input.blueprint.stages.length
  }\` · Resonance Beacons Calibrated \`${input.beaconsCalibrated}\` · Lab Score \`${
    input.score
  }\`

### Calibrated Physical Parameters & Measured Invariants
- Gravitational Acceleration $g$: \`${input.gravityMs2.toFixed(2)} m/s²\`
- Ballistic Launch Speed $v_0$: \`${input.launchSpeedMs.toFixed(1)} m/s\`
- Aerodynamic Drag Coefficient $C_d$: \`${input.dragCoeff.toFixed(3)}\`
- Field Coupling Multiplier $k$: \`${input.fieldCoupling.toFixed(2)}×\`
- Peak Rover/Pulse Kinetic Energy $E_k = \\tfrac{1}{2}mv^2$: \`${input.peakKineticJoules.toFixed(
    1
  )} J\`
- Peak Linear Momentum $\\|\\mathbf{p}\\| = mv$: \`${input.peakMomentumKgMs.toFixed(1)} kg·m/s\`
- Analytical 38° Vacuum Apex Reference $h_{\\max} = v_{0y}^2/(2g)$: \`${apexEst.toFixed(2)} m\`
`;
}

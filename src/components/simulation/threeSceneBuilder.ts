import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { terrainHeightAt, terrainNormalAt } from "../../lib/integrativePhysicsEngine";

export function detectSoftwareWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return true;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export interface StudioEnvironmentHandles {
  envTexture: THREE.Texture;
  contactShadowTex: THREE.CanvasTexture;
  terrainAlbedoTex: THREE.CanvasTexture;
  terrainRoughnessTex: THREE.CanvasTexture;
  dispose: () => void;
}

/**
 * Generates zero-404 procedural PBR textures (albedo with SRGBColorSpace + maxAnisotropy,
 * linear roughness/bump map, radial contact shadow) and RoomEnvironment PMREM reflections.
 */
export function buildStudioTexturesAndEnv(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  accentHex: string = "#38bdf8"
): StudioEnvironmentHandles {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Studio PBR Environment Map (Mandatory on every device)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = envRT.texture;
  pmremGenerator.dispose();

  // 2. Soft Radial Contact Shadow Texture
  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = 128;
  shadowCanvas.height = 128;
  const sCtx = shadowCanvas.getContext("2d")!;
  const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
  grad.addColorStop(0, "rgba(3, 6, 14, 0.72)");
  grad.addColorStop(0.55, "rgba(3, 6, 14, 0.32)");
  grad.addColorStop(1, "rgba(3, 6, 14, 0)");
  sCtx.fillStyle = grad;
  sCtx.fillRect(0, 0, 128, 128);
  const contactShadowTex = new THREE.CanvasTexture(shadowCanvas);
  contactShadowTex.colorSpace = THREE.SRGBColorSpace;

  // 3. Topographic Metric Grid Terrain Albedo Texture (SRGBColorSpace + max anisotropy)
  const albedoCanvas = document.createElement("canvas");
  albedoCanvas.width = 512;
  albedoCanvas.height = 512;
  const aCtx = albedoCanvas.getContext("2d")!;
  aCtx.fillStyle = "#131c2e";
  aCtx.fillRect(0, 0, 512, 512);

  // Subtle mineral grain
  for (let i = 0; i < 2400; i++) {
    const gx = (i * 73) % 512;
    const gy = (i * 137) % 512;
    aCtx.fillStyle = i % 2 === 0 ? "rgba(148, 163, 184, 0.035)" : "rgba(15, 23, 42, 0.14)";
    aCtx.fillRect(gx, gy, 3, 3);
  }

  // Minor 1-meter subdivisions
  aCtx.strokeStyle = "rgba(148, 163, 184, 0.09)";
  aCtx.lineWidth = 1;
  for (let step = 0; step <= 512; step += 64) {
    aCtx.beginPath();
    aCtx.moveTo(step, 0);
    aCtx.lineTo(step, 512);
    aCtx.stroke();
    aCtx.beginPath();
    aCtx.moveTo(0, step);
    aCtx.lineTo(512, step);
    aCtx.stroke();
  }

  // Major 8-meter metric reference lines
  aCtx.strokeStyle = accentHex + "33";
  aCtx.lineWidth = 2;
  aCtx.strokeRect(1, 1, 510, 510);

  // Fiducial crosshairs
  aCtx.strokeStyle = "rgba(226, 232, 240, 0.22)";
  aCtx.lineWidth = 1.5;
  aCtx.beginPath();
  aCtx.moveTo(248, 256);
  aCtx.lineTo(264, 256);
  aCtx.moveTo(256, 248);
  aCtx.lineTo(256, 264);
  aCtx.stroke();

  const terrainAlbedoTex = new THREE.CanvasTexture(albedoCanvas);
  terrainAlbedoTex.colorSpace = THREE.SRGBColorSpace;
  terrainAlbedoTex.wrapS = THREE.RepeatWrapping;
  terrainAlbedoTex.wrapT = THREE.RepeatWrapping;
  terrainAlbedoTex.repeat.set(28, 28);
  terrainAlbedoTex.anisotropy = maxAniso;

  // 4. Linear Roughness / Micro-Bump Data Map (NoColorSpace)
  const roughCanvas = document.createElement("canvas");
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext("2d")!;
  rCtx.fillStyle = "#c8c8c8";
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const rx = (i * 59) % 256;
    const ry = (i * 97) % 256;
    const shade = 165 + (i % 70);
    rCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    rCtx.fillRect(rx, ry, 4, 4);
  }
  const terrainRoughnessTex = new THREE.CanvasTexture(roughCanvas);
  terrainRoughnessTex.colorSpace = THREE.NoColorSpace;
  terrainRoughnessTex.wrapS = THREE.RepeatWrapping;
  terrainRoughnessTex.wrapT = THREE.RepeatWrapping;
  terrainRoughnessTex.repeat.set(28, 28);
  terrainRoughnessTex.anisotropy = maxAniso;

  return {
    envTexture: envRT.texture,
    contactShadowTex,
    terrainAlbedoTex,
    terrainRoughnessTex,
    dispose: () => {
      envRT.dispose();
      contactShadowTex.dispose();
      terrainAlbedoTex.dispose();
      terrainRoughnessTex.dispose();
    },
  };
}

/**
 * Configures balanced 3-point warm/cool studio & outdoor proving ground lighting
 * plus horizon-matched exponential fog.
 */
export function setupProvingGroundLighting(
  scene: THREE.Scene,
  isSoftwareGl: boolean
): { keyLight: THREE.DirectionalLight } {
  const skyHorizonHex = 0x0b1220;
  scene.background = new THREE.Color(skyHorizonHex);
  scene.fog = new THREE.FogExp2(skyHorizonHex, 0.0095);

  // Cool sky / deep slate ground Hemisphere fill
  const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e293b, 0.85);
  hemiLight.position.set(0, 60, 0);
  scene.add(hemiLight);

  // Warm solar key light with tight orthographic shadow frustum
  const keyLight = new THREE.DirectionalLight(0xfff1d6, 2.35);
  keyLight.position.set(36, 54, 28);
  keyLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 8;
    keyLight.shadow.camera.far = 150;
    const d = 52;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  // Cool cyan rim / backlight to separate metallic silhouettes from mountains
  const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.95);
  rimLight.position.set(-42, 26, -38);
  scene.add(rimLight);

  return { keyLight };
}

/**
 * Builds the continuous 220m x 220m analytical terrain mesh and natural outdoor
 * perimeter of InstancedMesh basalt cliff outcrops & alpine pine groves (zero indoor walls).
 */
export function buildOutdoorTerrainAndPerimeter(
  scene: THREE.Object3D,
  seed: number,
  albedoTex: THREE.CanvasTexture,
  roughTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): { dispose: () => void } {
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Continuous Analytical Heightfield Mesh
  const size = 220;
  const segs = isSoftwareGl ? 96 : 140;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(posAttr.count * 3);
  const cLow = new THREE.Color(0x162033);
  const cMid = new THREE.Color(0x1e293b);
  const cHigh = new THREE.Color(0x334155);
  const cSnow = new THREE.Color(0x64748b);
  const cTmp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const vy = terrainHeightAt(vx, vz, seed);
    posAttr.setY(i, vy);

    if (vy < 1.2) {
      cTmp.copy(cLow).lerp(cMid, Math.max(0, (vy + 1.5) / 2.7));
    } else if (vy < 9.0) {
      cTmp.copy(cMid).lerp(cHigh, (vy - 1.2) / 7.8);
    } else {
      cTmp.copy(cHigh).lerp(cSnow, Math.min(1, (vy - 9.0) / 14.0));
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }
  terrainGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    map: albedoTex,
    roughnessMap: roughTex,
    bumpMap: roughTex,
    bumpScale: 0.08,
    vertexColors: true,
    roughness: 0.84,
    metalness: 0.08,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  scene.add(terrainMesh);
  disposables.push(terrainGeo, terrainMat);

  // Central Proving Pad Calibration Ring (offset on Y + polygonOffset to prevent Z-fighting)
  const padRingGeo = new THREE.RingGeometry(8.6, 9.1, 64);
  padRingGeo.rotateX(-Math.PI / 2);
  const padRingMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.35,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    depthWrite: false,
  });
  const padRing = new THREE.Mesh(padRingGeo, padRingMat);
  padRing.position.y = terrainHeightAt(0, 0, seed) + 0.03;
  scene.add(padRing);
  disposables.push(padRingGeo, padRingMat);

  // 2. Natural Perimeter Basalt Boulders & Crags (InstancedMesh > 20 items)
  const rockCount = 76;
  const rockGeo = new THREE.DodecahedronGeometry(1.4, 1);
  // Facet-perturb vertices slightly for authentic fractured basalt silhouette
  const rPos = rockGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < rPos.count; i++) {
    const px = rPos.getX(i);
    const py = rPos.getY(i);
    const pz = rPos.getZ(i);
    const scaleMod = 0.88 + 0.22 * Math.sin(px * 3.1 + pz * 2.7);
    rPos.setXYZ(i, px * scaleMod, Math.max(0.0, py + 0.9) * 0.85, pz * scaleMod);
  }
  rockGeo.computeVertexNormals();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.88,
    metalness: 0.12,
    flatShading: true,
  });
  const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rockInst.castShadow = !isSoftwareGl;
  rockInst.receiveShadow = !isSoftwareGl;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < rockCount; i++) {
    const angle = (i / rockCount) * Math.PI * 2 + ((seed + i * 17) % 11) * 0.04;
    const radius = 50 + ((i * 29 + seed) % 28);
    const rx = Math.cos(angle) * radius;
    const rz = Math.sin(angle) * radius;
    const ry = terrainHeightAt(rx, rz, seed) - 0.15;

    const s = (0.85 + ((i * 13) % 30) * 0.01) * (1.2 + (radius - 50) * 0.06);
    dummy.position.set(rx, ry, rz);
    dummy.rotation.set(0, angle * 1.7, ((i % 5) - 2) * 0.06);
    dummy.scale.set(s * 1.15, s * (0.9 + (i % 4) * 0.22), s);
    dummy.updateMatrix();
    rockInst.setMatrixAt(i, dummy.matrix);

    const lum = 0.78 + ((i * 7) % 25) * 0.014;
    tint.setRGB(0.28 * lum, 0.34 * lum, 0.43 * lum);
    rockInst.setColorAt(i, tint);
  }
  rockInst.instanceMatrix.needsUpdate = true;
  if (rockInst.instanceColor) rockInst.instanceColor.needsUpdate = true;
  rockInst.computeBoundingSphere();
  scene.add(rockInst);
  disposables.push(rockGeo, rockMat);

  // 3. Stylized Procedural Alpine Pines (Composite 3-layer InstancedMesh: Trunk + Lower Tier + Crown)
  const treeCount = 64;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1.5, 7);
  trunkGeo.translate(0, 0.75, 0);
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x3f2e21,
    roughness: 0.92,
    metalness: 0.04,
  });

  const tierLowGeo = new THREE.ConeGeometry(1.15, 2.2, 7);
  tierLowGeo.translate(0, 2.1, 0);
  const tierHighGeo = new THREE.ConeGeometry(0.82, 1.85, 7);
  tierHighGeo.translate(0, 3.35, 0);
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a34,
    roughness: 0.76,
    metalness: 0.06,
    flatShading: true,
  });

  const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const lowInst = new THREE.InstancedMesh(tierLowGeo, foliageMat, treeCount);
  const highInst = new THREE.InstancedMesh(tierHighGeo, foliageMat, treeCount);
  lowInst.castShadow = !isSoftwareGl;
  highInst.castShadow = !isSoftwareGl;

  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + 0.09 + ((i * 23) % 9) * 0.03;
    const radius = 46 + ((i * 19 + seed) % 24);
    const tx = Math.cos(angle) * radius;
    const tz = Math.sin(angle) * radius;
    const ty = terrainHeightAt(tx, tz, seed);

    const scaleVar = 0.85 + ((i * 11) % 31) * 0.01;
    dummy.position.set(tx, ty, tz);
    dummy.rotation.set(0, (i * 1.3) % (Math.PI * 2), 0);
    dummy.scale.setScalar(scaleVar);
    dummy.updateMatrix();

    trunkInst.setMatrixAt(i, dummy.matrix);
    lowInst.setMatrixAt(i, dummy.matrix);
    highInst.setMatrixAt(i, dummy.matrix);

    const gShift = 0.85 + ((i * 17) % 24) * 0.012;
    tint.setRGB(0.11 * gShift, 0.26 * gShift, 0.22 * gShift);
    lowInst.setColorAt(i, tint);
    highInst.setColorAt(i, tint.clone().multiplyScalar(1.12));
  }

  for (const inst of [trunkInst, lowInst, highInst]) {
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }
  disposables.push(trunkGeo, trunkMat, tierLowGeo, tierHighGeo, foliageMat);

  return {
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

// ============================================================================
// COMPOSITE 3–12 PART PROCEDURAL ACTORS & PROPS (Bottom-Center Pivots)
// ============================================================================

export interface KineticRoverRig {
  root: THREE.Group;
  bodyVisual: THREE.Group;
  gyroWheel: THREE.Mesh;
  turretYawGroup: THREE.Group;
  turretPitchGroup: THREE.Group;
  thrusterFlame: THREE.Mesh;
  chassisMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/**
 * 9-Part Procedural Gyro-Stabilized Kinetic Field Rover:
 *  1. Beveled octagonal titanium hull (ExtrudeGeometry)
 *  2. Lathe-turned copper reaction wheel (LatheGeometry)
 *  3. Articulated turret yaw yoke
 *  4. Pitch-elevating rail launcher barrel (LatheGeometry)
 *  5. Optical sapphire telemetry dome (MeshPhysicalMaterial)
 *  6–9. Four suspension struts + vulcanized wheel pods, plasma nozzle & contact shadow
 */
export function createKineticRoverRig(
  contactShadowTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): KineticRoverRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const root = new THREE.Group();
  const bodyVisual = new THREE.Group();
  root.add(bodyVisual);

  // Grounded radial contact shadow at y = 0.02
  const shadowGeo = new THREE.PlaneGeometry(3.4, 3.4);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.02;
  root.add(shadowMesh);
  disposables.push(shadowGeo, shadowMat);

  // Part 1: Primary Silhouette — Beveled Octagonal Titanium Chassis (ExtrudeGeometry)
  const hullShape = new THREE.Shape();
  const w = 0.85;
  const l = 1.12;
  const cut = 0.32;
  hullShape.moveTo(-w + cut, -l);
  hullShape.lineTo(w - cut, -l);
  hullShape.lineTo(w, -l + cut);
  hullShape.lineTo(w, l - cut);
  hullShape.lineTo(w - cut, l);
  hullShape.lineTo(-w + cut, l);
  hullShape.lineTo(-w, l - cut);
  hullShape.lineTo(-w, -l + cut);
  hullShape.closePath();

  const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
    depth: 0.36,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.07,
    bevelSegments: 3,
  });
  hullGeo.rotateX(Math.PI / 2);
  hullGeo.translate(0, 0.72, 0);

  const chassisMat = new THREE.MeshStandardMaterial({
    color: 0xdbeafe,
    metalness: 0.86,
    roughness: 0.22,
  });
  const hullMesh = new THREE.Mesh(hullGeo, chassisMat);
  hullMesh.castShadow = !isSoftwareGl;
  hullMesh.receiveShadow = !isSoftwareGl;
  bodyVisual.add(hullMesh);
  disposables.push(hullGeo, chassisMat);

  // Part 2: Secondary Read — Lathe-Turned Anodized Copper Gyroscopic Reaction Wheel
  const lathePts = [
    new THREE.Vector2(0.42, 0),
    new THREE.Vector2(0.76, 0.02),
    new THREE.Vector2(0.8, 0.11),
    new THREE.Vector2(0.68, 0.14),
    new THREE.Vector2(0.42, 0.12),
  ];
  const gyroGeo = new THREE.LatheGeometry(lathePts, 28);
  const gyroMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.84,
    roughness: 0.48, // >= 0.25 roughness delta vs chassis (0.22)
  });
  const gyroWheel = new THREE.Mesh(gyroGeo, gyroMat);
  gyroWheel.position.y = 0.74;
  gyroWheel.castShadow = !isSoftwareGl;
  bodyVisual.add(gyroWheel);
  disposables.push(gyroGeo, gyroMat);

  // Part 3 & 4: Articulated Turret Yoke + Lathe Rail Barrel
  const turretYawGroup = new THREE.Group();
  turretYawGroup.position.set(0, 0.88, -0.05);
  bodyVisual.add(turretYawGroup);

  const yokeGeo = new THREE.CylinderGeometry(0.32, 0.38, 0.22, 16);
  const yokeMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.55,
    roughness: 0.58,
  });
  const yokeMesh = new THREE.Mesh(yokeGeo, yokeMat);
  yokeMesh.position.y = 0.11;
  turretYawGroup.add(yokeMesh);
  disposables.push(yokeGeo, yokeMat);

  const turretPitchGroup = new THREE.Group();
  turretPitchGroup.position.set(0, 0.24, 0);
  turretYawGroup.add(turretPitchGroup);

  const barrelPts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.14, 0.0),
    new THREE.Vector2(0.14, 0.35),
    new THREE.Vector2(0.1, 0.42),
    new THREE.Vector2(0.1, 1.05),
    new THREE.Vector2(0.13, 1.1),
    new THREE.Vector2(0.07, 1.12),
  ];
  const barrelGeo = new THREE.LatheGeometry(barrelPts, 20);
  barrelGeo.rotateX(-Math.PI / 2); // Point forward along -Z local
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    metalness: 0.94,
    roughness: 0.16,
  });
  const barrelMesh = new THREE.Mesh(barrelGeo, barrelMat);
  barrelMesh.castShadow = !isSoftwareGl;
  turretPitchGroup.add(barrelMesh);
  disposables.push(barrelGeo, barrelMat);

  // Part 5: Optical Sapphire Telemetry Dome (MeshPhysicalMaterial)
  const domeGeo = new THREE.SphereGeometry(0.24, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0x7dd3fc,
    metalness: 0,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.92,
    transparent: true,
    opacity: isSoftwareGl ? 0.45 : 1,
    ior: 1.76,
    thickness: 0.8,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  domeMesh.position.set(0, 0.84, 0.42);
  domeMesh.renderOrder = 2;
  bodyVisual.add(domeMesh);
  disposables.push(domeGeo, domeMat);

  // Parts 6–9: Four Outrigger Suspension Struts + Vulcanized Wheel Pods (grounded at y = 0)
  const strutGeo = new THREE.BoxGeometry(0.14, 0.42, 0.18);
  const wheelGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.22, 18);
  wheelGeo.rotateZ(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.24, 12);
  hubGeo.rotateZ(Math.PI / 2);

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.08,
    roughness: 0.86,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    metalness: 0.85,
    roughness: 0.25,
  });

  const wheelOffsets: Array<[number, number]> = [
    [-0.88, -0.78],
    [0.88, -0.78],
    [-0.88, 0.78],
    [0.88, 0.78],
  ];
  for (const [wx, wz] of wheelOffsets) {
    const strut = new THREE.Mesh(strutGeo, yokeMat);
    strut.position.set(wx * 0.88, 0.42, wz);
    strut.rotation.z = wx > 0 ? 0.24 : -0.24;
    bodyVisual.add(strut);

    const wheel = new THREE.Mesh(wheelGeo, rubberMat);
    wheel.position.set(wx, 0.26, wz); // Radius 0.26 => bottom touches y = 0.00!
    wheel.castShadow = !isSoftwareGl;
    bodyVisual.add(wheel);

    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.position.set(wx, 0.26, wz);
    bodyVisual.add(hub);
  }
  disposables.push(strutGeo, wheelGeo, hubGeo, rubberMat, hubMat);

  // Accent Detail: Rear Vector Thruster Nozzle + Dynamic Plasma Plume
  const nozzleGeo = new THREE.CylinderGeometry(0.14, 0.22, 0.26, 16);
  nozzleGeo.rotateX(Math.PI / 2);
  const nozzleMesh = new THREE.Mesh(nozzleGeo, yokeMat);
  nozzleMesh.position.set(0, 0.56, 1.18);
  bodyVisual.add(nozzleMesh);

  const flameGeo = new THREE.ConeGeometry(0.16, 0.75, 14);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.36);
  const flameMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const thrusterFlame = new THREE.Mesh(flameGeo, flameMat);
  thrusterFlame.position.set(0, 0.56, 1.28);
  thrusterFlame.scale.set(1, 1, 0.01);
  bodyVisual.add(thrusterFlame);

  // Front Headlight Visor Bar
  const visorGeo = new THREE.BoxGeometry(0.72, 0.08, 0.08);
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xe0f2fe,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.4,
    roughness: 0.15,
    metalness: 0.2,
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 0.58, -1.16);
  bodyVisual.add(visor);
  disposables.push(nozzleGeo, flameGeo, flameMat, visorGeo, visorMat);

  return {
    root,
    bodyVisual,
    gyroWheel,
    turretYawGroup,
    turretPitchGroup,
    thrusterFlame,
    chassisMat,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export interface ResonanceBeaconRig {
  root: THREE.Group;
  coreMesh: THREE.Mesh;
  gimbalRing: THREE.Mesh;
  haloMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  haloMat: THREE.MeshBasicMaterial;
  dispose: () => void;
}

/**
 * 7-Part Procedural Harmonic Resonance Beacon Pylon (Bottom-Center Pivot at y = 0):
 *  1. Stepped hexagonal plinth
 *  2. Three helical TubeGeometry copper induction coils
 *  3. Levitating Octahedron resonance crystal
 *  4. Gimbal Torus eigenfrequency ring
 *  5. Top dipole spire finial
 *  6. Ground calibration halo
 *  7. Soft radial contact shadow
 */
export function createResonanceBeaconRig(
  accentHex: string,
  contactShadowTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): ResonanceBeaconRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const root = new THREE.Group();
  const accentColor = new THREE.Color(accentHex);

  // Contact shadow
  const shadowGeo = new THREE.PlaneGeometry(4.2, 4.2);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.02;
  root.add(shadow);
  disposables.push(shadowGeo, shadowMat);

  // Part 1: Stepped Hexagonal Plinth (sits flush at y = 0)
  const plinthGeo = new THREE.CylinderGeometry(1.05, 1.35, 0.55, 6);
  plinthGeo.translate(0, 0.275, 0);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.18,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.castShadow = !isSoftwareGl;
  plinth.receiveShadow = !isSoftwareGl;
  root.add(plinth);
  disposables.push(plinthGeo, plinthMat);

  // Part 2: Three Curved TubeGeometry Induction Struts
  const coilMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.88,
  });
  for (let k = 0; k < 3; k++) {
    const theta = (k * Math.PI * 2) / 3;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(theta) * 0.9, 0.5, Math.sin(theta) * 0.9),
      new THREE.Vector3(Math.cos(theta + 0.4) * 1.15, 1.85, Math.sin(theta + 0.4) * 1.15),
      new THREE.Vector3(Math.cos(theta + 0.8) * 0.35, 3.35, Math.sin(theta + 0.8) * 0.35),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 20, 0.075, 8, false);
    const strut = new THREE.Mesh(tubeGeo, coilMat);
    strut.castShadow = !isSoftwareGl;
    root.add(strut);
    disposables.push(tubeGeo);
  }
  disposables.push(coilMat);

  // Part 3: Levitating Polyhedral Core
  const coreGeo = new THREE.OctahedronGeometry(0.62, 0);
  const coreMat = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.65,
    roughness: 0.14,
    metalness: 0.25,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = 2.05;
  coreMesh.castShadow = !isSoftwareGl;
  root.add(coreMesh);
  disposables.push(coreGeo, coreMat);

  // Part 4: Gimbal Eigenfrequency Ring
  const gimbalGeo = new THREE.TorusGeometry(0.95, 0.055, 12, 36);
  const gimbalMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.42,
    metalness: 0.86,
  });
  const gimbalRing = new THREE.Mesh(gimbalGeo, gimbalMat);
  gimbalRing.position.y = 2.05;
  root.add(gimbalRing);
  disposables.push(gimbalGeo, gimbalMat);

  // Part 5: Top Dipole Spire Finial
  const spireGeo = new THREE.ConeGeometry(0.18, 0.85, 8);
  spireGeo.translate(0, 3.75, 0);
  const spire = new THREE.Mesh(spireGeo, coilMat);
  root.add(spire);
  disposables.push(spireGeo);

  // Part 6: Ground Calibration Halo
  const haloGeo = new THREE.RingGeometry(1.75, 2.05, 40);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const haloMesh = new THREE.Mesh(haloGeo, haloMat);
  haloMesh.position.y = 0.04;
  root.add(haloMesh);
  disposables.push(haloGeo, haloMat);

  return {
    root,
    coreMesh,
    gimbalRing,
    haloMesh,
    coreMat,
    haloMat,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

export interface ShearDroneRig {
  root: THREE.Group;
  hullGroup: THREE.Group;
  rotorRing: THREE.Mesh;
  telegraphRing: THREE.Mesh;
  telegraphMat: THREE.MeshBasicMaterial;
  shroudMat: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/**
 * 6-Part Procedural Shear Vortex Hazard Drone:
 *  1. Lathe-contoured armored shroud
 *  2. Counter-rotating rotor torus + blades
 *  3. Crimson optical sensor eye
 *  4. Three beveled ExtrudeGeometry stabilizer fins
 *  5. Ground-projected shockwave windup telegraph ring
 *  6. Grounded contact shadow
 */
export function createShearDroneRig(
  contactShadowTex: THREE.CanvasTexture,
  isSoftwareGl: boolean
): ShearDroneRig {
  const disposables: Array<{ dispose: () => void }> = [];
  const root = new THREE.Group();
  const hullGroup = new THREE.Group();
  hullGroup.position.y = 1.65; // Hover altitude above terrainHeightAt(x,z)
  root.add(hullGroup);

  // Contact shadow on ground (y = 0.03)
  const shadowGeo = new THREE.PlaneGeometry(2.8, 2.8);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: contactShadowTex,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const shadow = new THREE.Mesh(shadowGeo, shadowMat);
  shadow.position.y = 0.03;
  root.add(shadow);
  disposables.push(shadowGeo, shadowMat);

  // Ground Windup Telegraph Ring (expands during 1.15s attack windup)
  const teleGeo = new THREE.RingGeometry(0.4, 5.2, 48);
  teleGeo.rotateX(-Math.PI / 2);
  const telegraphMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const telegraphRing = new THREE.Mesh(teleGeo, telegraphMat);
  telegraphRing.position.y = 0.05;
  telegraphRing.scale.setScalar(0.1);
  root.add(telegraphRing);
  disposables.push(teleGeo, telegraphMat);

  // Part 1: Lathe Armored Shroud
  const pts = [
    new THREE.Vector2(0.0, -0.32),
    new THREE.Vector2(0.48, -0.22),
    new THREE.Vector2(0.72, 0.05),
    new THREE.Vector2(0.55, 0.34),
    new THREE.Vector2(0.18, 0.46),
    new THREE.Vector2(0.0, 0.48),
  ];
  const shroudGeo = new THREE.LatheGeometry(pts, 24);
  const shroudMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.82,
    roughness: 0.28,
  });
  const shroud = new THREE.Mesh(shroudGeo, shroudMat);
  shroud.castShadow = !isSoftwareGl;
  hullGroup.add(shroud);
  disposables.push(shroudGeo, shroudMat);

  // Part 2: Rotor Ring
  const rotorGeo = new THREE.TorusGeometry(0.92, 0.07, 10, 28);
  rotorGeo.rotateX(Math.PI / 2);
  const rotorMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.65,
    roughness: 0.58,
  });
  const rotorRing = new THREE.Mesh(rotorGeo, rotorMat);
  hullGroup.add(rotorRing);
  disposables.push(rotorGeo, rotorMat);

  // Part 3: Crimson Hazard Sensor Eye
  const eyeGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xf87171,
    emissive: 0xef4444,
    emissiveIntensity: 1.5,
    roughness: 0.12,
    metalness: 0.1,
  });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(0, 0.06, -0.62);
  hullGroup.add(eye);
  disposables.push(eyeGeo, eyeMat);

  // Part 4: Three Beveled Stabilizer Fins
  const finShape = new THREE.Shape();
  finShape.moveTo(0, -0.2);
  finShape.lineTo(0.45, -0.05);
  finShape.lineTo(0.32, 0.35);
  finShape.lineTo(0, 0.25);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  for (let f = 0; f < 3; f++) {
    const fin = new THREE.Mesh(finGeo, rotorMat);
    const a = (f * Math.PI * 2) / 3;
    fin.rotation.y = a;
    fin.position.set(Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55);
    hullGroup.add(fin);
  }
  disposables.push(finGeo);

  return {
    root,
    hullGroup,
    rotorRing,
    telegraphRing,
    telegraphMat,
    shroudMat,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}

/**
 * Helper to align any grounded actor subtly to local terrain normal with damping.
 */
const _scratchNormal: [number, number, number] = [0, 1, 0];
export function sampleTerrainGroundAndSlope(
  x: number,
  z: number,
  seed: number,
  outTargetUp: THREE.Vector3
): number {
  const h = terrainHeightAt(x, z, seed);
  terrainNormalAt(x, z, seed, _scratchNormal);
  outTargetUp.set(_scratchNormal[0], _scratchNormal[1], _scratchNormal[2]);
  return h;
}

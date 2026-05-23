import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ============================================================
// CONFIGURATION — Edit these to align custom models
// ============================================================
export const PITCH_CONFIG = {
  positionX: 0,
  positionY: -.40,
  positionZ: 0,
  rotationY: 90,      // degrees — rotates texture so goals face Z axis (matching game logic)
  scale: 1.0,
  length: 105,
  width: 68,
  goalWidth: 7.32,
  goalHeight: 2.44,
  goalDepth: 2.5,
  grassColor1: '#1e6b1e',
  grassColor2: '#237523',
  get hl() { return this.length / 2; },
  get hw() { return this.width / 2; },
};

export const STADIUM_CONFIG = {
  useCustomStadium: true,
  path: import.meta.env.BASE_URL + 'stadium.glb',
  positionX: 0,
  positionY: -0.3,
  positionZ: -2.7,
  rotationY: 90,    // rotated to align stadium goals with game's Z-axis goal positions
  scale: 1.02,
  hideGeneratedPitch: false,
  ambientIntensity: 0.45,
  directionalIntensity: 1.2,
};

export const PLAYER_CONFIG = {
  useCustomModel: true,
  path: import.meta.env.BASE_URL + 'player.glb',
  scale: 0.7,
  rotationY: 0,
  yOffset: 0,
  height: 1.8,
  runSpeed: 9,
  sprintSpeed: 14,
  walkSpeed: 4.5,
  controlRadius: 1.6,
  kickPower: 34,
  passAccuracy: 0.92,
  shotAccuracy: 0.82,
};

export const GOAL_CONFIG = {
  yOffset: 0,
};

const GAME_CFG = {
  ballRadius: 0.22,
  gravity: 22,
  friction: 0.985,
  airFriction: 0.998,
  bounce: 0.55,
  matchDuration: 6 * 60,
  halfDuration: 3 * 60,
  camH: 28,
  camDist: 38,
  camSmooth: 0.06,
};
const BROADCAST_CAM_X = 55; // +X touchline keeps the home/user side on the right of the screen.
const OPPONENT_AI_ATTACK_BONUS = 8;
const OPPONENT_AI_KICK_BOOST = 1.14;

// ============================================================
// FEATURE STATE
// ============================================================
let slowMoState   = null;  // { realTimer, duration, camAngle, scoringHome }
let throwInState  = null;  // { player, timer, phase, homeGets, targetZ }
let yellowCards   = { home: 0, away: 0 };
let pendingPenalty = null; // 'home' = home attacks, 'away' = away attacks
let penaltyState  = null;  // full penalty state object
const SLOW_MO_SPEED = 0.15;
const SLOW_MO_DUR   = 3.8;

// ── Snow ──────────────────────────────────────────────────────
let snowActive = true;          // set false to disable
const SNOW_COUNT = 3000;
const _snowPos  = new Float32Array(SNOW_COUNT * 3);
const _snowFall = new Float32Array(SNOW_COUNT);
let   _snowGeo  = null;
let   _snowSys  = null;

// ── Rain ──────────────────────────────────────────────────────
let rainActive = false;
const RAIN_COUNT = 4000;
const _rainPos = new Float32Array(RAIN_COUNT * 3);
const _rainFall = new Float32Array(RAIN_COUNT);
let   _rainGeo  = null;
let   _rainSys  = null;

// ── Particles ─────────────────────────────────────────────────
const PART_MAX = 600;
const _partPos  = new Float32Array(PART_MAX * 3);
const _partCol  = new Float32Array(PART_MAX * 3);
let   _partGeo  = null;
let   _partSys  = null;
let   _ballTrailTimer = 0;
const _partData = Array.from({ length: PART_MAX }, () => ({
  alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
  life: 0, maxLife: 1, r: 1, g: 1, b: 1
}));

// ── Mobile State Detection ───────────────────────────────────
const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
let joystickTouchId = null;
let joystickStartPos = { x: 0, y: 0 };

// ── First-person mode ─────────────────────────────────────────
let fpsMode  = false;
let fpsPitch = 0;                 // camera pitch angle (radians)
const FPS_EYE_HEIGHT = 1.5;       // world-space eye level above player.position.y
const FPS_SENS       = 0.002;     // mouse sensitivity

const ALL_TEAMS_DATA = {
  BAR: {
    name: 'FC Barcelona', short: 'BAR',
    color: '#a50044', altColor: '#004d98', gkColor: '#ff8800',
    badgeBg: 'linear-gradient(135deg, #a50044 0%, #004d98 100%)', badgeChar: 'B', badgeCharColor: '#ffc107',
    players: ['Ter Stegen','Cancelo','Christensen','Kounde','Balde','De Jong','Pedri','Gavi','Raphinha','Lewandowski','Yamal']
  },
  RMA: {
    name: 'Real Madrid', short: 'RMA',
    color: '#ffffff', altColor: '#FEBE10', gkColor: '#00aa55',
    badgeBg: '#ffffff', badgeChar: 'R', badgeCharColor: '#1c2c5b',
    players: ['Courtois','Carvajal','Rudiger','Militao','Mendy','Tchouameni','Camavinga','Modric','Vinicius','Bellingham','Rodrygo']
  },
  MCI: {
    name: 'Manchester City', short: 'MCI',
    color: '#6cabdd', altColor: '#1c2c5b', gkColor: '#ffcc00',
    badgeBg: '#6cabdd', badgeChar: 'M', badgeCharColor: '#1c2c5b',
    players: ['Ederson', 'Walker', 'Dias', 'Ake', 'Gvardiol', 'Rodri', 'Kovacic', 'De Bruyne', 'Foden', 'Haaland', 'Bernardo']
  },
  LIV: {
    name: 'Liverpool', short: 'LIV',
    color: '#c8102e', altColor: '#f6eb61', gkColor: '#33ffaa',
    badgeBg: '#c8102e', badgeChar: 'L', badgeCharColor: '#ffc107',
    players: ['Alisson', 'Alexander-Arnold', 'Van Dijk', 'Konate', 'Robertson', 'Mac Allister', 'Szoboszlai', 'Endo', 'Diaz', 'Nunez', 'Salah']
  },
  ARS: {
    name: 'Arsenal', short: 'ARS',
    color: '#ef0107', altColor: '#063672', gkColor: '#eeff00',
    badgeBg: '#ef0107', badgeChar: 'A', badgeCharColor: '#ffffff',
    players: ['Raya', 'White', 'Saliba', 'Gabriel', 'Timber', 'Rice', 'Odegaard', 'Havertz', 'Saka', 'Jesus', 'Martinelli']
  },
  FCB: {
    name: 'Bayern Munich', short: 'FCB',
    color: '#dc052d', altColor: '#0066b2', gkColor: '#ff7700',
    badgeBg: 'linear-gradient(135deg, #dc052d 0%, #0066b2 100%)', badgeChar: 'B', badgeCharColor: '#ffffff',
    players: ['Neuer', 'Kimmich', 'Upamecano', 'Kim', 'Davies', 'Laimer', 'Goretzka', 'Musiala', 'Sane', 'Kane', 'Coman']
  },
  PSG: {
    name: 'PSG', short: 'PSG',
    color: '#004170', altColor: '#e30613', gkColor: '#99ff00',
    badgeBg: '#004170', badgeChar: 'P', badgeCharColor: '#e30613',
    players: ['Donnarumma', 'Hakimi', 'Marquinhos', 'Skriniar', 'Hernandez', 'Zaïre-Emery', 'Vitinha', 'Ruiz', 'Dembélé', 'Ramos', 'Mbappé']
  }
};

const TEAMS = {
  home: {
    name: 'Barcelona', short: 'BAR',
    color: '#a50044', altColor: '#004d98', gkColor: '#ff8800',
    formation: {
      GK:  { x: 0,    z: -48 },
      LB:  { x: -28,  z: -36 }, CB1: { x: -10,  z: -40 },
      CB2: { x: 10,   z: -40 }, RB:  { x: 28,   z: -36 },
      CM1: { x: -15,  z: -20 }, CM2: { x: 0,    z: -25 }, CM3: { x: 15, z: -20 },
      LW:  { x: -28,  z: -5  }, ST:  { x: 0,    z: 5   }, RW:  { x: 28, z: -5  },
    },
  },
  away: {
    name: 'Real Madrid', short: 'RMA',
    color: '#111111', altColor: '#FEBE10', gkColor: '#00aa55',
    formation: {
      GK:  { x: 0,    z: 48  },
      LB:  { x: 28,   z: 36  }, CB1: { x: 10,   z: 40  },
      CB2: { x: -10,  z: 40  }, RB:  { x: -28,  z: 36  },
      CM1: { x: 15,   z: 20  }, CM2: { x: 0,    z: 25  }, CM3: { x: -15, z: 20  },
      LW:  { x: 28,   z: 5   }, ST:  { x: 0,    z: -5  }, RW:  { x: -28, z: 5   },
    },
  },
};

let HOME_NAMES = [...ALL_TEAMS_DATA.BAR.players];
let AWAY_NAMES = [...ALL_TEAMS_DATA.RMA.players];

// ============================================================
// THREE.JS SCENE
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88b8e8);
scene.fog = new THREE.FogExp2(0x88b8e8, 0.006);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 800);

const renderer = new THREE.WebGLRenderer({
  canvas: document.getElementById('game-canvas'),
  antialias: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============================================================
// LIGHTING
// ============================================================
function setupLighting() {
  scene.add(new THREE.AmbientLight(0xffffff, STADIUM_CONFIG.ambientIntensity));

  const sun = new THREE.DirectionalLight(0xfff8e0, STADIUM_CONFIG.directionalIntensity);
  sun.position.set(60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xd0e8ff, 0.35);
  fill.position.set(-50, 60, -40);
  scene.add(fill);

  [[-58, 38, -40], [58, 38, -40], [-58, 38, 40], [58, 38, 40]].forEach(([x, y, z]) => {
    const fl = new THREE.PointLight(0xffe8c0, 0.45, 220);
    fl.position.set(x, y, z);
    scene.add(fl);
  });
}

// ============================================================
// PITCH TEXTURE
// ============================================================
function createPitchTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 1400;
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height;
  const sx = W / PITCH_CONFIG.length, sz = H / PITCH_CONFIG.width;
  const sw = Math.floor(7 * sx);

  for (let x = 0; x < W; x += sw * 2) {
    ctx.fillStyle = PITCH_CONFIG.grassColor1; ctx.fillRect(x, 0, sw, H);
    ctx.fillStyle = PITCH_CONFIG.grassColor2; ctx.fillRect(x + sw, 0, sw, H);
  }

  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff'; ctx.lineWidth = 3;
  const m = 12;
  ctx.strokeRect(m, m, W - m * 2, H - m * 2);
  ctx.beginPath(); ctx.moveTo(W / 2, m); ctx.lineTo(W / 2, H - m); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 9.15 * sx, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 5, 0, Math.PI * 2); ctx.fill();

  const pl = 16.5 * sx, pw = 40.3 * sz, pt = (H - pw) / 2;
  ctx.strokeRect(m, pt, pl, pw);
  ctx.strokeRect(W - m - pl, pt, pl, pw);

  const gl2 = 5.5 * sx, gw2 = 18.32 * sz, gt2 = (H - gw2) / 2;
  ctx.strokeRect(m, gt2, gl2, gw2);
  ctx.strokeRect(W - m - gl2, gt2, gl2, gw2);

  const ps = 11 * sx;
  [[m + ps, H / 2], [W - m - ps, H / 2]].forEach(([cx, cy]) => {
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fill();
  });
  ctx.beginPath(); ctx.arc(m + ps, H / 2, 9.15 * sx, -0.72, 0.72); ctx.stroke();
  ctx.beginPath(); ctx.arc(W - m - ps, H / 2, 9.15 * sx, Math.PI - 0.72, Math.PI + 0.72); ctx.stroke();

  [[m, m, 0, Math.PI / 2], [W - m, m, Math.PI / 2, Math.PI],
   [m, H - m, -Math.PI / 2, 0], [W - m, H - m, Math.PI, Math.PI * 1.5]].forEach(([cx, cy, a, b]) => {
    ctx.beginPath(); ctx.arc(cx, cy, 1.2 * sx, a, b); ctx.stroke();
  });

  return new THREE.CanvasTexture(c);
}

// ============================================================
// SCENE OBJECTS
// ============================================================
let pitchMesh, outerGrass, goalGroups = [];
let customStadium = null;
let pitchTexture = null;
let controlIndicator = null, passIndicator = null;

function buildPitch() {
  if (pitchMesh) { scene.remove(pitchMesh); pitchMesh.geometry.dispose(); }
  if (outerGrass) { scene.remove(outerGrass); outerGrass.geometry.dispose(); }

  if (STADIUM_CONFIG.useCustomStadium && STADIUM_CONFIG.hideGeneratedPitch) return;

  if (!pitchTexture) pitchTexture = createPitchTexture();

  const geo = new THREE.PlaneGeometry(PITCH_CONFIG.length * PITCH_CONFIG.scale, PITCH_CONFIG.width * PITCH_CONFIG.scale);
  const mat = new THREE.MeshStandardMaterial({ map: pitchTexture, roughness: 0.85 });
  pitchMesh = new THREE.Mesh(geo, mat);
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.rotation.z = PITCH_CONFIG.rotationY * (Math.PI / 180);
  pitchMesh.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ);
  pitchMesh.receiveShadow = true;
  scene.add(pitchMesh);

  const og = new THREE.PlaneGeometry(240, 180);
  const om = new THREE.MeshStandardMaterial({ color: 0x1a5a1a, roughness: 0.9 });
  outerGrass = new THREE.Mesh(og, om);
  outerGrass.rotation.x = -Math.PI / 2;
  outerGrass.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY - 0.01, PITCH_CONFIG.positionZ);
  outerGrass.receiveShadow = true;
  scene.add(outerGrass);
}

function buildGoals() {
  goalGroups.forEach(g => scene.remove(g));
  goalGroups = [];

  [-1, 1].forEach(side => {
    const g = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.2, metalness: 0.65 });
    const netWire = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, wireframe: true });
    const netFill = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, side: THREE.DoubleSide });
    const gw = PITCH_CONFIG.goalWidth, gh = PITCH_CONFIG.goalHeight, gd = PITCH_CONFIG.goalDepth;
    const pr = 0.055;

    const mkCyl = (r, h) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 12), postMat);
    const lp = mkCyl(pr, gh); lp.position.set(-gw / 2, gh / 2, 0); lp.castShadow = true; g.add(lp);
    const rp = mkCyl(pr, gh); rp.position.set(gw / 2, gh / 2, 0); rp.castShadow = true; g.add(rp);
    const cb = mkCyl(pr, gw); cb.rotation.z = Math.PI / 2; cb.position.set(0, gh, 0); cb.castShadow = true; g.add(cb);
    // Back posts and net always extend in local -Z; side=1 goal is rotated 180° so it faces correctly
    const blp = mkCyl(pr * 0.7, gh); blp.position.set(-gw / 2, gh / 2, -gd); g.add(blp);
    const brp = mkCyl(pr * 0.7, gh); brp.position.set(gw / 2, gh / 2, -gd); g.add(brp);
    const tb = mkCyl(pr * 0.7, gw); tb.rotation.z = Math.PI / 2; tb.position.set(0, gh, -gd); g.add(tb);
    // Side bars
    const sbL = mkCyl(pr * 0.7, gd); sbL.rotation.x = Math.PI / 2; sbL.position.set(-gw / 2, 0, -gd / 2); g.add(sbL);
    const sbR = mkCyl(pr * 0.7, gd); sbR.rotation.x = Math.PI / 2; sbR.position.set(gw / 2, 0, -gd / 2); g.add(sbR);
    const sbT = mkCyl(pr * 0.7, gd); sbT.rotation.x = Math.PI / 2; sbT.position.set(0, gh, -gd / 2); g.add(sbT);

    const mkPlane = (w, h2) => {
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(w, h2), netWire);
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(w, h2), netFill);
      const grp = new THREE.Group(); grp.add(wm); grp.add(fm); return grp;
    };
    const back = mkPlane(gw, gh); back.position.set(0, gh / 2, -gd); g.add(back);
    const leftN = mkPlane(gd, gh); leftN.rotation.y = Math.PI / 2; leftN.position.set(-gw / 2, gh / 2, -gd / 2); g.add(leftN);
    const rightN = mkPlane(gd, gh); rightN.rotation.y = -Math.PI / 2; rightN.position.set(gw / 2, gh / 2, -gd / 2); g.add(rightN);
    const topN = mkPlane(gw, gd); topN.rotation.x = Math.PI / 2; topN.position.set(0, gh, -gd / 2); g.add(topN);

    g.position.set(
      PITCH_CONFIG.positionX,
      PITCH_CONFIG.positionY + GOAL_CONFIG.yOffset,
      PITCH_CONFIG.positionZ + side * PITCH_CONFIG.hl * PITCH_CONFIG.scale
    );
    if (side === 1) g.rotation.y = Math.PI;

    // Hide generated goals — stadium model provides the visual goals
    g.visible = false;

    scene.add(g);
    goalGroups.push(g);
  });
}

// ============================================================
// PITCH LINE OVERLAYS — 3D lines that float above the pitch so they
// are always visible regardless of the stadium model's ground surface
// ============================================================
function buildPitchLines() {
  scene.children.filter(c => c.userData.isPitchLine).forEach(c => scene.remove(c));

  const y  = PITCH_CONFIG.positionY + 0.06;
  const px = PITCH_CONFIG.positionX;
  const pz = PITCH_CONFIG.positionZ;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale; // 52.5
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, depthWrite: false });

  const addRect = (x1, z1, x2, z2) => {
    const pts = [x1, y, z1, x2, y, z1,
                 x2, y, z1, x2, y, z2,
                 x2, y, z2, x1, y, z2,
                 x1, y, z2, x1, y, z1];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.LineSegments(geo, mat);
    line.userData.isPitchLine = true;
    scene.add(line);
  };

  const penHW = 20.16; // penalty area half-width (40.32m wide)
  const penD  = 16.5;  // penalty area depth
  const gkHW  = 9.16;  // goal area half-width (18.32m wide)
  const gkD   = 5.5;   // goal area depth

  // Penalty areas (both ends)
  addRect(px - penHW, pz - hl,        px + penHW, pz - hl + penD);
  addRect(px - penHW, pz + hl,        px + penHW, pz + hl - penD);

  // Goal areas / 6-yard boxes (both ends)
  addRect(px - gkHW,  pz - hl,        px + gkHW,  pz - hl + gkD);
  addRect(px - gkHW,  pz + hl,        px + gkHW,  pz + hl - gkD);

  // Penalty spots
  const addSpot = (x, z) => {
    const geo = new THREE.CircleGeometry(0.18, 8);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y + 0.01, z);
    m.userData.isPitchLine = true;
    scene.add(m);
  };
  addSpot(px, pz - hl + 11); // near home goal
  addSpot(px, pz + hl - 11); // near away goal
}

// ============================================================
// PLAYER INDICATORS
// ============================================================
function buildPlayerIndicators() {
  // Cyan downward-pointing cone above controlled player
  controlIndicator = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.6, 8),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff })
  );
  controlIndicator.visible = false;
  scene.add(controlIndicator);

  // Yellow rotating diamond ring above best pass target
  passIndicator = new THREE.Mesh(
    new THREE.RingGeometry(0.26, 0.44, 4),
    new THREE.MeshBasicMaterial({ color: 0xffdd00, side: THREE.DoubleSide })
  );
  passIndicator.rotation.x = -Math.PI / 2;
  passIndicator.visible = false;
  scene.add(passIndicator);
}

function updateIndicators(dt) {
  if (!controlIndicator || !passIndicator) return;
  const t = Date.now() * 0.001;

  if (controlled && gameState === 'playing') {
    const bobY = 0.18 * Math.sin(t * 3.5);
    controlIndicator.position.set(
      controlled.position.x,
      controlled.position.y + PLAYER_CONFIG.height + 0.85 + bobY,
      controlled.position.z
    );
    controlIndicator.rotation.z = Math.PI; // point down
    controlIndicator.visible = true;

    // Ball possession: gold pulsing ring + HUD label + screen glow
    const hasBallNow = controlled.userData.hasBall;
    if (controlled.userData.ring) {
      controlled.userData.ring.material.color.setHex(hasBallNow ? 0xffcc00 : 0x00d4ff);
      // Faster, wider pulse when possessing so it's unmissable
      controlled.userData.ring.material.opacity = hasBallNow
        ? 0.3 + Math.abs(Math.sin(t * 7)) * 0.7
        : 0.85;
    }
    controlIndicator.material.color.setHex(hasBallNow ? 0xffcc00 : 0x00d4ff);
    const ballHud = document.getElementById('ball-hud');
    if (ballHud) ballHud.style.opacity = hasBallNow ? '1' : '0';
    const glow = document.getElementById('possession-glow');
    if (glow) glow.style.boxShadow = hasBallNow
      ? `inset 0 0 90px rgba(255,204,0,${0.12 + Math.abs(Math.sin(t * 7)) * 0.1})`
      : 'inset 0 0 90px rgba(255,204,0,0)';
  } else {
    controlIndicator.visible = false;
    const ballHud = document.getElementById('ball-hud');
    if (ballHud) ballHud.style.opacity = '0';
    const glow = document.getElementById('possession-glow');
    if (glow) glow.style.boxShadow = 'inset 0 0 90px rgba(255,204,0,0)';
  }

  const passTarget = (gameState === 'playing' && hasBall()) ? getBestPassTarget() : null;
  if (passTarget) {
    const bobY2 = 0.12 * Math.sin(t * 4.2 + 1.5);
    passIndicator.position.set(
      passTarget.position.x,
      passTarget.position.y + PLAYER_CONFIG.height + 0.55 + bobY2,
      passTarget.position.z
    );
    passIndicator.rotation.z += dt * 2.0; // spin
    passIndicator.visible = true;
  } else {
    passIndicator.visible = false;
  }
}

// ============================================================
// BALL
// ============================================================
let ball, ballShadow;

function buildBall() {
  const geo = new THREE.SphereGeometry(GAME_CFG.ballRadius, 28, 28);
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#111';
  [[128, 80], [62, 128], [194, 128], [88, 196], [168, 196]].forEach(([cx, cy]) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * 72 - 90) * Math.PI / 180;
      i ? ctx.lineTo(cx + 22 * Math.cos(a), cy + 22 * Math.sin(a))
        : ctx.moveTo(cx + 22 * Math.cos(a), cy + 22 * Math.sin(a));
    }
    ctx.closePath(); ctx.fill();
  });
  const mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), roughness: 0.35 });
  ball = new THREE.Mesh(geo, mat);
  ball.castShadow = true;
  ball.position.set(0, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, 0);
  ball.userData = { vel: new THREE.Vector3(), lastBy: null };
  scene.add(ball);

  const sg = new THREE.CircleGeometry(GAME_CFG.ballRadius * 0.85, 16);
  const sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22 });
  ballShadow = new THREE.Mesh(sg, sm);
  ballShadow.rotation.x = -Math.PI / 2;
  ballShadow.position.y = PITCH_CONFIG.positionY + 0.01;
  scene.add(ballShadow);
}

function updateBall(dt) {
  const v = ball.userData.vel;
  const groundY = PITCH_CONFIG.positionY + GAME_CFG.ballRadius;

  if (ball.position.y > groundY) v.y -= GAME_CFG.gravity * dt;

  ball.position.addScaledVector(v, dt);

  if (ball.position.y <= groundY) {
    ball.position.y = groundY;
    if (Math.abs(v.y) > 0.5) v.y = -v.y * GAME_CFG.bounce;
    else v.y = 0;
    v.x *= GAME_CFG.friction;
    v.z *= GAME_CFG.friction;
  }
  v.x *= GAME_CFG.airFriction;
  v.z *= GAME_CFG.airFriction;

  ball.rotation.x += v.z * dt * 3.5;
  ball.rotation.z -= v.x * dt * 3.5;

  ballShadow.position.x = ball.position.x;
  ballShadow.position.z = ball.position.z;
  const h = ball.position.y - groundY;
  ballShadow.scale.setScalar(Math.max(0.1, 1 - h * 0.04));
  ballShadow.material.opacity = Math.max(0.04, 0.22 - h * 0.012);

  checkBallBounds();
  checkGoal();
}

function checkBallBounds() {
  if (penaltyState || throwInState) return; // skip during penalty / throw-in anim
  const hw = PITCH_CONFIG.hw * PITCH_CONFIG.scale;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;

  // ── THROW IN (side out) ────────────────────────────────────
  if (Math.abs(ball.position.x) > hw + 1) {
    const outX = ball.position.x, outZ = ball.position.z;
    const lastToucher = ball.userData.lastBy;
    const homeGets = !lastToucher || awayPlayers.includes(lastToucher);
    const throwTeam = homeGets ? homePlayers : awayPlayers;

    const sideX  = Math.sign(outX) * hw;
    const clampZ = Math.max(-(hl - 3), Math.min(hl - 3, outZ));
    ball.userData.vel.set(0, 0, 0);
    [...homePlayers, ...awayPlayers].forEach(p => p.userData.hasBall = false);

    const thrower = throwTeam.filter(p => !p.userData.isGK).reduce((best, p) => {
      const d = Math.abs(p.position.z - clampZ);
      return !best || d < Math.abs(best.position.z - clampZ) ? p : best;
    }, null);

    if (thrower) {
      const receiver = throwTeam.filter(p => !p.userData.isGK && p !== thrower).reduce((best, p) => {
        const d = Math.abs(p.position.z - clampZ);
        return !best || d < Math.abs(best.position.z - clampZ) ? p : best;
      }, null);
      const targetZ = receiver ? receiver.position.z : (clampZ + (Math.random() - 0.5) * 8);
      thrower.position.set(PITCH_CONFIG.positionX + sideX, PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ + clampZ);
      thrower.rotation.y = Math.atan2(-Math.sign(sideX), 0);
      // Ball hovers above player's head during animation
      ball.position.set(thrower.position.x, PITCH_CONFIG.positionY + PLAYER_CONFIG.height * 1.18, thrower.position.z);
      // Start throw-in animation instead of instantly giving ball
      throwInState = { player: thrower, timer: 0, phase: 'raise', homeGets, targetZ };
      if (homeGets) setControlled(thrower);
    }
    return;
  }

  // ── GOAL KICK / CORNER (end out) ──────────────────────────
  if (Math.abs(ball.position.z) > hl + 2 && Math.abs(ball.position.x) > PITCH_CONFIG.goalWidth / 2 + 1) {
    const isTopEnd = ball.position.z < 0; // z negative = home goal end
    const lastToucher = ball.userData.lastBy;
    const lastWasHome = lastToucher && homePlayers.includes(lastToucher);

    ball.userData.vel.set(0, 0, 0);
    [...homePlayers, ...awayPlayers].forEach(p => p.userData.hasBall = false);

    if ((isTopEnd && lastWasHome) || (!isTopEnd && !lastWasHome)) {
      // Corner — nearest player from attacking team
      const cornerX = Math.sign(ball.position.x) * (hw - 1);
      const cornerZ = Math.sign(ball.position.z) * (hl - 1);
      ball.position.set(PITCH_CONFIG.positionX + cornerX, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ + cornerZ);
      const cornerTeam = lastWasHome ? homePlayers : awayPlayers;
      const kicker = cornerTeam.filter(p => !p.userData.isGK).reduce((best, p) => {
        const d = p.position.distanceTo(ball.position);
        return !best || d < best.position.distanceTo(ball.position) ? p : best;
      }, null);
      if (kicker) { kicker.position.copy(ball.position); kicker.userData.hasBall = true; ball.position.set(kicker.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, kicker.position.z); }
      if (lastWasHome && kicker) setControlled(kicker);
      showMsg('CORNER!');
    } else {
      // Goal kick — GK gets the ball
      const gkTeam = isTopEnd ? homePlayers : awayPlayers;
      const gk = gkTeam.find(p => p.userData.isGK);
      const kickZ = isTopEnd ? -(hl - 6) : (hl - 6);
      ball.position.set(PITCH_CONFIG.positionX, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ + kickZ);
      if (gk) { gk.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ + kickZ); gk.userData.hasBall = true; ball.position.set(gk.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, gk.position.z); }
      if (!isTopEnd && gk) setControlled(gk); // away goal kick → you're on that end? keep home control
      showMsg('GOAL KICK');
    }
  }
}

function checkGoal() {
  if (gameState !== 'playing') return;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const gw = PITCH_CONFIG.goalWidth / 2;
  const gh = PITCH_CONFIG.goalHeight;
  const by = ball.position.y - PITCH_CONFIG.positionY;
  if (Math.abs(ball.position.z) > hl - 0.1 && Math.abs(ball.position.x) < gw && by < gh + 0.3) {
    const scoringHome = ball.position.z > 0;
    if (scoringHome) homeScore++; else awayScore++;
    scoreGoal(scoringHome);
  }
}

// ============================================================
// REALISTIC PLAYER BUILDER
// ============================================================
function buildRealisticPlayer(teamData, isGK) {
  const g = new THREE.Group();
  const jColor = new THREE.Color(isGK ? teamData.gkColor : teamData.color);
  const sColor = new THREE.Color(teamData.altColor || '#222');
  const skin = new THREE.Color(0xf0c090);
  const dark = new THREE.Color(0x1a1a1a);
  const h = PLAYER_CONFIG.height;

  const mkM = col => new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 });
  const jM = mkM(jColor), sM = mkM(sColor), skM = mkM(skin), dM = mkM(dark);

  // — Torso (tapered box for more realistic look)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, h * 0.38, 0.22), jM);
  torso.position.y = h * 0.56;
  torso.castShadow = true; g.add(torso);

  // — Chest detail (slightly narrower top)
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.38, h * 0.12, 0.2), jM);
  chest.position.y = h * 0.7;
  chest.castShadow = true; g.add(chest);

  // — Shorts
  const shorts = new THREE.Mesh(new THREE.BoxGeometry(0.4, h * 0.16, 0.22), sM);
  shorts.position.y = h * 0.34;
  shorts.castShadow = true; g.add(shorts);

  // — Hip/belt
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.41, h * 0.03, 0.22), dM);
  belt.position.y = h * 0.42;
  g.add(belt);

  // — Head (sphere + face shaping)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 16), skM);
  head.position.y = h * 0.88;
  head.castShadow = true; g.add(head);

  // — Hair
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.132, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), mkM(new THREE.Color(0x3a2010)));
  hair.position.y = h * 0.895;
  hair.rotation.x = 0.2;
  g.add(hair);

  // — Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, h * 0.07, 8), skM);
  neck.position.y = h * 0.79;
  g.add(neck);

  // — Upper legs (quads - thicker)
  const ulgeo = new THREE.CylinderGeometry(0.09, 0.075, h * 0.2, 8);
  const ulL = new THREE.Mesh(ulgeo, sM); ulL.position.set(-0.11, h * 0.22, 0); ulL.castShadow = true; g.add(ulL);
  const ulR = new THREE.Mesh(ulgeo, sM); ulR.position.set(0.11, h * 0.22, 0); ulR.castShadow = true; g.add(ulR);

  // — Lower legs (calves)
  const llgeo = new THREE.CylinderGeometry(0.065, 0.05, h * 0.22, 8);
  const llL = new THREE.Mesh(llgeo, skM); llL.position.set(-0.11, h * 0.06, 0); llL.castShadow = true; g.add(llL);
  const llR = new THREE.Mesh(llgeo, skM); llR.position.set(0.11, h * 0.06, 0); llR.castShadow = true; g.add(llR);

  // — Socks
  const sockGeo = new THREE.CylinderGeometry(0.066, 0.056, h * 0.1, 8);
  const socks = mkM(new THREE.Color(0xffffff));
  const sockL = new THREE.Mesh(sockGeo, socks); sockL.position.set(-0.11, h * 0.01, 0); g.add(sockL);
  const sockR = new THREE.Mesh(sockGeo, socks); sockR.position.set(0.11, h * 0.01, 0); g.add(sockR);

  // — Boots/shoes
  const shoeGeo = new THREE.BoxGeometry(0.13, 0.07, 0.24);
  const shoeM = mkM(new THREE.Color(0x111111));
  const shL = new THREE.Mesh(shoeGeo, shoeM); shL.position.set(-0.11, -0.04, 0.04); shL.castShadow = true; g.add(shL);
  const shR = new THREE.Mesh(shoeGeo, shoeM); shR.position.set(0.11, -0.04, 0.04); shR.castShadow = true; g.add(shR);

  // — Upper arms
  const uaGeo = new THREE.CylinderGeometry(0.055, 0.048, h * 0.2, 8);
  const uaL = new THREE.Mesh(uaGeo, jM); uaL.position.set(-0.26, h * 0.62, 0); uaL.rotation.z = 0.2; uaL.castShadow = true; g.add(uaL);
  const uaR = new THREE.Mesh(uaGeo, jM); uaR.position.set(0.26, h * 0.62, 0); uaR.rotation.z = -0.2; uaR.castShadow = true; g.add(uaR);

  // — Forearms
  const faGeo = new THREE.CylinderGeometry(0.042, 0.035, h * 0.18, 8);
  const faL = new THREE.Mesh(faGeo, skM); faL.position.set(-0.3, h * 0.48, 0); faL.rotation.z = 0.15; g.add(faL);
  const faR = new THREE.Mesh(faGeo, skM); faR.position.set(0.3, h * 0.48, 0); faR.rotation.z = -0.15; g.add(faR);

  // Store refs for animation
  g.userData.limbs = {
    ulL, ulR, llL, llR, uaL, uaR, faL, faR, torso, head,
  };

  // Selection ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.5, 28),
    new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  g.userData.ring = ring;

  return g;
}

// ============================================================
// PLAYER SETUP
// ============================================================
let homePlayers = [], awayPlayers = [];
let controlled = null;
let customPlayerModel = null;

async function loadCustomPlayerModel() {
  if (!PLAYER_CONFIG.useCustomModel) return null;
  return new Promise(resolve => {
    new GLTFLoader().load(
      PLAYER_CONFIG.path,
      gltf => {
        const m = gltf.scene;
        m.rotation.y = PLAYER_CONFIG.rotationY * Math.PI / 180;
        m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        // Store animation clips so each clone can create its own AnimationMixer.
        m.userData.animations = gltf.animations;
        console.log(`✅ Custom player model loaded | animations: [${gltf.animations.map(a => a.name).join(', ')}]`);
        resolve(m);
      },
      null,
      () => { console.warn('⚠ Custom player model not found, using generated players'); resolve(null); }
    );
  });
}

async function setupTeams() {
  [...homePlayers, ...awayPlayers].forEach(p => {
    if (p.userData.mixer) p.userData.mixer.stopAllAction();
    scene.remove(p);
  });
  homePlayers = []; awayPlayers = [];

  customPlayerModel = await loadCustomPlayerModel();

  let hi = 0, ai = 0;
  for (const [posName, pos] of Object.entries(TEAMS.home.formation)) {
    const isGK = posName === 'GK';
    const p = makePlayer(TEAMS.home, pos, posName, HOME_NAMES[hi], isGK, customPlayerModel);
    homePlayers.push(p); hi++;
  }
  for (const [posName, pos] of Object.entries(TEAMS.away.formation)) {
    const isGK = posName === 'GK';
    const p = makePlayer(TEAMS.away, pos, posName, AWAY_NAMES[ai], isGK, customPlayerModel);
    p.rotation.y = Math.PI;
    awayPlayers.push(p); ai++;
  }

  controlled = homePlayers[9]; // ST
  setControlled(controlled);
}

function makePlayer(teamData, pos, posName, name, isGK, customModel) {
  let p;
  if (customModel) {
    // SkeletonUtils.clone gives each player its own independent skeleton so
    // bone transforms don't bleed across instances (which causes the giant-head bug).
    p = SkeletonUtils.clone(customModel);
    p.scale.setScalar(PLAYER_CONFIG.scale);
    p.rotation.y = PLAYER_CONFIG.rotationY * Math.PI / 180;
    // Only tint the away team — home team keeps the model's original colours.
    const isAwayTeam = teamData === TEAMS.away;
    if (isAwayTeam) {
      const kitColor = new THREE.Color(isGK ? teamData.gkColor : teamData.color);
      p.traverse(c => {
        if (c.isMesh && c.material) {
          c.material = c.material.clone();
          const n = c.name.toLowerCase();
          if (!n.includes('eye') && !n.includes('teeth') && !n.includes('mouth')) {
            c.material.color.set(kitColor);
          }
        }
      });
    }
    // Add selection ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.5, 28),
      new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    p.add(ring);
    p.userData.ring = ring;

    // Wire up the built-in animations. Find "relax" or "idle" first, else use clip[0].
    const clips = customModel.userData.animations || [];
    if (clips.length > 0) {
      const mixer = new THREE.AnimationMixer(p);
      const clip = clips.find(a => /relax|idle/i.test(a.name)) || clips[0];
      mixer.clipAction(clip).play();
      p.userData.mixer = mixer;
    }
  } else {
    p = buildRealisticPlayer(teamData, isGK);
  }

  p.position.set(
    PITCH_CONFIG.positionX + pos.x * PITCH_CONFIG.scale,
    PITCH_CONFIG.positionY + (PLAYER_CONFIG.useCustomModel ? PLAYER_CONFIG.yOffset : 0),
    PITCH_CONFIG.positionZ + pos.z * PITCH_CONFIG.scale
  );

  p.userData = {
    ...p.userData,
    name, posName, team: teamData, isGK,
    home: { ...pos },
    vel: new THREE.Vector3(),
    aiVel: new THREE.Vector3(),
    stamina: 100,
    hasBall: false,
    isControlled: false,
    speed: isGK ? PLAYER_CONFIG.runSpeed * 0.78 : PLAYER_CONFIG.runSpeed,
    animPhase: Math.random() * Math.PI * 2,
    ring: p.userData.ring,
    limbs: p.userData.limbs,
  };

  scene.add(p);
  return p;
}

// ============================================================
// ANIMATION
// ============================================================
function animatePlayerRunning(p, speed, dt) {
  if (!p.userData.limbs) return;
  const t = p.userData.animPhase;
  const L = p.userData.limbs;
  const swing = Math.sin(t * 3) * 0.55 * (speed / PLAYER_CONFIG.runSpeed);

  if (L.ulL) { L.ulL.rotation.x = swing; L.ulL.position.y = PLAYER_CONFIG.height * 0.22 + Math.abs(swing) * 0.03; }
  if (L.ulR) { L.ulR.rotation.x = -swing; L.ulR.position.y = PLAYER_CONFIG.height * 0.22 + Math.abs(-swing) * 0.03; }
  if (L.llL) { L.llL.rotation.x = Math.max(0, -swing * 0.6); }
  if (L.llR) { L.llR.rotation.x = Math.max(0, swing * 0.6); }
  if (L.uaL) { L.uaL.rotation.x = -swing * 0.5; }
  if (L.uaR) { L.uaR.rotation.x = swing * 0.5; }
  if (L.torso) L.torso.rotation.y = swing * 0.08;

  const bob = Math.abs(Math.sin(t * 3)) * 0.04;
  p.position.y = PITCH_CONFIG.positionY + bob + (PLAYER_CONFIG.useCustomModel ? PLAYER_CONFIG.yOffset : 0);
}

function resetPlayerPose(p) {
  if (!p.userData.limbs) return;
  const L = p.userData.limbs;
  ['ulL', 'ulR', 'llL', 'llR', 'uaL', 'uaR'].forEach(k => {
    if (L[k]) { L[k].rotation.x = 0; L[k].rotation.z = k.includes('ua') ? (k.includes('L') ? 0.2 : -0.2) : 0; }
  });
  if (L.torso) L.torso.rotation.y = 0;
  p.position.y = PITCH_CONFIG.positionY + (PLAYER_CONFIG.useCustomModel ? PLAYER_CONFIG.yOffset : 0);
}

// ============================================================
// SNOW
// ============================================================
function initSnow() {
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const hw = PITCH_CONFIG.hw * PITCH_CONFIG.scale;
  for (let i = 0; i < SNOW_COUNT; i++) {
    _snowPos[i*3]   = (Math.random() - 0.5) * hw * 3.5;
    _snowPos[i*3+1] = Math.random() * 32;
    _snowPos[i*3+2] = (Math.random() - 0.5) * hl * 3;
    _snowFall[i]    = 1.8 + Math.random() * 3.5;
  }
  _snowGeo = new THREE.BufferGeometry();
  _snowGeo.setAttribute('position', new THREE.BufferAttribute(_snowPos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff, size: 0.22,
    transparent: true, opacity: 0.82,
    depthWrite: false, sizeAttenuation: true,
  });
  _snowSys = new THREE.Points(_snowGeo, mat);
  _snowSys.renderOrder = 999;
  _snowSys.visible = snowActive;
  scene.add(_snowSys);
  // Slightly overcast sky when snowing
  if (snowActive) {
    scene.background = new THREE.Color(0xa8b8c4);
    scene.fog = new THREE.FogExp2(0xa8b8c4, 0.007);
  }
}

function updateSnow(dt) {
  if (!snowActive || !_snowGeo) return;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const hw = PITCH_CONFIG.hw * PITCH_CONFIG.scale;
  const ground = PITCH_CONFIG.positionY + 0.05;
  for (let i = 0; i < SNOW_COUNT; i++) {
    _snowPos[i*3+1] -= _snowFall[i] * dt;
    _snowPos[i*3]   += (Math.random() - 0.5) * 0.7 * dt;
    if (_snowPos[i*3+1] < ground) {
      _snowPos[i*3]   = (Math.random() - 0.5) * hw * 3.5;
      _snowPos[i*3+1] = 28 + Math.random() * 12;
      _snowPos[i*3+2] = (Math.random() - 0.5) * hl * 3;
    }
  }
  _snowGeo.attributes.position.needsUpdate = true;
}

// ============================================================
// RAIN & WEATHER
// ============================================================
function initRain() {
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const hw = PITCH_CONFIG.hw * PITCH_CONFIG.scale;
  for (let i = 0; i < RAIN_COUNT; i++) {
    _rainPos[i*3]   = (Math.random() - 0.5) * hw * 3.5;
    _rainPos[i*3+1] = Math.random() * 40;
    _rainPos[i*3+2] = (Math.random() - 0.5) * hl * 3;
    _rainFall[i]    = 28 + Math.random() * 14;
  }
  _rainGeo = new THREE.BufferGeometry();
  _rainGeo.setAttribute('position', new THREE.BufferAttribute(_rainPos, 3));
  
  const mat = new THREE.PointsMaterial({
    color: 0x88ccff, size: 0.14,
    transparent: true, opacity: 0.58,
    depthWrite: false, sizeAttenuation: true,
  });
  _rainSys = new THREE.Points(_rainGeo, mat);
  _rainSys.renderOrder = 998;
  _rainSys.visible = rainActive;
  scene.add(_rainSys);
}

function updateRain(dt) {
  if (!rainActive || !_rainGeo) return;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const hw = PITCH_CONFIG.hw * PITCH_CONFIG.scale;
  const ground = PITCH_CONFIG.positionY + 0.05;
  for (let i = 0; i < RAIN_COUNT; i++) {
    _rainPos[i*3+1] -= _rainFall[i] * dt;
    _rainPos[i*3]   += 1.5 * dt;
    if (_rainPos[i*3+1] < ground) {
      _rainPos[i*3]   = (Math.random() - 0.5) * hw * 3.5;
      _rainPos[i*3+1] = 32 + Math.random() * 12;
      _rainPos[i*3+2] = (Math.random() - 0.5) * hl * 3;
    }
  }
  _rainGeo.attributes.position.needsUpdate = true;
}

function updateWeatherEffects() {
  let col = 0x88b8e8;
  let density = 0.006;
  if (snowActive) {
    col = 0xa8b8c4;
    density = 0.007;
  } else if (rainActive) {
    col = 0x4a5868;
    density = 0.009;
  }
  
  scene.background = new THREE.Color(col);
  scene.fog = new THREE.FogExp2(col, density);
  
  if (_snowSys) _snowSys.visible = snowActive;
  if (_rainSys) _rainSys.visible = rainActive;
  
  const btnSnow = document.getElementById('btn-snow-toggle');
  const btnRain = document.getElementById('btn-rain-toggle');
  if (btnSnow) {
    btnSnow.textContent = '❄ Snow: ' + (snowActive ? 'ON' : 'OFF');
    if (snowActive) btnSnow.classList.add('active');
    else btnSnow.classList.remove('active');
  }
  if (btnRain) {
    btnRain.textContent = '🌧 Rain: ' + (rainActive ? 'ON' : 'OFF');
    if (rainActive) btnRain.classList.add('active');
    else btnRain.classList.remove('active');
  }
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
function initParticles() {
  _partGeo = new THREE.BufferGeometry();
  // Hide all particles below the pitch initially
  _partPos.fill(0);
  for (let i = 0; i < PART_MAX; i++) _partPos[i * 3 + 1] = -1000;
  const posAttr = new THREE.BufferAttribute(_partPos, 3);
  const colAttr = new THREE.BufferAttribute(_partCol, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  _partGeo.setAttribute('position', posAttr);
  _partGeo.setAttribute('color', colAttr);
  _partSys = new THREE.Points(_partGeo, new THREE.PointsMaterial({
    size: .2, vertexColors: true,
    transparent: true, opacity: 1,
    depthWrite: false, sizeAttenuation: true,
    blending: THREE.AdditiveBlending, // adds colour to scene → glows instead of fading to black
  }));
  // Buffer starts below the pitch; keep system renderable as particles move each frame.
  _partSys.frustumCulled = false;
  _partSys.renderOrder = 998;
  scene.add(_partSys);
}

function _spawnParticle(x, y, z, vx, vy, vz, r, g, b, life) {
  const p = _partData.find(p => !p.alive);
  if (!p) return;
  p.alive = true;
  p.x = x; p.y = y; p.z = z;
  p.vx = vx; p.vy = vy; p.vz = vz;
  p.r = r; p.g = g; p.b = b;
  p.life = life; p.maxLife = life;
}

// Bright burst when ball is kicked — large sparks, additive glow
function emitKickBurst(pos) {
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 8;
    const warm = Math.random();
    _spawnParticle(
      pos.x, Math.max(pos.y, PITCH_CONFIG.positionY + 0.1) + 0.2, pos.z,
      Math.cos(a) * sp, 3 + Math.random() * 6, Math.sin(a) * sp,
      1, 0.75 + warm * 0.25, warm * 0.4,  // hot white→gold→orange
      0.45 + Math.random() * 0.25
    );
  }
}

// Foot dust when running — bright so it pops against the field
function emitFootDust(x, z, speed) {
  // ~55% chance at run speed, up to ~85% while sprinting
  if (Math.random() > Math.min(0.85, speed * 0.07)) return;
  // Emit 1-2 particles each call for a proper dust cloud
  const count = speed > PLAYER_CONFIG.sprintSpeed * 0.85 ? 2 : 1;
  for (let c = 0; c < count; c++) {
    _spawnParticle(
      x + (Math.random() - 0.5) * 0.5,
      PITCH_CONFIG.positionY + 0.12,
      z + (Math.random() - 0.5) * 0.5,
      (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.0, (Math.random() - 0.5) * 1.2,
      0.95, 0.92, 0.80,  // bright white-cream — visible on green field
      0.32 + Math.random() * 0.28
    );
  }
}

// Ball motion trail — activate at moderate speed, more intense when flying fast
function emitBallTrail(dt) {
  if (!ball) return;
  _ballTrailTimer -= dt;
  const spd = ball.userData.vel.length();
  if (spd < 3 || _ballTrailTimer > 0) return;
  // Emit more often the faster the ball moves
  _ballTrailTimer = Math.max(0.01, 0.06 - spd * 0.0018);
  const t = Math.min(1, (spd - 3) / 20); // 0 at spd=3, 1 at spd=23
  _spawnParticle(
    ball.position.x, ball.position.y + 0.05, ball.position.z,
    ball.userData.vel.x * -0.06, Math.abs(ball.userData.vel.y) * 0.04 + 0.2, ball.userData.vel.z * -0.06,
    1, 0.95 - t * 0.4, 0.9 - t * 0.75,  // white → warm orange at high speed
    0.18 + t * 0.2
  );
}

function updateParticles(dt) {
  if (!_partGeo) return;
  _partData.forEach((p, i) => {
    if (!p.alive) {
      _partPos[i * 3 + 1] = -1000; // push off-screen
      return;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.vy -= 5.5 * dt; // gravity
    p.life -= dt;
    if (p.life <= 0) { p.alive = false; _partPos[i * 3 + 1] = -1000; return; }
    const frac = p.life / p.maxLife; // 1→0
    _partPos[i * 3]     = p.x;
    _partPos[i * 3 + 1] = p.y;
    _partPos[i * 3 + 2] = p.z;
    _partCol[i * 3]     = p.r * frac;
    _partCol[i * 3 + 1] = p.g * frac;
    _partCol[i * 3 + 2] = p.b * frac;
  });
  _partGeo.attributes.position.needsUpdate = true;
  _partGeo.attributes.color.needsUpdate    = true;
}

// ============================================================
// FIRST-PERSON MODE
// ============================================================
function toggleFPS() {
  fpsMode = !fpsMode;
  fpsPitch = 0;
  const el = document.getElementById('fps-indicator');
  const ch = document.getElementById('fps-crosshair');
  if (fpsMode) {
    document.body.requestPointerLock();
    if (el) el.textContent = 'FPS ON  |  F: exit';
    if (ch) ch.style.display = 'block';
    if (controlled) controlled.visible = false; // hide own body in first-person
  } else {
    document.exitPointerLock();
    if (el) el.textContent = '';
    if (ch) ch.style.display = 'none';
    if (controlled) controlled.visible = true;  // restore on exit
    _syncCamToIdeal(); // snap camPos to broadcast so no lerp-from-stale-pos glitch
  }
}

document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && fpsMode) {
    fpsMode = false;
    fpsPitch = 0;
    if (controlled) controlled.visible = true; // always restore model
    const el = document.getElementById('fps-indicator');
    const ch = document.getElementById('fps-crosshair');
    if (el) el.textContent = '';
    if (ch) ch.style.display = 'none';
    _syncCamToIdeal(); // prevent stale-camPos snap when re-entering 3rd person
  }
});

document.addEventListener('mousemove', e => {
  if (!fpsMode || document.pointerLockElement !== document.body) return;
  if (controlled) controlled.rotation.y -= e.movementX * FPS_SENS;
  fpsPitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2,
    fpsPitch - e.movementY * FPS_SENS));
});

// ============================================================
// INPUT
// ============================================================
const keys = {};
let chargeState = null; // { type: 'pass'|'shoot', startTime }
const MAX_CHARGE = 1.8;  // seconds for full power

function cancelCharge() {
  if (!chargeState) return;
  chargeState = null;
  const pbw = document.getElementById('power-bar-wrap');
  if (pbw) pbw.style.display = 'none';
  document.getElementById('power-fill').style.width = '0%';
}

document.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') {
    if (gameState === 'playing') setGameState('paused');
    else if (gameState === 'paused') setGameState('playing');
    return;
  }
  // Penalty: SPACE fires the shot (works in both attack and defend modes)
  if (gameState === 'penalty' && penaltyState?.phase === 'active' && e.code === 'Space') {
    e.preventDefault();
    firePenaltyShot();
    return;
  }
  if (gameState === 'playing' && !throwInState && e.code === 'KeyO') {
    e.preventDefault();
    setupPenalty(false); // test: defend home goal
    return;
  }
  if (gameState === 'playing' && !throwInState && e.code === 'KeyP') {
    e.preventDefault();
    setupPenalty(true); // test: attack away goal
    return;
  }
  if (gameState !== 'playing') return;
  if (throwInState) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (e.repeat) return;
    if (!hasBall()) { switchPlayer(); return; }
    if (!chargeState) {
      chargeState = { type: 'pass', startTime: performance.now() };
      document.getElementById('power-bar-label').textContent = 'PASS POWER';
      document.getElementById('power-bar-wrap').style.display = 'block';
    }
  }
  if (e.code === 'KeyE') {
    if (hasBall() && !chargeState) {
      chargeState = { type: 'shoot', startTime: performance.now() };
      document.getElementById('power-bar-label').textContent = 'SHOT POWER';
      document.getElementById('power-bar-wrap').style.display = 'block';
    } else if (!hasBall()) {
      doTackle();
    }
  }
  if (e.code === 'KeyQ') { switchPlayer(); }   // Q always switches to player nearest the ball
  if (e.code === 'KeyR') { if (hasBall()) doLobShot(); }
  if (e.code === 'KeyF') { toggleFPS(); }      // F toggles first-person camera
});

document.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (chargeState && (e.code === 'Space' || e.code === 'KeyE')) {
    const elapsed = (performance.now() - chargeState.startTime) / 1000;
    const power = Math.min(1.0, elapsed / MAX_CHARGE);
    const type = chargeState.type;
    cancelCharge();
    if (type === 'pass') doPass(power);
    else if (type === 'shoot') doShoot(power);
  }
});

const hasBall = () => controlled && controlled.userData.hasBall;

// ============================================================
// MOVEMENT
// ============================================================
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// Smoothly rotate p toward targetAngle. turnRate in radians/second.
function smoothRotateY(p, targetAngle, dt, turnRate = 12) {
  let diff = targetAngle - p.rotation.y;
  while (diff >  Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  p.rotation.y += diff * Math.min(1, dt * turnRate);
}
function getInputMoveVector() {
  const mv = new THREE.Vector3();
  const hasMoveKey = keys['KeyW'] || keys['KeyA'] || keys['KeyS'] || keys['KeyD'];
  if (!hasMoveKey) return mv;

  // Keep WASD locked to on-screen directions, regardless of broadcast camera angle.
  const camForward = new THREE.Vector3();
  camera.getWorldDirection(camForward);
  camForward.y = 0;
  if (camForward.lengthSq() < 1e-6) camForward.set(1, 0, 0);
  else camForward.normalize();

  const camRight = new THREE.Vector3().crossVectors(camForward, WORLD_UP).normalize();
  if (keys['KeyW']) mv.add(camForward);
  if (keys['KeyS']) mv.addScaledVector(camForward, -1);
  if (keys['KeyD']) mv.add(camRight);
  if (keys['KeyA']) mv.addScaledVector(camRight, -1);
  return mv;
}

function updateControlled(dt) {
  if (!controlled || gameState !== 'playing' || throwInState) return;
  const p = controlled;
  const mv = getInputMoveVector();

  if (!p.userData.snowVel) p.userData.snowVel = new THREE.Vector3();
  const snowVel = p.userData.snowVel;

  if (mv.lengthSq() > 0) {
    mv.normalize();
    const isSprint = keys['ShiftLeft'] || keys['ShiftRight'];
    let sp = PLAYER_CONFIG.runSpeed;
    if (isSprint && p.userData.stamina > 0) {
      sp = PLAYER_CONFIG.sprintSpeed;
      p.userData.stamina = Math.max(0, p.userData.stamina - 24 * dt);
    } else {
      p.userData.stamina = Math.min(100, p.userData.stamina + 11 * dt);
    }

    if (snowActive) {
      // Snow: slow acceleration and wide turning arc = slippery feel
      snowVel.lerp(new THREE.Vector3(mv.x * sp, 0, mv.z * sp), Math.min(1, dt * 4));
      p.position.x += snowVel.x * dt;
      p.position.z += snowVel.z * dt;
      const spEff = snowVel.length();
      if (!fpsMode && spEff > 0.2) smoothRotateY(p, Math.atan2(snowVel.x, snowVel.z), dt, 7);
      p.userData.animPhase += dt * spEff * 0.75;
      animatePlayerRunning(p, spEff, dt);
      if (p.userData.mixer) p.userData.mixer.timeScale = Math.max(0.3, spEff / PLAYER_CONFIG.runSpeed);
      emitFootDust(p.position.x, p.position.z, spEff);
    } else {
      snowVel.set(mv.x * sp, 0, mv.z * sp);
      p.position.x += mv.x * sp * dt;
      p.position.z += mv.z * sp * dt;
      if (!fpsMode) smoothRotateY(p, Math.atan2(mv.x, mv.z), dt, 14);
      p.userData.animPhase += dt * sp * 0.75;
      animatePlayerRunning(p, sp, dt);
      if (p.userData.mixer) p.userData.mixer.timeScale = sp / PLAYER_CONFIG.runSpeed;
      emitFootDust(p.position.x, p.position.z, sp);
    }
    clampPitch(p);
    if (p.userData.hasBall) moveBallWith(p);
  } else {
    if (snowActive && snowVel.lengthSq() > 0.05) {
      // Slide to a stop on snow rather than stopping instantly
      snowVel.lerp(new THREE.Vector3(), Math.min(1, dt * 2.5));
      p.position.x += snowVel.x * dt;
      p.position.z += snowVel.z * dt;
      clampPitch(p);
      if (p.userData.hasBall) moveBallWith(p);
    } else {
      snowVel.set(0, 0, 0);
      resetPlayerPose(p);
      if (p.userData.mixer) p.userData.mixer.timeScale = 1;
    }
    p.userData.stamina = Math.min(100, p.userData.stamina + 9 * dt);
  }

  document.getElementById('stamina-fill').style.width = p.userData.stamina + '%';
}

function moveBallWith(p) {
  const fwd = new THREE.Vector3(Math.sin(p.rotation.y), 0, Math.cos(p.rotation.y));
  ball.position.set(p.position.x + fwd.x * 0.55, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, p.position.z + fwd.z * 0.55);
  ball.userData.vel.set(0, 0, 0);
}

function clampPitch(p) {
  const hw = PITCH_CONFIG.hw * PITCH_CONFIG.scale - 0.5;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale - 0.5;
  p.position.x = Math.max(-hw, Math.min(hw, p.position.x));
  p.position.z = Math.max(-hl, Math.min(hl, p.position.z));
}

// ============================================================
// BALL CONTROL PICKUP
// ============================================================
function checkBallPickup() {
  const spd = ball.userData.vel.length();
  if (spd > 22) return; // very hard shots blow past everyone
  // Wider trap radius for passes; tight radius for shots so the GK can't hoover up a bullet
  const pickupR = spd < 9 ? PLAYER_CONFIG.controlRadius * 1.8 : PLAYER_CONFIG.controlRadius;
  const all = [...homePlayers, ...awayPlayers];
  let nearest = null, nearD = pickupR;
  all.forEach(p => {
    const d = p.position.distanceTo(ball.position);
    if (d < nearD) { nearD = d; nearest = p; }
  });
  if (!nearest) return;
  const holder = all.find(p => p.userData.hasBall);
  if (nearest === holder) return;

  all.forEach(p => p.userData.hasBall = false);
  nearest.userData.hasBall = true;
  ball.userData.lastBy = nearest;

  if (homePlayers.includes(nearest) && !nearest.userData.isGK) setControlled(nearest);
}

// ============================================================
// ACTIONS
// ============================================================
function getBestPassTarget() {
  if (!controlled) return null;
  // Include GK as pass option too
  const mates = homePlayers.filter(p => p !== controlled);
  if (!mates.length) return null;

  // Aim direction: movement keys take priority, then facing direction
  const mv = getInputMoveVector();
  const aimDir = mv.lengthSq() > 0
    ? mv.clone().normalize()
    : new THREE.Vector3(Math.sin(controlled.rotation.y), 0, Math.cos(controlled.rotation.y));

  let best = null, bestScore = -Infinity;
  mates.forEach(t => {
    const toTarget = new THREE.Vector3().subVectors(t.position, controlled.position);
    const dist = toTarget.length();
    const dot = aimDir.dot(toTarget.clone().normalize());
    // FPS: weight facing direction much more heavily — look where you want to pass
    const aimWeight = fpsMode ? 150 : 110;
    const score = dot * aimWeight - dist * 0.35 + (dist < 4 ? -25 : 0);
    if (score > bestScore && dist < 120 && dot > -0.25) {
      bestScore = score;
      best = t;
    }
  });
  // Fallback: if no valid target in front, return the nearest teammate (back-pass)
  if (!best) {
    best = mates.reduce((a, b) =>
      a.position.distanceTo(controlled.position) <= b.position.distanceTo(controlled.position) ? a : b
    );
  }
  return best;
}

function doPass(power = 0.65) {
  if (!hasBall()) return;
  const passer = controlled;
  const best = getBestPassTarget();
  if (!best) return;
  passer.userData.hasBall = false;

  const toTarget = new THREE.Vector3().subVectors(best.position, ball.position);
  const dist = toTarget.length();
  const dir = toTarget.clone().normalize();

  const minForce = PLAYER_CONFIG.kickPower * 0.32;
  const maxForce = PLAYER_CONFIG.kickPower * 1.1;
  const force = Math.min(minForce + power * (maxForce - minForce), dist * 3.2);

  const err = (1 - PLAYER_CONFIG.passAccuracy) * 0.16 * (1 - power * 0.4);
  dir.x += (Math.random() - 0.5) * err;
  dir.z += (Math.random() - 0.5) * err;
  dir.normalize();

  ball.userData.vel.copy(dir.multiplyScalar(force));
  ball.userData.vel.y = 0.5 + power * 2.4;
  emitKickBurst(ball.position);
}

function doThroughBall() {
  if (!hasBall()) return;
  const passer = controlled;
  const fwds = homePlayers.filter(p => !p.userData.isGK && p !== passer);
  if (!fwds.length) return;
  // Find most advanced player toward opponent goal
  const sign = controlled.position.z < 0 ? -1 : 1;
  const target = fwds.reduce((a, b) => (sign * b.position.z > sign * a.position.z ? b : a));
  passer.userData.hasBall = false;
  const ahead = target.position.clone();
  ahead.z += sign * 18; // lead the run further
  const dir = new THREE.Vector3().subVectors(ahead, ball.position).normalize();
  ball.userData.vel.copy(dir.multiplyScalar(PLAYER_CONFIG.kickPower * 0.9));
  ball.userData.vel.y = 2.2;
  showMsg('THROUGH BALL!');
}

function doShoot(power = 0.75) {
  if (!hasBall()) return;
  controlled.userData.hasBall = false;
  const homeGK = homePlayers.find(gk => gk.userData.isGK);
  const goalZ = homeGK ? -Math.sign(homeGK.position.z) * PITCH_CONFIG.hl * PITCH_CONFIG.scale : PITCH_CONFIG.hl * PITCH_CONFIG.scale;

  // Aim assist: blend heavily toward goal, small random spread
  const tx = (Math.random() - 0.5) * PITCH_CONFIG.goalWidth * 0.62;
  const ty = 0.32 + Math.random() * PITCH_CONFIG.goalHeight * 0.76;
  const target = new THREE.Vector3(PITCH_CONFIG.positionX + tx, PITCH_CONFIG.positionY + ty, PITCH_CONFIG.positionZ + goalZ);
  const toGoal = new THREE.Vector3().subVectors(target, ball.position).normalize();
  const facing = new THREE.Vector3(Math.sin(controlled.rotation.y), 0, Math.cos(controlled.rotation.y));
  // FPS aim assist stronger (90%) since manual aiming is harder without a cursor
  const autoAim = fpsMode ? 0.90 : 0.78;
  const dir = new THREE.Vector3().addScaledVector(toGoal, autoAim).addScaledVector(facing, 1 - autoAim).normalize();

  // Harder shots less accurate
  const errScale = (power > 0.85 ? 0.13 : 0.04) * (1 - PLAYER_CONFIG.shotAccuracy);
  dir.x += (Math.random() - 0.5) * errScale;
  dir.normalize();

  const minForce = PLAYER_CONFIG.kickPower * 0.65;
  const maxForce = PLAYER_CONFIG.kickPower * 1.35;
  ball.userData.vel.copy(dir.multiplyScalar(minForce + power * (maxForce - minForce)));
  ball.userData.vel.y = Math.max(0.8, ty * 0.65 + power * 2.2);
  emitKickBurst(ball.position);
}

function doLobShot() {
  if (!hasBall()) return;
  controlled.userData.hasBall = false;
  const homeGK = homePlayers.find(gk => gk.userData.isGK);
  const goalZ = homeGK ? -Math.sign(homeGK.position.z) * PITCH_CONFIG.hl * PITCH_CONFIG.scale : PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const target = new THREE.Vector3(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY + PITCH_CONFIG.goalHeight * 0.9, PITCH_CONFIG.positionZ + goalZ);
  const dir = new THREE.Vector3().subVectors(target, ball.position).normalize();
  ball.userData.vel.copy(dir.multiplyScalar(PLAYER_CONFIG.kickPower * 0.78));
  ball.userData.vel.y = 16;  // high arc
  emitKickBurst(ball.position);
  showMsg('LOB SHOT!');
}

function doTackle() {
  const holder = [...homePlayers, ...awayPlayers].find(p => p.userData.hasBall);
  if (!holder || !controlled || holder === controlled) return;
  const d = controlled.position.distanceTo(holder.position);
  if (d < 1.5) {
    if (Math.random() < 0.28) {
      // Clean tackle
      holder.userData.hasBall = false;
      controlled.userData.hasBall = true;
      ball.userData.vel.set(0, 0, 0);
      ball.position.set(controlled.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, controlled.position.z);
      showMsg('TACKLE!');
    } else {
      // Failed tackle — chance of foul (home player committed it)
      if (awayPlayers.includes(holder) && Math.random() < 0.12) {
        showMsg('FOUL!');
        triggerYellowCard(false); // home team fouled → home gets yellow
      }
    }
  }
}

function switchPlayer() {
  const cands = homePlayers.filter(p => !p.userData.isGK && p !== controlled);
  if (!cands.length) return;
  cands.sort((a, b) => a.position.distanceTo(ball.position) - b.position.distanceTo(ball.position));
  setControlled(cands[0]);
}

function setControlled(p) {
  if (controlled) {
    controlled.userData.isControlled = false;
    if (controlled.userData.ring) controlled.userData.ring.material.opacity = 0;
    if (fpsMode) {
      // Pass the passer's yaw to the new player so the FPS camera doesn't jolt
      p.rotation.y = controlled.rotation.y;
      controlled.visible = true;
    }
  }
  controlled = p;
  p.userData.isControlled = true;
  if (p.userData.ring) p.userData.ring.material.opacity = 0.85;
  if (fpsMode) p.visible = false; // hide new player in FPS
  document.getElementById('pc-name').textContent = p.userData.name.toUpperCase();
  document.getElementById('pc-pos').textContent = p.userData.isGK ? 'GK' : `${p.userData.posName} · ${p.userData.team.name.toUpperCase()}`;
}

// ============================================================
// AI SYSTEM
// ============================================================
// AI_TICK = 0 → runs every frame so NPC positions update smoothly (no more 11fps teleporting)
function updateAI(dt) {
  const adt = dt;

  const allPlayers = [...homePlayers, ...awayPlayers];
  const holder = allPlayers.find(p => p.userData.hasBall);
  const homeHasBall = holder ? homePlayers.includes(holder) : false;
  const awayHasBall = holder ? awayPlayers.includes(holder) : false;

  awayPlayers.forEach(p => {
    if (p.userData.isGK) updateGKAI(p, adt);
    else updateOutfieldAI(p, false, holder, homeHasBall, awayHasBall, adt);
  });
  homePlayers.forEach(p => {
    if (p === controlled) return;
    if (p.userData.isGK) updateGKAI(p, adt);
    else updateOutfieldAI(p, true, holder, homeHasBall, awayHasBall, adt);
  });

  // Away players press controlled player when they have ball
  if (controlled && controlled.userData.hasBall) {
    awayPlayers.filter(p => !p.userData.isGK).forEach(opp => {
      const d = opp.position.distanceTo(controlled.position);
      if (d < 1.1 && Math.random() < 0.008) {
        controlled.userData.hasBall = false;
        cancelCharge();
        if (Math.random() < 0.55) {
          opp.userData.hasBall = true;
          ball.userData.vel.set(0, 0, 0);
          ball.position.set(opp.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, opp.position.z);
          showMsg('BALL LOST!');
        } else {
          ball.userData.vel.set((Math.random() - 0.5) * 8, 1.8, (Math.random() - 0.5) * 8);
          showMsg('FOUL!');
          // Rough challenge → possible yellow card for away team
          if (Math.random() < 0.16) triggerYellowCard(true);
        }
      }
    });
  }
}

function updateOutfieldAI(p, isHome, holder, homeHasBall, awayHasBall, adt) {
  const teamHasBall = isHome ? homeHasBall : awayHasBall;
  const oppHasBall  = isHome ? awayHasBall : homeHasBall;
  const hl        = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const ownGZ     = (isHome ? -1 : 1) * hl;
  const atkGZ     = -ownGZ;
  const atkDir    = Math.sign(atkGZ);
  const opponents = isHome ? awayPlayers : homePlayers;
  const teammates = isHome ? homePlayers : awayPlayers;
  const h         = p.userData.home;

  // ── BALL CARRIER: always update immediately ───────────────────
  if (p.userData.hasBall) {
    const distToGoal = Math.abs(p.position.z - (PITCH_CONFIG.positionZ + atkGZ));
    const pressedBy  = opponents.filter(o => !o.userData.isGK && o.position.distanceTo(p.position) < 4.5);

    // Shoot — much more aggressively at close range
    const shootChance = distToGoal < 14 ? 0.13 : distToGoal < 24 ? 0.065 : distToGoal < 35 ? 0.028 : 0;
    if (shootChance > 0 && Math.random() < shootChance) { aiShoot(p); return; }

    // Pass — more often in own half or under pressure
    const inOwnHalf  = atkDir * p.position.z < 0;
    const passChance = pressedBy.length >= 1 ? 0.08 : (inOwnHalf ? 0.04 : 0.018);
    if (Math.random() < passChance) { aiPass(p, { inOwnHalf, pressedCount: pressedBy.length }); return; }

    // ── JUKE / SPIN: random chance when a defender is tight ──────
    const pressedClose = pressedBy.filter(o => o.position.distanceTo(p.position) < 3.0);
    if (!p.userData.juke && pressedClose.length > 0 && Math.random() < adt * 0.15) {
      p.userData.juke = {
        timer: 0,
        duration: 0.38 + Math.random() * 0.14,
        spinDir: Math.random() < 0.5 ? 1 : -1,
      };
    }
    if (p.userData.juke) {
      const j = p.userData.juke;
      j.timer += adt;
      // Sharp full-body spin — visually unmistakable
      p.rotation.y += j.spinDir * Math.PI * 5.5 * adt;
      // Keep dribbling forward through the spin
      aiMoveTo(p, new THREE.Vector3(
        p.position.x + Math.sin(p.rotation.y) * 3,
        0,
        p.position.z + Math.cos(p.rotation.y) * 3
      ), adt * 1.4);
      emitFootDust(p.position.x, p.position.z, PLAYER_CONFIG.runSpeed * 1.2);
      if (j.timer >= j.duration) p.userData.juke = null;
      return;
    }

    // Dribble hard toward goal (slight curve toward center)
    const tx = h.x * (isHome ? 0.28 : 0.2);
    const dribbleDepth = isHome ? 0.92 : 0.97;
    aiMoveTo(p, new THREE.Vector3(PITCH_CONFIG.positionX + tx, 0, PITCH_CONFIG.positionZ + atkGZ * dribbleDepth), adt);
    return;
  }

  // ── PRESSING: 2 closest react immediately, no commit delay ───
  const myDistToBall = p.position.distanceTo(ball.position);
  if (oppHasBall) {
    const closerCount = teammates.filter(
      t => !t.userData.isGK && t !== p && t.position.distanceTo(ball.position) < myDistToBall
    ).length;
    if (closerCount < 2) {
      if (holder && p.position.distanceTo(holder.position) < 1.9 && Math.random() < 0.06) {
        attemptAITackle(p, holder, isHome); return;
      }
      const pt = ball.position.clone(); pt.y = 0;
      aiMoveTo(p, pt, adt * 1.18);
      return;
    }
  }

  // ── LOOSE BALL CHASERS: 3 closest react immediately ──────────
  if (!teamHasBall && !oppHasBall) {
    const closerTeammates = teammates.filter(
      t => !t.userData.isGK && t !== p && t.position.distanceTo(ball.position) < myDistToBall
    ).length;
    if (closerTeammates < 3) {
      const anticipate = ball.position.clone().addScaledVector(ball.userData.vel, 0.25);
      anticipate.y = 0;
      aiMoveTo(p, anticipate, adt * 1.15);
      return;
    }
  }

  // ── TARGET COMMIT (all other players) ────────────────────────
  // Players hold their current target for ~0.42s before recalculating.
  // This stops the constant micro-oscillation that looks robotic — a player
  // commits to a run, completes it, then picks the next position.
  p.userData.aiTargetTimer = (p.userData.aiTargetTimer || 0) - adt;
  const nearTarget = p.userData.aiTarget && p.position.distanceTo(p.userData.aiTarget) < 1.6;
  if (p.userData.aiTargetTimer > 0 && !nearTarget && p.userData.aiTarget) {
    aiMoveTo(p, p.userData.aiTarget, adt * 0.88);
    return;
  }

  // ── CALCULATE NEW TARGET ─────────────────────────────────────
  // ballProgress: positive = ball is in this team's attacking half.
  const ballProgress = ball.position.z * atkDir;

  // How deep this player sits in their own formation (larger = deeper defender).
  // homeDepth > 38 → CB, > 28 → LB/RB, > 10 → CM, else → forward (handled separately).
  const homeDepth = -(atkDir * h.z);

  let teamOffset;
  if (teamHasBall) {
    // Push the whole team forward aggressively — only the 2 CBs stay back.
    // baseAdv=30 means LBs (h.z=±36) advance to z=±6 (edge of midfield),
    // CMs go into the opponent half, and forwards are already in the penalty area.
    const attackBonus = isHome ? 0 : OPPONENT_AI_ATTACK_BONUS;
    const baseAdv  = 30 + attackBonus;
    const extraAdv = Math.max(0, ballProgress * (isHome ? 0.6 : 0.72));
    const totalAdv = Math.min(baseAdv + extraAdv, hl * (isHome ? 0.72 : 0.8));

    // Only the 2 CBs (homeDepth > 38) are capped — they hold a back-two.
    // Everyone else pushes with full advance.
    const personalCap = homeDepth > 38 ? (isHome ? 14 : 22) : totalAdv;
    teamOffset = atkDir * Math.min(totalAdv, personalCap);

  } else if (oppHasBall) {
    teamOffset = atkDir * Math.max(-hl * 0.12, Math.min(ballProgress * 0.26, hl * 0.14));
  } else {
    teamOffset = atkDir * Math.max(-hl * 0.07, Math.min(ballProgress * 0.36, hl * 0.32));
  }
  const rawZ = PITCH_CONFIG.positionZ + h.z * PITCH_CONFIG.scale + teamOffset;
  const minZ = -hl * 0.96;
  const maxZ = hl * 0.96;
  const clampedZ = Math.max(minZ, Math.min(maxZ, rawZ));

  let newTarget;

  if (teamHasBall) {
    // ── ATTACKING POSITIONS ──────────────────────────────────
    // ST + LW + RW make dedicated penalty-area runs.
    // Mids push to edge of box. Defenders advance to halfway.
    const isAttacker = atkDir * h.z >= -5; // true for ST, LW, RW of each team
    if (isAttacker) {
      // Each attacker runs to a unique spot inside the penalty area
      const penDepth = Math.abs(h.x) < 8 ? 0.82 : 0.76; // ST deeper, wingers wider
      const penZ     = PITCH_CONFIG.positionZ + atkGZ * penDepth;
      const runX     = PITCH_CONFIG.positionX + h.x * PITCH_CONFIG.scale * 0.62;
      newTarget = new THREE.Vector3(runX, 0, penZ);
    } else {
      // Mids / defenders: advance with the team line
      newTarget = new THREE.Vector3(PITCH_CONFIG.positionX + h.x * PITCH_CONFIG.scale, 0, clampedZ);
    }

  } else if (oppHasBall) {
    // ── DEFENSIVE MARKING ───────────────────────────────────
    const unmarked = opponents.filter(o => !o.userData.isGK && o !== holder);
    const nearest  = unmarked.reduce((best, opp) => {
      const d = p.position.distanceTo(opp.position);
      return !best || d < p.position.distanceTo(best.position) ? opp : best;
    }, null);
    const linePos = new THREE.Vector3(PITCH_CONFIG.positionX + h.x * PITCH_CONFIG.scale, 0, clampedZ);
    newTarget = nearest
      ? new THREE.Vector3().lerpVectors(nearest.position, linePos, 0.45)
      : linePos.clone();

  } else {
    // ── LOOSE BALL (non-chaser): hold team line, drift toward ball ──
    const holdPos = new THREE.Vector3(PITCH_CONFIG.positionX + h.x * PITCH_CONFIG.scale, 0, clampedZ);
    newTarget = new THREE.Vector3().lerpVectors(holdPos, ball.position, 0.2);
  }

  newTarget.y = 0;
  p.userData.aiTarget      = newTarget;
  p.userData.aiTargetTimer = 0.42;
  aiMoveTo(p, p.userData.aiTarget, adt * 0.9);
}

function attemptAITackle(tackler, holder, tacklerIsHome) {
  if (!holder || !holder.userData.hasBall) return;
  holder.userData.hasBall = false;
  if (Math.random() < 0.54) {
    tackler.userData.hasBall = true;
    ball.userData.vel.set(0, 0, 0);
    ball.position.set(tackler.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, tackler.position.z);
    if (holder === controlled) { cancelCharge(); showMsg('BALL LOST!'); }
    if (tacklerIsHome && tackler !== controlled) setControlled(tackler);
  } else {
    ball.userData.vel.set((Math.random() - 0.5) * 9, 2, (Math.random() - 0.5) * 9);
    // Chance of yellow card — away tackles generate away yellows (home benefits)
    if (!tacklerIsHome && holder === controlled && Math.random() < 0.14) {
      triggerYellowCard(true);  // away team fouled home player
    } else if (tacklerIsHome && Math.random() < 0.10) {
      triggerYellowCard(false); // home team foul
    }
  }
}

function updateGKAI(p, adt) {
  const isHome = homePlayers.includes(p);
  const ownGZ = (isHome ? -1 : 1) * PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const goalLineZ = PITCH_CONFIG.positionZ + ownGZ;
  const standOffZ = goalLineZ + (isHome ? 4.5 : -4.5);

  // If GK holds ball, distribute quickly
  if (p.userData.hasBall) {
    p.userData.gkHoldTime = (p.userData.gkHoldTime || 0) + adt;
    ball.position.set(p.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, p.position.z);
    if (p.userData.gkHoldTime > 1.8) {
      p.userData.hasBall = false;
      p.userData.gkHoldTime = 0;
      const kickBoost = isHome ? 1 : OPPONENT_AI_KICK_BOOST;
      // Kick toward the field (away from own end) and aim at a nearby outfielder
      const kickZ = p.position.z < 0 ? 1 : -1; // always kick toward center
      const mates = (isHome ? homePlayers : awayPlayers).filter(t => !t.userData.isGK);
      const target = mates.sort((a, b) => kickZ * b.position.z - kickZ * a.position.z)[0];
      if (target) {
        const toMate = new THREE.Vector3().subVectors(target.position, ball.position);
        toMate.y = 0; toMate.normalize();
        ball.userData.vel.set(toMate.x * PLAYER_CONFIG.kickPower * 0.68 * kickBoost, 0, toMate.z * PLAYER_CONFIG.kickPower * 0.68 * kickBoost);
        ball.userData.vel.y = 9;
      } else {
        const kickDir = new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3, kickZ).normalize();
        ball.userData.vel.copy(kickDir.multiplyScalar(PLAYER_CONFIG.kickPower * 0.72 * kickBoost));
        ball.userData.vel.y = 9;
      }
    }
    return;
  }

  // Position: track ball horizontally, hold on goal line
  const maxX = PITCH_CONFIG.goalWidth * 0.62;
  const tx = Math.max(-maxX, Math.min(maxX, ball.position.x * 0.72));
  aiMoveTo(p, new THREE.Vector3(PITCH_CONFIG.positionX + tx, 0, standOffZ), adt * 1.25);
  p.lookAt(new THREE.Vector3(ball.position.x, p.position.y, ball.position.z));

  // Save attempt
  const d = p.position.distanceTo(ball.position);
  const bv = ball.userData.vel;
  const comingToGoal = isHome ? bv.z < -2.5 : bv.z > 2.5;
  const onTarget = Math.abs(ball.position.x) < PITCH_CONFIG.goalWidth * 0.62;

  if (d < 3.2 && comingToGoal && onTarget && bv.length() > 4) {
    let savePct = Math.max(0.1, 0.65 - d * 0.08 - bv.length() * 0.014);
    if (!isHome) savePct *= 0.3; // away GK is noticeably weaker
    if (Math.random() < savePct) {
      p.userData.hasBall = true;
      p.userData.gkHoldTime = 0;
      ball.userData.vel.set(0, 0, 0);
      ball.position.set(p.position.x, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, p.position.z);
      showMsg('SAVE!');
    } else if (Math.random() < (isHome ? 0.38 : 0.2)) {
      // Parry / fingertip — ball deflects
      bv.x *= -0.55;
      bv.z *= -0.38;
      bv.y = Math.abs(bv.y) * 0.45 + 2.5;
      showMsg('BLOCKED!');
    }
  }
}

function aiMoveTo(p, target, adt) {
  const toTarget = new THREE.Vector3().subVectors(target, p.position);
  toTarget.y = 0;
  const dist = toTarget.length();
  const maxSp = p.userData.speed * 0.74;

  // Smoothed velocity gives NPC players natural acceleration + deceleration
  // instead of instant direction flips that look robotic/choppy.
  if (!p.userData.aiVel) p.userData.aiVel = new THREE.Vector3();
  const vel = p.userData.aiVel;

  if (dist < 0.28) {
    // Bleed off speed — don't hard-stop
    vel.lerp(new THREE.Vector3(), Math.min(1, adt * 9));
    if (vel.lengthSq() < 0.01) return;
  } else {
    const desired = toTarget.clone().normalize().multiplyScalar(maxSp);
    vel.lerp(desired, Math.min(1, adt * 7));   // 7 rad/s acceleration
  }

  const speed = vel.length();
  if (speed < 0.01) return;
  const moveDir = vel.clone().normalize();
  const step = Math.min(speed * adt, dist);

  p.position.addScaledVector(moveDir, step);
  p.position.y = PITCH_CONFIG.positionY + (PLAYER_CONFIG.useCustomModel ? PLAYER_CONFIG.yOffset : 0);
  smoothRotateY(p, Math.atan2(moveDir.x, moveDir.z), adt, 10);
  p.userData.animPhase += adt * speed * 0.5;
  animatePlayerRunning(p, speed, adt * 0.08);
  if (p.userData.mixer) p.userData.mixer.timeScale = Math.max(0.3, speed / PLAYER_CONFIG.runSpeed);
  clampPitch(p);
  if (p.userData.hasBall) moveBallWith(p);
}

function aiShoot(p) {
  p.userData.hasBall = false;
  const isAway = awayPlayers.includes(p);
  const gz = (isAway ? -1 : 1) * PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const tx = (Math.random() - 0.5) * PITCH_CONFIG.goalWidth * 0.64;
  const ty = 0.38 + Math.random() * PITCH_CONFIG.goalHeight * 0.7;
  const dir = new THREE.Vector3().subVectors(
    new THREE.Vector3(PITCH_CONFIG.positionX + tx, PITCH_CONFIG.positionY + ty, PITCH_CONFIG.positionZ + gz),
    ball.position
  ).normalize();
  const shotBoost = isAway ? OPPONENT_AI_KICK_BOOST : 1.05;
  ball.userData.vel.copy(dir.multiplyScalar(PLAYER_CONFIG.kickPower * (1.1 + Math.random() * 0.4) * shotBoost));
  emitKickBurst(ball.position);
}

function aiPass(p, opts = {}) {
  const { inOwnHalf = false, pressedCount = 0 } = opts;
  const isAway = awayPlayers.includes(p);
  const team = isAway ? awayPlayers : homePlayers;
  const opponents = isAway ? homePlayers : awayPlayers;
  const mates = team.filter(t => t !== p && !t.userData.isGK);
  if (!mates.length) return;
  p.userData.hasBall = false;
  // Prefer forward passes — sort by how far ahead they are, pick from top half
  const sign = isAway ? -1 : 1;
  let t = null;
  let bestScore = -Infinity;
  const pitchHalfW = Math.max(1, PITCH_CONFIG.hw * PITCH_CONFIG.scale);
  mates.forEach(m => {
    const dist = p.position.distanceTo(m.position);
    const forwardDelta = sign * (m.position.z - p.position.z); // + = toward goal
    const widthDelta = Math.abs(m.position.x - p.position.x);
    const lane = 1 - Math.min(1, widthDelta / pitchHalfW);
    const pressureNearMate = opponents.filter(o => !o.userData.isGK && o.position.distanceTo(m.position) < 5.4).length;

    let score = forwardDelta * 2.25 + dist * 0.2 + lane * 3.4 - pressureNearMate * 1.75;
    if (forwardDelta > 4) score += 8;
    if (forwardDelta < 0) score -= inOwnHalf ? 6 : 18;
    if (forwardDelta < -5) score -= 14;
    if (pressedCount > 0 && forwardDelta < 0) score += 8; // allow safe reset under pressure
    if (dist < 4) score -= 5;

    if (score > bestScore) {
      bestScore = score;
      t = m;
    }
  });
  if (!t) t = mates[Math.floor(Math.random() * mates.length)];

  const dir  = new THREE.Vector3().subVectors(t.position, ball.position).normalize();
  const dist = ball.position.distanceTo(t.position);
  // Scale force so the ball actually reaches the target: dist ≈ force / 0.9 (from physics)
  // Capped at kickPower * 1.15 for very long passes
  // Force calibration: ground-pass travel ≈ force * 1.11 (friction decay)
  // Away team had OPPONENT_AI_KICK_BOOST causing massive overshoot — use flat 0.84 factor instead
  const forceFactor = isAway ? 0.84 : (1.03 * 1.04);
  const maxKick = isAway ? PLAYER_CONFIG.kickPower * 0.95 : PLAYER_CONFIG.kickPower * 1.32 * 1.04;
  const force = Math.min(maxKick, dist * forceFactor);
  ball.userData.vel.copy(dir.multiplyScalar(force));
  // Flatter arc for away to further reduce overshoot in air
  ball.userData.vel.y = isAway
    ? 0.9 + Math.min(dist * 0.07, 2.8)
    : 1.35 + Math.min(dist * 0.105, 4.6);
  emitKickBurst(ball.position);
}

// ============================================================
// CAMERA
// ============================================================
const camPos = new THREE.Vector3(0, GAME_CFG.camH, GAME_CFG.camDist);
const camTgt = new THREE.Vector3();

// Snap camPos/camTgt to the broadcast ideal — call whenever the camera
// was driven by something else (FPS mode, orbit, menu) so the next
// lerp-based frame starts from the right place instead of snapping.
function _syncCamToIdeal() {
  if (!ball) return;
  const bz  = ball.position.z;
  const hl2 = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const clz = Math.max(-hl2 * 0.88, Math.min(hl2 * 0.88, bz));
  camPos.set(BROADCAST_CAM_X, 18, clz);
  camTgt.set(ball.position.x * 0.25, 1.5, bz);
  camera.position.copy(camPos);
  camera.lookAt(camTgt);
}


function updateCamera(dt = 1 / 60) {
  // ── First-person view ──────────────────────────────────────
  if (fpsMode && controlled) {
    const p = controlled;
    // Head bob: amplitude grows with movement speed
    const spd = p.userData.snowVel ? p.userData.snowVel.length() : 0;
    const bob = spd > 1.2
      ? Math.sin(Date.now() * 0.016) * 0.05 * Math.min(1, spd / PLAYER_CONFIG.runSpeed)
      : 0;
    const targetY = p.position.y + FPS_EYE_HEIGHT + bob;
    // XZ: instant lock to player; Y: smooth to eliminate snaps from terrain/animation
    camera.position.x = p.position.x;
    camera.position.z = p.position.z;
    camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 22);
    const yaw = p.rotation.y;
    const cosPitch = Math.cos(fpsPitch);
    camera.lookAt(new THREE.Vector3(
      p.position.x + Math.sin(yaw) * cosPitch,
      camera.position.y + Math.sin(fpsPitch),
      p.position.z + Math.cos(yaw) * cosPitch
    ));
    return;
  }

  if (penaltyState) { updatePenaltyCamera(dt); return; }

  if (gameState === 'intro') return; // Intro handles its own camera

  const bx = ball.position.x, bz = ball.position.z;
  const hl = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const clampZ = Math.max(-hl * 0.88, Math.min(hl * 0.88, bz));

  let idealPos, idealTgt;
  if (slowMoState) {
    // Cinematic orbiting camera for slow-mo replay
    slowMoState.camAngle += 0.003;
    const a = slowMoState.camAngle;
    idealPos = new THREE.Vector3(
      Math.cos(a) * 32, 10 + Math.abs(Math.sin(a * 0.6)) * 9, clampZ + Math.sin(a) * 14
    );
    idealTgt = new THREE.Vector3(bx * 0.4, 1.2, bz);
  } else {
    // FIFA broadcast side-view: camera on the +X touchline, following ball along Z
    idealPos = new THREE.Vector3(BROADCAST_CAM_X, 18, clampZ);
    idealTgt = new THREE.Vector3(bx * 0.25, 1.5, bz);
  }

  // Frame-rate independent: same feel at 30fps or 144fps
  const baseSmooth = slowMoState ? 0.012 : GAME_CFG.camSmooth;
  const smooth = 1 - Math.pow(1 - baseSmooth, dt * 60);
  camPos.lerp(idealPos, smooth);
  camTgt.lerp(idealTgt, smooth);
  camera.position.copy(camPos);
  camera.lookAt(camTgt);
}

function updatePenaltyCamera(dt = 1 / 60) {
  if (!penaltyState) return;
  const s14 = 1 - Math.pow(1 - 0.14, dt * 60);
  const s09 = 1 - Math.pow(1 - 0.09, dt * 60);
  if (penaltyState.type === 'defend') {
    const gk = penaltyState.gk;
    const goalZ   = penaltyState.homeGoalZ;
    const fieldDir = -Math.sign(goalZ);
    camPos.lerp(new THREE.Vector3(gk.position.x * 0.9, gk.position.y + 3.3, goalZ - fieldDir * 2.8), s14);
    camTgt.lerp(new THREE.Vector3(gk.position.x * 0.55, 1.0, goalZ + fieldDir * 13.5), s14);
  } else {
    const sh   = penaltyState.shooter;
    const gz   = penaltyState.awayGoalZ;
    const back = -Math.sign(gz);
    camPos.lerp(new THREE.Vector3(sh.position.x * 0.5, sh.position.y + 5.5, sh.position.z + back * 7), s09);
    camTgt.lerp(new THREE.Vector3(0, 1.6, gz), s09);
  }
  camera.position.copy(camPos);
  camera.lookAt(camTgt);
}

// ============================================================
// MATCH TIMER
// ============================================================
let matchTime = 0, isFirstHalf = true;
let homeScore = 0, awayScore = 0;

function updateMatchTime(dt) {
  if (gameState !== 'playing') return;
  matchTime += dt;
  const m = Math.floor(matchTime / 60);
  const s = Math.floor(matchTime % 60);
  document.getElementById('match-time').textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  document.getElementById('half-ind').textContent = isFirstHalf ? '1ST HALF' : '2ND HALF';
  if (isFirstHalf && matchTime >= GAME_CFG.halfDuration) doHalftime();
  if (matchTime >= GAME_CFG.matchDuration) doFulltime();
}

// ============================================================
// GOAL / EVENTS
// ============================================================
function scoreGoal(scoringHome) {
  if (slowMoState || gameState === 'slo_mo') return; // already handling a goal
  if (scoringHome) homeScore++; else awayScore++;
  showMsg('GOAL!');
  // Kick off slow-motion replay
  slowMoState = { realTimer: 0, duration: SLOW_MO_DUR, camAngle: Math.PI * 1.75, scoringHome };
  setGameState('slo_mo');
  const ro = document.getElementById('replay-overlay');
  if (ro) ro.classList.add('active');
}

function showGoalResults(scoringHome) {
  // Called after slow-mo replay finishes
  const scorer = scoringHome ? TEAMS.home.name : TEAMS.away.name;
  document.getElementById('goal-scorer').textContent = scorer.toUpperCase();
  document.getElementById('goal-score-disp').textContent = `${homeScore} — ${awayScore}`;
  document.getElementById('home-score').textContent = homeScore;
  document.getElementById('away-score').textContent = awayScore;
  setGameState('goal');
  document.getElementById('goal-overlay').classList.add('active');
  setTimeout(() => {
    document.getElementById('goal-overlay').classList.remove('active');
    resetKickoff(!scoringHome);
    setGameState('playing');
  }, 3000);
}

// ============================================================
// THROW-IN ANIMATION
// ============================================================
function updateThrowInAnim(dt) {
  if (!throwInState) return;
  throwInState.timer += dt;
  const p = throwInState.player;
  const L = p.userData.limbs;

  // Keep ball hovering above head throughout animation
  ball.position.set(p.position.x, PITCH_CONFIG.positionY + PLAYER_CONFIG.height * 1.18, p.position.z);
  ball.userData.vel.set(0, 0, 0);

  if (throwInState.phase === 'raise') {
    // Raise arms phase (0 → 0.85 s)
    if (L) {
      const t = Math.min(throwInState.timer / 0.55, 1);
      if (L.uaL) { L.uaL.rotation.x = -Math.PI * 0.88 * t; L.uaL.rotation.z =  0.06 * t; }
      if (L.uaR) { L.uaR.rotation.x = -Math.PI * 0.88 * t; L.uaR.rotation.z = -0.06 * t; }
      if (L.faL) L.faL.rotation.x = -0.35 * t;
      if (L.faR) L.faR.rotation.x = -0.35 * t;
    }
    if (throwInState.timer > 0.9) { throwInState.phase = 'throw'; throwInState.timer = 0; }

  } else {
    // Brief pause then release (≥ 0.18 s)
    if (throwInState.timer > 0.18) {
      // Throw inward and slightly toward a nearby team-mate position
      const inX = -Math.sign(p.position.x) * (8 + Math.random() * 5);
      const inZ = (throwInState.targetZ - p.position.z) * 0.32;
      ball.userData.vel.set(inX, 7 + Math.random() * 2.5, inZ);
      ball.userData.lastBy = p;
      resetPlayerPose(p);
      showMsg('THROW IN');
      throwInState = null;
    }
  }
}

// ============================================================
// YELLOW CARD SYSTEM
// ============================================================
function triggerYellowCard(isAwayFoul) {
  const team = isAwayFoul ? 'away' : 'home';
  yellowCards[team]++;
  const count = yellowCards[team];
  const teamName = isAwayFoul ? TEAMS.away.name : TEAMS.home.name;

  updateCardHUD();

  document.getElementById('yc-team-text').textContent  = `${teamName.toUpperCase()} FOUL`;
  document.getElementById('yc-count-text').textContent = count % 2 === 0
    ? 'PENALTY AWARDED!'
    : `CARD ${count} — 1 MORE = PENALTY`;

  const ov = document.getElementById('yellow-card-overlay');
  ov.classList.add('active');

  if (count % 2 === 0) {
    // Every 2 cards → opponent gets a penalty
    setTimeout(() => {
      ov.classList.remove('active');
      setupPenalty(isAwayFoul); // isAwayFoul = true → home team attacks
    }, 2000);
  } else {
    setTimeout(() => ov.classList.remove('active'), 2400);
  }
}

function updateCardHUD() {
  ['home', 'away'].forEach(side => {
    const row = document.getElementById(`card-row-${side}`);
    if (!row) return;
    row.innerHTML = '';
    for (let i = 0; i < yellowCards[side]; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'width:7px;height:11px;background:#ffe600;border-radius:1px;display:inline-block;box-shadow:0 1px 4px rgba(255,200,0,0.6)';
      row.appendChild(d);
    }
  });
}

// ============================================================
// PENALTY KICK SYSTEM
// ============================================================
function setupPenalty(homeAttacks) {
  const homeGK = homePlayers.find(p => p.userData.isGK);
  const awayGK = awayPlayers.find(p => p.userData.isGK);
  if (!homeGK || !awayGK) return;

  throwInState = null;
  cancelCharge();

  const hl       = PITCH_CONFIG.hl * PITCH_CONFIG.scale;
  const homeGoalZ = Math.sign(homeGK.position.z) * hl;
  const awayGoalZ = Math.sign(awayGK.position.z) * hl;

  // Clear possession / velocity for all
  [...homePlayers, ...awayPlayers].forEach(p => { p.userData.hasBall = false; });
  ball.userData.vel.set(0, 0, 0);

  if (homeAttacks) {
    // ── HOME ATTACKS (against away goal) ────────────────────
    const penZ = awayGoalZ - Math.sign(awayGoalZ) * 11;
    ball.position.set(PITCH_CONFIG.positionX, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, penZ);

    awayGK.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, awayGoalZ - Math.sign(awayGoalZ) * 0.6);
    awayGK.rotation.y = awayGoalZ > 0 ? Math.PI : 0;

    const attacker = (controlled && !controlled.userData.isGK) ? controlled
      : (homePlayers.find(p => !p.userData.isGK) || homePlayers[0]);
    attacker.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, penZ - Math.sign(awayGoalZ) * 1.2);
    attacker.rotation.y = awayGoalZ > 0 ? 0 : Math.PI;
    setControlled(attacker);

    penaltyState = {
      type: 'attack', phase: 'intro', introTimer: 0,
      gk: awayGK, shooter: attacker,
      sliderPos: 0.5, sliderDir: 1,
      shotTarget: null, shotTimer: 0, accuracy: 0,
      awayGoalZ, resultTimer: 0,
    };
    document.getElementById('penalty-sub-text').textContent  = 'YOU ATTACK!';
    document.getElementById('penalty-hint-text').textContent = 'Position the slider · SPACE to shoot';

  } else {
    // ── AWAY ATTACKS (against home goal — you defend as GK) ──
    const penZ = homeGoalZ - Math.sign(homeGoalZ) * 11;
    ball.position.set(PITCH_CONFIG.positionX, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, penZ);

    homeGK.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, homeGoalZ + Math.sign(homeGoalZ) * -0.6);
    homeGK.rotation.y = homeGoalZ < 0 ? 0 : Math.PI;
    setControlled(homeGK);

    const shooterPool = awayPlayers.filter(p => !p.userData.isGK);
    const shooter = shooterPool[Math.floor(Math.random() * shooterPool.length)];
    shooter.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, penZ - Math.sign(homeGoalZ) * -1.2);
    shooter.rotation.y = homeGoalZ < 0 ? Math.PI : 0;

    penaltyState = {
      type: 'defend', phase: 'intro', introTimer: 0,
      gk: homeGK, shooter,
      shotTarget: null, shotTimer: 0,
      homeGoalZ, resultTimer: 0,
    };
    document.getElementById('penalty-sub-text').textContent  = 'DEFEND YOUR GOAL!';
    document.getElementById('penalty-hint-text').textContent = 'A/D to move GK · SPACE = they shoot';
  }

  setGameState('penalty');
  document.getElementById('penalty-overlay').classList.add('active');
}

function updatePenaltyKick(dt) {
  if (!penaltyState) return;

  // Always run ball physics (respects the checkBallBounds guard)
  updateBall(dt);

  // ── INTRO PHASE ──────────────────────────────────────────
  if (penaltyState.phase === 'intro') {
    penaltyState.introTimer += dt;
    if (penaltyState.introTimer > 2.5) {
      penaltyState.phase = 'active';
      document.getElementById('penalty-overlay').classList.remove('active');
      if (penaltyState.type === 'defend') {
        document.getElementById('penalty-hud').classList.add('active');
      } else {
        document.getElementById('accuracy-slider-wrap').classList.add('active');
      }
    }
    return;
  }

  // ── ACTIVE PHASE ─────────────────────────────────────────
  if (penaltyState.phase === 'active') {
    if (penaltyState.type === 'attack') {
      // Oscillate slider
      penaltyState.sliderPos += dt * 1.5 * penaltyState.sliderDir;
      if (penaltyState.sliderPos >= 1) { penaltyState.sliderPos = 1; penaltyState.sliderDir = -1; }
      if (penaltyState.sliderPos <= 0) { penaltyState.sliderPos = 0; penaltyState.sliderDir =  1; }
      const ind = document.getElementById('acc-indicator');
      if (ind) ind.style.left = (penaltyState.sliderPos * 100) + '%';
    } else {
      // GK moves left/right with A/D (clamped to goalpost width)
      const gk    = penaltyState.gk;
      const moveX = (keys['KeyA'] ? -1 : 0) + (keys['KeyD'] ? 1 : 0);
      if (moveX !== 0) {
        gk.position.x += moveX * PLAYER_CONFIG.runSpeed * 1.15 * dt;
        gk.position.x  = Math.max(-PITCH_CONFIG.goalWidth / 2 + 0.3,
                           Math.min( PITCH_CONFIG.goalWidth / 2 - 0.3, gk.position.x));
        gk.rotation.y  = moveX > 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      }
    }
    return;
  }

  // ── SHOT PHASE ───────────────────────────────────────────
  if (penaltyState.phase === 'shot') {
    penaltyState.shotTimer += dt;
    if (penaltyState.shotTimer > 2.2) evaluatePenaltyResult();
    return;
  }

  // ── RESULT PHASE ─────────────────────────────────────────
  if (penaltyState.phase === 'result') {
    penaltyState.resultTimer += dt;
    if (penaltyState.resultTimer > 3.2) endPenalty();
  }
}

function firePenaltyShot() {
  if (!penaltyState || penaltyState.phase !== 'active') return;
  penaltyState.phase    = 'shot';
  penaltyState.shotTimer = 0;

  if (penaltyState.type === 'attack') {
    document.getElementById('accuracy-slider-wrap').classList.remove('active');

    // Slider 0 = far-left, 0.5 = centre, 1 = far-right
    const s     = penaltyState.sliderPos;
    const aimX  = (s - 0.5) * PITCH_CONFIG.goalWidth * 0.82;
    const aimY  = 0.45 + Math.random() * PITCH_CONFIG.goalHeight * 0.65;
    const goalZ = penaltyState.awayGoalZ;

    // Accuracy peaks at the sweet-spot corner zones (~0.2 and ~0.8)
    const distFromSweetSpot = Math.min(Math.abs(s - 0.2), Math.abs(s - 0.8));
    const accuracy = 1 - Math.min(1, distFromSweetSpot * 4.5);
    penaltyState.accuracy = accuracy;

    const err = (1 - accuracy) * 1.8;
    const target = new THREE.Vector3(
      aimX + (Math.random() - 0.5) * err,
      aimY,
      goalZ
    );
    const dir = new THREE.Vector3().subVectors(target, ball.position).normalize();
    ball.userData.vel.copy(dir.multiplyScalar(PLAYER_CONFIG.kickPower * 1.25));
    ball.userData.lastBy = penaltyState.shooter;
    penaltyState.shotTarget = target;

    // Away GK dives — harder to save the better the aim
    const gk = penaltyState.gk;
    const gkGuessRight = Math.random() < (0.55 - accuracy * 0.38);
    gk.position.x = gkGuessRight ? aimX * 0.8 : -aimX * 0.7;

  } else {
    document.getElementById('penalty-hud').classList.remove('active');

    // Away player picks a corner at random
    const corners = [
      { x: -PITCH_CONFIG.goalWidth * 0.36, y: 0.5  },
      { x:  PITCH_CONFIG.goalWidth * 0.36, y: 0.5  },
      { x: -PITCH_CONFIG.goalWidth * 0.26, y: PITCH_CONFIG.goalHeight * 0.68 },
      { x:  PITCH_CONFIG.goalWidth * 0.26, y: PITCH_CONFIG.goalHeight * 0.68 },
    ];
    const c = corners[Math.floor(Math.random() * corners.length)];
    const target = new THREE.Vector3(PITCH_CONFIG.positionX + c.x, PITCH_CONFIG.positionY + c.y, penaltyState.homeGoalZ);
    const dir = new THREE.Vector3().subVectors(target, ball.position).normalize();
    ball.userData.vel.copy(dir.multiplyScalar(PLAYER_CONFIG.kickPower * 1.15));
    ball.userData.lastBy = penaltyState.shooter;
    penaltyState.shotTarget = target;
  }
}

function evaluatePenaltyResult() {
  if (!penaltyState || penaltyState.phase === 'result') return;
  penaltyState.phase       = 'result';
  penaltyState.resultTimer = 0;

  const rt  = document.getElementById('penalty-result-text');
  const rs  = document.getElementById('penalty-result-sub');
  const ov  = document.getElementById('penalty-result-overlay');
  let isGoal = false;

  if (penaltyState.type === 'attack') {
    const gk   = penaltyState.gk;
    const tgt  = penaltyState.shotTarget;
    if (!tgt) { endPenalty(); return; }
    const saveR = 1.7 + (1 - (penaltyState.accuracy || 0)) * 1.5;
    isGoal = Math.abs(gk.position.x - tgt.x) > saveR;
    if (isGoal) {
      homeScore++;
      document.getElementById('home-score').textContent = homeScore;
      rt.textContent = 'PENALTY GOAL!'; rt.style.color = '#44ee44';
      if (rs) rs.textContent = `${TEAMS.home.name.toUpperCase()} SCORE`;
    } else {
      rt.textContent = 'SAVED!'; rt.style.color = '#ff4444';
      if (rs) rs.textContent = `${TEAMS.away.name.toUpperCase()} GOALKEEPER`;
    }
  } else {
    const gk  = penaltyState.gk;
    const tgt = penaltyState.shotTarget;
    if (!tgt) { endPenalty(); return; }
    const saveR = 1.55;
    isGoal = Math.abs(gk.position.x - tgt.x) > saveR;
    if (isGoal) {
      awayScore++;
      document.getElementById('away-score').textContent = awayScore;
      rt.textContent = 'GOAL!'; rt.style.color = '#ff4444';
      if (rs) rs.textContent = `${TEAMS.away.name.toUpperCase()} SCORE`;
    } else {
      rt.textContent = 'GREAT SAVE!'; rt.style.color = '#44ee44';
      if (rs) rs.textContent = 'PENALTY STOPPED!';
    }
  }
  ov.classList.add('active');
}

function endPenalty() {
  document.getElementById('penalty-overlay').classList.remove('active');
  document.getElementById('penalty-hud').classList.remove('active');
  document.getElementById('accuracy-slider-wrap').classList.remove('active');
  document.getElementById('penalty-result-overlay').classList.remove('active');
  penaltyState  = null;
  pendingPenalty = null;
  resetKickoff(true);
  setGameState('playing');
}

function doHalftime() {
  isFirstHalf = false;
  setGameState('halftime');
  showMsg('HALF TIME');
  setTimeout(() => { switchSides(); setGameState('playing'); }, 4500);
}

function doFulltime() {
  setGameState('fulltime');
  document.getElementById('ft-score').textContent = `${homeScore} — ${awayScore}`;
  document.getElementById('ft-teams').textContent = `${TEAMS.home.name} VS ${TEAMS.away.name}`.toUpperCase();
  const res = homeScore > awayScore ? `${TEAMS.home.name.toUpperCase()} WIN`
    : awayScore > homeScore ? `${TEAMS.away.name.toUpperCase()} WIN` : 'DRAW';
  document.getElementById('ft-result').textContent = res;
  document.getElementById('fulltime-screen').classList.add('active');
}

function switchSides() {
  [...homePlayers, ...awayPlayers].forEach(p => {
    p.position.z *= -1;
    p.rotation.y += Math.PI;
    p.userData.home.z *= -1;
  });
}

function resetKickoff(homeKicksOff) {
  ball.position.set(PITCH_CONFIG.positionX, GAME_CFG.ballRadius + PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ);
  ball.userData.vel.set(0, 0, 0);
  [...homePlayers, ...awayPlayers].forEach(p => {
    p.userData.hasBall = false;
    const h = p.userData.home;
    p.position.set(PITCH_CONFIG.positionX + h.x * PITCH_CONFIG.scale, PITCH_CONFIG.positionY + (PLAYER_CONFIG.useCustomModel ? PLAYER_CONFIG.yOffset : 0), PITCH_CONFIG.positionZ + h.z * PITCH_CONFIG.scale);
  });
  const ko = homeKicksOff ? homePlayers[9] : awayPlayers[9];
  ko.userData.hasBall = true;
  if (homeKicksOff) setControlled(ko);
}

// ============================================================
// RADAR
// ============================================================
function updateRadar() {
  const canvas = document.getElementById('radar-canvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sx = W / (PITCH_CONFIG.length * PITCH_CONFIG.scale);
  const sz = H / (PITCH_CONFIG.width * PITCH_CONFIG.scale);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#1a5c1a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  ctx.beginPath(); ctx.moveTo(W / 2, 3); ctx.lineTo(W / 2, H - 3); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 8, 0, Math.PI * 2); ctx.stroke();

  const wp = pos => ({ x: W / 2 + (pos.x - PITCH_CONFIG.positionX) * sx, y: H / 2 + (pos.z - PITCH_CONFIG.positionZ) * sz });
  homePlayers.forEach(p => {
    const { x, y } = wp(p.position);
    ctx.fillStyle = p === controlled ? '#00d4ff' : '#fff';
    ctx.beginPath(); ctx.arc(x, y, p === controlled ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
  });
  awayPlayers.forEach(p => {
    const { x, y } = wp(p.position);
    ctx.fillStyle = '#ff4444';
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  });
  const bp = wp(ball.position);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#333'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(bp.x, bp.y, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// ============================================================
// GAME STATE
// ============================================================
let gameState = 'loading';

function setGameState(s) {
  gameState = s;
  const hud = document.getElementById('hud');
  hud.classList.toggle('active', ['playing', 'goal', 'slo_mo', 'penalty'].includes(s));
  document.getElementById('main-menu').classList.toggle('active', s === 'menu');
  document.getElementById('pause-menu').classList.toggle('active', s === 'paused');
  if (s !== 'fulltime') document.getElementById('fulltime-screen').classList.remove('active');
  const ap = document.getElementById('adjust-panel');
  if (s !== 'playing' && s !== 'paused') ap.classList.remove('active');

  // Mobile control layer swapping (normal pitch controls vs penalty shootout HUD)
  const isPen = s === 'penalty';
  const joy = document.getElementById('joystick-container');
  const act = document.getElementById('mobile-action-pad');
  const pen = document.getElementById('mobile-penalty-pad');
  if (joy) joy.style.display = isPen ? 'none' : 'flex';
  if (act) act.style.display = isPen ? 'none' : 'block';
  if (pen) pen.style.display = isPen ? 'flex' : 'none';
}

// ============================================================
// MSG BANNER
// ============================================================
let msgTimer = null;
function showMsg(txt) {
  const el = document.getElementById('msg-banner');
  el.textContent = txt;
  el.classList.add('show');
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// ============================================================
// CUSTOM STADIUM LOADER
// ============================================================
async function loadCustomStadium() {
  if (!STADIUM_CONFIG.useCustomStadium) return;
  return new Promise(resolve => {
    new GLTFLoader().load(
      STADIUM_CONFIG.path,
      gltf => {
        if (customStadium) scene.remove(customStadium);
        customStadium = gltf.scene;
        customStadium.scale.setScalar(STADIUM_CONFIG.scale);
        customStadium.position.set(STADIUM_CONFIG.positionX, STADIUM_CONFIG.positionY, STADIUM_CONFIG.positionZ);
        customStadium.rotation.y = STADIUM_CONFIG.rotationY * Math.PI / 180;
        customStadium.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
        scene.add(customStadium);
        console.log('✅ Stadium loaded');
        resolve(customStadium);
      },
      null,
      () => { console.warn('⚠ Stadium GLB not found. Put stadium.glb in /public/'); resolve(null); }
    );
  });
}

// ============================================================
// ADJUSTMENT PANEL SLIDERS
// ============================================================
function bindSlider(id, valId, configObj, key, fmt = v => v, suffix = '') {
  const sl = document.getElementById(id);
  const vl = document.getElementById(valId);
  if (!sl) return;
  sl.value = configObj[key];
  if (vl) vl.textContent = fmt(configObj[key]) + suffix;
  sl.addEventListener('input', () => {
    const v = parseFloat(sl.value);
    configObj[key] = v;
    if (vl) vl.textContent = fmt(v) + suffix;
  });
}

function setupAdjustPanel() {
  bindSlider('sl-pitch-x', 'vl-pitch-x', PITCH_CONFIG, 'positionX', v => v.toFixed(1));
  bindSlider('sl-pitch-y', 'vl-pitch-y', PITCH_CONFIG, 'positionY', v => v.toFixed(2));
  bindSlider('sl-pitch-z', 'vl-pitch-z', PITCH_CONFIG, 'positionZ', v => v.toFixed(1));
  bindSlider('sl-pitch-rot', 'vl-pitch-rot', PITCH_CONFIG, 'rotationY', v => v.toFixed(0), '°');
  bindSlider('sl-pitch-scale', 'vl-pitch-scale', PITCH_CONFIG, 'scale', v => v.toFixed(2));

  bindSlider('sl-sta-y', 'vl-sta-y', STADIUM_CONFIG, 'positionY', v => v.toFixed(1));
  bindSlider('sl-sta-scale', 'vl-sta-scale', STADIUM_CONFIG, 'scale', v => v.toFixed(3));
  bindSlider('sl-sta-rot', 'vl-sta-rot', STADIUM_CONFIG, 'rotationY', v => v.toFixed(0), '°');

  bindSlider('sl-plr-scale', 'vl-plr-scale', PLAYER_CONFIG, 'scale', v => v.toFixed(3));
  bindSlider('sl-plr-rot', 'vl-plr-rot', PLAYER_CONFIG, 'rotationY', v => v.toFixed(0), '°');
  bindSlider('sl-plr-y', 'vl-plr-y', PLAYER_CONFIG, 'yOffset', v => v.toFixed(2));

  bindSlider('sl-goal-y', 'vl-goal-y', GOAL_CONFIG, 'yOffset', v => v.toFixed(2));

  const cbStadium = document.getElementById('cb-stadium');
  const vlStadium = document.getElementById('vl-stadium');
  cbStadium.checked = STADIUM_CONFIG.useCustomStadium;
  cbStadium.disabled = false;
  if (vlStadium) vlStadium.textContent = STADIUM_CONFIG.useCustomStadium ? 'ON' : 'OFF';
  cbStadium.addEventListener('change', () => {
    STADIUM_CONFIG.useCustomStadium = cbStadium.checked;
    if (vlStadium) vlStadium.textContent = cbStadium.checked ? 'ON' : 'OFF';
  });

  const cbPlayer = document.getElementById('cb-player');
  const vlPlayer = document.getElementById('vl-player');
  cbPlayer.checked = PLAYER_CONFIG.useCustomModel;
  if (vlPlayer) vlPlayer.textContent = PLAYER_CONFIG.useCustomModel ? 'ON' : 'OFF';
  cbPlayer.addEventListener('change', () => {
    PLAYER_CONFIG.useCustomModel = cbPlayer.checked;
    if (vlPlayer) vlPlayer.textContent = cbPlayer.checked ? 'ON' : 'OFF';
  });

  const cbHide = document.getElementById('cb-hide-pitch');
  cbHide.addEventListener('change', () => {
    STADIUM_CONFIG.hideGeneratedPitch = cbHide.checked;
  });

  document.getElementById('btn-apply').addEventListener('click', async () => {
    // Rebuild scene with new settings
    if (STADIUM_CONFIG.useCustomStadium) await loadCustomStadium();
    else if (customStadium) { scene.remove(customStadium); customStadium = null; }
    buildPitch();
    buildGoals();
    buildPitchLines();
    if (pitchMesh) {
      pitchMesh.position.set(PITCH_CONFIG.positionX, PITCH_CONFIG.positionY, PITCH_CONFIG.positionZ);
      pitchMesh.rotation.z = PITCH_CONFIG.rotationY * Math.PI / 180;
    }
    if (customStadium) {
      customStadium.position.set(STADIUM_CONFIG.positionX, STADIUM_CONFIG.positionY, STADIUM_CONFIG.positionZ);
      customStadium.scale.setScalar(STADIUM_CONFIG.scale);
      customStadium.rotation.y = STADIUM_CONFIG.rotationY * Math.PI / 180;
    }
    // Rebuild players if model toggle changed
    await setupTeams();
    resetKickoff(true);
    showMsg('APPLIED!');
  });

  document.getElementById('btn-close-panel').addEventListener('click', () => {
    document.getElementById('adjust-panel').classList.remove('active');
  });
}

// ============================================================
// UI BUTTON BINDINGS
// ============================================================
function setupUI() {
  document.getElementById('btn-quickmatch').onclick = async () => {
    applyTeamSelection();
    await startMatch();
  };
  document.getElementById('btn-adjustfield').onclick = () => {
    document.getElementById('adjust-panel').classList.toggle('active');
  };
  document.getElementById('btn-resume').onclick = () => setGameState('playing');
  document.getElementById('btn-restart').onclick = async () => {
    applyTeamSelection();
    await startMatch();
  };
  document.getElementById('btn-quit').onclick = () => { setGameState('menu'); document.getElementById('fulltime-screen').classList.remove('active'); };
  document.getElementById('btn-playagain').onclick = async () => {
    applyTeamSelection();
    await startMatch();
  };

  // ── Team Selection Dropdowns ──────────────────────────────
  const selHome = document.getElementById('select-home-team');
  const selAway = document.getElementById('select-away-team');
  if (selHome) selHome.addEventListener('change', () => { applyTeamSelection(); });
  if (selAway) selAway.addEventListener('change', () => { applyTeamSelection(); });

  // ── Weather Selectors ───────────────────────────────────────
  const btnSnowToggle = document.getElementById('btn-snow-toggle');
  const btnRainToggle = document.getElementById('btn-rain-toggle');

  if (btnSnowToggle) {
    btnSnowToggle.onclick = () => {
      snowActive = !snowActive;
      if (snowActive) rainActive = false; // Mutually exclusive
      updateWeatherEffects();
    };
  }

  if (btnRainToggle) {
    btnRainToggle.onclick = () => {
      rainActive = !rainActive;
      if (rainActive) snowActive = false; // Mutually exclusive
      updateWeatherEffects();
    };
  }

  // ── Season Mode & Leaderboard Buttons ──────────────────────
  const btnSeason = document.getElementById('btn-season-mode');
  if (btnSeason) {
    btnSeason.onclick = () => { showMsg('SEASON MODE COMING SOON!'); };
  }
  const btnLeaderboard = document.getElementById('btn-leaderboard');
  if (btnLeaderboard) {
    btnLeaderboard.onclick = () => { showMsg('LEADERBOARD COMING SOON!'); };
  }

  // Set initial button active state & sky color
  updateWeatherEffects();
  
  // Render initial setup badge circles immediately
  applyTeamSelection();

  // Initialize responsive touch controls if mobile/touch device detected
  initMobileControls();
}

// ============================================================
// MOBILE TOUCH SCREEN VIRTUAL CONTROLLER ENGINE
// ============================================================
function initMobileControls() {
  const overlay = document.getElementById('mobile-hud-overlay');
  if (!overlay) return;

  // Force active state display or styling based on detection
  if (isMobile) {
    overlay.style.display = 'block';
    console.log('📱 Touch screen detected: Virtual gamepad initialized.');
  }

  // ── Top Bar Controls ──────────────────────────────────────
  const mPause = document.getElementById('mbtn-pause');
  const mFps = document.getElementById('mbtn-fps');

  if (mPause) {
    mPause.addEventListener('touchstart', e => {
      e.preventDefault();
      if (gameState === 'playing') setGameState('paused');
      else if (gameState === 'paused') setGameState('playing');
    }, { passive: false });
  }

  if (mFps) {
    mFps.addEventListener('touchstart', e => {
      e.preventDefault();
      toggleFPS();
    }, { passive: false });
  }

  // ── Virtual Touch Joystick (Movement) ─────────────────────
  const joyContainer = document.getElementById('joystick-container');
  const joyBase = document.getElementById('joystick-base');
  const joyKnob = document.getElementById('joystick-knob');

  if (joyContainer && joyBase && joyKnob) {
    const handleJoystickStart = e => {
      e.preventDefault();
      const touch = e.changedTouches[0];
      joystickTouchId = touch.identifier;

      const baseRect = joyBase.getBoundingClientRect();
      joystickStartPos.x = baseRect.left + baseRect.width / 2;
      joystickStartPos.y = baseRect.top + baseRect.height / 2;
    };

    const handleJoystickMove = e => {
      if (joystickTouchId === null) return;

      // Find the touch point matching our joystick tracking identifier
      let activeTouch = null;
      for (let i = 0; i < e.touches.length; i++) {
        if (e.touches[i].identifier === joystickTouchId) {
          activeTouch = e.touches[i];
          break;
        }
      }

      if (!activeTouch) return;
      e.preventDefault();

      let dx = activeTouch.clientX - joystickStartPos.x;
      let dy = activeTouch.clientY - joystickStartPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxLen = 45; // Maximum radial offset for joystick knob clamping (px)

      // Clamp knob offset to joystick base boundary circle
      if (dist > maxLen) {
        dx = (dx / dist) * maxLen;
        dy = (dy / dist) * maxLen;
      }

      // Visual offset transition
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;

      // Map offset coordinates to W, A, S, D key emulation variables
      const nx = dx / maxLen;
      const ny = dy / maxLen;
      const deadzone = 0.20; // 20% inner deadzone boundary

      keys['KeyW'] = ny < -deadzone;
      keys['KeyS'] = ny > deadzone;
      keys['KeyD'] = nx > deadzone;
      keys['KeyA'] = nx < -deadzone;
    };

    const handleJoystickEnd = e => {
      if (joystickTouchId === null) return;

      // Check if the tracking touch point has lifted/ended
      let touchEnded = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
          touchEnded = true;
          break;
        }
      }

      if (touchEnded) {
        e.preventDefault();
        joystickTouchId = null;
        joyKnob.style.transform = 'translate(0px, 0px)';

        // Clear active direction virtual keycodes instantly
        keys['KeyW'] = false;
        keys['KeyS'] = false;
        keys['KeyA'] = false;
        keys['KeyD'] = false;
      }
    };

    joyContainer.addEventListener('touchstart', handleJoystickStart, { passive: false });
    window.addEventListener('touchmove', handleJoystickMove, { passive: false });
    window.addEventListener('touchend', handleJoystickEnd, { passive: false });
    window.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
  }

  // ── Tactical Action Buttons ────────────────────────────────
  const mSprint = document.getElementById('mbtn-sprint');
  const mPass = document.getElementById('mbtn-pass');
  const mShoot = document.getElementById('mbtn-shoot');
  const mSwitch = document.getElementById('mbtn-switch');
  const mLob = document.getElementById('mbtn-lob');

  // 1. Sprint Control (Hold to trigger, release to stop)
  if (mSprint) {
    mSprint.addEventListener('touchstart', e => {
      e.preventDefault();
      mSprint.classList.add('pressed');
      keys['ShiftLeft'] = true;
      keys['ShiftRight'] = true;
    }, { passive: false });

    mSprint.addEventListener('touchend', e => {
      e.preventDefault();
      mSprint.classList.remove('pressed');
      keys['ShiftLeft'] = false;
      keys['ShiftRight'] = false;
    }, { passive: false });

    mSprint.addEventListener('touchcancel', e => {
      e.preventDefault();
      mSprint.classList.remove('pressed');
      keys['ShiftLeft'] = false;
      keys['ShiftRight'] = false;
    }, { passive: false });
  }

  // 2. Dynamic Pass Control (Charge-to-kick meter support!)
  if (mPass) {
    mPass.addEventListener('touchstart', e => {
      e.preventDefault();
      mPass.classList.add('pressed');

      if (gameState !== 'playing' || throwInState) return;
      if (!hasBall()) {
        switchPlayer();
        return;
      }

      // Kick off charge power bar meter
      if (!chargeState) {
        chargeState = { type: 'pass', startTime: performance.now() };
        const label = document.getElementById('power-bar-label');
        const wrap = document.getElementById('power-bar-wrap');
        if (label) label.textContent = 'PASS POWER';
        if (wrap) wrap.style.display = 'block';
      }
    }, { passive: false });

    mPass.addEventListener('touchend', e => {
      e.preventDefault();
      mPass.classList.remove('pressed');

      if (chargeState && chargeState.type === 'pass') {
        const elapsed = (performance.now() - chargeState.startTime) / 1000;
        const power = Math.min(1.0, elapsed / MAX_CHARGE);
        cancelCharge();
        doPass(power);
      }
    }, { passive: false });

    mPass.addEventListener('touchcancel', e => {
      e.preventDefault();
      mPass.classList.remove('pressed');
      cancelCharge();
    }, { passive: false });
  }

  // 3. Dynamic Shot / Tackle Control (Charge-to-shoot support!)
  if (mShoot) {
    mShoot.addEventListener('touchstart', e => {
      e.preventDefault();
      mShoot.classList.add('pressed');

      if (gameState !== 'playing' || throwInState) return;
      if (hasBall()) {
        if (!chargeState) {
          chargeState = { type: 'shoot', startTime: performance.now() };
          const label = document.getElementById('power-bar-label');
          const wrap = document.getElementById('power-bar-wrap');
          if (label) label.textContent = 'SHOT POWER';
          if (wrap) wrap.style.display = 'block';
        }
      } else {
        doTackle();
      }
    }, { passive: false });

    mShoot.addEventListener('touchend', e => {
      e.preventDefault();
      mShoot.classList.remove('pressed');

      if (chargeState && chargeState.type === 'shoot') {
        const elapsed = (performance.now() - chargeState.startTime) / 1000;
        const power = Math.min(1.0, elapsed / MAX_CHARGE);
        cancelCharge();
        doShoot(power);
      }
    }, { passive: false });

    mShoot.addEventListener('touchcancel', e => {
      e.preventDefault();
      mShoot.classList.remove('pressed');
      cancelCharge();
    }, { passive: false });
  }

  // 4. Switch Player (Tap trigger)
  if (mSwitch) {
    mSwitch.addEventListener('touchstart', e => {
      e.preventDefault();
      mSwitch.classList.add('pressed');
      switchPlayer();
    }, { passive: false });

    mSwitch.addEventListener('touchend', e => {
      e.preventDefault();
      mSwitch.classList.remove('pressed');
    }, { passive: false });
  }

  // 5. Lob Shot (Tap trigger)
  if (mLob) {
    mLob.addEventListener('touchstart', e => {
      e.preventDefault();
      mLob.classList.add('pressed');
      if (hasBall()) doLobShot();
    }, { passive: false });

    mLob.addEventListener('touchend', e => {
      e.preventDefault();
      mLob.classList.remove('pressed');
    }, { passive: false });
  }

  // ── Mobile Penalty Shootout Controls ────────────────────────
  const mPenLeft = document.getElementById('mbtn-pen-left');
  const mPenRight = document.getElementById('mbtn-pen-right');
  const mPenShoot = document.getElementById('mbtn-pen-shoot');

  if (mPenLeft) {
    mPenLeft.addEventListener('touchstart', e => {
      e.preventDefault();
      mPenLeft.classList.add('pressed');
      keys['KeyA'] = true;
    }, { passive: false });

    mPenLeft.addEventListener('touchend', e => {
      e.preventDefault();
      mPenLeft.classList.remove('pressed');
      keys['KeyA'] = false;
    }, { passive: false });

    mPenLeft.addEventListener('touchcancel', e => {
      e.preventDefault();
      mPenLeft.classList.remove('pressed');
      keys['KeyA'] = false;
    }, { passive: false });
  }

  if (mPenRight) {
    mPenRight.addEventListener('touchstart', e => {
      e.preventDefault();
      mPenRight.classList.add('pressed');
      keys['KeyD'] = true;
    }, { passive: false });

    mPenRight.addEventListener('touchend', e => {
      e.preventDefault();
      mPenRight.classList.remove('pressed');
      keys['KeyD'] = false;
    }, { passive: false });

    mPenRight.addEventListener('touchcancel', e => {
      e.preventDefault();
      mPenRight.classList.remove('pressed');
      keys['KeyD'] = false;
    }, { passive: false });
  }

  if (mPenShoot) {
    mPenShoot.addEventListener('touchstart', e => {
      e.preventDefault();
      mPenShoot.classList.add('pressed');
      if (gameState === 'penalty' && penaltyState?.phase === 'active') {
        firePenaltyShot();
      }
    }, { passive: false });

    mPenShoot.addEventListener('touchend', e => {
      e.preventDefault();
      mPenShoot.classList.remove('pressed');
    }, { passive: false });
  }
}


function applyTeamSelection() {
  const selHome = document.getElementById('select-home-team');
  const selAway = document.getElementById('select-away-team');
  if (!selHome || !selAway) return;

  const homeKey = selHome.value;
  const awayKey = selAway.value;

  const homeData = ALL_TEAMS_DATA[homeKey];
  const awayData = ALL_TEAMS_DATA[awayKey];

  if (homeData && awayData) {
    TEAMS.home.name = homeData.name;
    TEAMS.home.short = homeData.short;
    TEAMS.home.color = homeData.color;
    TEAMS.home.altColor = homeData.altColor;
    TEAMS.home.gkColor = homeData.gkColor;

    TEAMS.away.name = awayData.name;
    TEAMS.away.short = awayData.short;
    TEAMS.away.color = awayData.color;
    TEAMS.away.altColor = awayData.altColor;
    TEAMS.away.gkColor = awayData.gkColor;

    HOME_NAMES = [...homeData.players];
    AWAY_NAMES = [...awayData.players];

    // Rebuild circular badges on the Match Setup Card dynamically!
    const setupHomeBadge = document.getElementById('setup-home-badge');
    const setupAwayBadge = document.getElementById('setup-away-badge');
    const setupHomeName  = document.getElementById('setup-home-name');
    const setupAwayName  = document.getElementById('setup-away-name');

    if (setupHomeBadge) {
      setupHomeBadge.style.background = homeData.badgeBg;
      setupHomeBadge.style.color = homeData.badgeCharColor;
      setupHomeBadge.textContent = homeData.badgeChar;
    }
    if (setupAwayBadge) {
      setupAwayBadge.style.background = awayData.badgeBg;
      setupAwayBadge.style.color = awayData.badgeCharColor;
      setupAwayBadge.textContent = awayData.badgeChar;
    }
    if (setupHomeName) setupHomeName.textContent = homeData.name;
    if (setupAwayName) setupAwayName.textContent = awayData.name;
  }
}

async function startMatch() {
  await setupTeams(); // Rebuild custom glb kit colors and names procedurally!
  
  homeScore = 0; awayScore = 0; matchTime = 0; isFirstHalf = true;
  yellowCards  = { home: 0, away: 0 };
  slowMoState  = null;
  throwInState = null;
  penaltyState = null;
  pendingPenalty = null;
  updateCardHUD();
  // Clean up any open overlays
  ['replay-overlay','yellow-card-overlay','penalty-overlay','penalty-hud',
   'accuracy-slider-wrap','penalty-result-overlay'].forEach(id => {
    document.getElementById(id)?.classList.remove('active');
  });
  document.getElementById('home-score').textContent = '0';
  document.getElementById('away-score').textContent = '0';
  document.getElementById('home-name').textContent = TEAMS.home.name.toUpperCase();
  document.getElementById('away-name').textContent = TEAMS.away.name.toUpperCase();
  document.getElementById('home-badge').textContent = TEAMS.home.short;
  document.getElementById('away-badge').textContent = TEAMS.away.short;
  document.querySelector('.sb-team.home').style.background = TEAMS.home.color;
  document.querySelector('.sb-team.away').style.background = TEAMS.away.color;
  document.getElementById('ft-teams').textContent = `${TEAMS.home.name} VS ${TEAMS.away.name}`.toUpperCase();
  resetKickoff(true);
  setGameState('playing');
  showMsg('KICK OFF!');
}

// ============================================================
// LOADING PROGRESS
// ============================================================
function setProgress(pct, label) {
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = label;
}

// ============================================================
// GAME LOOP
// ============================================================
let lastTime = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const rawDt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  // Advance AnimationMixer for every player that has one (custom model animations).
  const _mixerDt = gameState === 'slo_mo' ? rawDt * SLOW_MO_SPEED : rawDt;
  [...homePlayers, ...awayPlayers].forEach(p => { if (p.userData.mixer) p.userData.mixer.update(_mixerDt); });

  updateSnow(rawDt);
  updateRain(rawDt);
  updateParticles(rawDt);

  if (gameState === 'playing' || gameState === 'slo_mo') {
    // Slow-motion multiplier during goal replay
    const dt = gameState === 'slo_mo' ? rawDt * SLOW_MO_SPEED : rawDt;

    if (gameState !== 'slo_mo') updateControlled(dt);

    if (throwInState) {
      updateThrowInAnim(dt);
    } else {
      updateBall(dt);
      emitBallTrail(dt);
      checkBallPickup();
    }

    updateAI(dt);
    if (gameState === 'playing') updateMatchTime(rawDt);
    updateCamera(dt);
    updateRadar();
    updateIndicators(dt);

    if (chargeState) {
      const elapsed = (performance.now() - chargeState.startTime) / 1000;
      document.getElementById('power-fill').style.width = Math.min(100, (elapsed / MAX_CHARGE) * 100) + '%';
    } else {
      const pbw = document.getElementById('power-bar-wrap');
      if (pbw && pbw.style.display !== 'none') pbw.style.display = 'none';
    }

    // Advance slow-mo timer and transition to goal overlay when done
    if (gameState === 'slo_mo' && slowMoState) {
      slowMoState.realTimer += rawDt;
      if (slowMoState.realTimer >= slowMoState.duration) {
        document.getElementById('replay-overlay')?.classList.remove('active');
        const scHome = slowMoState.scoringHome;
        slowMoState = null;
        _syncCamToIdeal(); // orbit cam ended — snap to broadcast so goal state doesn't glitch
        showGoalResults(scHome);
      }
    }

  } else if (gameState === 'penalty') {
    updatePenaltyKick(rawDt);
    updateCamera(rawDt);
    updateRadar();

  } else {
    // Keep camPos/camTgt in sync even during menu/pause/goal so re-entering
    // playing state doesn't cause a camera snap from stale values.
    camPos.lerp(new THREE.Vector3(BROADCAST_CAM_X, GAME_CFG.camH + 5, 0), 0.02);
    camTgt.lerp(new THREE.Vector3(0, 0, 0), 0.02);
    camera.position.copy(camPos);
    camera.lookAt(camTgt);
  }

  renderer.render(scene, camera);
}

// ============================================================
// INTRO CUTSCENE
// ============================================================
function playIntro() {
  setGameState('intro');
  document.getElementById('loading-screen').classList.remove('active');

  // Create cinematic overlay
  const div = document.createElement('div');
  div.id = 'intro-overlay';
  div.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;pointer-events:none;z-index:9999;background:rgba(0,0,0,0.3);';
  div.innerHTML = `
    <h1 style="font-size:7vw;color:#fff;text-shadow:0 5px 15px rgba(0,0,0,0.8);font-family:sans-serif;font-style:italic;transform:skew(-10deg) translateY(50px);opacity:0;transition:all 1.2s ease-out;">FIFA GAME</h1>
    <h2 style="font-size:3vw;color:#ffcc00;text-shadow:0 3px 8px rgba(0,0,0,0.8);font-family:sans-serif;margin:10px 0;transform:translateY(50px);opacity:0;transition:all 1.2s 0.5s ease-out;">FIFA GAME AND FOOTBALL GAME SIMULATION</h2>
  `;
  document.body.appendChild(div);

  // Trigger CSS animations
  requestAnimationFrame(() => {
    const h1 = div.querySelector('h1'); if(h1) { h1.style.opacity = '1'; h1.style.transform = 'translateY(0) skew(-10deg)'; }
    const h2 = div.querySelector('h2'); if(h2) { h2.style.opacity = '1'; h2.style.transform = 'translateY(0)'; }
  });

  let t = 0;
  const duration = 1.8;
  const startPos = new THREE.Vector3(0, 100, 160);
  const endPos = new THREE.Vector3(BROADCAST_CAM_X, 18, 0);

  const animate = () => {
    if (gameState !== 'intro') { if(div.parentNode) div.parentNode.removeChild(div); return; }
    t += 0.012;
    const pct = Math.min(1, t / duration);
    const ease = 1 - Math.pow(1 - pct, 3); // cubic out

    camera.position.lerpVectors(startPos, endPos, ease);
    // Add a slight orbit/pan effect
    camera.position.x += Math.sin(pct * Math.PI) * 30;
    camera.lookAt(0, 5 * (1 - ease), 0);

    if (pct >= 1) {
      if(div.parentNode) div.parentNode.removeChild(div);
      setGameState('menu');
      _syncCamToIdeal();
    } else {
      requestAnimationFrame(animate);
    }
  };
  animate();
}

// ============================================================
// INIT
// ============================================================
async function init() {
  setProgress(10, 'SETTING UP LIGHTS...');
  setupLighting();
  initSnow();
  initRain();
  initParticles();
  await new Promise(r => setTimeout(r, 40));

  setProgress(20, 'LOADING STADIUM...');
  await loadCustomStadium();
  await new Promise(r => setTimeout(r, 40));

  setProgress(40, 'BUILDING PITCH...');
  buildPitch();
  buildGoals();
  buildPitchLines();
  buildPlayerIndicators();
  await new Promise(r => setTimeout(r, 40));

  setProgress(60, 'CREATING BALL...');
  buildBall();
  await new Promise(r => setTimeout(r, 40));

  setProgress(75, 'SPAWNING PLAYERS...');
  await setupTeams();
  await new Promise(r => setTimeout(r, 40));

  setProgress(90, 'SETTING UP UI...');
  setupUI();
  setupAdjustPanel();
  await new Promise(r => setTimeout(r, 40));

  // Side-view broadcast camera (FIFA style)
  camera.fov = 52;
  camera.updateProjectionMatrix();
  camPos.set(BROADCAST_CAM_X, 18, 0);
  camera.position.copy(camPos);
  camera.lookAt(0, 1.5, 0);

  setProgress(100, 'READY!');
  await new Promise(r => setTimeout(r, 50));

  playIntro();

  requestAnimationFrame(loop);
}

init();

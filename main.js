import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as WebIFC from "web-ifc";

const loaderEl = document.getElementById("loader");
const enterBtn = document.getElementById("enter-btn");
const loaderBody = document.getElementById("loader-body");
const hintEl = document.getElementById("hint");
const infoPanel = document.getElementById("info-panel");
const infoType = document.getElementById("info-type");
const infoName = document.getElementById("info-name");
const infoId = document.getElementById("info-id");
const infoClose      = document.getElementById("info-close");
const cloudToggleBtn = document.getElementById("cloud-toggle");
const recenterBtn    = document.getElementById("recenter");

try {

// ── Renderer ───────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
document.getElementById("viewer").appendChild(renderer.domElement);

window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ── Scene ──────────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0f);

scene.add(new THREE.AmbientLight(0xfff8f0, 0.8));
const sun = new THREE.DirectionalLight(0xfff0e0, 1.8);
sun.position.set(60, 120, 80);
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8899cc, 0.6);
fill.position.set(-80, 30, -60);
scene.add(fill);

// ── Camera + controls ─────────────────────────────────────────────────────

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 5000);
camera.position.set(30, 30, 30);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// ── IFC loading ────────────────────────────────────────────────────────────

const ifcApi = new WebIFC.IfcAPI();
ifcApi.SetWasmPath("/", true);
await ifcApi.Init();

const response = await fetch("/models/reinli.ifc");
const buffer = new Uint8Array(await response.arrayBuffer());
const modelID = ifcApi.OpenModel(buffer, { COORDINATE_TO_ORIGIN: true });

// Build reverse lookup: IFC type number → name string (e.g. 3701648567 → "IFCWALL")
const ifcTypeNames = {};
for (const [k, v] of Object.entries(WebIFC)) {
  if (typeof v === "number" && k.startsWith("IFC")) ifcTypeNames[v] = k;
}

// Shared materials per colour
const materials = new Map();
function getMaterial(r, g, b, a) {
  const key = `${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)},${a.toFixed(2)}`;
  if (!materials.has(key)) {
    materials.set(
      key,
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(r, g, b),
        transparent: a < 0.99,
        opacity: a,
        side: THREE.DoubleSide,
      }),
    );
  }
  return materials.get(key);
}

// All renderable meshes (for raycasting)
const pickableMeshes = [];

ifcApi.StreamAllMeshes(modelID, (mesh) => {
  const placed = mesh.geometries;
  for (let i = 0; i < placed.size(); i++) {
    const p = placed.get(i);
    const geom = ifcApi.GetGeometry(modelID, p.geometryExpressID);
    const idxData = ifcApi.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    const vertData = ifcApi.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());

    const positions = new Float32Array(vertData.length / 2);
    const normals = new Float32Array(vertData.length / 2);
    for (let j = 0; j < vertData.length; j += 6) {
      const b = j / 2;
      positions[b] = vertData[j];
      positions[b + 1] = vertData[j + 1];
      positions[b + 2] = vertData[j + 2];
      normals[b] = vertData[j + 3];
      normals[b + 1] = vertData[j + 4];
      normals[b + 2] = vertData[j + 5];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(idxData, 1));

    const col = p.color;
    const mesh3 = new THREE.Mesh(geometry, getMaterial(col.x, col.y, col.z, col.w));

    const m = p.flatTransformation;
    mesh3.matrix.set(
      m[0],
      m[4],
      m[8],
      m[12],
      m[1],
      m[5],
      m[9],
      m[13],
      m[2],
      m[6],
      m[10],
      m[14],
      m[3],
      m[7],
      m[11],
      m[15],
    );
    mesh3.matrixAutoUpdate = false;
    mesh3.userData.expressID = mesh.expressID;

    scene.add(mesh3);
    pickableMeshes.push(mesh3);
    geom.delete();
  }
});

// Ensure world matrices are current for raycasting
scene.updateMatrixWorld();

// ── Fit camera ────────────────────────────────────────────────────────────

const bbox = new THREE.Box3().setFromObject(scene);
const center = bbox.getCenter(new THREE.Vector3());
const size = bbox.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);

controls.target.copy(center);
camera.position.set(center.x + maxDim, center.y + maxDim * 0.75, center.z + maxDim);
camera.lookAt(center);
controls.update();

// ── Element selection ─────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const highlightMat = new THREE.MeshLambertMaterial({
  color: 0xc8b89a,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.85,
});
let selectedMeshes = [];

function deselect() {
  for (const { mesh, mat } of selectedMeshes) mesh.material = mat;
  selectedMeshes = [];
  infoPanel.classList.add("hidden");
}

function select(expressID) {
  deselect();
  for (const m of pickableMeshes) {
    if (m.userData.expressID !== expressID) continue;
    selectedMeshes.push({ mesh: m, mat: m.material });
    m.material = highlightMat;
  }

  // Fetch name and type from IFC
  const line = ifcApi.GetLine(modelID, expressID, false);
  const typeName = ifcTypeNames[line.type] ?? `Type ${line.type}`;
  const name = line.Name?.value ?? line.ObjectType?.value ?? "—";

  infoType.textContent = typeName.replace("IFC", "");
  infoName.textContent = name;
  infoId.textContent = `#${expressID}`;
  infoPanel.classList.remove("hidden");
}

// Distinguish click from drag
let pointerMoved = false;
renderer.domElement.addEventListener("pointerdown", () => {
  pointerMoved = false;
});
renderer.domElement.addEventListener("pointermove", () => {
  pointerMoved = true;
});
renderer.domElement.addEventListener("pointerup", (e) => {
  if (pointerMoved) return;
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(pickableMeshes);
  hits.length ? select(hits[0].object.userData.expressID) : deselect();
});

infoClose.addEventListener("click", deselect);

recenterBtn.addEventListener("click", () => {
  controls.target.copy(center);
  camera.position.set(center.x + maxDim, center.y + maxDim * 0.75, center.z + maxDim);
  controls.update();
});

// ── Point cloud ────────────────────────────────────────────────────────────

const geo = await streamPLY("/models/cloud.ply");

// PLY is Z-up (survey); Three.js is Y-up — rotate -90° around X to stand it upright,
// then -13° around Y to match building orientation
geo.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
geo.applyMatrix4(new THREE.Matrix4().makeRotationY(-13 * Math.PI / 180));

// Align to IFC model: center X/Z, pin floor on Y
geo.computeBoundingBox();
const cloudCenter = geo.boundingBox.getCenter(new THREE.Vector3());
geo.translate(
  center.x - cloudCenter.x - 0.80,
  bbox.min.y - geo.boundingBox.min.y,
  center.z - cloudCenter.z,
);

const cloud = new THREE.Points(geo, new THREE.PointsMaterial({
  size: 0.05,
  vertexColors: geo.hasAttribute("color"),
  color: geo.hasAttribute("color") ? 0xffffff : 0xc8b89a,
  sizeAttenuation: true,
}));
scene.add(cloud);

cloudToggleBtn.classList.add("active");
cloudToggleBtn.addEventListener("click", () => {
  cloud.visible = !cloud.visible;
  cloudToggleBtn.classList.toggle("active", cloud.visible);
});

async function streamPLY(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`PLY fetch failed: ${res.status}`);
  const reader = res.body.getReader();

  let pending = new Uint8Array(0);
  let dataStart = -1;

  while (dataStart === -1) {
    const { value, done } = await reader.read();
    if (done) break;
    const next = new Uint8Array(pending.length + value.length);
    next.set(pending); next.set(value, pending.length);
    pending = next;
    const text = new TextDecoder().decode(pending);
    const idx = text.indexOf("end_header\n");
    if (idx !== -1) dataStart = idx + "end_header\n".length;
  }

  const header = new TextDecoder().decode(pending.slice(0, dataStart));
  const lines  = header.split("\n").map(l => l.trim());

  if (!lines.some(l => l.startsWith("format binary_little_endian")))
    throw new Error("PLY: only binary_little_endian is supported");

  let vertexCount = 0;
  const props = [];
  const TYPE_SIZE = { float: 4, double: 8, int: 4, uint: 4, short: 2, ushort: 2, uchar: 1, char: 1 };

  for (const line of lines) {
    if (line.startsWith("element vertex")) vertexCount = parseInt(line.split(" ")[2]);
    if (line.startsWith("property")) {
      const [, type, name] = line.split(" ");
      props.push({ type, name, size: TYPE_SIZE[type] ?? 0 });
    }
  }

  const stride = props.reduce((s, p) => s + p.size, 0);
  let off = 0;
  const offsets = {};
  for (const p of props) { offsets[p.name] = off; off += p.size; }

  const { x: xO, y: yO, z: zO, red: rO, green: gO, blue: bO } = offsets;
  const hasColor = rO !== undefined;
  const pos = new Float32Array(vertexCount * 3);
  const col = hasColor ? new Float32Array(vertexCount * 3) : null;

  let carry = pending.slice(dataStart);
  let kIdx = 0;

  function processBuffer(buf) {
    let o = 0;
    const view = new DataView(buf.buffer, buf.byteOffset);
    while (o + stride <= buf.length) {
      pos[kIdx * 3]     = view.getFloat32(o + xO, true);
      pos[kIdx * 3 + 1] = view.getFloat32(o + yO, true);
      pos[kIdx * 3 + 2] = view.getFloat32(o + zO, true);
      if (col) {
        col[kIdx * 3]     = buf[o + rO] / 255;
        col[kIdx * 3 + 1] = buf[o + gO] / 255;
        col[kIdx * 3 + 2] = buf[o + bO] / 255;
      }
      kIdx++;
      o += stride;
    }
    return buf.slice(o);
  }

  carry = processBuffer(carry);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (carry.length > 0) {
      const merged = new Uint8Array(carry.length + value.length);
      merged.set(carry); merged.set(value, carry.length);
      carry = processBuffer(merged);
    } else {
      carry = processBuffer(value);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos.slice(0, kIdx * 3), 3));
  if (col) geometry.setAttribute("color", new THREE.BufferAttribute(col.slice(0, kIdx * 3), 3));
  return geometry;
}

// ── Done ──────────────────────────────────────────────────────────────────

document.querySelector(".loader-bar").classList.add("done", "ready");
enterBtn.addEventListener("click", () => {
  loaderEl.classList.add("hidden");
  let hintTimer = setTimeout(() => hintEl.classList.add("fade"), 5000);
  renderer.domElement.addEventListener("pointerdown", () => {
    hintEl.classList.remove("fade");
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.add("fade"), 5000);
  });
}, { once: true });

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

} catch (err) {
  const isSafariVersion = err.message?.includes("emscripten") || err.message?.includes("Safari");
  loaderBody.textContent = isSafariVersion
    ? "Visningen krever Safari 15 eller nyere. Oppdater iOS og prøv igjen."
    : "Kunne ikke laste modellen. Prøv å laste siden på nytt.";
  document.querySelector(".loader-bar").style.display = "none";
  enterBtn.style.display = "none";
}

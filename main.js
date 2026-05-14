import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as WebIFC from "web-ifc";

const loaderEl = document.getElementById("loader");
const hintEl = document.getElementById("hint");

// ── Renderer ───────────────────────────────────────────────────────────────

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
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

// ── IFC loading (single-threaded, no workers) ─────────────────────────────

const ifcApi = new WebIFC.IfcAPI();
ifcApi.SetWasmPath("/", true);
await ifcApi.Init();

const response = await fetch("/models/church.ifc");
const buffer = new Uint8Array(await response.arrayBuffer());
const modelID = ifcApi.OpenModel(buffer, { COORDINATE_TO_ORIGIN: true });

// Shared material per colour, keyed by hex string
const materials = new Map();
function getMaterial(r, g, b, a) {
  const hex = `${r.toFixed(2)},${g.toFixed(2)},${b.toFixed(2)},${a.toFixed(2)}`;
  if (!materials.has(hex)) {
    materials.set(
      hex,
      new THREE.MeshLambertMaterial({
        color: new THREE.Color(r, g, b),
        transparent: a < 0.99,
        opacity: a,
        side: THREE.DoubleSide,
      }),
    );
  }
  return materials.get(hex);
}

// Extract all geometry from the model
ifcApi.StreamAllMeshes(modelID, (mesh) => {
  const placedGeometries = mesh.geometries;

  for (let i = 0; i < placedGeometries.size(); i++) {
    const placed = placedGeometries.get(i);
    const geomData = ifcApi.GetGeometry(modelID, placed.geometryExpressID);
    const verts = ifcApi.GetRawLineData ? null : null; // unused
    const idxData = ifcApi.GetIndexArray(geomData.GetIndexData(), geomData.GetIndexDataSize());
    const vertData = ifcApi.GetVertexArray(geomData.GetVertexData(), geomData.GetVertexDataSize());

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(vertData.length / 2);
    const normals = new Float32Array(vertData.length / 2);

    for (let j = 0; j < vertData.length; j += 6) {
      const base = j / 2;
      positions[base] = vertData[j];
      positions[base + 1] = vertData[j + 1];
      positions[base + 2] = vertData[j + 2];
      normals[base] = vertData[j + 3];
      normals[base + 1] = vertData[j + 4];
      normals[base + 2] = vertData[j + 5];
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(idxData, 1));

    const col = placed.color;
    const mesh3 = new THREE.Mesh(geometry, getMaterial(col.x, col.y, col.z, col.w));

    const m = placed.flatTransformation;
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

    scene.add(mesh3);
    geomData.delete();
  }
});

ifcApi.CloseModel(modelID);

// ── Fit camera ────────────────────────────────────────────────────────────

const bbox = new THREE.Box3().setFromObject(scene);
const center = bbox.getCenter(new THREE.Vector3());
const size = bbox.getSize(new THREE.Vector3());
const maxDim = Math.max(size.x, size.y, size.z);

controls.target.copy(center);
camera.position.set(center.x + maxDim, center.y + maxDim * 0.75, center.z + maxDim);
camera.lookAt(center);
controls.update();

// ── Done ──────────────────────────────────────────────────────────────────

loaderEl.classList.add("hidden");

let hintTimer = setTimeout(() => hintEl.classList.add("fade"), 5000);
renderer.domElement.addEventListener("pointerdown", () => {
  hintEl.classList.remove("fade");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hintEl.classList.add("fade"), 5000);
});

// ── Render loop ───────────────────────────────────────────────────────────

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

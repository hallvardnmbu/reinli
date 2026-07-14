import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import * as WebIFC from "web-ifc";

const DEBUG = false;
let INTENSITY = 2.3;

const loaderEl = document.getElementById("loader");
const enterBtn = document.getElementById("enter-btn");
const loaderBody = document.getElementById("loader-body");
const hintEl = document.getElementById("hint");
const infoPanel = document.getElementById("info-panel");
const infoType = document.getElementById("info-type");
const infoName = document.getElementById("info-name");
const infoId = document.getElementById("info-id");
const infoClose = document.getElementById("info-close");
const infoProps = document.getElementById("info-props");
const cloudToggleBtn = document.getElementById("cloud-toggle");
const modelOpacityEl = document.getElementById("model-opacity");
const brightnessEl = document.getElementById("brightness");
const recenterBtn = document.getElementById("recenter");
const debugValsEl = document.getElementById("debug-vals");
const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
const topRight = document.getElementById("top-right");

try {
  // ── Renderer ───────────────────────────────────────────────────────────────

  const renderer = new THREE.WebGLRenderer({ antialias: devicePixelRatio < 2 });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  document.getElementById("viewer").appendChild(renderer.domElement);

  window.addEventListener("resize", () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  // ── Scene ──────────────────────────────────────────────────────────────────

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim(),
  );

  // Hemisphere light simulates sky dome (industry standard for architectural viz)
  const hemisphere = new THREE.HemisphereLight(
    0xffffff, // sky color (bright white)
    0xffffff, // ground color (cool gray-blue)
    INTENSITY * 0.26  // scaled from INTENSITY constant
  );
  scene.add(hemisphere);

  // Create directional lights with consistent setup
  const directionalLights = [
    [80, 60, 80],
    [-80, 60, 80],
    [-80, 60, -80],
    [80, 60, -80],
    [0, 0, -80],
    [0, -60, 0]
  ].map(position => {
    const light = new THREE.DirectionalLight(0xfff0e0, INTENSITY);
    light.position.set(...position);
    scene.add(light);
    return light;
  });

  // Store base intensities for brightness control
  const lightBases = {
    hemisphere: hemisphere.intensity,
    directional: INTENSITY
  };

  function applyBrightness() {
    const t = brightnessEl.value / 100;
    hemisphere.intensity = lightBases.hemisphere * t;
    for (const light of directionalLights) {
      light.intensity = lightBases.directional * t;
    }
  }
  brightnessEl.addEventListener("input", applyBrightness);
  applyBrightness();

  // ── Camera + controls ─────────────────────────────────────────────────────

  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 5000);
  camera.position.set(30, 30, 30);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  // ── Camera Tour System ────────────────────────────────────────────────────

  // Cubic easing function (in-out)
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Camera tour state
  const tourState = {
    active: false,
    paused: false,
    currentTour: null,
    startTime: 0,
    pauseTime: 0,
    totalPausedTime: 0,
    duration: 0,
    waypoints: []
  };

  // Define camera tours (positions and look-at targets)
  const tours = {
    overview: {
      name: "Oversikt",
      duration: 25000, // 25 seconds
      waypoints: [
        { pos: [40, 25, 40], target: [0, 5, 0], duration: 0.2 },
        { pos: [0, 35, 50], target: [0, 5, 0], duration: 0.25 },
        { pos: [-45, 30, 20], target: [0, 8, 0], duration: 0.25 },
        { pos: [-30, 25, -40], target: [0, 5, 0], duration: 0.15 },
        { pos: [30, 30, -35], target: [0, 8, 0], duration: 0.15 }
      ]
    },
    interior: {
      name: "Interiør",
      duration: 28000, // 28 seconds
      waypoints: [
        { pos: [0, 2, 15], target: [0, 5, 0], duration: 0.15 },
        { pos: [0, 3, 8], target: [0, 6, -5], duration: 0.2 },
        { pos: [0, 4, 0], target: [0, 8, -10], duration: 0.2 },
        { pos: [0, 5, -8], target: [0, 10, -15], duration: 0.2 },
        { pos: [0, 4, -12], target: [0, 8, -18], duration: 0.15 },
        { pos: [0, 3, -5], target: [0, 6, 5], duration: 0.1 }
      ]
    },
    details: {
      name: "Detaljer",
      duration: 30000, // 30 seconds
      waypoints: [
        { pos: [8, 8, 8], target: [5, 6, 5], duration: 0.15 },
        { pos: [6, 12, 4], target: [4, 10, 2], duration: 0.2 },
        { pos: [-5, 10, 6], target: [-3, 8, 4], duration: 0.2 },
        { pos: [-8, 6, -4], target: [-5, 5, -2], duration: 0.15 },
        { pos: [4, 15, -6], target: [2, 12, -4], duration: 0.15 },
        { pos: [10, 8, 0], target: [6, 6, 0], duration: 0.15 }
      ]
    }
  };

  // Interpolate between two waypoints
  function interpolateWaypoint(wp1, wp2, t) {
    const eased = easeInOutCubic(t);
    return {
      pos: [
        wp1.pos[0] + (wp2.pos[0] - wp1.pos[0]) * eased,
        wp1.pos[1] + (wp2.pos[1] - wp1.pos[1]) * eased,
        wp1.pos[2] + (wp2.pos[2] - wp1.pos[2]) * eased
      ],
      target: [
        wp1.target[0] + (wp2.target[0] - wp1.target[0]) * eased,
        wp1.target[1] + (wp2.target[1] - wp1.target[1]) * eased,
        wp1.target[2] + (wp2.target[2] - wp1.target[2]) * eased
      ]
    };
  }

  // Update camera position during tour
  function updateTour() {
    if (!tourState.active || tourState.paused) return;

    const elapsed = Date.now() - tourState.startTime - tourState.totalPausedTime;
    const progress = Math.min(elapsed / tourState.duration, 1);

    if (progress >= 1) {
      stopTour();
      return;
    }

    // Find current segment
    const waypoints = tourState.waypoints;
    let accumulatedDuration = 0;
    let currentSegment = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const segmentDuration = waypoints[i].duration;
      if (progress <= accumulatedDuration + segmentDuration) {
        currentSegment = i;
        break;
      }
      accumulatedDuration += segmentDuration;
    }

    // Interpolate within current segment
    const wp1 = waypoints[currentSegment];
    const wp2 = waypoints[currentSegment + 1];
    const segmentProgress = (progress - accumulatedDuration) / wp1.duration;
    const interpolated = interpolateWaypoint(wp1, wp2, segmentProgress);

    // Update camera
    camera.position.set(...interpolated.pos);
    controls.target.set(...interpolated.target);
    controls.update();
  }

  // Start a tour
  function startTour(tourName) {
    const tour = tours[tourName];
    if (!tour) return;

    // Disable manual controls during tour
    controls.enabled = false;

    tourState.active = true;
    tourState.paused = false;
    tourState.currentTour = tourName;
    tourState.startTime = Date.now();
    tourState.totalPausedTime = 0;
    tourState.duration = tour.duration;
    tourState.waypoints = tour.waypoints;

    updateTourUI();
  }

  // Pause tour
  function pauseTour() {
    if (!tourState.active || tourState.paused) return;
    tourState.paused = true;
    tourState.pauseTime = Date.now();
    updateTourUI();
  }

  // Resume tour
  function resumeTour() {
    if (!tourState.active || !tourState.paused) return;
    tourState.paused = false;
    tourState.totalPausedTime += Date.now() - tourState.pauseTime;
    updateTourUI();
  }

  // Stop tour
  function stopTour() {
    tourState.active = false;
    tourState.paused = false;
    tourState.currentTour = null;
    controls.enabled = true;
    updateTourUI();
  }

  // Update UI button states
  function updateTourUI() {
    const playBtn = document.getElementById("tour-play");
    const pauseBtn = document.getElementById("tour-pause");
    const stopBtn = document.getElementById("tour-stop");
    const selectEl = document.getElementById("tour-select");

    if (tourState.active) {
      playBtn.disabled = true;
      pauseBtn.disabled = false;
      stopBtn.disabled = false;
      selectEl.disabled = true;

      if (tourState.paused) {
        playBtn.disabled = false;
        playBtn.classList.remove("active");
        pauseBtn.classList.remove("active");
      } else {
        pauseBtn.classList.add("active");
      }
    } else {
      playBtn.disabled = !selectEl.value;
      pauseBtn.disabled = true;
      stopBtn.disabled = true;
      selectEl.disabled = false;
      playBtn.classList.remove("active");
      pauseBtn.classList.remove("active");
    }
  }

  // Wire up tour controls
  const tourSelect = document.getElementById("tour-select");
  const tourPlayBtn = document.getElementById("tour-play");
  const tourPauseBtn = document.getElementById("tour-pause");
  const tourStopBtn = document.getElementById("tour-stop");

  tourSelect.addEventListener("change", () => {
    updateTourUI();
  });

  tourPlayBtn.addEventListener("click", () => {
    if (tourState.paused) {
      resumeTour();
    } else {
      const selectedTour = tourSelect.value;
      if (selectedTour) {
        startTour(selectedTour);
      }
    }
  });

  tourPauseBtn.addEventListener("click", () => {
    pauseTour();
  });

  tourStopBtn.addEventListener("click", () => {
    stopTour();
  });

  // Initialize UI
  updateTourUI();

  // ── Slider touch handling ─────────────────────────────────────────────────

  function bindSliderTouch(slider) {
    slider.addEventListener("pointerdown", (e) => {
      slider.setPointerCapture(e.pointerId);
      controls.enabled = false;
    });
    const release = (e) => {
      if (slider.hasPointerCapture?.(e.pointerId)) slider.releasePointerCapture(e.pointerId);
      controls.enabled = true;
    };
    slider.addEventListener("pointerup", release);
    slider.addEventListener("pointercancel", release);
  }
  bindSliderTouch(brightnessEl);
  bindSliderTouch(modelOpacityEl);

  // ── IFC loading ────────────────────────────────────────────────────────────

  // Start GLTF load immediately — it can transfer while WASM loads and IFC parses
  const dracoLoader = new DRACOLoader().setDecoderPath("/draco/");
  const gltfPromise = new GLTFLoader().setDRACOLoader(dracoLoader).loadAsync("/models/mesh.glb");

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
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(r, g, b),
        transparent: a < 0.99,
        opacity: a,
        side: THREE.DoubleSide,
      });
      mat.userData.baseOpacity = a;
      materials.set(key, mat);
    }
    return materials.get(key);
  }

  // All renderable meshes (for raycasting)
  const pickableMeshes = [];
  const ifcGroup = new THREE.Group();

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

      ifcGroup.add(mesh3);
      pickableMeshes.push(mesh3);
      geom.delete();
    }
  });

  scene.add(ifcGroup);

  // Build property-set lookup: expressID → [{setName, props:[{name,value}]}]
  const elementPsets = new Map();
  try {
    const relIDs = ifcApi.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIDs.size(); i++) {
      try {
        const rel = ifcApi.GetLine(modelID, relIDs.get(i), false);
        const psetID = rel.RelatingPropertyDefinition?.value;
        if (!psetID) continue;
        const pdef = ifcApi.GetLine(modelID, psetID, false);
        if (!pdef || pdef.type !== WebIFC.IFCPROPERTYSET) continue;
        const setName = pdef.Name?.value ?? "";
        const propIDs = (pdef.HasProperties ?? []).map((h) => h.value).filter(Boolean);
        const props = [];
        for (const pid of propIDs) {
          try {
            const p = ifcApi.GetLine(modelID, pid, false);
            if (p.type !== WebIFC.IFCPROPERTYSINGLEVALUE) continue;
            const name = p.Name?.value ?? "";
            const val = p.NominalValue?.value;
            if (name && val != null && val !== "") props.push({ name, value: String(val) });
          } catch {}
        }
        if (!props.length) continue;
        for (const obj of rel.RelatedObjects ?? []) {
          const id = obj.value;
          if (!id) continue;
          if (!elementPsets.has(id)) elementPsets.set(id, []);
          elementPsets.get(id).push({ setName, props });
        }
      } catch {}
    }
  } catch {}

  // Ensure world matrices are current for raycasting
  scene.updateMatrixWorld();

  // ── Fit camera ────────────────────────────────────────────────────────────

  const bbox = new THREE.Box3().setFromObject(ifcGroup);
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

    const line = ifcApi.GetLine(modelID, expressID, false);
    const typeName = ifcTypeNames[line.type] ?? `Type ${line.type}`;
    const name = line.Name?.value ?? line.ObjectType?.value ?? "—";

    const typeTranslations = {
      IFCCOLUMN: "Stav",
      IFCBEAM: "Bjelke",
      IFCWALL: "Veggtile",
      IFCROOF: "Tak",
      IFCSLAB: "Arkeologisk felt",
      IFCDOOR: "Dør",
      IFCMEMBER: "Stav"
    };
    infoType.textContent = typeTranslations[typeName] ?? typeName.replace("IFC", "");
    infoName.textContent = name;

    const psets = elementPsets.get(expressID) ?? [];
    const arkiv = psets.find((s) => s.setName === "Arkiv");

    if (arkiv) {
      infoProps.innerHTML = arkiv.props
        .map(({ name, value }) => {
          const linkedValue = value.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank" rel="noopener noreferrer">Referanse</a>'
          );
          return `<div class="info-prop">
            <span class="info-key">${name}</span>
            <span class="info-val">${linkedValue}</span>
          </div>`;
        })
        .join("");
    } else {
      infoProps.innerHTML = "<p>Ingen arkivinformasjon tilgjengelig.</p>";
    }

    infoPanel.classList.remove("hidden");
  }

  // Distinguish click from drag
  let pointerMoved = false;
  renderer.domElement.addEventListener("pointerdown", () => (pointerMoved = false));
  renderer.domElement.addEventListener("pointermove", () => (pointerMoved = true));
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (pointerMoved) return;
    mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
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

  // ── Mobile menu toggle ────────────────────────────────────────────────────

  mobileMenuToggle.addEventListener("click", () => {
    const isOpen = topRight.classList.toggle("menu-open");
    mobileMenuToggle.classList.toggle("active", isOpen);
  });

  // Close menu when clicking outside on mobile
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 600 && 
        topRight.classList.contains("menu-open") &&
        !topRight.contains(e.target) && 
        !mobileMenuToggle.contains(e.target)) {
      topRight.classList.remove("menu-open");
      mobileMenuToggle.classList.remove("active");
    }
  });

  // ── Point cloud (GLTF mesh) ────────────────────────────────────────────────

  const gltf = await gltfPromise;
  const cloud = gltf.scene;

  // GLTF from Autodesk is Z-up despite spec — rotate to Y-up before computing bounds
  cloud.rotation.x = -Math.PI / 2;
  cloud.updateMatrixWorld(true);

  // Align to IFC model: center X/Z, pin floor on Y
  const gltfBox = new THREE.Box3().setFromObject(cloud);
  const gltfCenter = gltfBox.getCenter(new THREE.Vector3());
  const baseTx = center.x - gltfCenter.x;
  const cloudTy = bbox.min.y - gltfBox.min.y;
  const baseTz = center.z - gltfCenter.z;

  let dX = 0.85,
    dY = 0.75,
    dZ = 0,
    rX = 0,
    rY = 6.5,
    rZ = 0;

  // Fix cloud at aligned position — it stays put while debug mode moves the IFC
  cloud.position.set(baseTx, cloudTy, baseTz);
  scene.add(cloud);

  ifcGroup.visible = false;

  cloudToggleBtn.addEventListener("click", () => {
    ifcGroup.visible = !ifcGroup.visible;
    cloudToggleBtn.classList.toggle("active", ifcGroup.visible);
    document.getElementById("model-opacity-wrap").style.display = ifcGroup.visible ? "" : "none";
  });

  function applyModelOpacity() {
    const t = modelOpacityEl.value / 100;
    for (const mat of materials.values()) {
      mat.opacity = mat.userData.baseOpacity * t;
      mat.transparent = mat.opacity < 0.99;
    }
  }
  modelOpacityEl.addEventListener("input", applyModelOpacity);
  applyModelOpacity();

  function applyDebug() {
    ifcGroup.position.set(dX, dY, dZ);
    ifcGroup.rotation.set((rX * Math.PI) / 180, (rY * Math.PI) / 180, (rZ * Math.PI) / 180);
    if (DEBUG)
      debugValsEl.textContent =
        `X ${dX.toFixed(3)}  Y ${dY.toFixed(3)}  Z ${dZ.toFixed(3)}\n` +
        `rX ${rX.toFixed(1)}°  rY ${rY.toFixed(1)}°  rZ ${rZ.toFixed(1)}°`;
  }
  applyDebug();

  if (DEBUG) {
    document.getElementById("debug-panel").style.display = "block";
    window.addEventListener("keydown", (e) => {
      const s = e.shiftKey ? 0.25 : 0.05,
        r = e.shiftKey ? 2.5 : 0.5;
      switch (e.key) {
        case "w":
          dZ -= s;
          break;
        case "s":
          dZ += s;
          break;
        case "a":
          dX -= s;
          break;
        case "d":
          dX += s;
          break;
        case "z":
          dY += s;
          break;
        case "x":
          dY -= s;
          break;
        case "q":
          rY -= r;
          break;
        case "e":
          rY += r;
          break;
        case "t":
          rX -= r;
          break;
        case "g":
          rX += r;
          break;
        case "f":
          rZ -= r;
          break;
        case "h":
          rZ += r;
          break;
        default:
          return;
      }
      e.preventDefault();
      applyDebug();
    });
  }

  // ── Done ──────────────────────────────────────────────────────────────────

  document.querySelector(".loader-bar").classList.add("done", "ready");
  enterBtn.addEventListener(
    "click",
    () => {
      loaderEl.classList.add("hidden");
      let hintTimer = setTimeout(() => hintEl.classList.add("fade"), 5000);
      renderer.domElement.addEventListener("pointerdown", () => {
        hintEl.classList.remove("fade");
        clearTimeout(hintTimer);
        hintTimer = setTimeout(() => hintEl.classList.add("fade"), 5000);
      });
    },
    { once: true },
  );

  renderer.setAnimationLoop(() => {
    updateTour();
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

import * as THREE from 'three';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';

export function setupEnvironment(scene, renderer) {

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const horizon = new THREE.Color(0xd7e3ee);
  scene.background = horizon.clone();
  scene.fog = new THREE.Fog(horizon.clone(), 70, 260);

  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x1f4f8f) },
        mid: { value: new THREE.Color(0x6f9ac8) },
        bottom: { value: horizon.clone() },
        offset: { value: 40 }, exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
        uniform float offset; uniform float exponent;
        varying vec3 vWorld;
        void main() {
          float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
          float t = pow(clamp(h, 0.0, 1.0), exponent);
          vec3 col = h < 0.15 ? mix(bottom, mid, clamp(h / 0.15, 0.0, 1.0))
                              : mix(mid, top, clamp((h - 0.15) / 0.85, 0.0, 1.0));
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight(0xbcd4ef, 0x3b3a34, 0.6);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(-60, 90, -90);
  sun.castShadow = true;
  // Higher-resolution soft shadows make cover, wall bases, and the new
  // textured materials read as grounded instead of floating.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 2.25;
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.025;
  const s = 66;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 180;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.AmbientLight(0xffffff, 0.18);
  scene.add(fill);

  return { sun, sky };
}

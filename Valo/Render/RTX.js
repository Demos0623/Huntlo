// Valo — "RTX" mode: a post-processing pipeline aimed at a more realistic look.
//   * SSAO  — screen-space ambient occlusion: soft contact shadows where surfaces
//             meet (corners, under crates), the biggest realism cue. Runs at half
//             resolution to stay affordable.
//   * Bloom — bright surfaces (gold, sky, reflections) glow.
//   * SMAA  — antialiasing for clean edges.
//   * OutputPass — filmic tone mapping + sRGB.
// Purely visual and toggled at runtime; SSAO/SMAA degrade gracefully if missing.
import * as THREE from 'three';
import { EffectComposer } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/OutputPass.js';
import { SSAOPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/SSAOPass.js';
import { SMAAPass } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/postprocessing/SMAAPass.js';

const PR = Math.min(window.devicePixelRatio || 1, 1.25);
const AO_SCALE = 0.5; // ambient occlusion at half res

export function buildRTX(renderer, scene, camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(PR);
  composer.setSize(size.x, size.y);

  composer.addPass(new RenderPass(scene, camera));

  let ssao = null;
  try {
    ssao = new SSAOPass(scene, camera, size.x * AO_SCALE, size.y * AO_SCALE);
    ssao.kernelRadius = 0.6;
    ssao.minDistance = 0.0015;
    ssao.maxDistance = 0.06;
    composer.addPass(ssao);
  } catch (e) { ssao = null; }

  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.55, 0.82);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  let smaa = null;
  try { smaa = new SMAAPass(size.x * PR, size.y * PR); composer.addPass(smaa); } catch (e) { smaa = null; }

  return {
    composer,
    bloom,
    ssao,
    render() { composer.render(); },
    setSize(w, h) {
      composer.setPixelRatio(PR);
      composer.setSize(w, h);
      if (ssao) ssao.setSize(w * AO_SCALE, h * AO_SCALE);
      bloom.setSize(w, h);
      if (smaa) smaa.setSize(w * PR, h * PR);
    },
  };
}

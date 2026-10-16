// Small shader patches shared by every diorama material:
//  • cut  — dithered "x-ray" hole in anything standing between the camera and the player
//  • rise — per-vertex grow-out-of-the-floor animation for the merged wall mesh
import * as THREE from 'three';

export const U = {
  uPlayer: { value: new THREE.Vector2() },
  uCut: { value: 0 },
  uS: { value: 1 },
  uOrigin: { value: new THREE.Vector2() },
};

/** Same curve as the shader: staggered by distance from the origin, tiny overshoot. */
export function riseK(dist: number, s: number): number {
  const d = Math.min(1, Math.max(0, dist / 16));
  const t = Math.min(1, Math.max(0, (s - d * 0.35) / 0.65));
  const c1 = 1.70158 * 0.6;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

const RISE_GLSL = /* glsl */ `
attribute vec2 aCenter;
uniform float uS;
uniform vec2 uOrigin;
float lqRise(vec2 c) {
  float d = clamp(distance(c, uOrigin) / 16.0, 0.0, 1.0);
  float t = clamp((uS - d * 0.35) / 0.65, 0.0, 1.0);
  float c1 = 1.70158 * 0.6;
  float c3 = c1 + 1.0;
  return max(0.0008, 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0));
}
`;

export function patchMaterial(mat: THREE.Material, opts: { cut?: boolean; rise?: boolean }) {
  const cut = !!opts.cut;
  const rise = !!opts.rise;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayer = U.uPlayer;
    shader.uniforms.uCut = U.uCut;
    shader.uniforms.uS = U.uS;
    shader.uniforms.uOrigin = U.uOrigin;
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    if (rise) {
      vs = RISE_GLSL + vs.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y *= lqRise(aCenter);');
    }
    if (cut) {
      vs = 'varying vec3 vLqW;\n' + vs.replace('#include <project_vertex>', '#include <project_vertex>\nvLqW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      fs =
        'varying vec3 vLqW;\nuniform vec2 uPlayer;\nuniform float uCut;\n' +
        fs.replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
  if (uCut > 0.5) {
    vec2 dd = vLqW.xz - uPlayer;
    float r = length(vec2(dd.x * 0.75, (dd.y - 1.4) * 0.55));
    if (dd.y > 0.3 && vLqW.y > 0.75 && r < 1.25) {
      float k = smoothstep(1.25, 0.55, r);
      vec2 p = floor(mod(gl_FragCoord.xy, 4.0));
      float bayer = mod(p.x * 2.0 + p.y * 3.0 + p.x * p.y, 4.0) / 4.0 + mod(p.x + p.y, 2.0) * 0.125;
      if (k * 0.85 > bayer) discard;
    }
  }`,
        );
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `lq-${cut ? 'c' : ''}${rise ? 'r' : ''}`;
}

/** Depth material for the shadow pass of the rising wall mesh. */
export function riseDepthMaterial(): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchMaterial(m, { rise: true });
  return m;
}

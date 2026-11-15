import * as THREE from 'three'

/**
 * Hologram malzemesi: kenarlar parlar (fresnel), orta saydam kalır,
 * üzerinde yatay tarama çizgileri ve aşağıdan yukarı geçen bir ışık bandı dolaşır.
 */

const vertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying float vWorldY;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldY = world.y;
    vec4 mv = viewMatrix * world;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uTime;
  uniform float uHover;
  uniform float uSelect;
  uniform float uSide;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  varying vec3 vLocal;
  varying float vWorldY;

  void main() {
    if (uSide != 0.0 && vLocal.z * uSide < -0.002) discard;

    float facing = abs(dot(normalize(vNormal), normalize(vViewDir)));
    float fres = pow(1.0 - facing, 2.4);

    float lines = sin(vWorldY * 300.0 - uTime * 3.0) * 0.5 + 0.5;
    lines = smoothstep(0.7, 1.0, lines) * 0.07;

    float sweepPos = fract(uTime * 0.16) * 2.6 - 0.3;
    float sweep = smoothstep(0.09, 0.0, abs(vWorldY - sweepPos)) * 0.55;

    float act = max(uHover * 0.65, uSelect);
    vec3 col = mix(uColor, uHot, act * 0.75);

    float a = 0.05 + fres * 0.95 + lines + sweep;
    a += act * (0.22 + fres * 0.5);
    gl_FragColor = vec4(col * a, a * uOpacity);
  }
`

export function createHoloMaterial(color: THREE.ColorRepresentation, side = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHot: { value: new THREE.Color('#e9f9ff') },
      uTime: { value: 0 },
      uHover: { value: 0 },
      uSelect: { value: 0 },
      uSide: { value: side },
      uOpacity: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

/** Platform ve ışık konisi için yukarı doğru sönen basit malzeme */
export function createFadeMaterial(color: THREE.ColorRepresentation, strength = 0.5) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float a = pow(1.0 - vUv.y, 2.2) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStrength: { value: strength } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  })
}

/** Zemindeki yuvarlak parlama */
export function createDiscMaterial(color: THREE.ColorRepresentation) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime;
      varying vec2 vUv;
      void main() {
        float d = distance(vUv, vec2(0.5)) * 2.0;
        float glow = pow(max(1.0 - d, 0.0), 2.5) * 0.55;
        float ring = smoothstep(0.012, 0.0, abs(d - fract(uTime * 0.25))) * (1.0 - d) * 0.8;
        float a = glow + ring;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}

export interface BodyLayerOptions {
  /** İçten saydam dolgu */
  fill: number
  /** Yönlü ışık (kas hatlarını gösterir) */
  light: number
  /** Kenar parlaması */
  rim: number
  /** Yüzey ızgarası */
  grid: number
}

/**
 * Vücut katmanları (dış yüzey ve kaslar) için hologram malzemesi.
 * - Yüzeye sabitlenmiş ince ızgara çizgileri (figürle birlikte döner)
 * - İçten saydam dolgu, kenarlarda parlak fresnel ışığı
 * - Her köşe noktasının bölge numarası (aRegion) ile bölge bazlı renk ve vurgu
 */
export function createBodyMaterial(opts: BodyLayerOptions) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aRegion;
      attribute float aStruct;
      flat varying int vRegion;
      flat varying float vStruct;
      varying vec3 vPos;
      varying vec3 vObjNormal;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vRegion = int(aRegion + 0.5);
        vStruct = aStruct;
        vPos = position;
        vObjNormal = normal;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uRegionColor[8];
      uniform float uHover[8];
      uniform float uSelect[8];
      uniform float uTime;
      uniform float uGrid;
      uniform float uFill;
      uniform float uLight;
      uniform float uRim;
      uniform float uGridAmt;
      uniform float uAlpha;
      uniform float uHoverStruct;
      uniform float uSelectStruct;
      /* Bir bölge seçiliyken 1: seçili olmayan bölgeler sönükleşir, seçilen öne çıkar */
      uniform float uAnySel;
      flat varying int vRegion;
      flat varying float vStruct;
      varying vec3 vPos;
      varying vec3 vObjNormal;
      varying vec3 vNormal;
      varying vec3 vViewDir;

      float gridLine(float coord, float spacing) {
        float c = coord / spacing;
        float w = fwidth(c);
        float d = abs(fract(c - 0.5) - 0.5) / max(w, 1e-4);
        // Çizgiler çok sıklaşırsa (uzak yüzeyler) titrememesi için söner
        return (1.0 - clamp(d, 0.0, 1.0)) * (1.0 - smoothstep(0.25, 0.5, w));
      }

      void main() {
        vec3 base = uRegionColor[vRegion];
        float hov = uHover[vRegion];
        float sel = uSelect[vRegion];

        vec3 n = normalize(vNormal);
        float facing = abs(dot(n, normalize(vViewDir)));
        float fres = pow(1.0 - facing, 2.2);

        vec3 an = abs(normalize(vObjNormal));
        float gy = gridLine(vPos.y, uGrid);
        float gx = gridLine(vPos.x, uGrid) * smoothstep(0.35, 0.8, an.z);
        float gz = gridLine(vPos.z, uGrid) * smoothstep(0.35, 0.8, an.x);
        float grid = max(gy, max(gx, gz));

        float sweepPos = fract(uTime * 0.14) * 2.4 - 0.25;
        float sweep = smoothstep(0.07, 0.0, abs(vPos.y - sweepPos));

        // Hafif yönlü ışık: kas hatlarını belirginleştirir
        float light = pow(max(dot(n, normalize(vec3(-0.35, 0.55, 0.75))), 0.0), 1.8);
        // Tek bir kas, damar ya da kemik de vurgulanabilir (explode görünüm)
        float sHov = vStruct > 0.5 && abs(vStruct - uHoverStruct) < 0.5 ? 1.0 : 0.0;
        float sSel = vStruct > 0.5 && abs(vStruct - uSelectStruct) < 0.5 ? 1.0 : 0.0;
        float act = max(max(hov * 0.7, sel), max(sHov * 0.8, sSel));
        float a = uFill + light * uLight + fres * uRim + grid * uGridAmt * (1.0 + act * 1.8) + sweep * 0.3 + act * (0.12 + fres * 0.4);
        vec3 col = base * a + vec3(0.85, 0.97, 1.0) * (pow(fres, 3.0) * 0.35 * uRim + act * grid * uGridAmt * 1.5);
        /*
         * Seçilen bölge (hologram görünümü): rengi parlak su yeşili-beyaza döner, dolgusu kalınlaşır ve yavaşça nabız gibi atar;
         * diğer bölgeler sönükleşir. Böylece hangi bölgenin açık olduğu ilk bakışta görülür.
         */
        float pulse = 0.82 + 0.18 * sin(uTime * 3.2);
        vec3 hot = mix(base, vec3(0.72, 1.0, 0.95), 0.6);
        float selA = sel * (0.32 + fres * 0.55 + grid * 0.6) * pulse;
        col = mix(col, hot * (a + selA), sel * 0.7) + hot * selA * 0.6;
        a += selA;
        float dim = 1.0 - 0.5 * uAnySel * (1.0 - sel);
        col *= dim;
        a *= dim;
        gl_FragColor = vec4(col * uAlpha, a * uAlpha);
      }
    `,
    uniforms: {
      uAnySel: { value: 0 },
      uRegionColor: { value: Array.from({ length: 8 }, () => new THREE.Color('#5fd3ff')) },
      uHover: { value: new Array(8).fill(0) },
      uSelect: { value: new Array(8).fill(0) },
      uTime: { value: 0 },
      uGrid: { value: 0.04 },
      uFill: { value: opts.fill },
      uLight: { value: opts.light },
      uRim: { value: opts.rim },
      uGridAmt: { value: opts.grid },
      uAlpha: { value: 1 },
      uHoverStruct: { value: -1 },
      uSelectStruct: { value: -1 },
    },
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    blending: THREE.AdditiveBlending,
  })
}

/**
 * Gerçekçi görünüm malzemesi: ışığa tepki veren fiziksel tabanlı malzeme.
 * Renk her köşe noktasında (vertex color) yapı türüne göre verilir.
 * Seçilen yapı (aStruct) katmanın renginden belirgin biçimde ayrılan vurgu rengine boyanır ve yavaşça parlar;
 * üzerine gelinen yapı aynı renge hafifçe döner.
 * Birden çok yapı birlikte seçilebilir (rahatsızlık bildirme): uSelectMask dokusunda her yapı numarasının bir pikseli
 * vardır, 255 ise o yapı seçilidir. Yapı numaraları SELECT_MASK_SIZE'dan küçüktür.
 */
export const SELECT_MASK_SIZE = 1024

export function createRealMaterial(roughness: number, pick: THREE.ColorRepresentation) {
  const mask = new THREE.DataTexture(new Uint8Array(SELECT_MASK_SIZE), SELECT_MASK_SIZE, 1, THREE.RedFormat, THREE.UnsignedByteType)
  mask.needsUpdate = true
  const uniforms = {
    uHoverStruct: { value: -1 },
    uSelectStruct: { value: -1 },
    uPick: { value: new THREE.Color(pick) },
    uTime: { value: 0 },
    uSelectMask: { value: mask },
  }
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side: THREE.DoubleSide })
  m.userData.uniforms = uniforms
  // Çoklu seçimin verisi: yapı numarası → 255 (seçili) ya da 0; değiştirince uSelectMask.value.needsUpdate = true
  m.userData.selectMask = mask.image.data
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aStruct;\nflat varying float vStruct;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStruct = aStruct;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uHoverStruct;\nuniform float uSelectStruct;\nuniform vec3 uPick;\nuniform float uTime;\nuniform sampler2D uSelectMask;\nflat varying float vStruct;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float sH = vStruct > 0.5 && abs(vStruct - uHoverStruct) < 0.5 ? 1.0 : 0.0;
        int structIndex = int(vStruct + 0.5);
        float sM = structIndex > 0 && structIndex < ${SELECT_MASK_SIZE} ? texelFetch(uSelectMask, ivec2(structIndex, 0), 0).r : 0.0;
        float sS = max(vStruct > 0.5 && abs(vStruct - uSelectStruct) < 0.5 ? 1.0 : 0.0, sM);
        diffuseColor.rgb = mix(diffuseColor.rgb, uPick, max(sS * 0.85, sH * 0.4));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uPick * (sS * (0.3 + 0.16 * sin(uTime * 3.4)) + sH * 0.1);`,
      )
  }
  return m
}

import * as THREE from 'three';

/**
 * Universal procedural PBR texture generators
 * Uses HTMLCanvasElement CanvasTexture in browser environments for complete
 * Three.js GLTFExporter compatibility, with DataTexture fallback.
 */

function dataToTexture(data: Uint8ClampedArray, width: number, height: number): THREE.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imgData = ctx.createImageData(width, height);
      imgData.data.set(data);
      ctx.putImageData(imgData, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Generates an Anime Eye Iris texture (Blue gradient with radial striations and specular star)
 */
export function createIrisTexture(size = 256): THREE.Texture {
  const data = new Uint8ClampedArray(size * size * 4);
  const center = size / 2;
  const radius = size * 0.46;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      if (dist > radius) {
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
        continue;
      }

      const normDist = dist / radius; // 0 at center, 1 at edge
      const limbal = Math.pow(normDist, 3.5);
      const pupil = normDist < 0.28 ? 1.0 : Math.max(0, 1 - (normDist - 0.28) * 8);
      const striations = 0.5 + 0.5 * Math.sin(angle * 28 + Math.sin(normDist * 14) * 2);

      const yFactor = (y / size);
      const rBase = Math.floor(25 + 30 * yFactor + 40 * striations * (1 - pupil));
      const gBase = Math.floor(60 + 130 * yFactor + 50 * striations * (1 - pupil));
      const bBase = Math.floor(180 + 75 * yFactor);

      let r = rBase;
      let g = gBase;
      let b = bBase;

      if (pupil > 0) {
        r = Math.floor(r * (1 - pupil * 0.92));
        g = Math.floor(g * (1 - pupil * 0.92));
        b = Math.floor(b * (1 - pupil * 0.85));
      }
      r = Math.floor(r * (1 - limbal * 0.75));
      g = Math.floor(g * (1 - limbal * 0.75));
      b = Math.floor(b * (1 - limbal * 0.55));

      const specDx = x - (center + radius * 0.3);
      const specDy = y - (center - radius * 0.32);
      const specDist = Math.sqrt(specDx * specDx + specDy * specDy);
      if (specDist < radius * 0.2) {
        const spec = Math.pow(1 - specDist / (radius * 0.2), 2);
        r = Math.min(255, r + Math.floor(spec * 240));
        g = Math.min(255, g + Math.floor(spec * 240));
        b = Math.min(255, b + Math.floor(spec * 255));
      }

      const spec2Dx = x - (center - radius * 0.28);
      const spec2Dy = y - (center + radius * 0.28);
      const spec2Dist = Math.sqrt(spec2Dx * spec2Dx + spec2Dy * spec2Dy);
      if (spec2Dist < radius * 0.1) {
        const spec2 = Math.pow(1 - spec2Dist / (radius * 0.1), 2);
        r = Math.min(255, r + Math.floor(spec2 * 200));
        g = Math.min(255, g + Math.floor(spec2 * 220));
        b = Math.min(255, b + Math.floor(spec2 * 255));
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  return dataToTexture(data, size, size);
}

/**
 * Generates Hoodie Fabric with Bear Silhouette Chest Icon and PBR Micro-Fleece Bump
 */
export function createHoodieTexture(size = 512): { albedo: THREE.Texture; normal: THREE.Texture } {
  const albedoData = new Uint8ClampedArray(size * size * 4);
  const normalData = new Uint8ClampedArray(size * size * 4);

  const cx = size * 0.5;
  const cy = size * 0.42;
  const bearSize = size * 0.12;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      let r = 249;
      let g = 197;
      let b = 209;

      if (y > size * 0.62 && y < size * 0.88 && Math.abs(x - cx) < size * 0.38) {
        r = Math.floor(r * 0.96);
        g = Math.floor(g * 0.95);
        b = Math.floor(g * 0.96);
      }

      const headDx = x - cx;
      const headDy = y - cy;
      const headDist = Math.sqrt(headDx * headDx + headDy * headDy);

      const earLeftDx = x - (cx - bearSize * 0.68);
      const earLeftDy = y - (cy - bearSize * 0.68);
      const earLeftDist = Math.sqrt(earLeftDx * earLeftDx + earLeftDy * earLeftDy);

      const earRightDx = x - (cx + bearSize * 0.68);
      const earRightDy = y - (cy - bearSize * 0.68);
      const earRightDist = Math.sqrt(earRightDx * earRightDx + earRightDy * earRightDy);

      const inBear = headDist < bearSize || earLeftDist < bearSize * 0.42 || earRightDist < bearSize * 0.42;

      if (inBear) {
        r = 255;
        g = 255;
        b = 255;
      }

      albedoData[idx] = r;
      albedoData[idx + 1] = g;
      albedoData[idx + 2] = b;
      albedoData[idx + 3] = 255;

      const twill = Math.sin(x * 1.5 + y * 1.5) * 8;
      const nx = 128 + Math.floor(twill);
      const ny = 128 + Math.floor(twill * 0.5);
      const nz = 255;

      normalData[idx] = nx;
      normalData[idx + 1] = ny;
      normalData[idx + 2] = nz;
      normalData[idx + 3] = 255;
    }
  }

  const albedo = dataToTexture(albedoData, size, size);
  const normal = dataToTexture(normalData, size, size);
  return { albedo, normal };
}

/**
 * Generates Thigh-High Athletic Sock Texture with Dual Pink Horizontal Stripes
 */
export function createSocksTexture(width = 256, height = 512): THREE.Texture {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const normY = y / height;
    const inStripe1 = normY > 0.08 && normY < 0.14;
    const inStripe2 = normY > 0.17 && normY < 0.23;

    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;

      if (inStripe1 || inStripe2) {
        data[idx] = 244;
        data[idx + 1] = 114;
        data[idx + 2] = 182;
      } else {
        data[idx] = 250;
        data[idx + 1] = 250;
        data[idx + 2] = 250;
      }
      data[idx + 3] = 255;
    }
  }

  return dataToTexture(data, width, height);
}

/**
 * Generates Facial Skin Texture with Subsurface Peach Tint & Soft Cheek Blush
 */
export function createSkinTexture(size = 512): THREE.Texture {
  const data = new Uint8ClampedArray(size * size * 4);
  const cx = size * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      let r = 255;
      let g = 232;
      let b = 225;

      const leftCheekDx = x - (cx - size * 0.25);
      const leftCheekDy = y - size * 0.52;
      const leftCheekDist = Math.sqrt(leftCheekDx * leftCheekDx + leftCheekDy * leftCheekDy);

      const rightCheekDx = x - (cx + size * 0.25);
      const rightCheekDy = y - size * 0.52;
      const rightCheekDist = Math.sqrt(rightCheekDx * rightCheekDx + rightCheekDy * rightCheekDy);

      const blushRadius = size * 0.14;
      const blush = Math.max(
        Math.max(0, 1 - leftCheekDist / blushRadius),
        Math.max(0, 1 - rightCheekDist / blushRadius)
      );

      if (blush > 0) {
        const blushFactor = Math.pow(blush, 1.8) * 0.45;
        r = Math.min(255, Math.floor(r * (1 - blushFactor) + 255 * blushFactor));
        g = Math.floor(g * (1 - blushFactor) + 153 * blushFactor);
        b = Math.floor(b * (1 - blushFactor) + 179 * blushFactor);
      }

      const lipDx = x - cx;
      const lipDy = y - size * 0.72;
      const lipDist = Math.sqrt((lipDx * 0.8) * (lipDx * 0.8) + (lipDy * 2.2) * (lipDy * 2.2));
      if (lipDist < size * 0.08) {
        const lipFactor = Math.pow(1 - lipDist / (size * 0.08), 2) * 0.5;
        r = Math.min(255, Math.floor(r * (1 - lipFactor) + 245 * lipFactor));
        g = Math.floor(g * (1 - lipFactor) + 130 * lipFactor);
        b = Math.floor(b * (1 - lipFactor) + 145 * lipFactor);
      }

      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  return dataToTexture(data, size, size);
}

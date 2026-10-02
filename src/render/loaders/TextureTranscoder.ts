import * as THREE from "three";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import basisScriptUrl from "three/examples/jsm/libs/basis/basis_transcoder.js?url";
import basisWasmUrl from "three/examples/jsm/libs/basis/basis_transcoder.wasm?url";

export interface TextureLease {
  readonly ktx2Loader: KTX2Loader;
  loadAsync(url: string): Promise<THREE.Texture>;
  dispose(): void;
}

interface TexturePool {
  loader: KTX2Loader;
  raster: THREE.TextureLoader;
  leases: number;
  requests: number;
  initialized: boolean;
  initializing: boolean;
  disposed: boolean;
}

let sharedPool: TexturePool | null = null;

function releaseIdlePool(pool: TexturePool): void {
  if (pool.disposed || pool.leases > 0 || pool.requests > 0 || pool.initializing) return;
  pool.disposed = true;
  // Native dispose decrements its active-loader count even when init never ran.
  // Before init, there are no workers or object URLs to release.
  if (pool.initialized) pool.loader.dispose();
  if (sharedPool === pool) sharedPool = null;
}

function createPool(renderer: THREE.WebGLRenderer): TexturePool {
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (url.endsWith("basis_transcoder.js")) return basisScriptUrl;
    if (url.endsWith("basis_transcoder.wasm")) return basisWasmUrl;
    return url;
  });
  const loader = new KTX2Loader(manager).setTranscoderPath("/neva-basis/")
    .setWorkerLimit(2).detectSupport(renderer);
  const pool: TexturePool = {
    loader, raster: new THREE.TextureLoader(), leases: 0, requests: 0,
    initialized: false, initializing: false, disposed: false
  };
  const nativeInit = loader.init.bind(loader);
  loader.init = () => {
    pool.initialized = true;
    pool.initializing = true;
    return nativeInit().finally(() => {
      pool.initializing = false;
      releaseIdlePool(pool);
    });
  };
  const nativeLoad = loader.load.bind(loader);
  loader.load = (url, onLoad, onProgress, onError) => {
    if (pool.disposed || pool.leases === 0) {
      onError?.(new DOMException("Texture owner disposed", "AbortError"));
      return undefined;
    }
    pool.requests++;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      pool.requests--;
      releaseIdlePool(pool);
    };
    const fail = (error: unknown): void => {
      try { onError?.(error); } finally { finish(); }
    };
    try {
      return nativeLoad(url, texture => {
        try { onLoad?.(texture); } finally { finish(); }
      }, onProgress, fail);
    } catch (error) {
      fail(error);
      return undefined;
    }
  };
  return pool;
}

/** World, Art Yard and character previews share one bounded WebGL transcoder. */
export function acquireTextureTranscoder(renderer: THREE.WebGLRenderer): TextureLease {
  const pool = sharedPool ??= createPool(renderer);
  pool.leases++;
  let disposed = false;
  return {
    ktx2Loader: pool.loader,
    async loadAsync(url) {
      if (disposed) throw new DOMException("Texture owner disposed", "AbortError");
      const texture = await (/\.ktx2(?:$|[?#])/i.test(url) ? pool.loader : pool.raster).loadAsync(url);
      if (disposed) {
        texture.dispose();
        throw new DOMException("Texture owner disposed", "AbortError");
      }
      return texture;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pool.leases--;
      releaseIdlePool(pool);
    }
  };
}

import crypto from 'isomorphic-webcrypto';

export function randomStr(): string {
  return Math.floor(Math.random() * Date.now()).toString(36);
}

export function arrayBufferTobase64(ab: ArrayBuffer): string {
  return btoa(String.fromCharCode.apply(null, new Uint8Array(ab)));
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

export function extractAddrFromPath(path: string): string {
  return path.split('>').slice(-1)[0];
}

export function extractSpacePath(path: string): string {
  return path.split('>').slice(0, -1).join('>');
}

export function joinPath(path: string | string[], target: string = ''): string {
  const pathSegs: string[] = Array.isArray(path) ? path : [path];
  return [ ...pathSegs, target ].filter(seg => seg.length > 0).join('>');
}

export async function calcAddrOrSubSpaceHash(addrOrSubSpace: string): Promise<Uint32Array> {
  const hash = await crypto.subtle.digest('SHA-512', (new TextEncoder()).encode(addrOrSubSpace));
  return new Uint32Array(hash);
}

export function formatFirstUint32Hex(data: Uint32Array) {
  return '0x' + ('00000000' + data[0].toString(16)).slice(-8);
}

export function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return newArray;
}

export function wait(timeout: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, timeout);
  });
}

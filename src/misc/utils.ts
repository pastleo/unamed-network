
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

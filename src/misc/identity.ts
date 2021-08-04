import crypto from 'isomorphic-webcrypto';
import { arrayBufferTobase64, base64ToArrayBuffer, extractAddrFromPath } from './utils';

declare namespace Identity {
  interface Config {
    myAddr?: string;
    signingKeyPair?: CryptoKeyPair;
    encryptionKeyPair?: CryptoKeyPair;
    [opt: string]: any;
  }

  interface Signature {
    random: string;
    sign: string;
  }
}

const SIGNING_KEY_OPTS = {
  name: "ECDSA",
  namedCurve: "P-384"
};
const SIGNING_ALGORITHM_OPTS = {
  name: "ECDSA",
  hash: { name: "SHA-384" },
}
const ENCRYPTION_KEY_OPTS = {
  name: "RSA-OAEP",
  modulusLength: 4096,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256"
};

class Identity {
  addr: string;
  exportedSigningPubKey: string;
  expoertedEncryptionPubKey: string;

  private signingKeyPair: CryptoKeyPair;
  private encryptionKeyPair: CryptoKeyPair;

  private exportedSigningPubKeyRaw: ArrayBuffer;
  private expoertedEncryptionPubKeyRaw: ArrayBuffer;

  constructor(config: Partial<Identity.Config> = {}) {
    if (config.myAddr) this.addr = config.myAddr;
    if (config.encryptionKeyPair) this.encryptionKeyPair = config.encryptionKeyPair;
    if (config.signingKeyPair) this.signingKeyPair = config.signingKeyPair;
  }

  async generateIfNeeded(): Promise<void> {
    if (!this.signingKeyPair) {
      this.signingKeyPair = await crypto.subtle.generateKey(
        SIGNING_KEY_OPTS,
        true,
        ["sign", "verify"],
      );
    }

    if (!this.encryptionKeyPair) {
      this.encryptionKeyPair = await crypto.subtle.generateKey(
        ENCRYPTION_KEY_OPTS,
        true,
        ["encrypt", "decrypt"],
      );
    }

    this.exportedSigningPubKeyRaw = await crypto.subtle.exportKey('raw', this.signingKeyPair.publicKey);
    this.expoertedEncryptionPubKeyRaw = await crypto.subtle.exportKey('spki', this.encryptionKeyPair.publicKey);
    this.exportedSigningPubKey = arrayBufferTobase64(this.exportedSigningPubKeyRaw);
    this.expoertedEncryptionPubKey = arrayBufferTobase64(this.expoertedEncryptionPubKeyRaw);

    if (!this.addr) {
      const pubKeyHash = await calcUnnamedAddr(
        this.exportedSigningPubKeyRaw,
        this.expoertedEncryptionPubKeyRaw,
      );
      this.addr = `#${arrayBufferTobase64(pubKeyHash)}`;
    }
  }

  async signature(): Promise<Identity.Signature> {
    const random = new Uint8Array(32);
    crypto.getRandomValues(random);
    const signature = await crypto.subtle.sign(
      SIGNING_ALGORITHM_OPTS,
      this.signingKeyPair.privateKey,
      calcDataToBeSigned(this.expoertedEncryptionPubKeyRaw, random),
    );

    return {
      random: arrayBufferTobase64(random),
      sign: arrayBufferTobase64(signature),
    };
  }
}

export default Identity;

export class PeerIdentity {
  addr: string;
  private signingPubKey: ArrayBuffer;
  private encryptionPubKey: ArrayBuffer;

  constructor(peerPath: string, peerSigningPubKeyBase64?: string, peerEncryptionPubKeyBase64?: string) {
    this.addr = extractAddrFromPath(peerPath);
    if (peerSigningPubKeyBase64) {
      this.setSigningPubKey(peerSigningPubKeyBase64);
    }
    if (peerEncryptionPubKeyBase64) {
      this.setEncryptionPubKey(peerEncryptionPubKeyBase64);
    }
  }

  setSigningPubKey(peerSigningPubKeyBase64: string) {
    this.signingPubKey = base64ToArrayBuffer(peerSigningPubKeyBase64);
  }
  setEncryptionPubKey(peerEncryptionPubKeyBase64: string) {
    this.encryptionPubKey = base64ToArrayBuffer(peerEncryptionPubKeyBase64);
  }

  async verify(signature: Identity.Signature): Promise<boolean> {
    if (this.addr.match(/^#/)) {
      const hashAddrVerified = await this.verifyUnnamedAddr();

      if (!hashAddrVerified) return false;
    }

    const signatureVerified = await this.verifySignature(signature);
    return signatureVerified;
  }

  async verifyUnnamedAddr(): Promise<boolean> {
    const pubKeyHash = await calcUnnamedAddr(this.signingPubKey, this.encryptionPubKey);
    return arrayBufferTobase64(pubKeyHash) === this.addr.slice(1);
  }

  async verifySignature(signature: Identity.Signature): Promise<boolean> {
    const peerSigningPubKey = await crypto.subtle.importKey(
      'raw', this.signingPubKey, SIGNING_KEY_OPTS, false, ['verify'],
    );

    const dataBeforeSigning = calcDataToBeSigned(
      this.encryptionPubKey, base64ToArrayBuffer(signature.random),
    );

    return crypto.subtle.verify(
      SIGNING_ALGORITHM_OPTS,
      peerSigningPubKey,
      base64ToArrayBuffer(signature.sign),
      dataBeforeSigning,
    );
  }
}

function calcUnnamedAddr(signingPubKey: ArrayBuffer, encryptionPubKey: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-512', concatArrayBuffer(signingPubKey, encryptionPubKey));
}

function calcDataToBeSigned(encryptionPubKey: ArrayBuffer, random: ArrayBuffer): ArrayBuffer {
  return concatArrayBuffer(encryptionPubKey, random);
}

function concatArrayBuffer(ab1: ArrayBuffer, ab2: ArrayBuffer): ArrayBuffer {
  const newArr = new Uint8Array(ab1.byteLength + ab2.byteLength);
  newArr.set(new Uint8Array(ab1));
  newArr.set(new Uint8Array(ab2), ab1.byteLength);
  return newArr.buffer;
}

import { Message, AnyMessage, messageAddrs } from './message';
import Identity from '../misc/identity';

export interface RequestToConnMessage extends Message {
  term: 'requestToConn'
  signingPubKey: string;
  encryptionPubKey: string;
  signature: Identity.Signature;

  offer?: RTCSessionDescription;
}
export function toRequestToConnMessage(data: AnyMessage): RequestToConnMessage {
  return data.term === 'requestToConn' && newRequestToConnMessage(data);
}
export function newRequestToConnMessage(data: AnyMessage): RequestToConnMessage {
  if (
    typeof data.signingPubKey === 'string' &&
    typeof data.encryptionPubKey === 'string' &&
    typeof data.signature.random === 'string' &&
    typeof data.signature.sign === 'string'
  ) {
    const message: RequestToConnMessage = {
      term: 'requestToConn',
      ...messageAddrs(data),
      signingPubKey: data.signingPubKey,
      encryptionPubKey: data.encryptionPubKey,
      signature: {
        random: data.signature.random,
        sign: data.signature.sign,
      },
    };

    if (typeof data.offer === 'object') {
      message.offer = data.offer as RTCSessionDescription;
    }

    return message;
  }
}

export async function makeRequestToConnMessage(myIdentity: Identity, peerPath: string, offer?: RTCSessionDescription): Promise<RequestToConnMessage> {
  return {
    term: 'requestToConn',
    srcPath: myIdentity.addr, desPath: peerPath,
    signingPubKey: myIdentity.exportedSigningPubKey,
    encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
    signature: await myIdentity.signature(),
    offer
  };
}

export interface RequestToConnResultMessage extends Message {
  term: 'requestToConnResult'
  signingPubKey: string;
  encryptionPubKey: string;
  signature: Identity.Signature;

  answer?: RTCSessionDescription;
}
export function toRequestToConnResultMessage(data: AnyMessage): RequestToConnResultMessage {
  return data.term === 'requestToConnResult' && newRequestToConnResultMessage(data);
}
export function newRequestToConnResultMessage(data: AnyMessage): RequestToConnResultMessage {
  if (
    typeof data.signingPubKey === 'string' &&
    typeof data.encryptionPubKey === 'string' &&
    typeof data.signature.random === 'string' &&
    typeof data.signature.sign === 'string'
  ) {
    const message: RequestToConnResultMessage = {
      term: 'requestToConnResult',
      ...messageAddrs(data),
      signingPubKey: data.signingPubKey,
      encryptionPubKey: data.encryptionPubKey,
      signature: {
        random: data.signature.random,
        sign: data.signature.sign,
      },
    };

    if (typeof data.answer === 'object') {
      message.answer = data.answer as RTCSessionDescription;
    }

    return message;
  }
}

export async function makeRequestToConnResultMessage(myIdentity: Identity, peerPath: string, answer?: RTCSessionDescription): Promise<RequestToConnResultMessage> {
  return {
    term: 'requestToConnResult',
    srcPath: myIdentity.addr, desPath: peerPath,
    signingPubKey: myIdentity.exportedSigningPubKey,
    encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
    signature: await myIdentity.signature(),
    answer,
  };
}

export interface RtcIceMessage extends Message {
  term: 'rtcIce';
  ice: RTCIceCandidate;
}
export function toRtcIceMessage(data: AnyMessage): RtcIceMessage {
  return data.term === 'rtcIce' && newRtcIceMessage(data);
}
export function newRtcIceMessage(data: AnyMessage): RtcIceMessage {
  if (
    typeof data.ice === 'object'
  ) {
    return {
      term: 'rtcIce',
      ...messageAddrs(data),
      ice: data.ice as RTCIceCandidate,
    };
  }
}
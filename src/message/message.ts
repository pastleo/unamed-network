import Identity from '../misc/identity';
import { randomStr } from '../misc/utils';

export interface Message {
  term: string;
  srcPath: string;
  desPath: string;
}
export type MessageData = Omit<Message, 'srcPath' | 'desPath'> & { [_: string]: any };

type MessageAddrs = Pick<Message, 'srcPath' | 'desPath'>;
type AnyMessage = Message & { [_: string]: any }

export function toMessage(data: any): Message {
  if (
    typeof data.term === 'string' &&
    typeof data.srcPath === 'string' &&
    typeof data.desPath === 'string'
  ) {
    return data
  }
}

function messageAddrs(data: AnyMessage): MessageAddrs {
  return { srcPath: data.srcPath, desPath: data.desPath };
}

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

export interface NetworkMessage extends Message {
  ttl: number;
  msgId: string;
}
export function deriveNetworkMessage(message: Message, initTtl: number = 10): NetworkMessage {
  const { ttl, msgId } = message as NetworkMessage;
  return {
    ...message,
    ttl: (ttl ?? initTtl) - 1,
    msgId: msgId ?? randomStr(),
  }
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

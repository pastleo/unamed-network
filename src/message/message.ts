import Identity from '../misc/identity';

export interface Message {
  term: string;
  srcAddr: string;
  desAddr: string;
}
type MessageAddrs = Pick<Message, 'srcAddr' | 'desAddr'>;
type MessageData = Message & { [_: string]: any }

export function toMessage(data: any): Message {
  if (
    typeof data.term === 'string' &&
    typeof data.srcAddr === 'string' &&
    typeof data.desAddr === 'string'
  ) {
    return data
  }
}

function messageAddrs(data: MessageData): MessageAddrs {
  return { srcAddr: data.srcAddr, desAddr: data.desAddr };
}

export interface RequestToConnMessage extends Message {
  term: 'requestToConn'
  signingPubKey: string;
  encryptionPubKey: string;
  signature: Identity.Signature;

  offer?: RTCSessionDescription;
}
export function toRequestToConnMessage(data: MessageData): RequestToConnMessage {
  return data.term === 'requestToConn' && newRequestToConnMessage(data);
}
export function newRequestToConnMessage(data: MessageData): RequestToConnMessage {
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
export function toRequestToConnResultMessage(data: MessageData): RequestToConnResultMessage {
  return data.term === 'requestToConnResult' && newRequestToConnResultMessage(data);
}
export function newRequestToConnResultMessage(data: MessageData): RequestToConnResultMessage {
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

export interface RtcIceMessage extends Message {
  term: 'rtcIce';
  ice: RTCIceCandidate;
}
export function toRtcIceMessage(data: MessageData): RtcIceMessage {
  return data.term === 'rtcIce' && newRtcIceMessage(data);
}
export function newRtcIceMessage(data: MessageData): RtcIceMessage {
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

export interface PingMessage extends Message {
  term: 'ping'
  timestamp: number
}
export function toPingMessage(data: MessageData): PingMessage {
  return data.term === 'ping' && newPingMessage(data);
}
export function newPingMessage(data: MessageData): PingMessage {
  if (
    typeof data.timestamp === 'number'
  ) {
    return {
      term: 'ping',
      ...messageAddrs(data),
      timestamp: data.timestamp,
    };
  }
}

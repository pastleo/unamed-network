import Identity from './identity';

export interface Message {
  term: string;
  // srcAddr
  // desAddr
}

export function toMessage(data: any): Message {
  if (typeof data.term === 'string') {
    return data
  }
}

export interface RequestToConnMessage extends Message {
  term: 'requestToConn'
  signingPubKey: string;
  encryptionPubKey: string;
  signature: Identity.Signature;

  myAddr: string; // -> srcAddr
  peerAddr: string; // -> desAddr
  offer?: RTCSessionDescription;
}
export function toRequestToConnMessage(data: any): RequestToConnMessage {
  return data.term === 'requestToConn' && newRequestToConnMessage(data);
}
export function newRequestToConnMessage(data: any): RequestToConnMessage {
  if (
    typeof data.signingPubKey === 'string' &&
    typeof data.encryptionPubKey === 'string' &&
    typeof data.signature.random === 'string' &&
    typeof data.signature.sign === 'string' &&
    typeof data.myAddr === 'string' &&
    typeof data.peerAddr === 'string'
  ) {
    const message: RequestToConnMessage = {
      term: 'requestToConn',
      signingPubKey: data.signingPubKey,
      encryptionPubKey: data.encryptionPubKey,
      signature: {
        random: data.signature.random,
        sign: data.signature.sign,
      },

      myAddr: data.myAddr,
      peerAddr: data.peerAddr,
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

  myAddr: string;
  peerAddr: string;
  ok: boolean;
  answer?: RTCSessionDescription;
}
export function toRequestToConnResultMessage(data: any): RequestToConnResultMessage {
  return data.term === 'requestToConnResult' && newRequestToConnResultMessage(data);
}
export function newRequestToConnResultMessage(data: any): RequestToConnResultMessage {
  if (
    typeof data.signingPubKey === 'string' &&
    typeof data.encryptionPubKey === 'string' &&
    typeof data.signature.random === 'string' &&
    typeof data.signature.sign === 'string' &&
    typeof data.ok === 'boolean' &&
    typeof data.myAddr === 'string' &&
    typeof data.peerAddr === 'string'
  ) {
    const message: RequestToConnResultMessage = {
      term: 'requestToConnResult',
      signingPubKey: data.signingPubKey,
      encryptionPubKey: data.encryptionPubKey,
      signature: {
        random: data.signature.random,
        sign: data.signature.sign,
      },

      myAddr: data.myAddr,
      peerAddr: data.peerAddr,
      ok: data.ok,
    };

    if (typeof data.answer === 'object') {
      message.answer = data.answer as RTCSessionDescription;
    }

    return message;
  }
}

export interface RtcIceMessage extends Message {
  term: 'rtcIce';
  myAddr: string;
  peerAddr: string;
  ice: RTCIceCandidate;
  timestamp?: number;
}
export function toRtcIceMessage(data: any): RtcIceMessage {
  return data.term === 'rtcIce' && newRtcIceMessage(data);
}
export function newRtcIceMessage(data: any): RtcIceMessage {
  if (
    typeof data.myAddr === 'string' &&
    typeof data.peerAddr === 'string' &&
    typeof data.ice === 'object'
  ) {
    return {
      term: 'rtcIce',
      myAddr: data.myAddr,
      peerAddr: data.peerAddr,
      ice: data.ice as RTCIceCandidate,
    };
  }
}

export interface PingMessage extends Message {
  term: 'ping'
  timestamp: number
}
export function toPingMessage(data: any): PingMessage {
  return data.term === 'ping' && newPingMessage(data);
}
export function newPingMessage(data: any): PingMessage {
  if (
    typeof data.timestamp === 'number'
  ) {
    return { term: 'ping', timestamp: data.timestamp };
  }
}

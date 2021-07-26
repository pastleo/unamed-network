export interface Message {
  term: string;
}

export function toMessage(data: any): Message {
  if (typeof data.term === 'string') {
    return data
  }
}

export interface RequestToConnMessage extends Message {
  term: 'requestToConn'
  myAddr: string;
  peerAddr: string;
  connId: string;
  offer?: RTCSessionDescription;
}
export function toRequestToConnMessage(data: any): RequestToConnMessage {
  return data.term === 'requestToConn' && newRequestToConnMessage(data);
}
export function newRequestToConnMessage(data: any): RequestToConnMessage {
  if (
    typeof data.myAddr === 'string' &&
    typeof data.peerAddr === 'string' &&
    typeof data.connId === 'string'
  ) {
    const message: RequestToConnMessage = {
      term: 'requestToConn',
      myAddr: data.myAddr,
      peerAddr: data.peerAddr,
      connId: data.connId,
    };

    if (typeof data.offer === 'object') {
      message.offer = data.offer as RTCSessionDescription;
    }

    return message;
  }
}

export interface RequestToConnResultMessage extends Message {
  term: 'requestToConnResult'
  myAddr: string;
  peerAddr: string;
  connId: string;
  ok: boolean;
  answer?: RTCSessionDescription;
}
export function toRequestToConnResultMessage(data: any): RequestToConnResultMessage {
  return data.term === 'requestToConnResult' && newRequestToConnResultMessage(data);
}
export function newRequestToConnResultMessage(data: any): RequestToConnResultMessage {
  if (
    typeof data.ok === 'boolean' &&
    typeof data.myAddr === 'string' &&
    typeof data.peerAddr === 'string' &&
    typeof data.connId === 'string'
  ) {
    const message: RequestToConnResultMessage = {
      term: 'requestToConnResult',
      myAddr: data.myAddr,
      peerAddr: data.peerAddr,
      connId: data.connId,
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
  connId: string;
  ice: RTCIceCandidate;
}
export function toRtcIceMessage(data: any): RtcIceMessage {
  return data.term === 'rtcIce' && newRtcIceMessage(data);
}
export function newRtcIceMessage(data: any): RtcIceMessage {
  if (
    typeof data.myAddr === 'string' &&
    typeof data.peerAddr === 'string' &&
    typeof data.connId === 'string' &&
    typeof data.ice === 'object'
  ) {
    return {
      term: 'rtcIce',
      myAddr: data.myAddr,
      peerAddr: data.peerAddr,
      connId: data.connId,
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

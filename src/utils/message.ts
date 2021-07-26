export interface Message {
  term: string;
}

export function toMessage(data: any): Message {
  if (typeof data.term === 'string') {
    return data
  }
}

/*
  connReqRelay: 'connReqRelay',
  connAcceptRelay: 'connAcceptRelay',
  rtcIce: 'rtcIce',
  rtcIceRelay: 'rtcIceRelay',
  connRejectRelay: 'connRejectRelay',
*/

export interface RequestToConnMessage extends Message {
  term: 'requestToConn'
  addr: string;
}
export function toRequestToConnMessage(data: any): RequestToConnMessage {
  if (typeof data.addr === 'string') {
    return { term: 'requestToConn', addr: data.addr };
  }
}

export interface RequestToConnResultMessage extends Message {
  term: 'requestToConnResult'
  ok: boolean;
}
export function toRequestToConnResultMessage(data: any): RequestToConnResultMessage {
  if (typeof data.ok === 'boolean') {
    return { term: 'requestToConnResult', ok: data.ok };
  }
}

export interface PingMessage extends Message {
  term: 'ping'
  timestamp: number
}
export function toPingMessage(data: any): PingMessage {
  if (typeof data.timestamp === 'number') {
    return { term: 'ping', timestamp: data.timestamp };
  }
}

export interface RequestToConnMessage {
  addr: string;
}

export function toRequestToConnMessage(data: any): RequestToConnMessage {
  if (typeof data.addr === 'string') {
    return { addr: data.addr };
  }
}

export interface RequestToConnResultMessage {
  ok: boolean;
}
export function toRequestToConnResultMessage(data: any): RequestToConnResultMessage {
  if (typeof data.ok === 'boolean') {
    return { ok: data.ok };
  }
}

export interface Message {
  term: string;
  payload: object;
}

export function toMessage(data: any): Message {
  if (typeof data.term === 'string' && typeof data.payload === 'object') {
    return { term: data.term, payload: data.payload };
  }
}

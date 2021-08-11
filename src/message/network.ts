import { Message, AnyMessage, toMessage } from './message';
import { randomStr } from '../misc/utils';

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

export interface PingMessage {
  term: 'ping'
  timestamp: number
}

export interface QueryAddrsMessageData {
  term: 'query-addrs'
  spacePath: string; // maybe we don't need this, desPath has this
}
export type QueryAddrsMessage = QueryAddrsMessageData & Message;
export function deriveQueryAddrsMessage(data: AnyMessage): QueryAddrsMessage {
  if (typeof data.spacePath === 'string') {
    return {
      ...toMessage(data),
      term: 'query-addrs',
      spacePath: data.spacePath,
    };
  }
}

export interface QueryAddrsResponseMessageData {
  term: 'query-addrs-response'
  addrs: string[];
}
export type QueryAddrsResponseMessage = QueryAddrsResponseMessageData & Message;
export function deriveQueryAddrsResponseMessage(data: AnyMessage): QueryAddrsResponseMessage {
  if (Array.isArray(data.addrs)) {
    return {
      ...toMessage(data),
      term: 'query-addrs-response',
      addrs: data.addrs,
    };
  }
}

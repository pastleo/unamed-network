import { Message } from './message';
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

export interface FindNodeMessage {
  term: 'find-node'
}

export interface FindNodeResponseMessage {
  term: 'find-node-response'
}

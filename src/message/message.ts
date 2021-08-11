export interface Message {
  term: string;
  srcPath: string;
  desPath: string;
}
export type MessageData = Omit<Message, 'srcPath' | 'desPath'> & { [_: string]: any };

type MessageAddrs = Pick<Message, 'srcPath' | 'desPath'>;
export type AnyMessage = Message & { [_: string]: any }

export function toMessage(data: any): Message {
  if (
    typeof data.term === 'string' &&
    typeof data.srcPath === 'string' &&
    typeof data.desPath === 'string'
  ) {
    return data
  }
}

export function messageAddrs(data: AnyMessage): MessageAddrs {
  return { srcPath: data.srcPath, desPath: data.desPath };
}

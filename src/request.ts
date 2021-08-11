import Agent from './agent';
import EventTarget from './misc/event-target';
import { Message as OriMessage, MessageData as OriMessageData } from './message/message';
import { NetworkMessageReceivedEvent } from './misc/events';
import { randomStr } from './misc/utils';

declare namespace Request {
  export const enum Direction { Request = 'request', Response = 'response' }
  interface MessageFields {
    requestId: string;
    direction: Direction;
  }
  type Message = OriMessage & MessageFields;
  type MessageData = OriMessageData & MessageFields;

  interface ManagerConfig {
    timeout: number;
  }

  type ResolveFn = (message: Request.Message) => {};
  type requestId = string;
  type RequestIdToThroughs = Record<requestId, [path: string, peerAddr: string]>;
}

export class RequestedEvent extends NetworkMessageReceivedEvent {
  type = 'requested'
  responseData?: Promise<OriMessageData>;

  response(message: OriMessageData | Promise<OriMessageData>) {
    this.responseData = (async () => await message)();
  }
}

interface EventMap {
  'requested': RequestedEvent;
}

const DEFAULT_CONFIG: Request.ManagerConfig = {
  timeout: 1000,
};

class RequestManager extends EventTarget<EventMap> {
  private agent: Agent;
  private config: Request.ManagerConfig;
  private requests: Record<string, Request> = {};

  private requestIdToThroughs: Request.RequestIdToThroughs = {};

  constructor(agent: Agent, config: Partial<Request.ManagerConfig> = {}) {
    super();
    this.agent = agent;
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  onReceiveNetworkMessage(event: NetworkMessageReceivedEvent): boolean {
    const message = event.detail as Request.Message;
    const { requestId, direction } = message;
    if (requestId) {
      switch (direction) {
        case Request.Direction.Request:
          return this.onReceiveRequestMessage(message, event);
        case Request.Direction.Response:
          return this.onReceiveResponseMessage(message, event);
      }
    }

    return false;
  }

  private onReceiveRequestMessage(message: Request.Message, event: NetworkMessageReceivedEvent): boolean {
    const requestedEvent = new RequestedEvent(event.messageReceivedEvent, event.exactForMe);

    this.dispatchEvent(requestedEvent);

    if (requestedEvent.responseData) {
      (async () => {
        const responseMessage: Request.MessageData = {
          ...(await requestedEvent.responseData),
          requestId: message.requestId,
          direction: Request.Direction.Response,
        };

        this.agent.send(event.detail.srcPath, responseMessage);
      })();
      return true;
    }

    return false;
  }

  private onReceiveResponseMessage(message: Request.Message, _event: NetworkMessageReceivedEvent): boolean {
    const request = this.requests[message.requestId];
    if (request) {
      request.complete(message);

      return true;
    }
    return false;
  }

  async request(desPath: string, messageContent: OriMessageData): Promise<Request> {
    const request = new Request(desPath, messageContent);
    this.requests[request.requestId] = request;
    this.agent.send(desPath, request.requestMessage);
    return request.start(this.config.timeout);
  }

  cacheReceive(fromPeerAddr: string, srcAddr: string, message: OriMessage): void {
    if (fromPeerAddr === srcAddr) return;
    const { requestId, direction } = message as Request.Message;
    if (!requestId || direction !== Request.Direction.Request) return;

    let through = this.requestIdToThroughs[requestId];
    if (!through) {
      this.requestIdToThroughs[requestId] = [message.srcPath, fromPeerAddr];
    }
  }

  route(message: OriMessage): string | null {
    const { requestId, direction } = message as Request.Message;

    if (requestId && direction === Request.Direction.Response) {
      const through = this.requestIdToThroughs[requestId];
      if (through) {
        const [desPath, peerAddr] = through;
        if (message.desPath === desPath) return peerAddr;
      }
    }
  }
}

export default RequestManager;

class Request {
  desPath: string;
  requestId: string;
  requestMessage: Request.MessageData;
  responseMessage: Request.Message;
  private resolveFn: (req: Request) => void;

  constructor(desPath: string, messageContent: OriMessageData, requestId?: string) {
    this.desPath = desPath;
    this.requestId = requestId || randomStr();
    this.requestMessage = {
      ...messageContent,
      requestId: this.requestId,
      direction: Request.Direction.Request,
    }
  }

  start(timeout: number): Promise<Request> {
    return new Promise<Request>((resolve, reject) => {
      this.resolveFn = resolve;
      setTimeout(() => {
        reject(new Error(`request.ts: request term: '${this.requestMessage.term}' from '${this.desPath}' has timeout`));
      }, timeout);
    });
  }

  complete(message: Request.Message) {
    this.responseMessage = message;
    this.resolveFn(this);
  }
}

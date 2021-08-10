import Agent from '../agent';
import { RequestedEvent } from '../request';

export async function ping(agent: Agent, desPath: string) {
  const request = await agent.requestManager.request(desPath, {
    term: 'ping', r: 10,
  });
  console.log('ping response:', request.responseMessage);
  return request;
}

export function handleRequest(event: RequestedEvent) {
  const message = event.detail as any;
  switch (message.term) {
    case 'ping':
      console.log('requested ping', message);
      event.response({ term: 'pong', r: message.r + 1 })
      break;
  }
}

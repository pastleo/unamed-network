import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';

import { PingMessage } from '../message/network';
import { ping, handleRequest } from './share';

const connManager = new BrowserConnManager();
const agent = new Agent(connManager);
(window as any).agent = agent;

(async () => {
  // DEV monitor:
  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.conn.peerIdentity.addr);

    const pingMessage: PingMessage = {
      term: 'ping', timestamp: Date.now(),
    };
    agent.send(event.detail.conn.peerIdentity.addr, pingMessage);
  });
  agent.addEventListener('receive-network', event => {
    console.log('receive-network', event);
  });
  connManager.addEventListener('close', event => {
    console.log('close', event);
  });
  agent.requestManager.addEventListener('requested', event => {
    handleRequest(event);
  });
  // =====

  await agent.start();
  console.log('agent started', agent.myIdentity.addr);

  await agent.connect('ws://localhost:8081');
})();

(window as any).ping = (desAddr: string) => ping(agent, desAddr);

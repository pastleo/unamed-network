import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';

import { PingMessage } from '../message/message';

const connManager = new BrowserConnManager();
const agent = new Agent(connManager);
(window as any).agent = agent;

(async () => {
  // DEV monitor:
  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.conn.peerIdentity.addr);

    const message: PingMessage = {
      srcPath: connManager.myIdentity.addr,
      desPath: event.detail.conn.peerIdentity.addr,
      term: 'ping', timestamp: Date.now(),
    };
    event.detail.conn.send(message);
  });
  connManager.addEventListener('receive', event => {
    console.log('receive', event.detail);
  });
  connManager.addEventListener('close', event => {
    console.log('close', event);
  });
  // =====

  await agent.start();
  console.log('agent started', agent.connManager.myIdentity.addr);

  await connManager.connect('ws://localhost:8081', '');
})();


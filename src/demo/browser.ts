//import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';

import { PingMessage } from '../misc/message';

const connManager = new BrowserConnManager();
(window as any).cm = connManager;

(async () => {
  await connManager.start();
  console.log('connManager started', connManager.myIdentity.addr);

  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.peerAddr);

    const message: PingMessage = { term: 'ping', timestamp: Date.now() };
    event.detail.conn.send(message);
  });
  connManager.addEventListener('receive', event => {
    console.log('receive', event);
  });

  await connManager.connect('ws://localhost:8081', '');
})();

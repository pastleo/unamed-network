//import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';

import { PingMessage } from '../utils/message';
import { randomStr } from '../utils/utils';

const connManager = new BrowserConnManager();
(window as any).cm = connManager;

(async () => {
  await connManager.start(`rtc://${location.hash.slice(1) || randomStr()}`);
  console.log('connManager started', connManager.myAddr);

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


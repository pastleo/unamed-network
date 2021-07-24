//import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';

const connManager = new BrowserConnManager();
(window as any).cm = connManager;

(async () => {
  await connManager.start('rtc://pastleo');
  console.log('connManager started');

  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.peerAddr);
  });
  connManager.addEventListener('receive', event => {
    console.log('receive', event);
  });

  await connManager.connect('ws://localhost:8081', '');
})();


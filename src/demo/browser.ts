//import Agent from 'unnamed-network/agent';
import BrowserConnManager from 'unnamed-network/conn-manager/browser';

const connManager = new BrowserConnManager();

(window as any).cm = connManager;

console.log('works ...');

(async () => {
  await connManager.start('rtc://pastleo');
  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.addr);
  });
  await connManager.connect('ws://localhost:8081', '');
  console.log('done');
})();


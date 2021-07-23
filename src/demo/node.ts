//import Agent from 'unnamed-network/agent';
import WssConnManager from 'unnamed-network/conn-manager/wss';
import repl from 'repl';

console.log('starting ...');

const connManager = new WssConnManager({ port: 8081 });
(global as any).cm = connManager;

(async () => {
  await connManager.start('ws://localhost:8081');
  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.addr);
  });

  repl.start({ prompt: '> ' });
})();

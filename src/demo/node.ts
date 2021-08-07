import Agent from 'unnamed-network/agent';
import WssConnManager from 'unnamed-network/conn-manager/wss';
import repl from 'repl';
import { PingMessage } from '../message/message';

const serverOpts: WssConnManager.ServerOptions = {};
if (process.env.HOST) serverOpts.host = process.env.HOST;
if (process.env.PORT) serverOpts.port = parseInt(process.env.PORT);

const connManager = new WssConnManager({
  myAddr: process.env.ADDR || 'ws://localhost:8081',
}, serverOpts);

const agent = new Agent(connManager);
(global as any).agent = agent;

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

  repl.start({ prompt: '> ' });
})();

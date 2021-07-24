//import Agent from 'unnamed-network/agent';
import WssConnManager from 'unnamed-network/conn-manager/wss';
import repl from 'repl';

const serverOpts: WssConnManager.ServerOptions = {};
if (process.env.HOST) serverOpts.host = process.env.HOST;
if (process.env.PORT) serverOpts.port = parseInt(process.env.PORT);

const connManager = new WssConnManager({}, serverOpts);
(global as any).cm = connManager;

//////////////
import { unnamedNetwork as protobuf } from '../messages/main';
const { HelloMessage, Terms } = protobuf;
//////////////

(async () => {
  await connManager.start(process.env.ADDR || 'ws://localhost:8081');
  console.log('connManager started');

  connManager.addEventListener('new-conn', event => {
    console.log('new-conn', event.detail.peerAddr);

    //////////////
    const msg = HelloMessage.encode({
      term: Terms.HELLO,
      addrs: ['123', '234']
    }).finish();
    console.log(msg);
    //HelloMessage.encode(
    event.detail.conn.sendRaw(msg);
    //////////////
  });
  connManager.addEventListener('receive', event => {
    console.log('receive', event);
  });

  repl.start({ prompt: '> ' });
})();

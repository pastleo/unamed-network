import repl from 'repl';
import WebSocket from 'ws';
import nodeLocalStorage from 'node-localstorage';
const { LocalStorage } = nodeLocalStorage;

import { setWsClass } from './lib/conn/ws.js';
setWsClass(WebSocket);

import ConnManager from './lib/connManager.js';
import WssConnProvider from './lib/connProvider/wss.js';

import { whichExampleToRun, defaultFirstAddr } from './config.js';

import examples from './examples/index.js';

let [myAddr, storage, port] = process.argv.slice(2);
if (!myAddr) {
  console.log('usage: npm start [myAddr] [storage] [port]');
  console.log(`using default myAddr: ${defaultFirstAddr}`);
  myAddr = defaultFirstAddr.slice(0);
}
if (!port) {
  port = (new URL(myAddr)).port;
  console.log(`using port from myAddr: ${port}`);
}
if (!storage) {
  storage = './.local-storage/default';
  console.log(`using default storage: ${storage}`);
}

const localStorage = new LocalStorage(storage);

const wss = new WebSocket.Server({ port });
const wssConnProvider = new WssConnProvider(wss);

global.cm = new ConnManager(myAddr, wssConnProvider);
console.log(`=> global.cm : connManager`);

(async () => {
  const methods = examples[whichExampleToRun](global.cm, {
    defaultFirstAddr, localStorage,
  });
  Object.keys(methods).forEach(methodName => {
    Object.defineProperty(global, methodName, {
      get: methods[methodName],
    });
    console.log(`=> global.${methodName}`);
  })
})();

const replServer = repl.start({ prompt: '> ' });

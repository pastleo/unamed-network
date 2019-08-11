import { randomStr } from './lib/utils.js';

import ConnManager from './lib/connManager.js';
import BrowserConnProvider from './lib/connProvider/browser.js';

import { whichExampleToRun, defaultFirstAddr, baseIceServers } from './config.js';

import examples from './examples/index.js';

const myAddr = `rtc://${randomStr()}`;

const browserConnProvider = new BrowserConnProvider({
  iceServers: baseIceServers,
});

window.cm = new ConnManager(myAddr, browserConnProvider);
console.log(`=> window.cm : connManager`);

document.addEventListener("DOMContentLoaded", async () => {
  const methods = examples[whichExampleToRun](window.cm, {
    defaultFirstAddr, document, localStorage,
  });
  Object.keys(methods).forEach(methodName => {
    Object.defineProperty(window, methodName, {
      get: methods[methodName],
    });
    console.log(`=> window.${methodName}`);
  });
});

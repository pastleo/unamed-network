import { randomStr } from './lib/utils.js';

import ConnManager from './lib/connManager.js';
import BrowserConnProvider from './lib/connProvider/browser.js';

import { defaultFirstAddr, baseIceServers } from './config.js';

import App from './index.js';

const myAddr = `rtc://${randomStr()}`;

const browserConnProvider = new BrowserConnProvider({
  iceServers: baseIceServers,
});

window.cm = new ConnManager(myAddr, browserConnProvider);
console.log(`=> window.cm : connManager`);

document.addEventListener("DOMContentLoaded", async () => {
  const app = new App(window.cm, { defaultFirstAddr, document, localStorage });
  Object.keys(app).forEach(methodName => {
    Object.defineProperty(window, methodName, {
      get: () => app[methodName],
    });
    console.log(`=> window.${methodName}`);
  });
});

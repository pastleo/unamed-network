import { selectPromise } from './browserHelpers.js';
import { EventDispatcher, request, onRequested } from '../lib/utils.js';

function init(connManager, { defaultFirstAddr, document }) {
  const eventDispatcher = new EventDispatcher();

  connManager.on('req', ({ addr, offer, accept }) => {
    console.log('req:', { addr, offer });
    accept(offer.test === 123);
  })
  connManager.on('req-relay', ({ toAddr, fromAddr, offer, accept }) => {
    console.log('req-relay:', { toAddr, fromAddr, offer });
    accept(offer.test === 123);
  })
  connManager.on('ready', ({ addr }) => {
    console.log('ready:', addr);
  })
  connManager.on('close', ({ addr }) => {
    console.log('close:', addr);
  })

  onRequested(connManager, 'query-peers', addr => {
    console.log('query-peers requested', { addr });
    return { addrs: connManager.getConnectedAddrs() };
  });
  onRequested(connManager, 'ping', addr => {
    console.log('query-peers ping', { addr });
    (async () => {
      const timeStarted = Date.now();
      await request(connManager, addr, 'pong');
      const t = Date.now() - timeStarted;
      console.log(`ping |< ${t}`);
      eventDispatcher.emit('pong', { addr, t });
    })();
  });
  onRequested(connManager, 'pong', addr => {
    console.log('query-peers pong', { addr });
  });

  connManager.start();
  console.log('connManager started');

  async function queryPeers(viaAddr) {
    const { addrs } = await request(connManager, viaAddr, 'query-peers');
    const knownAddrs = [
      ...connManager.getConnectedAddrs(),
      connManager.getMyAddr(),
    ];
    return addrs.filter(addr => !knownAddrs.includes(addr))
  }
  async function ping(addr) {
    const timeStarted = Date.now();
    await request(connManager, addr, 'ping');
    const t = Date.now() - timeStarted;
    console.log(`ping |> ${t}`);
    return t;
  }

  if (document) {
    const peerTemplate = document.getElementById('peer-template').content.children[0];
    const peersBox = document.getElementById('peers');

    document.getElementById('connect-name').value = defaultFirstAddr;
    document.getElementById('connect').onclick = () => {
      connManager.connect(document.getElementById('connect-name').value, { offer: { test: 123 } })
    };
    document.getElementById('message-broadcast').disabled = true;

    const myAddr = connManager.getMyAddr();
    document.title = `[${myAddr}] unnamed network client`;
    document.getElementById('my-addr').textContent = myAddr;

    const doms = {};

    async function queryAndConnectFlow(viaAddr, dom) {
      const addrs = await queryPeers(viaAddr);
      const connectCtl = dom.querySelector('.connect-ctl');
      const select = dom.querySelector('.connect-select');
      connectCtl.classList.add('shown');
      const [addr, ] = await selectPromise(select, addrs.map(a => [a, a]));
      connectCtl.classList.remove('shown');
      connManager.connect(addr, { viaAddr, offer: { test: 123 } });
    }

    async function pingAndShow(addr, dom) {
      const t = await ping(addr);
      dom.querySelector('.ping').onclick = () => pingAndShow(addr, dom);
      dom.querySelector('.ping').textContent = `ping |> ${t}`;
    }

    connManager.on('ready', ({ addr }) => {
      const dom = document.importNode(peerTemplate, true);
      peersBox.appendChild(dom);
      dom.querySelector('.name').textContent = addr;
      dom.querySelector('.query-peers').onclick = () => queryAndConnectFlow(addr, dom);
      dom.querySelector('.ping').onclick = () => pingAndShow(addr, dom);
      dom.querySelector('.disconnect').onclick = () => connManager.close(addr);
      doms[addr] = dom;
    });
    connManager.on('close', ({ addr }) => {
      doms[addr].remove();
      delete doms[addr];
    });
    eventDispatcher.on('pong', ({ addr, t }) => {
      doms[addr].querySelector('.ping').textContent = `ping |< ${t}`;
    });
  }

  let targetAddr = defaultFirstAddr;
  let viaAddr = defaultFirstAddr;

  return {
    connect: () => {
      connManager.connect(targetAddr, { viaAddr, offer: { test: 123 } });
    },
    close: () => {
      connManager.close(targetAddr);
    },
    queryPeers: async () => {
      const newAddrs = await queryPeers(viaAddr);
      targetAddr = newAddrs[0]
      console.log({ newAddrs, targetAddr });
    },
    setTargetAddr: () => addr => { targetAddr = addr; },
    setViaAddr: () => addr => { viaAddr = addr; },

    ping: async () => {
      ping(targetAddr);
    },
  }
}

export default init;

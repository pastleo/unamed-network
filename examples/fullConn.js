import Client from '../lib/fullConnClient.js';

function init(connManager, { defaultFirstAddr, document, localStorage }) {
  const client = new Client(connManager, localStorage);

  connManager.on('ready', ({ addr }) => {
    console.log('ready:', addr);
  });
  connManager.on('close', ({ addr }) => {
    console.log('close:', addr);
  });
  client.on('message', ({ addr, payload: { message } }) => {
    console.log(`${addr}: ${message}`);
  });

  (async () => {
    client.know(defaultFirstAddr);
    client.startLink();
    console.log('fullConnClient started');
  })();

  if (document) {
    const peerTemplate = document.getElementById('peer-template').content.children[0];
    const messageLineTemplate = document.getElementById('message-line-template').content.children[0];
    const messagesBox = document.getElementById('messages-box');
    const peersBox = document.getElementById('peers');

    const myAddr = connManager.getMyAddr();
    document.title = `[${myAddr}] unnamed network client`;
    document.getElementById('my-addr').textContent = myAddr;

    const doms = {};

    connManager.on('ready', ({ addr }) => {
      const dom = document.importNode(peerTemplate, true);
      peersBox.appendChild(dom);
      dom.querySelector('.name').textContent = addr;
      dom.querySelector('.query-peers').remove();
      dom.querySelector('.ping').remove();
      dom.querySelector('.disconnect').onclick = () => connManager.close(addr);
      doms[addr] = dom;
    });
    connManager.on('close', ({ addr }) => {
      doms[addr].remove();
      delete doms[addr];
    });

    document.getElementById('connect-name').value = defaultFirstAddr;
    document.getElementById('connect').onclick = () => {
      const addr = document.getElementById('connect-name').value;
      if (client.known(addr)) {
        client.forget(addr);
      } else {
        client.know(addr);
      }
    };
    document.getElementById('connect').textContent = 'know / forget';

    function sendInputMessage() {
      const message = document.getElementById('message-input').value;
      client.broadcast('message', { message });
      addMessage(connManager.getMyAddr(), message);
      document.getElementById('message-input').value = '';
    }
    document.getElementById('message-input').onkeyup = ({ keyCode }) => {
      if (keyCode === 13) { sendInputMessage(); }
    }
    document.getElementById('message-broadcast').onclick = sendInputMessage;

    client.on('message', ({ addr, payload: { message } }) => {
      addMessage(addr, message);
    });

    function addMessage(from, msg) {
      const dom = document.importNode(messageLineTemplate, true);
      messagesBox.appendChild(dom);
      dom.querySelector('.peer-name').textContent = from;
      dom.querySelector('.message-content').textContent = msg;
    }
  }

  return {
    client: () => client,
    know: () => addr => {
      client.know(addr);
    },
    broadcast: () => message => {
      client.broadcast('message', { message })
    }
  }
}

export default init;

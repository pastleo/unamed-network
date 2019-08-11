import Client from '../lib/client.js';

function init(connManager, { defaultFirstAddr, document, localStorage }) {
  const client = new Client(connManager, localStorage);

  connManager.on('ready', ({ addr }) => {
    console.log('ready:', addr);
  });
  connManager.on('close', ({ addr }) => {
    console.log('close:', addr);
  });
  client.on('req-join-group', ({ addr, group, payload, accept }) => {
    console.log('req-join-group', { addr, group, payload });
    accept(true);
  });
  client.on('joined', ({ group }) => {
    console.log('joined', group);
  });
  client.on('left', ({ group }) => {
    console.log('left', group);
  });
  client.on('new-neighbor', ({ group, addr }) => {
    console.log('new-neighbor', { group, addr });
  })
  client.on('neighbor-left', ({ group, addr }) => {
    console.log('neighbor-left', { group, addr });
  })
  client.on('message', ({ group, payload: { from, message } }) => {
    console.log(`${from}: ${message}`);
  });

  const myAddr = connManager.getMyAddr();

  if (document) {
    const groupTemplate = document.getElementById('group-template').content.children[0];
    const peerTemplate = document.getElementById('peer-template').content.children[0];
    const messageLineTemplate = document.getElementById('message-line-template').content.children[0];
    const groupInput = document.getElementById('group-input');
    const groupsBox = document.getElementById('group-box');

    document.title = `[${myAddr}] unnamed network client`;
    document.getElementById('my-addr').textContent = myAddr;

    const groupDoms = {};
    const neighborDoms = {};

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
    document.getElementById('input-box').remove();
    document.getElementById('group-join-box').classList.add('shown');

    async function joinGroup() {
      const group = groupInput.value;
      if (!group || client.hasGroup(group)) { return; }
      groupInput.value = '';
      await client.join(group);
    }
    groupInput.onkeyup = ({ keyCode }) => {
      if (keyCode === 13) { joinGroup(); }
    }
    document.getElementById('join-btn').onclick = joinGroup;

    function sendMsgToGroup(group, msgInput) {
      const message = msgInput.value;
      msgInput.value = '';
      client.broadcast(group, 'message', { from: myAddr, message })
      addMessage(group, myAddr, message);
    }

    client.on('ready', ({ group }) => {
      if (window.location.hash.length > 1) {
        client.join(window.location.hash.slice(1));
      }
    });
    client.on('joined', ({ group }) => {
      const dom = document.importNode(groupTemplate, true);
      groupsBox.appendChild(dom);

      const groupNameLink = dom.querySelector('.group-name')
      groupNameLink.textContent = group;
      groupNameLink.href = genGroupLink(group);

      if (group === '/') {
        dom.querySelector('.input-line').remove();
      } else {
        const msgInput = dom.querySelector('.group-message-input');
        msgInput.onkeyup = ({ keyCode }) => {
          if (keyCode === 13) { sendMsgToGroup(group, msgInput); }
        }
        dom.querySelector('.group-message-send').onclick = () => sendMsgToGroup(group, msgInput);
        dom.querySelector('.group-leave').onclick = () => client.leave(group);
      }

      groupDoms[group] = dom;
      neighborDoms[group] = {};
    });

    client.on('left', ({ group }) => {
      delete neighborDoms[group];
      groupDoms[group].remove();
      delete groupDoms[group];
    });

    client.on('new-neighbor', ({ group, addr }) => {
      const dom = document.importNode(peerTemplate, true);
      groupDoms[group].querySelector('.group-neighbor-box').appendChild(dom);

      dom.querySelector('.name').textContent = addr;
      dom.querySelector('.query-peers').remove();
      dom.querySelector('.ping').remove();
      dom.querySelector('.disconnect').onclick = () => connManager.close(addr);

      neighborDoms[group][addr] = dom;
    });

    client.on('neighbor-left', ({ group, addr }) => {
      const groupNeighborDoms = neighborDoms[group];
      if (groupNeighborDoms && groupNeighborDoms[addr]) {
        groupNeighborDoms[addr].remove();
        delete groupNeighborDoms[addr];
      }
    })

    client.on('message', ({ group, payload: { from, message } }) => {
      addMessage(group, from, message);
    });

    function addMessage(group, from, msg) {
      const dom = document.importNode(messageLineTemplate, true);
      groupDoms[group].querySelector('.group-msg-box').appendChild(dom);
      dom.querySelector('.peer-name').textContent = from;
      dom.querySelector('.message-content').textContent = msg;
    }

    function genGroupLink(group) {
      const url = new URL(window.location.href);
      url.hash = `#${group}`;
      return url.href;
    }
  }

  (async () => {
    client.know(defaultFirstAddr);
    await client.startLink();
    console.log('starClient started, myAddr:', myAddr);
  })();

  return {
    client: () => client,
    know: () => addr => { client.know(addr); },
    forget: () => addr => { client.forget(addr); },
    join: () => group => { client.join(group); },
    hasGroup: () => group => { console.log(group, client.hasGroup(group)); },
    leave: () => group => { client.leave(group); },
    send: () => (group, message) => {
      client.broadcast(group, 'message', { from: myAddr, message })
    }
  }
}

export default init;

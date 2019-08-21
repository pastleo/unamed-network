import Client from './lib/client.js';
import { randomStr, EventDispatcher } from './lib/utils.js';

const myNameKey = 'myName';
const mediaKeys = ['url', 'playing', 'time'];

function App(connManager, { defaultFirstAddr, document, localStorage }) {
  const client = new Client(connManager, localStorage);

  const myAddr = connManager.getMyAddr();
  let myName = localStorage.getItem(myNameKey) || myAddr;

  const eventDispatcher = new EventDispatcher();

  const groupMedia = {}

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
    setTimeout(() => broadcastMediaToGroup(group), 500);
    console.log('new-neighbor', { group, addr });
  })
  client.on('neighbor-left', ({ group, addr }) => {
    console.log('neighbor-left', { group, addr });
  })
  client.on('message', ({ group, payload: { from, author, message } }) => {
    console.log(`${author} (${from}): ${message}`);
  });

  client.on('media', ({ group, payload: { actionId, ...payload } }) => {
    const mediaState = groupMedia[group] || {};
    if (actionId > (mediaState.actionId || 0)) {
      const newMediaState = {};
      mediaKeys.forEach(k => {
        if (mediaState[k] !== payload[k]) {
          mediaState[k] = payload[k];
          newMediaState[k] = payload[k];
        }
      });
      mediaState.actionId = actionId;
      groupMedia[group] = mediaState;
      eventDispatcher.emit('media', group, newMediaState);
    }
  });

  eventDispatcher.on('media', (group, newMediaState) => {
    console.log(`media from ${group}:`, newMediaState);
  });

  function joinGroup(group) {
    client.join(group);
  }

  function setMyName(name) {
    myName = name;
    localStorage.setItem(myNameKey, name);
  }

  function sendMsgToGroup(group, message) {
    client.broadcast(group, 'message', { from: myAddr, author: myName, message })
  }

  function setGroupMedia(group, payload) {
    const mediaState = groupMedia[group] || {};
    const newState = { ...mediaState, ...payload };
    let changed = false;
    mediaKeys.forEach(k => {
      if (mediaState[k] !== newState[k]) changed = true;
    });
    if (changed) {
      const actionId = (mediaState.actionId || 0) + 1;
      newState.actionId = actionId;
    }
    groupMedia[group] = newState;
    if (changed) broadcastMediaToGroup(group);
    return changed;
  }

  function broadcastMediaToGroup(group) {
    const mediaState = groupMedia[group];
    if (!mediaState) return;
    const sendingData = {};
    mediaKeys.forEach(k => {
      sendingData[k] = mediaState[k];
    });
    sendingData.actionId = mediaState.actionId;
    client.broadcast(group, 'media', sendingData);
  }

  if (document) {
    document.getElementById('my-addr').textContent = myAddr;
    const nameInput = document.getElementById('name-input');
    nameInput.oninput = () => {
      setMyName(nameInput.value);
      updateMyNameDom();
    };
    updateMyNameDom();

    const knowingInput = document.getElementById('knowing-input');
    document.getElementById('know-btn').onclick = () => client.know(knowingInput.value);
    document.getElementById('forget-btn').onclick = () => client.forget(knowingInput.value);
    knowingInput.value = defaultFirstAddr;

    const groupTabTemplate = document.getElementById('group-tab-template').content.children[0];
    const groupContentTemplate = document.getElementById('group-content-template').content.children[0];
    const neighborTemplate = document.getElementById('neighbor-template').content.children[0];
    const msgTemplate = document.getElementById('msg-template').content.children[0];
    const mediaImgurTemplate = document.getElementById('media-imgur-template').content.children[0];
    const mediaYoutubeTemplate = document.getElementById('media-youtube-template').content.children[0];

    const groupTabs = document.getElementById('group-tabs');
    const groupContents = document.getElementById('group-contents');

    const groupDoms = {
      '/': [
        document.getElementById('root-tab'),
        document.getElementById('root-group-content'),
      ],
    };
    const neighborDoms = {
      '/': {}
    };

    const joinInput = document.getElementById('join-input');
    document.getElementById('join-btn').onclick = () => joinInput.value && joinGroupDom(joinInput.value);
    joinInput.onkeyup = ({ keyCode }) => {
      if (keyCode === 13 && joinInput.value) { joinGroupDom(joinInput.value); }
    }

    const newGroupTab = document.getElementById('new-group');

    groupDoms['/'][0].querySelector('.group-link').onclick = () => showGroup('/');
    newGroupTab.onclick = () => joinGroupDom(randomStr());

    client.on('ready', ({ group }) => {
      if (window.location.hash.length > 1) {
        joinGroupDom(window.location.hash.slice(1));
      }
    });

    client.on('left', ({ group }) => {
      delete neighborDoms[group];
      groupDoms[group].forEach(dom => dom.remove());
      delete groupDoms[group];
      showGroup('/');
    });

    client.on('new-neighbor', ({ group, addr }) => {
      const dom = document.importNode(neighborTemplate, true);
      const groupContentDom = groupDoms[group][1];
      const neighborBox = groupContentDom.querySelector('.group-neighbor-box')
      neighborBox.appendChild(dom);
      dom.querySelector('.neighbor-name').textContent = addr;

      let groupNeighborDoms = neighborDoms[group];
      if (!groupNeighborDoms) {
        groupNeighborDoms = {};
        neighborDoms[group] = groupNeighborDoms;
      }
      groupNeighborDoms[addr] = dom;
      updateNeighborCnt(group);
    });

    client.on('neighbor-left', ({ group, addr }) => {
      const groupNeighborDoms = neighborDoms[group];
      if (groupNeighborDoms && groupNeighborDoms[addr]) {
        groupNeighborDoms[addr].remove();
        delete groupNeighborDoms[addr];
      }
      updateNeighborCnt(group);
    });

    client.on('message', ({ group, payload: { from, author, message } }) => {
      addMessage(group, from, author, message);
    });

    const ytTag = document.createElement('script');
    ytTag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(ytTag, firstScriptTag);

    function showGroup(group) {
      const [tabDom, contentDom] = (groupDoms[group] || []);
      if (!(tabDom && contentDom)) return;

      const fgTabDom = groupTabs.querySelector('.nav-link.active');
      if (fgTabDom) fgTabDom.classList.remove('active');
      const fgContentDom = groupContents.querySelector('.tab-pane.active');
      if (fgContentDom) {
        fgContentDom.classList.remove('show', 'active');
        fgContentDom.classList.add('d-none');
      }

      tabDom.querySelector('.nav-link').classList.add('active');
      contentDom.classList.remove('d-none');
      contentDom.classList.add('show', 'active');

      if (group !== '/') {
        window.location.hash = `#${group}`;
      }
    }

    function joinGroupDom(group) {
      if (!client.hasGroup(group)) {
        joinGroup(group);

        const tabDom = document.importNode(groupTabTemplate, true);
        const contentDom = document.importNode(groupContentTemplate, true);

        const groupNameLink = tabDom.querySelector('.group-link');
        groupNameLink.textContent = group;
        groupNameLink.href = `#${group}`;
        groupNameLink.onclick = () => showGroup(group);

        contentDom.querySelector('.leave-group-btn').onclick = () => client.leave(group);

        const msgInput = contentDom.querySelector('.msg-input');
        msgInput.onkeyup = ({ keyCode }) => {
          if (keyCode === 13) { onSentClicked(group, msgInput); }
        }
        contentDom.querySelector('.send-msg-btn').onclick = () => onSentClicked(group, msgInput);

        const mediaInput = contentDom.querySelector('.media-input')
        contentDom.querySelector('.media-btn').onclick = () => onMediaBtnClicked(group, mediaInput.value);
        mediaInput.onkeyup = ({ keyCode }) => {
          if (keyCode === 13) { onMediaBtnClicked(group, mediaInput.value); }
        }

        groupTabs.insertBefore(tabDom, newGroupTab);
        groupContents.appendChild(contentDom);
        groupDoms[group] = [tabDom, contentDom];
      }
      showGroup(group);
    }

    function updateNeighborCnt(group) {
      const [_, groupContentDom] = groupDoms[group] || [];
      if (groupContentDom) {
        groupContentDom.querySelector('.neighbor-cnt').textContent = Object.keys(neighborDoms[group] || {}).length;
      }
    }

    function updateMyNameDom() {
      document.title = `[${myName}] Chatrooms - an unnamed-network example`;
      nameInput.value = myName;
    }

    function onSentClicked(group, msgInput) {
      const message = msgInput.value;
      msgInput.value = '';
      sendMsgToGroup(group, message);
      addMessage(group, myAddr, myName, message);
    }

    function addMessage(group, from, author, message) {
      const [_, groupContentDom] = groupDoms[group] || [];
      if (groupContentDom) {
        const msgsDom = groupContentDom.querySelector('.group-msgs');
        const dom = document.importNode(msgTemplate, true);
        dom.querySelector('.author').textContent = author;
        dom.querySelector('.from').textContent = from;
        dom.querySelector('.content').textContent = message;
        const isScrollBottom = (msgsDom.offsetHeight + msgsDom.scrollTop >= msgsDom.scrollHeight);
        msgsDom.appendChild(dom);
        if (isScrollBottom) {
          msgsDom.scrollTop = msgsDom.scrollHeight;
        }
      }
    }

    eventDispatcher.on('media', (group, { url, ...mediaState }) => {
      if (url !== undefined) setMediaDom(group, url);
      onReceivedYoutube(group, mediaState);
    });

    function onMediaBtnClicked(group, url) {
      if (setGroupMedia(group, { url })) {
        setMediaDom(group, url);
      }
    }

    function setMediaDom(group, url) {
      const [_, groupContentDom] = groupDoms[group] || [];
      if (!groupContentDom) return;
      if (url.match(/^https:\/\/i\.imgur\.com\/\w+/)) {
        clearMediaDom(group);
        const dom = document.importNode(mediaImgurTemplate, true);
        dom.querySelector('.imgur-image').src = url;
        const mediaContentDom = groupContentDom.querySelector('.media-content');
        mediaContentDom.appendChild(dom);
      } else {
        const youtubeId = parseYoutubeId(url);
        if (youtubeId) {
          clearMediaDom(group);
          newYoutubePlayer(group, youtubeId);
        }
      }
    }

    const youtubes = {};

    function parseYoutubeId(url) {
      const urlObj = new URL(url);
      if (urlObj.hostname !== 'www.youtube.com') return;
      const videoIdPair = urlObj.search.slice(1).split('&').map(x => x.split('=')).filter(([k, _]) => k === 'v');
      if (videoIdPair.length === 0) return;
      return videoIdPair[0][1];
    }

    function newYoutubePlayer(group, youtubeId) {
      const [_, groupContentDom] = groupDoms[group] || [];
      if (!groupContentDom) return;
      const dom = document.importNode(mediaYoutubeTemplate, true);
      const playerDomId = randomStr();
      dom.querySelector('.youtube-player').id = playerDomId;
      const mediaContentDom = groupContentDom.querySelector('.media-content');
      mediaContentDom.appendChild(dom);
      youtubes[group] = {
        playing: false,
        time: 0,
        timeLastChecked: Math.floor(Date.now() / 1000),
        stateChangePrevented: 1,
        player: new YT.Player(playerDomId, {
          height: '390',
          width: '640',
          videoId: youtubeId,
          events: {
            onReady: () => onYoutubeReady(group),
            onStateChange: e => onYoutubeChange(group, e),
          }
        }),
      }
    }

    function clearMediaDom(group) {
      const [_, groupContentDom] = groupDoms[group] || [];
      if (groupContentDom) {
        const mediaContentDom = groupContentDom.querySelector('.media-content')
        const range = document.createRange();
        range.selectNodeContents(mediaContentDom);
        range.deleteContents();
        delete youtubes[group];
      }
    }

    function onYoutubeReady(group) {
      const yt = youtubes[group];
      if (!yt) return;
      yt.ready = true;
      setTimeout(() => { yt.stateChangePrevented -= 1; }, 500);
      if (yt.mediaStateAferReady) {
        syncYoutubeState(group, yt.mediaStateAferReady);
      }
    }

    function onYoutubeChange(group, { data: state }) {
      const yt = youtubes[group];
      if (!yt) return;
      if (yt.stateChangePrevented > 0) return;
      const newPlaying = !(state === 0 || state === 2);
      clearTimeout(yt.playingChanging);
      if (yt.playing !== newPlaying) {
        yt.playingChanging = setTimeout(() => {
          yt.playing = newPlaying;
          onYoutubeSeeked(group);
        }, 200);
      }
      if (!newPlaying || !yt.playing) return;
      const timeNow = Math.floor(Date.now() / 1000);
      const playerTime = yt.player.getCurrentTime();
      if (Math.abs(yt.time + timeNow - yt.timeLastChecked - playerTime) > 3) {
        onYoutubeSeeked(group);
      }
    }

    function onYoutubeSeeked(group) {
      const yt = youtubes[group];
      if (!yt) return;
      yt.time = yt.player.getCurrentTime();
      yt.timeLastChecked = Math.floor(Date.now() / 1000);
      setGroupMedia(group, { playing: yt.playing, time: yt.time })
    }

    function onReceivedYoutube(group, mediaState) {
      const yt = youtubes[group];
      if (!yt) return;
      if (yt.ready) {
        syncYoutubeState(group, mediaState);
      } else {
        yt.mediaStateAferReady = {
          ...(yt.mediaStateAferReady || {}),
          ...mediaState,
        };
      }
    }

    function syncYoutubeState(group, { playing: newPlaying, time }) {
      const yt = youtubes[group];
      if (!yt) return;
      if (time !== undefined) {
        yt.stateChangePrevented += 1;
        setTimeout(() => { yt.stateChangePrevented -= 1; }, 100);
        yt.player.seekTo(time);
        yt.time = yt.player.getCurrentTime();
        yt.timeLastChecked = Math.floor(Date.now() / 1000);
      }
      if (newPlaying !== undefined) {
        yt.playing = newPlaying;
        yt.stateChangePrevented += 1;
        setTimeout(() => { yt.stateChangePrevented -= 1; }, 100);
        if (newPlaying) {
          yt.player.playVideo();
        } else {
          yt.player.pauseVideo();
        }
      }
    }
  }

  (async () => {
    client.know(defaultFirstAddr);
    await client.startLink();
    console.log('starClient started, myAddr:', myAddr);
  })();

  return {
    client: client,
    know: addr => { client.know(addr); },
    forget: addr => { client.forget(addr); },
    newGroup: () => { joinGroup(randomStr()); },
    join: group => { client.join(group); },
    hasGroup: group => { console.log(group, client.hasGroup(group)); },
    leave: group => { client.leave(group); },
    setName: name => { setMyName(name) },
    send: (group, message) => { sendMsgToGroup(group, message) },
    media: (group, mediaState) => { setGroupMedia(group, mediaState) },
  }
}

export default App;

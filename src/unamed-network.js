const KBucket = require('k-bucket');
//const { multiaddr } = require('multiaddr');
const PeerId = require('peer-id');
const { toString: uint8ArrayToString } = require('uint8arrays/to-string')
const SimplePeer = require('libp2p-webrtc-peer')

const PUBSUB_TOPIC_PREFIX = 'unamed-network/';
const DEFAULT_KNOWN_SERVICE_NODES = [
  '/ip4/127.0.0.1/tcp/4005/ws/p2p/12D3KooWMg1RMxFkAGGEW9RS66M4sCqz8BePeXMVwTPBjw4oBjR2'
];
const SERVICE_NODE_ADDR_PROTO_NAMES = ['ws', 'wss']; // for dev, production should be 'wss' only.

class UnamedNetwork {
  constructor(ipfs, nodeType) {
    this.nodeType = nodeType // 'serviceNode' | 'clientNode', TODO: change to addr, should auto detect
    this.ipfs = ipfs;
    this.rooms = {};
    this.peers = {};
    this.kBucket = new KBucket({
      numberOfNodesPerKBucket: 2,
      //localNodeId: idBuffer
    });
  }

  testKBucket() {
    const otherIdBuffer1 = PeerId.parse('12D3KooWJMXrVovsCuU1czeowx2xGizUipkiHBgHbUQ1dAD3UbCK').toBytes().slice(6);
    const otherIdBuffer2 = PeerId.parse('12D3KooWJMb4m8HjfJVHnBc9T5rWYkvn9BBtgRV6bYqGWnJCXf7j').toBytes().slice(6);
    console.log({
      otherIdBuffer1, otherIdBuffer2,
    });

    this.kBucket.add({ id: otherIdBuffer1, name: 'otherIdBuffer1' });
    this.kBucket.add({ id: otherIdBuffer2, name: 'otherIdBuffer2' });
    console.log(this.kBucket);
    console.log(
      this.kBucket.closest(new Uint8Array([126, 221, 53]), 1),
      this.kBucket.root
    );
  }

  async start(knownServiceNodes = DEFAULT_KNOWN_SERVICE_NODES) {
    this.idInfo = await this.ipfs.id();
    this.nodeAddrs = this.idInfo.addresses.filter(
      addr => addr.protos().find(proto => SERVICE_NODE_ADDR_PROTO_NAMES.indexOf(proto.name) >= 0)
    );
    this.nodeType = this.nodeAddrs.length > 0 ? 'serviceNode' : 'clientNode';

    if (this.nodeType === 'clientNode' && !SimplePeer.WEBRTC_SUPPORT) {
      throw new Error(`UnamedNetwork.start: capabitlity not satisfied! no public address for ${SERVICE_NODE_ADDR_PROTO_NAMES.join(', ')} nor webRTC available.`);
    }

    await this.ipfs.pubsub.subscribe(`${PUBSUB_TOPIC_PREFIX}/${this.idInfo.id}`, message => {
      try {
        this.handleMessage(message);
      } catch (e) {
        console.error(e);
      }
    });
    this.kBucket.add({
      id: peerIdBuffer(this.idInfo.id), type: 'self',
    });
    this.knownServiceNodes = knownServiceNodes.filter(addr => addr.indexOf(this.idInfo.id) === -1);
    await Promise.all(
      shuffle(this.knownServiceNodes).slice(-3).map(addr => this.connectAddr(addr))
    );
  }

  async join(name) {
    if (name.length < 3) throw new Error('room name have to be more than 3 characters');
    if (this.rooms[name]) return this.rooms[name];
    //if (this.knownServiceNodes
    // return Room
  }

  handleMessage(message) {
    if (message.from !== this.idInfo.id) {
      const msgStr = uint8ArrayToString(message.data);
      console.log(`got message on from ${message.from}: ${msgStr}`)

      let jsonPayload;
      try {
        jsonPayload = JSON.parse(msgStr);
      } catch (e) {}

      if (jsonPayload) {
        this.handleJsonMessage(message.from, jsonPayload);
      }
    }
  }
  handleJsonMessage(from, json) {
    if (json.to === this.idInfo.id) {
      this.handleJsonMessageForMe(from, json);
    }
  }
  handleJsonMessageForMe(from, json) {
    let peer = this.peers[from];
    switch(json.type) {
      case 'hello':
        this.kBucket.add({
          id: peerIdBuffer(from),
          peerId: from,
          type: json.nodeType,
        });
        break;
      case 'signal':
        if (!peer) {
          peer = new SimplePeer();
          peer.on('signal', data => {
            this.sendMessage({
              type: 'signal',
              to: from,
              data,
            });
          });
          peer.on('connect', () => {
            console.log('being connected from the other successfully')
            setInterval(() => {
              const rnd = `${(new Date()).toISOString()}: ${Math.random() * 10000}`;
              peer.send(rnd);
            }, 2000);
          });
          peer.on('data', data => {
            console.log('got a message from peer connecting: ' + data)
          });
          this.peers[from] = peer;
        }
        peer.signal(json.data);
        break;
    }
  }

  sendMessage(message) {
    // WIP: this.route(...);
    //this.ipfs.pubsub.publish(this.tiers[0].topic, JSON.stringify(message));
  }

  async connectWebrtc(peerId) {
    return new Promise(resolve => {
      const peer = new SimplePeer({ initiator: true });
      peer.on('signal', data => {
        this.sendMessage({
          type: 'signal',
          to: peerId,
          data,
        });
      });
      peer.on('connect', () => {
        console.log(`connecting to ${peerId} other successfully`)
        resolve(peer);

        setInterval(() => {
          const rnd = `${(new Date()).toISOString()}: ${Math.random() * 10000}`;
          peer.send(rnd);
        }, 2000);
      });
      peer.on('data', data => {
        console.log('got a message from peer being connected: ' + data)
      });
      console.log('peer inited', peer);
      this.peers[peerId] = peer;
    });
  }

  async connectAddr(multiaddr) {
    await this.ipfs.swarm.connect(multiaddr);
    const peerId = last(multiaddr.split('/'));
    await this.ipfs.pubsub.publish(`${PUBSUB_TOPIC_PREFIX}/${peerId}`, JSON.stringify({
      type: 'hello',
      to: peerId,
      nodeType: this.nodeType,
    }));
    this.kBucket.add({
      id: peerIdBuffer(peerId),
      peerId,
      type: 'serviceNode',
    });
  }

  route() {
  }
}

function peerIdBuffer(peerIdStr) {
  return PeerId.parse(peerIdStr).toBytes().slice(6)
}
function last(arr) {
  return arr[arr.length - 1];
}
function shuffle(oriArray) {
  const array = [...oriArray];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

module.exports = UnamedNetwork;

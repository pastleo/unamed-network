unamed-network
===

An Experiment that forms p2p [Kademlia DHT network](https://en.wikipedia.org/wiki/Kademlia) using [IPFS](https://ipfs.io/) and [WebRTC](https://webrtc.org/)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

## Feature

* join room
* broadcast messages in the room
* listen to memeber join / leave and other peer's broadcasted messages

## Design

* There are 2 type of node in the network, namely `serviceNode` and `clientNode`
  * a `serviceNode` is a [go-ipfs](https://github.com/ipfs/go-ipfs) daemon with a nodejs [ipfs-http-client](https://www.npmjs.com/package/ipfs-http-client) running `lib/unamed-network.js`
  * a `clientNode` is a browser running [js-ipfs](https://github.com/ipfs/js-ipfs) and `lib/unamed-network.js`
* on a normal Kademlia DHT network, location in the network of each node is based on its peerId, here is based on `hash(room.name)`; nodes within the same room use full-connected (for now)
  * when `serviceNode` starts, it will join a room that name is their peerId
* websocket for connecting to a `serviceNode`, while WebRTC for a `clientNode` connecting to a `clientNode`
  * websocket connection can be directly established with addr, and thus can be stored as `knownServiceAddr` for boostraping into network
* to join a room, a node send out a find room packet (RPC between nodes) containgin `hash(room.name)` to search for a room (or more precisely, a room member node), this packet can hop through many nodes, each node route the packet based on DHT
  * after finding room, the packet is responded with route of each peerId it traveled
  * with route of each peerId, a connect request packet is sent to the room member, so do WebRTC signal packets between the two
* `WIP: not implemented yet` to prevent a node with too many connection, [k-bucket](https://www.npmjs.com/package/k-bucket) will tell if there are redundant connections to other rooms

## Roadmap

* [x] work with IPFS (IPFS pubsub is used as transport for now)
* [x] able to find, join room and connect to other nodes
  * [x] `serviceNode` -> `serviceNode`
  * [x] `clientNode` -> `serviceNode`
  * [x] `serviceNode` -> `clientNode`
  * [x] `clientNode` -> `clientNode` (WebRTC)
* [x] provided as a library (for [unamed-world](https://github.com/pastleo/unamed-world))
* [x] detect peer connection lost and leaving
* [ ] use `k-bucket` to close redundant connections to other rooms, manage number of connections (especially for `clientNode`)
* [ ] retry on finding room
* [ ] other improvements to be add here

## Development

1. `git clone git@github.com:pastleo/unamed-network.git` and `cd unamed-network`
2. `npm install`
3. `cp env.js.dev env.js`
3. You need at least one `serviceNode`, see `dev-ipfs-nodes/README.md` to setup and start `dev-1`
4. `npm run web` and open [http://localhost:8888](http://localhost:8888) in your browser

Then use console (for both browser and nodejs) entering `await unamedNetwork.join('some-room')` to start testing, you can also start multiple `serviceNode` like `dev-2`, `dev-3` and browsers joining the same network

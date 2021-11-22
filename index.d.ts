import { EventEmitter } from 'tsee';
import { IPFS } from 'ipfs-core';
import KBucket from 'k-bucket';
import crypto from 'libp2p-crypto';

declare module 'unamed-network' {
  type RoomNameHash = string;
  type RoomNameHashBuffer = Uint8Array;
  type PeerId = string;
  type MultiAddr = string;
  type ReqId = string;
  type NodeType = 'serviceNode' | 'clientNode';
  type RoomMemberState = 'pending' | 'connected' | 'joined';
  type PeerConnState = 'pending' | 'connected';

  interface Room {
    roomNameHash: RoomNameHash;
    joined: boolean;
    name?: string; // not hashed, only room member knows
    members: Map<PeerId, RoomMemberState>;
  }
  interface Peer {
    peerId: PeerId;
    state: PeerConnState;
    addrs: MultiAddr[];
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
    connectedResolves: ((peer: Peer) => void)[];
    rtc?: Rtc;
  }
  interface KBucketContact {
    id: RoomNameHashBuffer;
    roomNameHash: RoomNameHash;
    vectorClock: number;
  }

  type UnamedNetworkEvents = {
    'new-member': ({ peer: Peer, room: Room }) => void;
  }

  type Ephemeral = Awaited<ReturnType<typeof crypto.keys.generateEphemeralKeyPair>>;
  type Encrypter = Awaited<ReturnType<typeof crypto.aes.create>>;
  type Decrypter = Awaited<ReturnType<typeof crypto.aes.create>>;
  interface Rtc {
    simplePeer: SimpleRtcPeer;
    ephemeral: Ephemeral;
    encrypter: Encrypter;
    decrypter: Decrypter;
  }

  export default class UnamedNetwork extends EventEmitter<UnamedNetworkEvents> {
    nodeType: NodeType;
    ipfs: IPFS;
    rooms: Map<RoomNameHash, Room>;
    primaryRoomNameHash: RoomNameHash | null; // for kBucket's localNodeId, which determine this node's location in Kademlia DHT network
    peers: Map<PeerId, Peer>; // connected
    kBucket: KBucket<KBucketContact>; // known rooms, but rooms without other peers should not be added

    private requestResolveRejects: Map<ReqId, [(payload: any) => void, (error: any) => void]>;
    private started: boolean;

    constructor(ipfs: IPFS);
    start(knownServiceNodes: MultiAddr[]): Promise<void>;
    join(roomName: string, makePrimary?: boolean): Promise<boolean>;
  }

  // Packets
  // ==========

  interface Packet { // abstract
    type: string;
    protocol: string;
    packetId: string;
  }
  interface Request { // abstract
    reqId: ReqId;
  }
  interface Response { // abstract
    reqId: ReqId;
  }

  interface PingPacket extends Packet, Request {
    type: 'ping';
    addrs: MultiAddr[];
    roomNameHashes: RoomNameHash[];
  }
  interface PongPacket extends Packet, Response {
    type: 'pong';
    addrs: MultiAddr[];
    roomNameHashes: RoomNameHash[];
  }

  interface FindPacket extends Packet, Request {
    type: 'find';
    targetHash: string;
    fromPath: PeerId[];
    lastDistance: number;
  }

  interface NetworkPacket extends Packet { // abstract
    route: PeerId[]; // include sender
    hop: number; // index in toPath
  }

  interface NetworkNoPeerPacket extends NetworkPacket {
    type: 'noPeer';
    oriPacketId: string;
  }

  interface FindResPacket extends NetworkPacket, Response {
    type: 'findRes';
    found: boolean;
  }

  interface ConnectPacket extends NetworkPacket, Request {
    type: 'connect';
    ephemeralKey: string;
    addrs: MultiAddr[];
  }
  interface ConnectResPacket extends NetworkPacket, Response {
    type: 'connectRes';
    accepted: boolean;
    method?: 'myAddr' | 'yourAddr' | 'webrtc';

    // for myAddr method
    addrs?: MultiAddr[];

    // for webrtc method's further connectSignal encryption
    ephemeralKey?: string;
  }
  interface ConnectSignalPacket extends NetworkPacket {
    type: 'connectSignal';
    encryptedSignal?: any;
  }

  interface JoinPacket extends Packet, Request {
    type: 'join';
    roomNameHash: RoomNameHash;
    roomName: string; // not hashed, can be kind of a passphrase
  }
  interface JoinResPacket extends Packet, Response {
    type: 'joinRes';
    ok: boolean;
    members?: PeerId[];
  }

  // ==========

  class SimpleRtcPeer {
  }
}

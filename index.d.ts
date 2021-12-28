import type { EventEmitter } from 'tsee';
import type WebSocket from 'isomorphic-ws';
import type KBucket from 'k-bucket';
import type crypto from 'libp2p-crypto';
import type debug from 'debug';

declare module 'unamed-network' {

  type UnamedNetworkEvents = {
    'new-known-service-addr': (event: { addr: MultiAddrStr }) => void,
    'new-member': (event: { memberPeer: Peer, room: Room }) => void,
    'member-left': (event: { memberPeer: Peer, room: Room }) => void,
    'room-message': (event: { room: Room, fromMember: Peer, message: any }) => void,
  }

  export default class UnamedNetwork extends EventEmitter<UnamedNetworkEvents> {
    readonly id: PeerId;
    readonly addrs: MultiAddrStr[];
    readonly nodeType: NodeType;
    readonly rooms: Map<RoomNameHash, Room>;
    readonly primaryRoomNameHash: RoomNameHash | null; // for kBucket's localNodeId, which determine this node's location in Kademlia DHT network
    readonly peers: Map<PeerId, Peer>;
    readonly kBucket: KBucket<KBucketContact>; // rooms without other peers should not be added

    readonly knownServiceAddrs: MultiAddrStr[];
    readonly started: boolean;
    readonly config: Config;
    readonly iceServers: RTCIceServers;
    readonly providing?: Providing;

    private requestResolveRejects: Map<ReqId, [(payload: any) => void, (error: any) => void]>;
    private broadcastedMessages: Map<string, () => void>; // value is a fn to clearTimeout
    private pubsubPollLostInterval: ReturnType<typeof setInterval>;

    constructor(config?: Config);
    start(knownServiceAddrs: MultiAddrStr[], myAddrs?: MultiAddrStr[]): Promise<void>;

    receiveAddrConn(ws: WebSocket);

    /** @returns if room has other peers */
    join(roomName: string, makePrimary?: boolean): Promise<boolean>;

    // TODO: implement, cannot leave primary room, must join another primary first
    // leave(roomName: string)

    broadcast(roomName: string, message: any, recipients?: PeerId): void;
  }

  type RTCIceServers = ConstructorParameters<typeof RTCPeerConnection>[0]['iceServers']

  interface Config {
    id?: PeerId;
    iceServers?: RTCIceServers;
    providing?: Providing;
  }

  type RoomNameHash = string;
  type RoomNameHashBuffer = Uint8Array;
  type PeerId = string;
  type MultiAddrStr = string;
  type ReqId = string;
  type NodeType = 'serviceNode' | 'clientNode';
  type RoomMemberState = 'pending' | 'connected' | 'joined' | 'failed';
  type PeerConnState = 'pending' | 'connected' | 'closing';

  interface Room {
    roomNameHash: RoomNameHash;
    joined: boolean;
    name?: string; // not hashed, only room member knows
    members: Map<PeerId, RoomMemberState>;
  }
  interface Peer {
    peerId: PeerId;
    state: PeerConnState;
    addrs: MultiAddrStr[];
    nodeType: NodeType;
    roomNameHashes: RoomNameHash[];
    connectedResolves: ((peer: Peer) => void)[];
    closingAndRejects: ((peer: Peer) => void)[];
    ws?: WebSocket;
    rtc?: Rtc;

    pending?: Pick<Peer, 'ws' | 'connectedResolves'>;
  }
  interface KBucketContact {
    id: RoomNameHashBuffer;
    roomNameHash: RoomNameHash;
    vectorClock: number;
  }

  type Ephemeral = Awaited<ReturnType<typeof crypto.keys.generateEphemeralKeyPair>>;
  type Encrypter = Awaited<ReturnType<typeof crypto.aes.create>>;
  type Decrypter = Awaited<ReturnType<typeof crypto.aes.create>>;
  type Chunk = Uint8Array;
  interface Rtc {
    simplePeer: SimpleRtcPeer;
    ephemeral: Ephemeral;
    encrypter: Encrypter;
    decrypter: Decrypter;
    sendingChunks: Chunk[];
    sendingResolves: (() => void)[];
    chunksSender?: () => void;
    chunksReceived: Chunk[];
  }

  interface Providing {
    iceServers?: RTCIceServers;
  }

  // Packets (just as memo)

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
    id: string;
    addrs: MultiAddrStr[];
    roomNameHashes: RoomNameHash[];
    providing?: Providing;
  }
  interface PongPacket extends Packet, Response {
    type: 'pong';
    addrs: MultiAddrStr[];
    roomNameHashes: RoomNameHash[];
    providing?: Providing;
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
    addrs: MultiAddrStr[];
  }
  interface ConnectResPacket extends NetworkPacket, Response {
    type: 'connectRes';
    accepted: boolean;
    method?: 'myAddr' | 'yourAddr' | 'webrtc';

    // for myAddr method
    addrs?: MultiAddrStr[];

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

  interface RoomMessagePacket extends Packet {
    type: 'roomMessage';
    roomNameHash: RoomNameHash;
    author: PeerId;
    message: any;
    recipients: []; // empty means everyone
  }

  // 3rd package that don't have typings:

  class SimpleRtcPeer {
  }
}

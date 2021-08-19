/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./src/agent.ts":
/*!**********************!*\
  !*** ./src/agent.ts ***!
  \**********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _misc_event_target__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./misc/event-target */ "./src/misc/event-target.ts");
/* harmony import */ var _router__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./router */ "./src/router.ts");
/* harmony import */ var _message_network__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./message/network */ "./src/message/network.ts");
/* harmony import */ var _misc_events__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./misc/events */ "./src/misc/events.ts");
/* harmony import */ var _misc_identity__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ./misc/identity */ "./src/misc/identity.ts");
/* harmony import */ var _tunnel__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ./tunnel */ "./src/tunnel.ts");
/* harmony import */ var _request__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ./request */ "./src/request.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_7__ = __webpack_require__(/*! ./misc/utils */ "./src/misc/utils.ts");








const agentDefaultConfig = {
    routeTtl: 10,
    requestTimeout: 1000,
};
class Agent extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(connManager, config = {}) {
        super();
        this.receivedMsgId = new Set();
        this.myIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_4__.default(config);
        this.config = { ...agentDefaultConfig, ...config };
        this.connManager = connManager;
        this.router = new _router__WEBPACK_IMPORTED_MODULE_1__.default();
        this.tunnelManager = new _tunnel__WEBPACK_IMPORTED_MODULE_5__.default(this);
        this.requestManager = new _request__WEBPACK_IMPORTED_MODULE_6__.default(this, {
            timeout: this.config.requestTimeout,
        });
        this.connManager.addEventListener('new-conn', event => {
            this.onNewConn(event);
        });
        this.connManager.addEventListener('close', event => {
            this.onConnClose(event);
        });
        this.connManager.addEventListener('receive', event => {
            this.onReceive(event);
        });
        this.requestManager.addEventListener('requested', event => {
            this.onRequested(event);
        });
    }
    async start() {
        await this.myIdentity.generateIfNeeded();
        await this.connManager.start(this);
        await this.router.start(this.myIdentity.addr);
    }
    async connect(peerPath, spacePath = '') {
        const peerAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.extractAddrFromPath)(peerPath);
        if (!this.connManager.hasConn(peerAddr)) {
            await this.connManager.connect(peerPath, {});
        }
        await this.router.addPath(peerPath);
        const notificationMessage = {
            term: 'join-space-notification',
        };
        this.send(peerPath, notificationMessage, spacePath);
        return true;
    }
    async join(spacePath = '') {
        const space = this.router.initSpace(spacePath);
        let connectSpaceNeighborSucceed = false;
        let connectSpaceNeighborTried = 0;
        let addrResponse;
        while (!connectSpaceNeighborSucceed && connectSpaceNeighborTried < 3) {
            try {
                connectSpaceNeighborTried++;
                addrResponse = await this.connectSpaceNeighbor(space);
                connectSpaceNeighborSucceed = true;
            }
            catch (err) {
                console.warn(`agent.ts: join: connectSpaceNeighbor failed, #${connectSpaceNeighborTried} retry in 3 secs...`, err);
                await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.wait)(3000);
            }
        }
        if (!connectSpaceNeighborSucceed)
            return false;
        let connectSpacePeersSucceed = false;
        let connectSpacePeersTried = 0;
        while (!connectSpacePeersSucceed && connectSpacePeersTried < 3) {
            try {
                connectSpacePeersTried++;
                await this.connectSpacePeers(space, addrResponse.addrs, (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.extractAddrFromPath)(addrResponse.srcPath));
                connectSpacePeersSucceed = true;
            }
            catch (err) {
                console.warn(`agent.ts: join: connectSpacePeers failed, #${connectSpacePeersTried} retry in 3 secs...`, err);
                await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.wait)(3000);
            }
        }
        return true;
    }
    async connectSpaceNeighbor(space) {
        const request = await this.requestManager.request((0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.joinPath)(space.path, this.myIdentity.addr), { term: 'query-addrs' });
        const addrResponse = (0,_message_network__WEBPACK_IMPORTED_MODULE_2__.deriveQueryAddrsResponseMessage)(request.responseMessage);
        await this.connect(addrResponse.srcPath, space.path);
        return addrResponse;
    }
    async connectSpacePeers(space, knownAddrs, neighborPath) {
        const [neighborSpace, neighborAddr] = this.router.getSpaceAndAddr(neighborPath);
        if (neighborSpace !== space)
            return;
        const addrAndHashes = await (0,_router__WEBPACK_IMPORTED_MODULE_1__.hashLine)(knownAddrs);
        const existingKBuckets = this.router.buildSpaceKBuckets(space.path);
        const responseKBuckets = this.router.buildKBuckets(addrAndHashes);
        const nextRequestKBuckets = (0,_router__WEBPACK_IMPORTED_MODULE_1__.mergeKBuckets)(existingKBuckets, responseKBuckets);
        this.router.removeLines(nextRequestKBuckets, [this.router.getLine(space.path, neighborAddr)]);
        let nextRequestMaxK = -1;
        let nextRequestMinK = Number.MAX_VALUE;
        nextRequestKBuckets.forEach((_bucket, k) => {
            if (k < nextRequestMinK)
                nextRequestMinK = k;
            if (k > nextRequestMaxK)
                nextRequestMaxK = k;
        });
        const nextRequestAddrs = (nextRequestKBuckets.size > 0 ? (nextRequestKBuckets.size >= 2 ? [nextRequestMaxK, nextRequestMinK] : [nextRequestMaxK]) : []).map(k => nextRequestKBuckets.get(k)).map(lines => lines[Math.floor(Math.random() * lines.length)][1]);
        let connectingKBuckets = responseKBuckets;
        await Promise.all(nextRequestAddrs.map(async (addr) => {
            const subRequest = await this.requestManager.request((0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.joinPath)(space.path, addr), { term: 'query-addrs' });
            const subAddrResponse = (0,_message_network__WEBPACK_IMPORTED_MODULE_2__.deriveQueryAddrsResponseMessage)(subRequest.responseMessage);
            const addrAndHashes = await (0,_router__WEBPACK_IMPORTED_MODULE_1__.hashLine)(subAddrResponse.addrs);
            connectingKBuckets = (0,_router__WEBPACK_IMPORTED_MODULE_1__.mergeKBuckets)(connectingKBuckets, this.router.buildKBuckets(addrAndHashes));
        }));
        this.router.removeLines(connectingKBuckets, space.table);
        const addrsToConnect = this.router.pickAddrsToConnect(connectingKBuckets, existingKBuckets);
        await Promise.all(addrsToConnect.map(addr => (this.connect((0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.joinPath)(space.path, addr), space.path))));
    }
    // WIP
    leave(_spacePath) { }
    listKnownAddrs(_spacePath) { }
    broadcast(_spacePath) { }
    send(path, message, srcSpacePath) {
        return this.route({
            srcPath: (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.joinPath)(srcSpacePath || '', this.myIdentity.addr),
            desPath: path,
            ...message,
        });
    }
    async onNewConn(event) {
        await this.router.addPath(event.detail.peerPath);
        this.dispatchEvent(event);
    }
    onReceive(event) {
        this.tunnelManager.cacheReceive(event.fromConn.peerIdentity.addr, event.srcAddr, event.detail);
        this.requestManager.cacheReceive(event.fromConn.peerIdentity.addr, event.srcAddr, event.detail);
        // TODO: what if this client is not in the dirname?
        if (event.desAddr === this.myIdentity.addr) {
            this.onReceiveMessage(event);
        }
        else {
            this.route(event.detail, event);
        }
    }
    async onReceiveMessage(event) {
        if (this.tunnelManager.onReceiveMessage(event))
            return;
        this.handleReceiveNetworkMessage(new _misc_events__WEBPACK_IMPORTED_MODULE_3__.NetworkMessageReceivedEvent(event, true));
    }
    async route(message, receiveEvent) {
        const networkMessage = (0,_message_network__WEBPACK_IMPORTED_MODULE_2__.deriveNetworkMessage)(message, this.config.routeTtl);
        const { srcPath, desPath, msgId } = networkMessage;
        const srcAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.extractAddrFromPath)(srcPath);
        const desAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.extractAddrFromPath)(desPath);
        if (networkMessage.ttl < 0) {
            console.warn(`message run out of ttl from '${srcPath}' to '${desPath}', dropping message:`, message);
            return false;
        }
        if (this.receivedMsgId.has(msgId)) {
            console.warn(`received twice (or more) same message with msgId '${msgId}' from '${srcPath}' to '${desPath}', dropping message:`, message);
            return false;
        }
        else {
            this.receivedMsgId.add(msgId);
        }
        // TODO: after DHT is done, this might be removed making sure not routing back for initial query-node
        if (this.connManager.hasConn(desAddr) && (receiveEvent === null || receiveEvent === void 0 ? void 0 : receiveEvent.fromConn.peerIdentity.addr) !== desAddr) {
            return this.connManager.send(desAddr, networkMessage);
        }
        const tunnelThroughAddr = this.tunnelManager.route(networkMessage);
        if (this.connManager.hasConn(tunnelThroughAddr)) {
            return this.connManager.send(tunnelThroughAddr, networkMessage);
        }
        const requestThroughAddr = this.requestManager.route(networkMessage);
        if (this.connManager.hasConn(requestThroughAddr)) {
            return this.connManager.send(requestThroughAddr, networkMessage);
        }
        const result = await this.router.route(desPath, receiveEvent === null || receiveEvent === void 0 ? void 0 : receiveEvent.fromConn.peerIdentity.addr);
        if (receiveEvent && result.mightBeForMe && srcAddr !== this.myIdentity.addr) {
            if (this.routeMessageMightBeForMe(receiveEvent))
                return true;
        }
        if (result.addrs.length === 0) {
            console.warn([
                'agent.ts: send: no available addr to send, router table:',
                this.router.printableTable(desPath),
            ].join('\n'), { result, message });
            return false;
        }
        if (result.broadcast) { // might need to do something before sending out
            result.addrs.forEach(addr => this.connManager.send(addr, networkMessage));
            return true;
        }
        else {
            if (result.notMakingProgressFromBase) {
                // TODO: after join flow complete, this should drop message
                // but allow srcAddr === fromAddr because srcPeer can be connecting first peer
                console.warn([
                    `agent.ts: onRoute: message from ${srcPath} to ${desPath} not making progress, router table:`,
                    this.router.printableTable(desPath),
                ].join('\n'), { result, message });
            }
            result.addrs.forEach(addr => this.connManager.send(addr, networkMessage));
            return true;
        }
    }
    routeMessageMightBeForMe(event) {
        const networkMessageEvent = new _misc_events__WEBPACK_IMPORTED_MODULE_3__.NetworkMessageReceivedEvent(event, false);
        return this.handleReceiveNetworkMessage(networkMessageEvent);
    }
    handleReceiveNetworkMessage(event) {
        if (this.requestManager.onReceiveNetworkMessage(event)) {
            return true;
        }
        ;
        let handled = false;
        switch (event.detail.term) {
            case 'join-space-notification':
                handled = this.handleJoinSpaceMessage(event.detail);
                break;
        }
        if (handled)
            return true;
        this.dispatchEvent(event);
        return event.defaultPrevented;
    }
    handleJoinSpaceMessage(message) {
        this.router.addPath(message.srcPath);
        return true;
    }
    async onConnClose(event) {
        this.router.rmAddr(event.detail.conn.peerIdentity.addr);
        this.dispatchEvent(event);
    }
    onRequested(event) {
        switch (event.detail.term) {
            case 'query-addrs':
                return this.onRequestedAddrs((0,_message_network__WEBPACK_IMPORTED_MODULE_2__.deriveQueryAddrsMessage)(event.detail), event);
        }
    }
    onRequestedAddrs(message, event) {
        let [space, _target, upperSpaces] = this.router.getSpaceAndAddr(message.desPath, false);
        const srcAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_7__.extractAddrFromPath)(message.srcPath);
        const response = {
            term: 'query-addrs-response',
            ...(space ? ({
                addrs: [
                    ...space.table.map(line => line[1]).filter(addr => addr !== srcAddr),
                ],
                responseSpace: space.path,
            }) : ({
                addrs: [],
                responseSpace: upperSpaces[upperSpaces.length - 1].path
            })),
        };
        event.response(response);
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Agent);


/***/ }),

/***/ "./src/conn-manager/base.ts":
/*!**********************************!*\
  !*** ./src/conn-manager/base.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "RequestToConnEvent": () => (/* binding */ RequestToConnEvent),
/* harmony export */   "NewConnEvent": () => (/* binding */ NewConnEvent),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _misc_event_target__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../misc/event-target */ "./src/misc/event-target.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../misc/utils */ "./src/misc/utils.ts");


class RequestToConnEvent extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.CustomEvent {
    constructor(detail) {
        super(detail);
        this.type = 'request-to-conn';
        this.peerAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_1__.extractAddrFromPath)(detail.peerPath);
    }
    reject() {
        this.defaultPrevented = false;
    }
}
class NewConnEvent extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.CustomEvent {
    constructor() {
        super(...arguments);
        this.type = 'new-conn';
    }
}
const configDefault = {
    newConnTimeout: 10000,
    requestToConnTimeout: 10000,
};
class ConnManager extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(config = {}) {
        super();
        this.conns = {};
        this.config = { ...configDefault, ...config };
    }
    connect(peerPath, opts) {
        const peerAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_1__.extractAddrFromPath)(peerPath);
        if (peerAddr in this.conns) {
            console.warn(`Peer '${peerAddr}' already connected, original conn will be closed`);
        }
        const timeout = opts.beingConnected ? this.config.newConnTimeout : this.config.requestToConnTimeout;
        if (peerAddr.match(/^wss?:\/\//)) {
            return this.connectWs(peerPath, { timeout, ...opts });
        }
        else {
            return this.connectUnnamed(peerPath, { timeout, ...opts });
        }
    }
    connCount() {
        return Object.entries(this.conns).length;
    }
    hasConn(peerAddr) {
        return peerAddr in this.conns;
    }
    send(peerAddr, message) {
        const conn = this.conns[peerAddr];
        if (conn) {
            conn.send(message);
            return true;
        }
        return false;
    }
    addConn(peerAddr, conn, peerPath) {
        const reconnected = peerAddr in this.conns;
        if (reconnected) {
            this.conns[peerAddr].close();
        }
        this.conns[peerAddr] = conn;
        conn.addEventListener('receive', event => {
            this.dispatchEvent(event);
        });
        conn.addEventListener('close', event => {
            this.dispatchEvent(event);
            if (conn.connId === this.conns[peerAddr].connId) { // prevent reconnect closing delete new connection
                delete this.conns[peerAddr];
            }
        });
        this.dispatchEvent(new NewConnEvent({ conn, peerPath, reconnected }));
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (ConnManager);


/***/ }),

/***/ "./src/conn-manager/wss.ts":
/*!*********************************!*\
  !*** ./src/conn-manager/wss.ts ***!
  \*********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _base__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base */ "./src/conn-manager/base.ts");
/* harmony import */ var _conn_ws__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../conn/ws */ "./src/conn/ws.ts");
/* harmony import */ var ws__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ws */ "ws");
/* harmony import */ var ws__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(ws__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _misc_identity__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../misc/identity */ "./src/misc/identity.ts");
/* harmony import */ var _message_message__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../message/message */ "./src/message/message.ts");
/* harmony import */ var _message_conn__WEBPACK_IMPORTED_MODULE_5__ = __webpack_require__(/*! ../message/conn */ "./src/message/conn.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_6__ = __webpack_require__(/*! ../misc/utils */ "./src/misc/utils.ts");








class WssConnManager extends _base__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(config = {}, opts = {}) {
        super(config);
        this.pendingWsConns = {};
        this.serverOpts = opts;
    }
    async start(agent) {
        this.agent = agent;
        const { hostname, port } = new URL(this.agent.myIdentity.addr);
        this.serverOpts = {
            host: hostname, port: parseInt(port),
            ...this.serverOpts,
        };
        this.server = new ws__WEBPACK_IMPORTED_MODULE_2__.Server(this.serverOpts);
        this.server.on('connection', (websocket) => {
            this.onNewConnection(websocket);
        });
    }
    onNewConnection(ws) {
        let ok = false;
        ws.addEventListener('message', async (event) => {
            const message = (0,_message_message__WEBPACK_IMPORTED_MODULE_4__.toMessage)(JSON.parse(event.data.toString()));
            switch (message === null || message === void 0 ? void 0 : message.term) {
                case 'requestToConn':
                    ok = await this.onNewConnSentRequestToConn(ws, message);
                    break;
                case 'requestToConnResult':
                    ok = await this.onNewConnSentRequestToConnResult(ws, message);
                    break;
            }
        }, { once: true });
        setTimeout(() => {
            if (!ok) {
                console.warn(`WssConnManager.onNewConnection: new connection timeout`);
                ws.close();
            }
        }, this.config.newConnTimeout);
    }
    async onNewConnSentRequestToConn(ws, message) {
        const requestToConnMessage = (0,_message_conn__WEBPACK_IMPORTED_MODULE_5__.newRequestToConnMessage)(message);
        if (requestToConnMessage) {
            const { srcPath: peerPath } = requestToConnMessage;
            const peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_3__.PeerIdentity(peerPath, requestToConnMessage.signingPubKey, requestToConnMessage.encryptionPubKey);
            if (await peerIdentity.verify(requestToConnMessage.signature)) {
                const event = new _base__WEBPACK_IMPORTED_MODULE_0__.RequestToConnEvent({ peerPath, peerIdentity });
                this.dispatchEvent(event);
                if (!event.defaultPrevented) {
                    if (event.peerAddr.match(/^wss?:\/\//)) {
                        return this.onNewConnSentRequestToConnByWs(ws, peerPath, peerIdentity);
                    }
                    else {
                        return this.onNewConnSentRequestToConnByUnnamed(ws, peerPath, peerIdentity);
                    }
                }
            }
        }
        return false;
    }
    async onNewConnSentRequestToConnByWs(ws, peerPath, peerIdentity) {
        ws.close();
        const conn = new _conn_ws__WEBPACK_IMPORTED_MODULE_1__.default();
        await conn.startLink({
            myIdentity: this.agent.myIdentity, peerPath,
            peerIdentity,
            beingConnected: true,
            timeout: this.config.newConnTimeout
        });
        this.addConn(peerIdentity.addr, conn, peerPath);
        return true;
    }
    async onNewConnSentRequestToConnByUnnamed(ws, peerPath, peerIdentity) {
        const message = await (0,_message_conn__WEBPACK_IMPORTED_MODULE_5__.makeRequestToConnResultMessage)(this.agent.myIdentity, peerPath);
        ws.send(JSON.stringify(message));
        const conn = new _conn_ws__WEBPACK_IMPORTED_MODULE_1__.default();
        conn.startFromExisting(ws, { peerIdentity });
        this.addConn(peerIdentity.addr, conn, peerPath);
        return true;
    }
    async onNewConnSentRequestToConnResult(ws, message) {
        const requestToConnResultMessage = (0,_message_conn__WEBPACK_IMPORTED_MODULE_5__.newRequestToConnResultMessage)(message);
        if (requestToConnResultMessage) {
            const { srcPath: peerPath } = requestToConnResultMessage;
            const peerAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_6__.extractAddrFromPath)(peerPath);
            const conn = this.pendingWsConns[peerAddr];
            if (conn) {
                delete this.pendingWsConns[peerAddr];
                conn.peerIdentity.setSigningPubKey(requestToConnResultMessage.signingPubKey);
                conn.peerIdentity.setEncryptionPubKey(requestToConnResultMessage.encryptionPubKey);
                if (await conn.peerIdentity.verify(requestToConnResultMessage.signature)) {
                    conn.startFromExisting(ws, {});
                    this.addConn(peerAddr, conn, peerPath);
                    return true;
                }
            }
        }
        return false;
    }
    async connectWs(peerPath, _opts) {
        const conn = new _conn_ws__WEBPACK_IMPORTED_MODULE_1__.default();
        const peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_3__.PeerIdentity(peerPath);
        this.pendingWsConns[peerIdentity.addr] = conn;
        conn.startLink({
            myIdentity: this.agent.myIdentity, peerPath,
            peerIdentity,
            waitForWs: true,
            timeout: this.config.requestToConnTimeout,
        });
        const ws = new (ws__WEBPACK_IMPORTED_MODULE_2___default())(peerIdentity.addr);
        ws.onopen = async () => {
            ws.send(JSON.stringify(await (0,_message_conn__WEBPACK_IMPORTED_MODULE_5__.makeRequestToConnMessage)(this.agent.myIdentity, peerPath)));
        };
        setTimeout(() => {
            ws.close();
        }, this.config.requestToConnTimeout);
    }
    async connectUnnamed(peerPath, _opts) {
        const conn = new _conn_ws__WEBPACK_IMPORTED_MODULE_1__.default();
        const peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_3__.PeerIdentity(peerPath);
        this.pendingWsConns[peerIdentity.addr] = conn;
        const startLinkPromise = conn.startLink({
            myIdentity: this.agent.myIdentity, peerPath,
            peerIdentity,
            timeout: this.config.requestToConnTimeout,
            waitForWs: true,
        });
        const connVia = await this.agent.tunnelManager.create(peerPath);
        connVia.send(await (0,_message_conn__WEBPACK_IMPORTED_MODULE_5__.makeRequestToConnMessage)(this.agent.myIdentity, peerPath));
        await startLinkPromise;
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (WssConnManager);


/***/ }),

/***/ "./src/conn/base.ts":
/*!**************************!*\
  !*** ./src/conn/base.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "MessageReceivedEvent": () => (/* binding */ MessageReceivedEvent),
/* harmony export */   "ConnCloseEvent": () => (/* binding */ ConnCloseEvent),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _misc_event_target__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../misc/event-target */ "./src/misc/event-target.ts");
/* harmony import */ var _message_message__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../message/message */ "./src/message/message.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../misc/utils */ "./src/misc/utils.ts");




class MessageReceivedEvent extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.CustomEvent {
    constructor(fromConn, detail) {
        super(detail);
        this.type = 'receive';
        this.fromConn = fromConn;
        this.srcAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_2__.extractAddrFromPath)(detail.srcPath);
        this.desAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_2__.extractAddrFromPath)(detail.desPath);
    }
}
class ConnCloseEvent extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.CustomEvent {
    constructor() {
        super(...arguments);
        this.type = 'close';
    }
}
class Conn extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(connId) {
        super();
        this.state = "NOT_CONNECTED" /* NOT_CONNECTED */;
        this.connId = connId || (0,_misc_utils__WEBPACK_IMPORTED_MODULE_2__.randomStr)();
    }
    onMessageData(data) {
        const messageContent = (0,_message_message__WEBPACK_IMPORTED_MODULE_1__.toMessage)(JSON.parse(data));
        if (messageContent) {
            this.dispatchEvent(new MessageReceivedEvent(this, messageContent));
        }
    }
    onClose(detail) {
        this.dispatchEvent(new ConnCloseEvent(detail));
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Conn);


/***/ }),

/***/ "./src/conn/ws.ts":
/*!************************!*\
  !*** ./src/conn/ws.ts ***!
  \************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _base__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base */ "./src/conn/base.ts");
/* harmony import */ var _misc_identity__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../misc/identity */ "./src/misc/identity.ts");
/* harmony import */ var _message_conn__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../message/conn */ "./src/message/conn.ts");
/* harmony import */ var ws__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ws */ "ws");
/* harmony import */ var ws__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(ws__WEBPACK_IMPORTED_MODULE_3__);





// importing 'ws' node_modules when targeting browser will only get a function that throw error: ws does not work in the browser
const WebSocket = typeof window === 'undefined' ? (ws__WEBPACK_IMPORTED_MODULE_3___default()) : window.WebSocket;
class WsConn extends _base__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor() {
        super(...arguments);
        this.connStartResolve = () => { };
        this.connStartReject = () => { };
        this.pendingMessages = [];
        this.closing = false;
    }
    startLink(opts) {
        return new Promise((resolve, reject) => {
            this.peerIdentity = opts.peerIdentity || new _misc_identity__WEBPACK_IMPORTED_MODULE_1__.PeerIdentity(opts.peerPath);
            this.connStartResolve = resolve;
            this.connStartReject = () => {
                this.state = "FAILED" /* FAILED */;
                reject();
            };
            setTimeout(() => {
                if (this.state !== "CONNECTED" /* CONNECTED */) {
                    this.connStartReject(new Error(`conn/ws.ts: startLink: connecting to ${this.peerIdentity.addr} timeout`));
                }
            }, opts.timeout);
            if (opts.waitForWs)
                return;
            this.ws = new WebSocket(this.peerIdentity.addr);
            this.ws.onerror = (error) => {
                console.error('ws.ts: ws.onerror', error);
                this.connStartReject(new Error(`conn/ws.ts: startLink: connecting to ${this.peerIdentity.addr} failed, ws error`));
            };
            if (opts.beingConnected) {
                // being connected from wss -> browser: wss ask browser to connect
                this.beingConnectingFlow(opts.peerPath, opts.myIdentity);
            }
            else {
                this.connectingFlow(opts.peerPath, opts.myIdentity);
            }
        });
    }
    beingConnectingFlow(peerPath, myIdentity) {
        this.ws.onopen = async () => {
            const message = await (0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.makeRequestToConnResultMessage)(myIdentity, peerPath);
            this.ws.send(JSON.stringify(message));
            this.finishStarting();
        };
    }
    connectingFlow(peerPath, myIdentity) {
        this.ws.onmessage = async (message) => {
            this.ws.onmessage = (message) => {
                this.pendingMessages.push(message.data.toString());
            };
            const resultMsg = (0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.toRequestToConnResultMessage)(JSON.parse(message.data.toString()));
            this.peerIdentity.setSigningPubKey(resultMsg.signingPubKey);
            this.peerIdentity.setEncryptionPubKey(resultMsg.encryptionPubKey);
            if (await this.peerIdentity.verify(resultMsg.signature)) {
                this.finishStarting();
            }
        };
        this.ws.onopen = async () => {
            const message = await (0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.makeRequestToConnMessage)(myIdentity, peerPath);
            this.ws.send(JSON.stringify(message));
        };
    }
    startFromExisting(ws, opts) {
        if (opts.peerIdentity) {
            this.peerIdentity = opts.peerIdentity;
        }
        this.ws = ws;
        this.finishStarting();
    }
    finishStarting() {
        this.state = "CONNECTED" /* CONNECTED */;
        this.ws.onmessage = (message) => {
            this.onMessageData(message.data.toString());
        };
        this.ws.onclose = (wsEvent) => {
            this.state = "CLOSED" /* CLOSED */;
            this.onClose({ wsEvent, conn: this, bySelf: this.closing });
        };
        this.connStartResolve();
        queueMicrotask(() => {
            this.pendingMessages.forEach(msg => {
                this.onMessageData(msg);
            });
        });
    }
    async close() {
        this.closing = true;
        this.ws.close();
    }
    async send(message) {
        this.ws.send(JSON.stringify(message));
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (WsConn);


/***/ }),

/***/ "./src/dev/share.ts":
/*!**************************!*\
  !*** ./src/dev/share.ts ***!
  \**************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "ping": () => (/* binding */ ping),
/* harmony export */   "handleRequest": () => (/* binding */ handleRequest)
/* harmony export */ });
async function ping(agent, desPath) {
    const request = await agent.requestManager.request(desPath, {
        term: 'ping', r: 10,
    });
    console.log('ping response:', request.responseMessage);
    return request;
}
function handleRequest(event) {
    const message = event.detail;
    switch (message.term) {
        case 'ping':
            console.log('requested ping', message);
            event.response({ term: 'pong', r: message.r + 1 });
            break;
    }
}


/***/ }),

/***/ "./src/message/conn.ts":
/*!*****************************!*\
  !*** ./src/message/conn.ts ***!
  \*****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "toRequestToConnMessage": () => (/* binding */ toRequestToConnMessage),
/* harmony export */   "newRequestToConnMessage": () => (/* binding */ newRequestToConnMessage),
/* harmony export */   "makeRequestToConnMessage": () => (/* binding */ makeRequestToConnMessage),
/* harmony export */   "toRequestToConnResultMessage": () => (/* binding */ toRequestToConnResultMessage),
/* harmony export */   "newRequestToConnResultMessage": () => (/* binding */ newRequestToConnResultMessage),
/* harmony export */   "makeRequestToConnResultMessage": () => (/* binding */ makeRequestToConnResultMessage),
/* harmony export */   "toRtcIceMessage": () => (/* binding */ toRtcIceMessage),
/* harmony export */   "newRtcIceMessage": () => (/* binding */ newRtcIceMessage)
/* harmony export */ });
/* harmony import */ var _message__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./message */ "./src/message/message.ts");

function toRequestToConnMessage(data) {
    return data.term === 'requestToConn' && newRequestToConnMessage(data);
}
function newRequestToConnMessage(data) {
    if (typeof data.signingPubKey === 'string' &&
        typeof data.encryptionPubKey === 'string' &&
        typeof data.signature.random === 'string' &&
        typeof data.signature.sign === 'string') {
        const message = {
            term: 'requestToConn',
            ...(0,_message__WEBPACK_IMPORTED_MODULE_0__.messageAddrs)(data),
            signingPubKey: data.signingPubKey,
            encryptionPubKey: data.encryptionPubKey,
            signature: {
                random: data.signature.random,
                sign: data.signature.sign,
            },
        };
        if (typeof data.offer === 'object') {
            message.offer = data.offer;
        }
        return message;
    }
}
async function makeRequestToConnMessage(myIdentity, peerPath, offer) {
    return {
        term: 'requestToConn',
        srcPath: myIdentity.addr, desPath: peerPath,
        signingPubKey: myIdentity.exportedSigningPubKey,
        encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
        signature: await myIdentity.signature(),
        offer
    };
}
function toRequestToConnResultMessage(data) {
    return data.term === 'requestToConnResult' && newRequestToConnResultMessage(data);
}
function newRequestToConnResultMessage(data) {
    if (typeof data.signingPubKey === 'string' &&
        typeof data.encryptionPubKey === 'string' &&
        typeof data.signature.random === 'string' &&
        typeof data.signature.sign === 'string') {
        const message = {
            term: 'requestToConnResult',
            ...(0,_message__WEBPACK_IMPORTED_MODULE_0__.messageAddrs)(data),
            signingPubKey: data.signingPubKey,
            encryptionPubKey: data.encryptionPubKey,
            signature: {
                random: data.signature.random,
                sign: data.signature.sign,
            },
        };
        if (typeof data.answer === 'object') {
            message.answer = data.answer;
        }
        return message;
    }
}
async function makeRequestToConnResultMessage(myIdentity, peerPath, answer) {
    return {
        term: 'requestToConnResult',
        srcPath: myIdentity.addr, desPath: peerPath,
        signingPubKey: myIdentity.exportedSigningPubKey,
        encryptionPubKey: myIdentity.expoertedEncryptionPubKey,
        signature: await myIdentity.signature(),
        answer,
    };
}
function toRtcIceMessage(data) {
    return data.term === 'rtcIce' && newRtcIceMessage(data);
}
function newRtcIceMessage(data) {
    if (typeof data.ice === 'object') {
        return {
            term: 'rtcIce',
            ...(0,_message__WEBPACK_IMPORTED_MODULE_0__.messageAddrs)(data),
            ice: data.ice,
        };
    }
}


/***/ }),

/***/ "./src/message/message.ts":
/*!********************************!*\
  !*** ./src/message/message.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "toMessage": () => (/* binding */ toMessage),
/* harmony export */   "messageAddrs": () => (/* binding */ messageAddrs)
/* harmony export */ });
function toMessage(data) {
    if (typeof data.term === 'string' &&
        typeof data.srcPath === 'string' &&
        typeof data.desPath === 'string') {
        return data;
    }
}
function messageAddrs(data) {
    return { srcPath: data.srcPath, desPath: data.desPath };
}


/***/ }),

/***/ "./src/message/network.ts":
/*!********************************!*\
  !*** ./src/message/network.ts ***!
  \********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "deriveNetworkMessage": () => (/* binding */ deriveNetworkMessage),
/* harmony export */   "deriveQueryAddrsMessage": () => (/* binding */ deriveQueryAddrsMessage),
/* harmony export */   "deriveQueryAddrsResponseMessage": () => (/* binding */ deriveQueryAddrsResponseMessage)
/* harmony export */ });
/* harmony import */ var _message__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./message */ "./src/message/message.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../misc/utils */ "./src/misc/utils.ts");


function deriveNetworkMessage(message, initTtl = 10) {
    const { ttl, msgId } = message;
    return {
        ...message,
        ttl: (ttl !== null && ttl !== void 0 ? ttl : initTtl) - 1,
        msgId: msgId !== null && msgId !== void 0 ? msgId : (0,_misc_utils__WEBPACK_IMPORTED_MODULE_1__.randomStr)(),
    };
}
function deriveQueryAddrsMessage(data) {
    return {
        ...(0,_message__WEBPACK_IMPORTED_MODULE_0__.toMessage)(data),
        term: 'query-addrs',
    };
}
function deriveQueryAddrsResponseMessage(data) {
    if (Array.isArray(data.addrs)) {
        return {
            ...(0,_message__WEBPACK_IMPORTED_MODULE_0__.toMessage)(data),
            term: 'query-addrs-response',
            addrs: data.addrs,
        };
    }
}


/***/ }),

/***/ "./src/misc/event-target.ts":
/*!**********************************!*\
  !*** ./src/misc/event-target.ts ***!
  \**********************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "CustomEvent": () => (/* binding */ CustomEvent),
/* harmony export */   "default": () => (/* binding */ EventTarget)
/* harmony export */ });
class CustomEvent {
    constructor(detail) {
        this.defaultPrevented = false;
        this.detail = detail;
    }
    preventDefault() {
        this.defaultPrevented = true;
    }
}
class EventTarget {
    constructor() {
        this.listeners = {};
    }
    addEventListener(type, listener) {
        if (!(type in this.listeners)) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(listener);
    }
    removeEventListener(type, listener) {
        if (!(type in this.listeners))
            return;
        const stack = this.listeners[type];
        stack.splice(stack.indexOf(listener, 1));
    }
    dispatchEvent(event) {
        if (!(event.type in this.listeners))
            return;
        this.listeners[event.type].slice().forEach(callback => {
            callback.call(this, event);
        });
        return !event.defaultPrevented;
    }
}


/***/ }),

/***/ "./src/misc/events.ts":
/*!****************************!*\
  !*** ./src/misc/events.ts ***!
  \****************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "NetworkMessageReceivedEvent": () => (/* binding */ NetworkMessageReceivedEvent)
/* harmony export */ });
/* harmony import */ var _event_target__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./event-target */ "./src/misc/event-target.ts");

class NetworkMessageReceivedEvent extends _event_target__WEBPACK_IMPORTED_MODULE_0__.CustomEvent {
    constructor(messageReceivedEvent, exactForMe) {
        super(messageReceivedEvent.detail);
        this.type = 'receive-network';
        this.messageReceivedEvent = messageReceivedEvent;
        this.exactForMe = exactForMe;
    }
}


/***/ }),

/***/ "./src/misc/identity.ts":
/*!******************************!*\
  !*** ./src/misc/identity.ts ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "PeerIdentity": () => (/* binding */ PeerIdentity)
/* harmony export */ });
/* harmony import */ var isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! isomorphic-webcrypto */ "isomorphic-webcrypto");
/* harmony import */ var isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _utils__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./utils */ "./src/misc/utils.ts");


const SIGNING_KEY_OPTS = {
    name: "ECDSA",
    namedCurve: "P-384"
};
const SIGNING_ALGORITHM_OPTS = {
    name: "ECDSA",
    hash: { name: "SHA-384" },
};
const ENCRYPTION_KEY_OPTS = {
    name: "RSA-OAEP",
    modulusLength: 4096,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256"
};
class Identity {
    constructor(config = {}) {
        if (config.myAddr)
            this.addr = config.myAddr;
        if (config.encryptionKeyPair)
            this.encryptionKeyPair = config.encryptionKeyPair;
        if (config.signingKeyPair)
            this.signingKeyPair = config.signingKeyPair;
    }
    async generateIfNeeded() {
        if (!this.signingKeyPair) {
            this.signingKeyPair = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.generateKey(SIGNING_KEY_OPTS, true, ["sign", "verify"]);
        }
        if (!this.encryptionKeyPair) {
            this.encryptionKeyPair = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.generateKey(ENCRYPTION_KEY_OPTS, true, ["encrypt", "decrypt"]);
        }
        this.exportedSigningPubKeyRaw = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.exportKey('raw', this.signingKeyPair.publicKey);
        this.expoertedEncryptionPubKeyRaw = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.exportKey('spki', this.encryptionKeyPair.publicKey);
        this.exportedSigningPubKey = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.arrayBufferTobase64)(this.exportedSigningPubKeyRaw);
        this.expoertedEncryptionPubKey = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.arrayBufferTobase64)(this.expoertedEncryptionPubKeyRaw);
        if (!this.addr) {
            const pubKeyHash = await calcUnnamedAddr(this.exportedSigningPubKeyRaw, this.expoertedEncryptionPubKeyRaw);
            this.addr = `#${(0,_utils__WEBPACK_IMPORTED_MODULE_1__.arrayBufferTobase64)(pubKeyHash)}`;
        }
    }
    async signature() {
        const random = new Uint8Array(32);
        isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().getRandomValues(random);
        const signature = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.sign(SIGNING_ALGORITHM_OPTS, this.signingKeyPair.privateKey, calcDataToBeSigned(this.expoertedEncryptionPubKeyRaw, random));
        return {
            random: (0,_utils__WEBPACK_IMPORTED_MODULE_1__.arrayBufferTobase64)(random),
            sign: (0,_utils__WEBPACK_IMPORTED_MODULE_1__.arrayBufferTobase64)(signature),
        };
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Identity);
class PeerIdentity {
    constructor(peerPath, peerSigningPubKeyBase64, peerEncryptionPubKeyBase64) {
        this.addr = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.extractAddrFromPath)(peerPath);
        if (peerSigningPubKeyBase64) {
            this.setSigningPubKey(peerSigningPubKeyBase64);
        }
        if (peerEncryptionPubKeyBase64) {
            this.setEncryptionPubKey(peerEncryptionPubKeyBase64);
        }
    }
    setSigningPubKey(peerSigningPubKeyBase64) {
        this.signingPubKey = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.base64ToArrayBuffer)(peerSigningPubKeyBase64);
    }
    setEncryptionPubKey(peerEncryptionPubKeyBase64) {
        this.encryptionPubKey = (0,_utils__WEBPACK_IMPORTED_MODULE_1__.base64ToArrayBuffer)(peerEncryptionPubKeyBase64);
    }
    async verify(signature) {
        if (this.addr.match(/^#/)) {
            const hashAddrVerified = await this.verifyUnnamedAddr();
            if (!hashAddrVerified)
                return false;
        }
        const signatureVerified = await this.verifySignature(signature);
        return signatureVerified;
    }
    async verifyUnnamedAddr() {
        const pubKeyHash = await calcUnnamedAddr(this.signingPubKey, this.encryptionPubKey);
        return (0,_utils__WEBPACK_IMPORTED_MODULE_1__.arrayBufferTobase64)(pubKeyHash) === this.addr.slice(1);
    }
    async verifySignature(signature) {
        const peerSigningPubKey = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.importKey('raw', this.signingPubKey, SIGNING_KEY_OPTS, false, ['verify']);
        const dataBeforeSigning = calcDataToBeSigned(this.encryptionPubKey, (0,_utils__WEBPACK_IMPORTED_MODULE_1__.base64ToArrayBuffer)(signature.random));
        return isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.verify(SIGNING_ALGORITHM_OPTS, peerSigningPubKey, (0,_utils__WEBPACK_IMPORTED_MODULE_1__.base64ToArrayBuffer)(signature.sign), dataBeforeSigning);
    }
}
function calcUnnamedAddr(signingPubKey, encryptionPubKey) {
    return isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.digest('SHA-512', concatArrayBuffer(signingPubKey, encryptionPubKey));
}
function calcDataToBeSigned(encryptionPubKey, random) {
    return concatArrayBuffer(encryptionPubKey, random);
}
function concatArrayBuffer(ab1, ab2) {
    const newArr = new Uint8Array(ab1.byteLength + ab2.byteLength);
    newArr.set(new Uint8Array(ab1));
    newArr.set(new Uint8Array(ab2), ab1.byteLength);
    return newArr.buffer;
}


/***/ }),

/***/ "./src/misc/utils.ts":
/*!***************************!*\
  !*** ./src/misc/utils.ts ***!
  \***************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "randomStr": () => (/* binding */ randomStr),
/* harmony export */   "arrayBufferTobase64": () => (/* binding */ arrayBufferTobase64),
/* harmony export */   "base64ToArrayBuffer": () => (/* binding */ base64ToArrayBuffer),
/* harmony export */   "extractAddrFromPath": () => (/* binding */ extractAddrFromPath),
/* harmony export */   "extractSpacePath": () => (/* binding */ extractSpacePath),
/* harmony export */   "joinPath": () => (/* binding */ joinPath),
/* harmony export */   "calcAddrOrSubSpaceHash": () => (/* binding */ calcAddrOrSubSpaceHash),
/* harmony export */   "formatFirstUint32Hex": () => (/* binding */ formatFirstUint32Hex),
/* harmony export */   "shuffle": () => (/* binding */ shuffle),
/* harmony export */   "wait": () => (/* binding */ wait)
/* harmony export */ });
/* harmony import */ var isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! isomorphic-webcrypto */ "isomorphic-webcrypto");
/* harmony import */ var isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0__);

function randomStr() {
    return Math.floor(Math.random() * Date.now()).toString(36);
}
function arrayBufferTobase64(ab) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(ab)));
}
function base64ToArrayBuffer(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
function extractAddrFromPath(path) {
    return path.split('>').slice(-1)[0];
}
function extractSpacePath(path) {
    return path.split('>').slice(0, -1).join('>');
}
function joinPath(path, target = '') {
    const pathSegs = Array.isArray(path) ? path : [path];
    return [...pathSegs, target].filter(seg => seg.length > 0).join('>');
}
async function calcAddrOrSubSpaceHash(addrOrSubSpace) {
    const hash = await isomorphic_webcrypto__WEBPACK_IMPORTED_MODULE_0___default().subtle.digest('SHA-512', (new TextEncoder()).encode(addrOrSubSpace));
    return new Uint32Array(hash);
}
function formatFirstUint32Hex(data) {
    return '0x' + ('00000000' + data[0].toString(16)).slice(-8);
}
function shuffle(array) {
    const newArray = [...array];
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return newArray;
}
function wait(timeout) {
    return new Promise(resolve => {
        setTimeout(resolve, timeout);
    });
}


/***/ }),

/***/ "./src/request.ts":
/*!************************!*\
  !*** ./src/request.ts ***!
  \************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "RequestedEvent": () => (/* binding */ RequestedEvent),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "Request": () => (/* binding */ Request)
/* harmony export */ });
/* harmony import */ var _misc_event_target__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./misc/event-target */ "./src/misc/event-target.ts");
/* harmony import */ var _misc_events__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./misc/events */ "./src/misc/events.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./misc/utils */ "./src/misc/utils.ts");



class RequestedEvent extends _misc_events__WEBPACK_IMPORTED_MODULE_1__.NetworkMessageReceivedEvent {
    constructor() {
        super(...arguments);
        this.type = 'requested';
    }
    response(message) {
        this.responseData = (async () => await message)();
    }
}
const DEFAULT_CONFIG = {
    timeout: 1000,
};
class RequestManager extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(agent, config = {}) {
        super();
        this.requests = {};
        this.requestIdToThroughs = {};
        this.agent = agent;
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };
    }
    onReceiveNetworkMessage(event) {
        const message = event.detail;
        const { requestId, direction } = message;
        if (requestId) {
            switch (direction) {
                case "request" /* Request */:
                    return this.onReceiveRequestMessage(message, event);
                case "response" /* Response */:
                    return this.onReceiveResponseMessage(message, event);
            }
        }
        return false;
    }
    onReceiveRequestMessage(message, event) {
        const requestedEvent = new RequestedEvent(event.messageReceivedEvent, event.exactForMe);
        this.dispatchEvent(requestedEvent);
        if (requestedEvent.responseData) {
            (async () => {
                const responseData = await requestedEvent.responseData;
                const responseMessage = {
                    ...responseData,
                    requestId: message.requestId,
                    direction: "response" /* Response */,
                };
                this.agent.send(event.detail.srcPath, responseMessage, responseData.responseSpace);
            })();
            return true;
        }
        return false;
    }
    onReceiveResponseMessage(message, _event) {
        const request = this.requests[message.requestId];
        if (request) {
            request.complete(message);
            return true;
        }
        return false;
    }
    async request(desPath, messageContent) {
        const request = new Request(desPath, messageContent);
        this.requests[request.requestId] = request;
        this.agent.send(desPath, request.requestMessage);
        return request.start(this.config.timeout);
    }
    cacheReceive(fromPeerAddr, srcAddr, message) {
        if (fromPeerAddr === srcAddr)
            return;
        const { requestId, direction } = message;
        if (!requestId || direction !== "request" /* Request */)
            return;
        let through = this.requestIdToThroughs[requestId];
        if (!through) {
            this.requestIdToThroughs[requestId] = [message.srcPath, fromPeerAddr];
        }
    }
    route(message) {
        const { requestId, direction } = message;
        if (requestId && direction === "response" /* Response */) {
            const through = this.requestIdToThroughs[requestId];
            if (through) {
                const [desPath, peerAddr] = through;
                if (message.desPath === desPath)
                    return peerAddr;
            }
        }
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (RequestManager);
class Request {
    constructor(desPath, messageContent, requestId) {
        this.desPath = desPath;
        this.requestId = requestId || (0,_misc_utils__WEBPACK_IMPORTED_MODULE_2__.randomStr)();
        this.requestMessage = {
            ...messageContent,
            requestId: this.requestId,
            direction: "request" /* Request */,
        };
    }
    start(timeout) {
        return new Promise((resolve, reject) => {
            this.resolveFn = resolve;
            setTimeout(() => {
                reject(new Error(`request.ts: request term: '${this.requestMessage.term}' from '${this.desPath}' has timeout`));
            }, timeout);
        });
    }
    complete(message) {
        this.responseMessage = message;
        this.resolveFn(this);
    }
}



/***/ }),

/***/ "./src/router.ts":
/*!***********************!*\
  !*** ./src/router.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "hashLine": () => (/* binding */ hashLine),
/* harmony export */   "mergeKBuckets": () => (/* binding */ mergeKBuckets),
/* harmony export */   "dbgLines": () => (/* binding */ dbgLines),
/* harmony export */   "dbgKBuckets": () => (/* binding */ dbgKBuckets),
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./misc/utils */ "./src/misc/utils.ts");

class Router {
    async start(myAddr) {
        this.myAddr = myAddr;
        this.myHash = await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.calcAddrOrSubSpaceHash)(this.myAddr);
        this.rootSpace = {
            table: [],
            name: '',
            path: '',
            subSpaces: {},
        };
    }
    initSpace(spacePath) {
        const pathSegs = spacePath.split('>');
        const mkSpaceP = (level, currentSpace) => {
            const currentSpaceName = pathSegs[level];
            if (!currentSpaceName)
                return currentSpace;
            let subSpace = currentSpace.subSpaces[currentSpaceName];
            if (!subSpace) {
                subSpace = {
                    table: [],
                    name: pathSegs[level],
                    path: (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.joinPath)(pathSegs.slice(0, level + 1)),
                    subSpaces: {},
                };
                currentSpace.subSpaces[currentSpaceName] = subSpace;
            }
            return mkSpaceP(level + 1, subSpace);
        };
        return mkSpaceP(0, this.rootSpace);
    }
    async addPath(path) {
        const addr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.extractAddrFromPath)(path);
        let [space, target, upperSpaces] = this.getSpaceAndAddr(path, false);
        if (!space) {
            space = upperSpaces.pop();
        }
        const hash = await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.calcAddrOrSubSpaceHash)(target);
        addLine(space.table, [hash, addr]);
        const addrHash = await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.calcAddrOrSubSpaceHash)(addr);
        while (upperSpaces.length > 0) {
            space = upperSpaces.pop();
            addLine(space.table, [addrHash, addr]);
        }
    }
    rmAddr(addr) {
        const rmAddrR = (currentSpace) => {
            const index = currentSpace.table.findIndex(([_, lineAddr]) => lineAddr === addr);
            if (index !== -1) {
                currentSpace.table.splice(index, 1);
            }
            Object.entries(currentSpace.subSpaces).forEach(([_, space]) => {
                rmAddrR(space);
            });
        };
        rmAddrR(this.rootSpace);
    }
    getSpaceAndAddr(path = '', exact = true) {
        const pathSegs = path.split('>');
        let currentSpace = this.rootSpace;
        const upperSpaces = [];
        while (pathSegs.length > 1) {
            if (pathSegs[0]) {
                upperSpaces.push(currentSpace);
                currentSpace = currentSpace.subSpaces[pathSegs[0]];
                if (!currentSpace) {
                    if (exact) {
                        throw new Error(`router.ts: getSpaceAndAddr: space ${(0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.joinPath)(pathSegs.slice(0, -1))} not exists`);
                    }
                    else {
                        return [null, pathSegs[0], upperSpaces];
                    }
                }
            }
            pathSegs.shift();
        }
        return [currentSpace, pathSegs[0], upperSpaces];
    }
    getSpace(spacePath, exact = true) {
        const pathSegs = spacePath.split('>');
        let currentSpace = this.rootSpace;
        while (pathSegs.length > 0) {
            if (pathSegs[0]) {
                currentSpace = currentSpace.subSpaces[pathSegs[0]];
                if (!currentSpace && exact)
                    throw new Error(`router.ts: getSpace: space ${spacePath} not exists`);
            }
            pathSegs.shift();
        }
        return currentSpace;
    }
    getLine(spacePath, addr) {
        const space = this.getSpace(spacePath);
        return space.table.find(line => line[1] === addr);
    }
    printableTable(pathWithAddr) {
        const [space] = this.getSpaceAndAddr(pathWithAddr, false);
        if (space)
            return this.getSpaceAndAddr(pathWithAddr, true)[0].table.map(([hash, addr]) => `${(0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.formatFirstUint32Hex)(hash)} : ${addr}`).join('\n') + '\n';
        else
            return ' (( space not exists )) ';
    }
    async route(desPath, baseAddr) {
        let [space, target, upperSpaces] = this.getSpaceAndAddr(desPath, false);
        if (!space) {
            space = upperSpaces.pop();
        }
        while (space.table.length === 0 && upperSpaces.length > 0) {
            target = space.name;
            space = upperSpaces.pop();
        }
        if (!target) {
            console.warn(`desPath: '${desPath}' does not have a valid target`);
            return { invalid: true, addrs: [] };
        }
        if (target === '*' && space.path !== '') { // broadcast
            return {
                broadcast: true,
                addrs: space.table.map(line => line[1]).filter(addr => addr !== baseAddr),
            };
        }
        if (space.table.length === 0) {
            return {
                addrs: [],
                noPeers: true,
            };
        }
        const targetHash = await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.calcAddrOrSubSpaceHash)(target);
        let nextAddr;
        let minXor = (new Uint32Array(16)).fill(0xFFFFFFFF);
        space.table.forEach(([hash, addr]) => {
            if (addr === baseAddr)
                return;
            const xor = xorUint32Array(hash, targetHash);
            if (compareUint32Array(xor, minXor) === -1) {
                minXor = xor;
                nextAddr = addr;
            }
        });
        const mySelfXor = xorUint32Array(this.myHash, targetHash);
        let notMakingProgressFromBase;
        if (baseAddr) {
            const baseHash = await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.calcAddrOrSubSpaceHash)(baseAddr);
            notMakingProgressFromBase = compareUint32Array(xorUint32Array(baseHash, targetHash), minXor) <= 0;
        }
        const result = {
            addrs: nextAddr ? [nextAddr] : [],
            notMakingProgressFromBase,
            mightBeForMe: compareUint32Array(mySelfXor, minXor) <= 0
        };
        return result;
    }
    buildSpaceKBuckets(spacePath) {
        return this.buildKBuckets(this.getSpace(spacePath).table);
    }
    buildKBuckets(lines) {
        const kBuckets = new Map();
        lines.forEach(addrAndHash => {
            const k = sameBitsUint32Array(this.myHash, addrAndHash[0]);
            let bucket = kBuckets.get(k);
            if (bucket === undefined) {
                bucket = [];
                kBuckets.set(k, bucket);
            }
            const { exact, left } = findHashIndex(bucket, addrAndHash[0]);
            if (exact !== undefined)
                return;
            bucket.splice(left, 0, addrAndHash);
        });
        return kBuckets;
    }
    dbgMyHash() {
        dbgLines('me', [[this.myHash, this.myAddr]]);
    }
    removeLines(kBuckets, lines) {
        [...lines, [this.myHash, this.myAddr]].forEach(([hash, _addr]) => {
            const k = sameBitsUint32Array(this.myHash, hash);
            const bucket = kBuckets.get(k);
            if (bucket) {
                const { exact } = findHashIndex(bucket, hash);
                if (typeof exact === 'number') {
                    bucket.splice(exact, 1);
                    if (bucket.length === 0) {
                        kBuckets.delete(k);
                    }
                }
            }
        });
    }
    pickAddrsToConnect(kBuckets, existingKBuckets) {
        const addrs = [];
        kBuckets.forEach((lines, k) => {
            const allowedNewLines = k < 3 ? 3 - k : 1;
            const existingLines = existingKBuckets.get(k) || [];
            const linesToPick = Math.min(allowedNewLines - existingLines.length, lines.length);
            if (linesToPick > 0) {
                addrs.push(...(0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.shuffle)(lines).slice(0, linesToPick).map(line => line[1]));
            }
        });
        return addrs;
    }
}
function xorUint32Array(hash1, hash2) {
    return hash1.map((v, i) => v ^ hash2[i]);
}
function compareUint32Array(arr1, arr2) {
    // assume arr1 has same length as arr2
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] < arr2[i])
            return -1;
        if (arr1[i] > arr2[i])
            return 1;
    }
    return 0;
}
function sameBitsUint32Array(arr1, arr2) {
    const xor = xorUint32Array(arr1, arr2);
    let sameBits = 0;
    for (let i = 0; i < xor.length; i++) {
        for (let j = 0; j < 32; j++) {
            if ((0x80000000 & xor[i]) !== 0)
                return sameBits;
            sameBits++;
            xor[i] = xor[i] << 1;
        }
    }
    return sameBits;
}
function hashLine(addrs) {
    return Promise.all(addrs.map(async (addr) => ([
        await (0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.calcAddrOrSubSpaceHash)(addr), addr
    ])));
}
function findHashIndex(lines, hash) {
    let left = 0, right = lines.length;
    while (left !== right) {
        const middle = Math.floor((left + right) / 2);
        const compared = compareUint32Array(hash, lines[middle][0]);
        if (compared === -1) {
            right = middle;
        }
        else if (compared === 1) {
            left = middle + 1;
        }
        else { // compared === 0
            return { exact: middle };
        }
    }
    return { left };
}
function mergeKBuckets(...kBucketsArr) {
    const newKBuckets = new Map();
    kBucketsArr.forEach(kBuckets => {
        kBuckets.forEach((lines, k) => {
            let bucket = newKBuckets.get(k);
            if (bucket === undefined) {
                bucket = [];
                newKBuckets.set(k, bucket);
            }
            lines.forEach(line => {
                addLine(bucket, line);
            });
        });
    });
    return newKBuckets;
}
function addLine(lines, line) {
    const { exact, left } = findHashIndex(lines, line[0]);
    if (exact !== undefined)
        return;
    lines.splice(left, 0, line);
}
function dbgLines(name, lines) {
    console.group(name);
    console.log(lines.map(([hash, addr]) => `${(0,_misc_utils__WEBPACK_IMPORTED_MODULE_0__.formatFirstUint32Hex)(hash)} :: ${addr}`).join('\n'));
    console.groupEnd();
}
function dbgKBuckets(name, kBuckets) {
    console.group(name);
    kBuckets.forEach((lines, k) => {
        dbgLines(k.toString(), lines);
    });
    console.groupEnd();
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (Router);


/***/ }),

/***/ "./src/tunnel.ts":
/*!***********************!*\
  !*** ./src/tunnel.ts ***!
  \***********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__),
/* harmony export */   "TunnelConn": () => (/* binding */ TunnelConn),
/* harmony export */   "NewTunnelEvent": () => (/* binding */ NewTunnelEvent)
/* harmony export */ });
/* harmony import */ var _misc_event_target__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./misc/event-target */ "./src/misc/event-target.ts");
/* harmony import */ var _conn_base__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./conn/base */ "./src/conn/base.ts");
/* harmony import */ var _misc_identity__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./misc/identity */ "./src/misc/identity.ts");
/* harmony import */ var _misc_utils__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./misc/utils */ "./src/misc/utils.ts");




class NewTunnelEvent extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.CustomEvent {
    constructor() {
        super(...arguments);
        this.type = 'new-tunnel';
    }
}
class TunnelManager extends _misc_event_target__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(agent) {
        super();
        this.tunnels = {};
        this.connIdToThroughs = {};
        this.agent = agent;
    }
    onReceiveMessage(event) {
        const { tunnelConnId } = event.detail;
        if (tunnelConnId) {
            (async () => {
                const tunnel = this.tunnels[tunnelConnId];
                if (tunnel) {
                    tunnel.onReceive(event);
                }
                else {
                    const newTunnel = new TunnelConn(tunnelConnId);
                    const newTunnelEvent = new NewTunnelEvent({ tunnel: newTunnel });
                    this.dispatchEvent(newTunnelEvent);
                    if (!newTunnelEvent.defaultPrevented) {
                        const { srcPath: peerPath } = event.detail;
                        this.tunnels[newTunnel.connId] = newTunnel;
                        await this.startTunnel(peerPath, newTunnel);
                        newTunnel.onReceive(event);
                    }
                }
            })();
            return true;
        }
    }
    async create(peerPath, tunnelConnId) {
        const tunnel = new TunnelConn(tunnelConnId);
        this.tunnels[tunnel.connId] = tunnel;
        await this.startTunnel(peerPath, tunnel);
        return tunnel;
    }
    async startTunnel(peerPath, tunnel) {
        await tunnel.startLink({
            myPath: this.agent.myIdentity.addr,
            peerPath,
            send: (message) => {
                this.agent.route(message);
            },
            close: () => {
                delete this.tunnels[tunnel.connId];
            },
        });
        return tunnel;
    }
    cacheReceive(fromPeerAddr, srcAddr, message) {
        if (fromPeerAddr === srcAddr)
            return;
        const { tunnelConnId, direction } = message;
        if (!tunnelConnId)
            return;
        switch (direction) {
            case "A" /* A */:
                return this.saveCache(tunnelConnId, "B" /* B */, message.srcPath, fromPeerAddr);
            case "B" /* B */:
                return this.saveCache(tunnelConnId, "A" /* A */, message.srcPath, fromPeerAddr);
        }
    }
    saveCache(tunnelConnId, direction, desPath, peerAddr) {
        let through = this.connIdToThroughs[tunnelConnId];
        if (!through) {
            through = {};
            this.connIdToThroughs[tunnelConnId] = through;
        }
        if (!through[direction]) {
            through[direction] = [desPath, peerAddr];
        }
    }
    route(message) {
        var _a;
        const { tunnelConnId, direction } = message;
        if (tunnelConnId && direction) {
            const through = (_a = this.connIdToThroughs[tunnelConnId]) === null || _a === void 0 ? void 0 : _a[direction];
            if (through) {
                const [desPath, peerAddr] = through;
                if (message.desPath === desPath)
                    return peerAddr;
            }
        }
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (TunnelManager);
class TunnelConn extends _conn_base__WEBPACK_IMPORTED_MODULE_1__.default {
    constructor(tunnelConnId) {
        super(tunnelConnId);
        this.direction = tunnelConnId ? "B" /* B */ : "A" /* A */;
    }
    async startLink(opts) {
        this.peerPath = opts.peerPath;
        this.peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_2__.PeerIdentity(opts.peerPath);
        this.myPath = opts.myPath;
        this.sendFunc = opts.send;
        this.closeFunc = opts.close;
        this.state = "CONNECTED" /* CONNECTED */;
    }
    onReceive(event) {
        const detail = event.detail;
        const srcAddr = (0,_misc_utils__WEBPACK_IMPORTED_MODULE_3__.extractAddrFromPath)(detail.srcPath);
        if (srcAddr === this.peerIdentity.addr &&
            detail.tunnelConnId === this.connId) {
            this.dispatchEvent(event);
        }
    }
    send(messageContent) {
        const message = {
            srcPath: this.myPath,
            desPath: this.peerPath,
            tunnelConnId: this.connId,
            direction: this.direction,
            ...messageContent,
        };
        this.sendFunc(message);
    }
    async close() {
        this.state = "CLOSED" /* CLOSED */;
        this.closeFunc();
    }
}



/***/ }),

/***/ "isomorphic-webcrypto":
/*!***************************************!*\
  !*** external "isomorphic-webcrypto" ***!
  \***************************************/
/***/ ((module) => {

module.exports = require("isomorphic-webcrypto");

/***/ }),

/***/ "repl":
/*!***********************!*\
  !*** external "repl" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("repl");

/***/ }),

/***/ "ws":
/*!*********************!*\
  !*** external "ws" ***!
  \*********************/
/***/ ((module) => {

module.exports = require("ws");

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			var getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
/*!*************************!*\
  !*** ./src/dev/node.ts ***!
  \*************************/
__webpack_require__.r(__webpack_exports__);
/* harmony import */ var _agent__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ../agent */ "./src/agent.ts");
/* harmony import */ var _conn_manager_wss__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../conn-manager/wss */ "./src/conn-manager/wss.ts");
/* harmony import */ var repl__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! repl */ "repl");
/* harmony import */ var repl__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(repl__WEBPACK_IMPORTED_MODULE_2__);
/* harmony import */ var _share__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./share */ "./src/dev/share.ts");




process.on('uncaughtException', err => {
    console.log('Caught exception: ', err);
});
const serverOpts = {};
if (process.env.HOST)
    serverOpts.host = process.env.HOST;
if (process.env.PORT)
    serverOpts.port = parseInt(process.env.PORT);
const connManager = new _conn_manager_wss__WEBPACK_IMPORTED_MODULE_1__.default({}, serverOpts);
const agent = new _agent__WEBPACK_IMPORTED_MODULE_0__.default(connManager, {
    myAddr: process.env.ADDR || 'ws://localhost:8081',
});
global.agent = agent;
(async () => {
    // DEV monitor:
    agent.addEventListener('new-conn', event => {
        console.log('new-conn', event.detail.conn.peerIdentity.addr);
        const pingMessage = {
            term: 'ping', timestamp: Date.now(),
        };
        agent.send(event.detail.conn.peerIdentity.addr, pingMessage);
    });
    agent.addEventListener('receive-network', event => {
        console.log('receive-network', event);
    });
    agent.addEventListener('close', event => {
        console.log('close', event);
    });
    agent.requestManager.addEventListener('requested', event => {
        (0,_share__WEBPACK_IMPORTED_MODULE_3__.handleRequest)(event);
    });
    // =====
    await agent.start();
    console.log('agent started', agent.myIdentity.addr);
    repl__WEBPACK_IMPORTED_MODULE_2___default().start({ prompt: '> ' });
})();
global.ping = (desAddr) => (0,_share__WEBPACK_IMPORTED_MODULE_3__.ping)(agent, desAddr);

})();

/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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QUFLLENBQUMsRUFBRTtRQUN6RCxxREFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ3ZCLENBQUMsQ0FBQyxDQUFDO0lBQ0gsUUFBUTtJQUVSLE1BQU0sS0FBSyxDQUFDLEtBQUssRUFBRSxDQUFDO0lBQ3BCLE9BQU8sQ0FBQyxHQUFHLENBQUMsZUFBZSxFQUFFLEtBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUM7SUFFcEQsaURBQVUsQ0FBQyxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQy9CLENBQUMsQ0FBQyxFQUFFLENBQUM7QUFFSixNQUFjLENBQUMsSUFBSSxHQUFHLENBQUMsT0FBZSxFQUFFLEVBQUUsQ0FBQyw0Q0FBSSxDQUFDLEtBQUssRUFBRSxPQUFPLENBQUMsQ0FBQyIsInNvdXJjZXMiOlsid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9hZ2VudC50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvY29ubi1tYW5hZ2VyL2Jhc2UudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL2Nvbm4tbWFuYWdlci93c3MudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL2Nvbm4vYmFzZS50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvY29ubi93cy50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvZGV2L3NoYXJlLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9tZXNzYWdlL2Nvbm4udHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL21lc3NhZ2UvbWVzc2FnZS50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvbWVzc2FnZS9uZXR3b3JrLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9taXNjL2V2ZW50LXRhcmdldC50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvbWlzYy9ldmVudHMudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL21pc2MvaWRlbnRpdHkudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL21pc2MvdXRpbHMudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL3JlcXVlc3QudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL3JvdXRlci50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvdHVubmVsLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay9leHRlcm5hbCBcImlzb21vcnBoaWMtd2ViY3J5cHRvXCIiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrL2V4dGVybmFsIFwicmVwbFwiIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay9leHRlcm5hbCBcIndzXCIiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay93ZWJwYWNrL3J1bnRpbWUvY29tcGF0IGdldCBkZWZhdWx0IGV4cG9ydCIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvd2VicGFjay9ydW50aW1lL2RlZmluZSBwcm9wZXJ0eSBnZXR0ZXJzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay93ZWJwYWNrL3J1bnRpbWUvaGFzT3duUHJvcGVydHkgc2hvcnRoYW5kIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay93ZWJwYWNrL3J1bnRpbWUvbWFrZSBuYW1lc3BhY2Ugb2JqZWN0Iiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9kZXYvbm9kZS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgRXZlbnRUYXJnZXQgZnJvbSAnLi9taXNjL2V2ZW50LXRhcmdldCc7XG5pbXBvcnQgQ29ubk1hbmFnZXIsIHsgTmV3Q29ubkV2ZW50IH0gZnJvbSAnLi9jb25uLW1hbmFnZXIvYmFzZSc7XG5pbXBvcnQgeyBDb25uQ2xvc2VFdmVudCB9IGZyb20gJy4vY29ubi9iYXNlJztcbmltcG9ydCBSb3V0ZXIsIHsgaGFzaExpbmUsIG1lcmdlS0J1Y2tldHMgfSBmcm9tICcuL3JvdXRlcic7XG5pbXBvcnQgeyBNZXNzYWdlLCBNZXNzYWdlRGF0YSB9IGZyb20gJy4vbWVzc2FnZS9tZXNzYWdlJztcbmltcG9ydCB7XG4gIGRlcml2ZU5ldHdvcmtNZXNzYWdlLFxuICBRdWVyeUFkZHJzTWVzc2FnZSwgZGVyaXZlUXVlcnlBZGRyc01lc3NhZ2UsXG4gIFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2UsIFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2VEYXRhLCBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlLFxuICBKb2luU3BhY2VOb3RpZmljYXRpb25NZXNzYWdlRGF0YSxcbn0gZnJvbSAnLi9tZXNzYWdlL25ldHdvcmsnO1xuaW1wb3J0IHsgTWVzc2FnZVJlY2VpdmVkRXZlbnQgfSBmcm9tICcuL2Nvbm4vYmFzZSc7XG5pbXBvcnQgeyBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQgfSBmcm9tICcuL21pc2MvZXZlbnRzJztcbmltcG9ydCBJZGVudGl0eSBmcm9tICcuL21pc2MvaWRlbnRpdHknO1xuaW1wb3J0IFR1bm5lbE1hbmFnZXIgZnJvbSAnLi90dW5uZWwnO1xuaW1wb3J0IFJlcXVlc3RNYW5hZ2VyLCB7IFJlcXVlc3RlZEV2ZW50IH0gZnJvbSAnLi9yZXF1ZXN0JztcbmltcG9ydCB7IGpvaW5QYXRoLCBleHRyYWN0QWRkckZyb21QYXRoLCBleHRyYWN0U3BhY2VQYXRoLCB3YWl0IH0gZnJvbSAnLi9taXNjL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgQWdlbnQge1xuICB0eXBlIENvbmZpZyA9IHtcbiAgICByb3V0ZVR0bDogbnVtYmVyO1xuICAgIHJlcXVlc3RUaW1lb3V0OiBudW1iZXI7XG4gIH0gJiBJZGVudGl0eS5Db25maWc7XG59XG5cbmludGVyZmFjZSBFdmVudE1hcCB7XG4gICdyZWNlaXZlLW5ldHdvcmsnOiBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQ7XG4gICduZXctY29ubic6IE5ld0Nvbm5FdmVudDtcbiAgJ2Nsb3NlJzogQ29ubkNsb3NlRXZlbnQ7XG59XG5cbmNvbnN0IGFnZW50RGVmYXVsdENvbmZpZzogQWdlbnQuQ29uZmlnID0ge1xuICByb3V0ZVR0bDogMTAsXG4gIHJlcXVlc3RUaW1lb3V0OiAxMDAwLFxufVxuXG5jbGFzcyBBZ2VudCBleHRlbmRzIEV2ZW50VGFyZ2V0PEV2ZW50TWFwPiB7XG4gIG15SWRlbnRpdHk6IElkZW50aXR5O1xuICBjb25uTWFuYWdlcjogQ29ubk1hbmFnZXI7XG4gIHR1bm5lbE1hbmFnZXI6IFR1bm5lbE1hbmFnZXI7XG4gIHJlcXVlc3RNYW5hZ2VyOiBSZXF1ZXN0TWFuYWdlcjtcbiAgcHJpdmF0ZSBjb25maWc6IEFnZW50LkNvbmZpZztcbiAgcHJpdmF0ZSByb3V0ZXI6IFJvdXRlcjtcbiAgcHJpdmF0ZSByZWNlaXZlZE1zZ0lkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgY29uc3RydWN0b3IoY29ubk1hbmFnZXI6IENvbm5NYW5hZ2VyLCBjb25maWc6IFBhcnRpYWw8QWdlbnQuQ29uZmlnPiA9IHt9KSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLm15SWRlbnRpdHkgPSBuZXcgSWRlbnRpdHkoY29uZmlnKTtcbiAgICB0aGlzLmNvbmZpZyA9IHsgLi4uYWdlbnREZWZhdWx0Q29uZmlnLCAuLi5jb25maWcgfTtcbiAgICB0aGlzLmNvbm5NYW5hZ2VyID0gY29ubk1hbmFnZXI7XG4gICAgdGhpcy5yb3V0ZXIgPSBuZXcgUm91dGVyKCk7XG4gICAgdGhpcy50dW5uZWxNYW5hZ2VyID0gbmV3IFR1bm5lbE1hbmFnZXIodGhpcyk7XG4gICAgdGhpcy5yZXF1ZXN0TWFuYWdlciA9IG5ldyBSZXF1ZXN0TWFuYWdlcih0aGlzLCB7XG4gICAgICB0aW1lb3V0OiB0aGlzLmNvbmZpZy5yZXF1ZXN0VGltZW91dCxcbiAgICB9KTtcblxuICAgIHRoaXMuY29ubk1hbmFnZXIuYWRkRXZlbnRMaXN0ZW5lcignbmV3LWNvbm4nLCBldmVudCA9PiB7XG4gICAgICB0aGlzLm9uTmV3Q29ubihldmVudCk7XG4gICAgfSk7XG4gICAgdGhpcy5jb25uTWFuYWdlci5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsIGV2ZW50ID0+IHtcbiAgICAgIHRoaXMub25Db25uQ2xvc2UoZXZlbnQpO1xuICAgIH0pO1xuICAgIHRoaXMuY29ubk1hbmFnZXIuYWRkRXZlbnRMaXN0ZW5lcigncmVjZWl2ZScsIGV2ZW50ID0+IHtcbiAgICAgIHRoaXMub25SZWNlaXZlKGV2ZW50KTtcbiAgICB9KTtcblxuICAgIHRoaXMucmVxdWVzdE1hbmFnZXIuYWRkRXZlbnRMaXN0ZW5lcigncmVxdWVzdGVkJywgZXZlbnQgPT4ge1xuICAgICAgdGhpcy5vblJlcXVlc3RlZChldmVudCk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzdGFydCgpIHtcbiAgICBhd2FpdCB0aGlzLm15SWRlbnRpdHkuZ2VuZXJhdGVJZk5lZWRlZCgpO1xuICAgIGF3YWl0IHRoaXMuY29ubk1hbmFnZXIuc3RhcnQodGhpcyk7XG4gICAgYXdhaXQgdGhpcy5yb3V0ZXIuc3RhcnQodGhpcy5teUlkZW50aXR5LmFkZHIpO1xuICB9XG5cbiAgYXN5bmMgY29ubmVjdChwZWVyUGF0aDogc3RyaW5nLCBzcGFjZVBhdGg6IHN0cmluZyA9ICcnKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcGVlckFkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHBlZXJQYXRoKTtcbiAgICBpZiAoIXRoaXMuY29ubk1hbmFnZXIuaGFzQ29ubihwZWVyQWRkcikpIHtcbiAgICAgIGF3YWl0IHRoaXMuY29ubk1hbmFnZXIuY29ubmVjdChwZWVyUGF0aCwge30pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJvdXRlci5hZGRQYXRoKHBlZXJQYXRoKTtcbiAgICBjb25zdCBub3RpZmljYXRpb25NZXNzYWdlOiBKb2luU3BhY2VOb3RpZmljYXRpb25NZXNzYWdlRGF0YSA9IHtcbiAgICAgIHRlcm06ICdqb2luLXNwYWNlLW5vdGlmaWNhdGlvbicsXG4gICAgfVxuICAgIHRoaXMuc2VuZChwZWVyUGF0aCwgbm90aWZpY2F0aW9uTWVzc2FnZSwgc3BhY2VQYXRoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGFzeW5jIGpvaW4oc3BhY2VQYXRoOiBzdHJpbmcgPSAnJyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHNwYWNlID0gdGhpcy5yb3V0ZXIuaW5pdFNwYWNlKHNwYWNlUGF0aCk7XG5cbiAgICBsZXQgY29ubmVjdFNwYWNlTmVpZ2hib3JTdWNjZWVkID0gZmFsc2U7XG4gICAgbGV0IGNvbm5lY3RTcGFjZU5laWdoYm9yVHJpZWQgPSAwO1xuICAgIGxldCBhZGRyUmVzcG9uc2U6IFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2U7XG4gICAgd2hpbGUoIWNvbm5lY3RTcGFjZU5laWdoYm9yU3VjY2VlZCAmJiBjb25uZWN0U3BhY2VOZWlnaGJvclRyaWVkIDwgMykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29ubmVjdFNwYWNlTmVpZ2hib3JUcmllZCsrO1xuICAgICAgICBhZGRyUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmNvbm5lY3RTcGFjZU5laWdoYm9yKHNwYWNlKTtcbiAgICAgICAgY29ubmVjdFNwYWNlTmVpZ2hib3JTdWNjZWVkID0gdHJ1ZTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLndhcm4oYGFnZW50LnRzOiBqb2luOiBjb25uZWN0U3BhY2VOZWlnaGJvciBmYWlsZWQsICMke2Nvbm5lY3RTcGFjZU5laWdoYm9yVHJpZWR9IHJldHJ5IGluIDMgc2Vjcy4uLmAsIGVycik7XG4gICAgICAgIGF3YWl0IHdhaXQoMzAwMCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghY29ubmVjdFNwYWNlTmVpZ2hib3JTdWNjZWVkKSByZXR1cm4gZmFsc2U7XG5cbiAgICBsZXQgY29ubmVjdFNwYWNlUGVlcnNTdWNjZWVkID0gZmFsc2U7XG4gICAgbGV0IGNvbm5lY3RTcGFjZVBlZXJzVHJpZWQgPSAwO1xuICAgIHdoaWxlKCFjb25uZWN0U3BhY2VQZWVyc1N1Y2NlZWQgJiYgY29ubmVjdFNwYWNlUGVlcnNUcmllZCA8IDMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbm5lY3RTcGFjZVBlZXJzVHJpZWQrKztcbiAgICAgICAgYXdhaXQgdGhpcy5jb25uZWN0U3BhY2VQZWVycyhcbiAgICAgICAgICBzcGFjZSxcbiAgICAgICAgICBhZGRyUmVzcG9uc2UuYWRkcnMsXG4gICAgICAgICAgZXh0cmFjdEFkZHJGcm9tUGF0aChhZGRyUmVzcG9uc2Uuc3JjUGF0aCksXG4gICAgICAgICk7XG4gICAgICAgIGNvbm5lY3RTcGFjZVBlZXJzU3VjY2VlZCA9IHRydWU7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBhZ2VudC50czogam9pbjogY29ubmVjdFNwYWNlUGVlcnMgZmFpbGVkLCAjJHtjb25uZWN0U3BhY2VQZWVyc1RyaWVkfSByZXRyeSBpbiAzIHNlY3MuLi5gLCBlcnIpO1xuICAgICAgICBhd2FpdCB3YWl0KDMwMDApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0U3BhY2VOZWlnaGJvcihzcGFjZTogUm91dGVyLlNwYWNlKTogUHJvbWlzZTxRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlPiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGF3YWl0IHRoaXMucmVxdWVzdE1hbmFnZXIucmVxdWVzdChqb2luUGF0aChzcGFjZS5wYXRoLCB0aGlzLm15SWRlbnRpdHkuYWRkciksIHsgdGVybTogJ3F1ZXJ5LWFkZHJzJyB9KTtcbiAgICBjb25zdCBhZGRyUmVzcG9uc2UgPSBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlKHJlcXVlc3QucmVzcG9uc2VNZXNzYWdlKTtcblxuICAgIGF3YWl0IHRoaXMuY29ubmVjdChhZGRyUmVzcG9uc2Uuc3JjUGF0aCwgc3BhY2UucGF0aCk7XG5cbiAgICByZXR1cm4gYWRkclJlc3BvbnNlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0U3BhY2VQZWVycyhzcGFjZTogUm91dGVyLlNwYWNlLCBrbm93bkFkZHJzOiBzdHJpbmdbXSwgbmVpZ2hib3JQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbbmVpZ2hib3JTcGFjZSwgbmVpZ2hib3JBZGRyXSA9IHRoaXMucm91dGVyLmdldFNwYWNlQW5kQWRkcihuZWlnaGJvclBhdGgpO1xuICAgIGlmIChuZWlnaGJvclNwYWNlICE9PSBzcGFjZSkgcmV0dXJuO1xuXG4gICAgY29uc3QgYWRkckFuZEhhc2hlcyA9IGF3YWl0IGhhc2hMaW5lKGtub3duQWRkcnMpO1xuXG4gICAgY29uc3QgZXhpc3RpbmdLQnVja2V0cyA9IHRoaXMucm91dGVyLmJ1aWxkU3BhY2VLQnVja2V0cyhzcGFjZS5wYXRoKTtcbiAgICBjb25zdCByZXNwb25zZUtCdWNrZXRzID0gdGhpcy5yb3V0ZXIuYnVpbGRLQnVja2V0cyhhZGRyQW5kSGFzaGVzKTtcbiAgICBjb25zdCBuZXh0UmVxdWVzdEtCdWNrZXRzID0gbWVyZ2VLQnVja2V0cyhleGlzdGluZ0tCdWNrZXRzLCByZXNwb25zZUtCdWNrZXRzKTtcbiAgICB0aGlzLnJvdXRlci5yZW1vdmVMaW5lcyhcbiAgICAgIG5leHRSZXF1ZXN0S0J1Y2tldHMsXG4gICAgICBbdGhpcy5yb3V0ZXIuZ2V0TGluZShzcGFjZS5wYXRoLCBuZWlnaGJvckFkZHIpXVxuICAgICk7XG5cbiAgICBsZXQgbmV4dFJlcXVlc3RNYXhLID0gLTE7XG4gICAgbGV0IG5leHRSZXF1ZXN0TWluSyA9IE51bWJlci5NQVhfVkFMVUU7XG4gICAgbmV4dFJlcXVlc3RLQnVja2V0cy5mb3JFYWNoKChfYnVja2V0LCBrKSA9PiB7XG4gICAgICBpZiAoayA8IG5leHRSZXF1ZXN0TWluSykgbmV4dFJlcXVlc3RNaW5LID0gaztcbiAgICAgIGlmIChrID4gbmV4dFJlcXVlc3RNYXhLKSBuZXh0UmVxdWVzdE1heEsgPSBrO1xuICAgIH0pO1xuXG4gICAgY29uc3QgbmV4dFJlcXVlc3RBZGRycyA9IChuZXh0UmVxdWVzdEtCdWNrZXRzLnNpemUgPiAwID8gKFxuICAgICAgbmV4dFJlcXVlc3RLQnVja2V0cy5zaXplID49IDIgPyBbbmV4dFJlcXVlc3RNYXhLLCBuZXh0UmVxdWVzdE1pbktdIDogW25leHRSZXF1ZXN0TWF4S11cbiAgICApIDogW10pLm1hcChcbiAgICAgIGsgPT4gbmV4dFJlcXVlc3RLQnVja2V0cy5nZXQoaylcbiAgICApLm1hcChcbiAgICAgIGxpbmVzID0+IGxpbmVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGxpbmVzLmxlbmd0aCldWzFdXG4gICAgKTtcblxuICAgIGxldCBjb25uZWN0aW5nS0J1Y2tldHMgPSByZXNwb25zZUtCdWNrZXRzO1xuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBuZXh0UmVxdWVzdEFkZHJzLm1hcChhc3luYyBhZGRyID0+IHtcbiAgICAgICAgY29uc3Qgc3ViUmVxdWVzdCA9IGF3YWl0IHRoaXMucmVxdWVzdE1hbmFnZXIucmVxdWVzdChqb2luUGF0aChzcGFjZS5wYXRoLCBhZGRyKSwgeyB0ZXJtOiAncXVlcnktYWRkcnMnIH0pO1xuICAgICAgICBjb25zdCBzdWJBZGRyUmVzcG9uc2UgPSBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlKHN1YlJlcXVlc3QucmVzcG9uc2VNZXNzYWdlKTtcbiAgICAgICAgY29uc3QgYWRkckFuZEhhc2hlcyA9IGF3YWl0IGhhc2hMaW5lKHN1YkFkZHJSZXNwb25zZS5hZGRycyk7XG4gICAgICAgIGNvbm5lY3RpbmdLQnVja2V0cyA9IG1lcmdlS0J1Y2tldHMoXG4gICAgICAgICAgY29ubmVjdGluZ0tCdWNrZXRzLCB0aGlzLnJvdXRlci5idWlsZEtCdWNrZXRzKFxuICAgICAgICAgICAgYWRkckFuZEhhc2hlc1xuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgICB0aGlzLnJvdXRlci5yZW1vdmVMaW5lcyhjb25uZWN0aW5nS0J1Y2tldHMsIHNwYWNlLnRhYmxlKTtcblxuICAgIGNvbnN0IGFkZHJzVG9Db25uZWN0ID0gdGhpcy5yb3V0ZXIucGlja0FkZHJzVG9Db25uZWN0KGNvbm5lY3RpbmdLQnVja2V0cywgZXhpc3RpbmdLQnVja2V0cyk7XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIGFkZHJzVG9Db25uZWN0Lm1hcChhZGRyID0+IChcbiAgICAgICAgdGhpcy5jb25uZWN0KGpvaW5QYXRoKHNwYWNlLnBhdGgsIGFkZHIpLCBzcGFjZS5wYXRoKVxuICAgICAgKSlcbiAgICApO1xuICB9XG5cbiAgLy8gV0lQXG4gIGxlYXZlKF9zcGFjZVBhdGg6IHN0cmluZykge31cbiAgbGlzdEtub3duQWRkcnMoX3NwYWNlUGF0aDogc3RyaW5nKSB7fVxuICBicm9hZGNhc3QoX3NwYWNlUGF0aDogc3RyaW5nKSB7fVxuXG4gIHNlbmQocGF0aDogc3RyaW5nLCBtZXNzYWdlOiBNZXNzYWdlRGF0YSwgc3JjU3BhY2VQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMucm91dGUoe1xuICAgICAgc3JjUGF0aDogam9pblBhdGgoc3JjU3BhY2VQYXRoIHx8ICcnLCB0aGlzLm15SWRlbnRpdHkuYWRkciksXG4gICAgICBkZXNQYXRoOiBwYXRoLFxuICAgICAgLi4ubWVzc2FnZSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb25OZXdDb25uKGV2ZW50OiBOZXdDb25uRXZlbnQpIHtcbiAgICBhd2FpdCB0aGlzLnJvdXRlci5hZGRQYXRoKGV2ZW50LmRldGFpbC5wZWVyUGF0aCk7XG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgb25SZWNlaXZlKGV2ZW50OiBNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IHZvaWQge1xuICAgIHRoaXMudHVubmVsTWFuYWdlci5jYWNoZVJlY2VpdmUoZXZlbnQuZnJvbUNvbm4ucGVlcklkZW50aXR5LmFkZHIsIGV2ZW50LnNyY0FkZHIsIGV2ZW50LmRldGFpbCk7XG4gICAgdGhpcy5yZXF1ZXN0TWFuYWdlci5jYWNoZVJlY2VpdmUoZXZlbnQuZnJvbUNvbm4ucGVlcklkZW50aXR5LmFkZHIsIGV2ZW50LnNyY0FkZHIsIGV2ZW50LmRldGFpbCk7XG5cbiAgICAvLyBUT0RPOiB3aGF0IGlmIHRoaXMgY2xpZW50IGlzIG5vdCBpbiB0aGUgZGlybmFtZT9cbiAgICBpZiAoZXZlbnQuZGVzQWRkciA9PT0gdGhpcy5teUlkZW50aXR5LmFkZHIpIHtcbiAgICAgIHRoaXMub25SZWNlaXZlTWVzc2FnZShldmVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucm91dGUoZXZlbnQuZGV0YWlsLCBldmVudCk7XG4gICAgfVxuICB9XG5cbiAgcHJvdGVjdGVkIGFzeW5jIG9uUmVjZWl2ZU1lc3NhZ2UoZXZlbnQ6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50KSB7XG4gICAgaWYgKFxuICAgICAgdGhpcy50dW5uZWxNYW5hZ2VyLm9uUmVjZWl2ZU1lc3NhZ2UoZXZlbnQpXG4gICAgKSByZXR1cm47XG5cbiAgICB0aGlzLmhhbmRsZVJlY2VpdmVOZXR3b3JrTWVzc2FnZShuZXcgTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KGV2ZW50LCB0cnVlKSk7XG4gIH1cblxuICBhc3luYyByb3V0ZShtZXNzYWdlOiBNZXNzYWdlLCByZWNlaXZlRXZlbnQ/OiBNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IG5ldHdvcmtNZXNzYWdlID0gZGVyaXZlTmV0d29ya01lc3NhZ2UobWVzc2FnZSwgdGhpcy5jb25maWcucm91dGVUdGwpO1xuICAgIGNvbnN0IHsgc3JjUGF0aCwgZGVzUGF0aCwgbXNnSWQgfSA9IG5ldHdvcmtNZXNzYWdlO1xuICAgIGNvbnN0IHNyY0FkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHNyY1BhdGgpO1xuICAgIGNvbnN0IGRlc0FkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKGRlc1BhdGgpO1xuXG4gICAgaWYgKG5ldHdvcmtNZXNzYWdlLnR0bCA8IDApIHtcbiAgICAgIGNvbnNvbGUud2FybihgbWVzc2FnZSBydW4gb3V0IG9mIHR0bCBmcm9tICcke3NyY1BhdGh9JyB0byAnJHtkZXNQYXRofScsIGRyb3BwaW5nIG1lc3NhZ2U6YCwgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucmVjZWl2ZWRNc2dJZC5oYXMobXNnSWQpKSB7XG4gICAgICBjb25zb2xlLndhcm4oYHJlY2VpdmVkIHR3aWNlIChvciBtb3JlKSBzYW1lIG1lc3NhZ2Ugd2l0aCBtc2dJZCAnJHttc2dJZH0nIGZyb20gJyR7c3JjUGF0aH0nIHRvICcke2Rlc1BhdGh9JywgZHJvcHBpbmcgbWVzc2FnZTpgLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZWNlaXZlZE1zZ0lkLmFkZChtc2dJZCk7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogYWZ0ZXIgREhUIGlzIGRvbmUsIHRoaXMgbWlnaHQgYmUgcmVtb3ZlZCBtYWtpbmcgc3VyZSBub3Qgcm91dGluZyBiYWNrIGZvciBpbml0aWFsIHF1ZXJ5LW5vZGVcbiAgICBpZiAodGhpcy5jb25uTWFuYWdlci5oYXNDb25uKGRlc0FkZHIpICYmIHJlY2VpdmVFdmVudD8uZnJvbUNvbm4ucGVlcklkZW50aXR5LmFkZHIgIT09IGRlc0FkZHIpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5NYW5hZ2VyLnNlbmQoZGVzQWRkciwgbmV0d29ya01lc3NhZ2UpO1xuICAgIH1cblxuICAgIGNvbnN0IHR1bm5lbFRocm91Z2hBZGRyID0gdGhpcy50dW5uZWxNYW5hZ2VyLnJvdXRlKG5ldHdvcmtNZXNzYWdlKTtcbiAgICBpZiAodGhpcy5jb25uTWFuYWdlci5oYXNDb25uKHR1bm5lbFRocm91Z2hBZGRyKSkge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubk1hbmFnZXIuc2VuZCh0dW5uZWxUaHJvdWdoQWRkciwgbmV0d29ya01lc3NhZ2UpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3RUaHJvdWdoQWRkciA9IHRoaXMucmVxdWVzdE1hbmFnZXIucm91dGUobmV0d29ya01lc3NhZ2UpO1xuICAgIGlmICh0aGlzLmNvbm5NYW5hZ2VyLmhhc0Nvbm4ocmVxdWVzdFRocm91Z2hBZGRyKSkge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubk1hbmFnZXIuc2VuZChyZXF1ZXN0VGhyb3VnaEFkZHIsIG5ldHdvcmtNZXNzYWdlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvdXRlci5yb3V0ZShkZXNQYXRoLCByZWNlaXZlRXZlbnQ/LmZyb21Db25uLnBlZXJJZGVudGl0eS5hZGRyKTtcblxuICAgIGlmIChyZWNlaXZlRXZlbnQgJiYgcmVzdWx0Lm1pZ2h0QmVGb3JNZSAmJiBzcmNBZGRyICE9PSB0aGlzLm15SWRlbnRpdHkuYWRkcikge1xuICAgICAgaWYgKHRoaXMucm91dGVNZXNzYWdlTWlnaHRCZUZvck1lKHJlY2VpdmVFdmVudCkpIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXN1bHQuYWRkcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIFtcbiAgICAgICAgICAnYWdlbnQudHM6IHNlbmQ6IG5vIGF2YWlsYWJsZSBhZGRyIHRvIHNlbmQsIHJvdXRlciB0YWJsZTonLFxuICAgICAgICAgIHRoaXMucm91dGVyLnByaW50YWJsZVRhYmxlKGRlc1BhdGgpLFxuICAgICAgICBdLmpvaW4oJ1xcbicpLFxuICAgICAgICB7IHJlc3VsdCwgbWVzc2FnZSB9XG4gICAgICApO1xuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdC5icm9hZGNhc3QpIHsgLy8gbWlnaHQgbmVlZCB0byBkbyBzb21ldGhpbmcgYmVmb3JlIHNlbmRpbmcgb3V0XG4gICAgICByZXN1bHQuYWRkcnMuZm9yRWFjaChhZGRyID0+IHRoaXMuY29ubk1hbmFnZXIuc2VuZChhZGRyLCBuZXR3b3JrTWVzc2FnZSkpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChyZXN1bHQubm90TWFraW5nUHJvZ3Jlc3NGcm9tQmFzZSkge1xuICAgICAgICAvLyBUT0RPOiBhZnRlciBqb2luIGZsb3cgY29tcGxldGUsIHRoaXMgc2hvdWxkIGRyb3AgbWVzc2FnZVxuICAgICAgICAvLyBidXQgYWxsb3cgc3JjQWRkciA9PT0gZnJvbUFkZHIgYmVjYXVzZSBzcmNQZWVyIGNhbiBiZSBjb25uZWN0aW5nIGZpcnN0IHBlZXJcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFtcbiAgICAgICAgICAgIGBhZ2VudC50czogb25Sb3V0ZTogbWVzc2FnZSBmcm9tICR7c3JjUGF0aH0gdG8gJHtkZXNQYXRofSBub3QgbWFraW5nIHByb2dyZXNzLCByb3V0ZXIgdGFibGU6YCxcbiAgICAgICAgICAgIHRoaXMucm91dGVyLnByaW50YWJsZVRhYmxlKGRlc1BhdGgpLFxuICAgICAgICAgIF0uam9pbignXFxuJyksXG4gICAgICAgICAgeyByZXN1bHQsIG1lc3NhZ2UgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmFkZHJzLmZvckVhY2goYWRkciA9PiB0aGlzLmNvbm5NYW5hZ2VyLnNlbmQoYWRkciwgbmV0d29ya01lc3NhZ2UpKTtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByb3V0ZU1lc3NhZ2VNaWdodEJlRm9yTWUoZXZlbnQ6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgbmV0d29ya01lc3NhZ2VFdmVudCA9IG5ldyBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQoZXZlbnQsIGZhbHNlKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWNlaXZlTmV0d29ya01lc3NhZ2UobmV0d29ya01lc3NhZ2VFdmVudCk7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVJlY2VpdmVOZXR3b3JrTWVzc2FnZShldmVudDogTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgaWYgKFxuICAgICAgdGhpcy5yZXF1ZXN0TWFuYWdlci5vblJlY2VpdmVOZXR3b3JrTWVzc2FnZShldmVudClcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH07XG5cbiAgICBsZXQgaGFuZGxlZCA9IGZhbHNlO1xuICAgIHN3aXRjaCAoZXZlbnQuZGV0YWlsLnRlcm0pIHtcbiAgICAgIGNhc2UgJ2pvaW4tc3BhY2Utbm90aWZpY2F0aW9uJzpcbiAgICAgICAgaGFuZGxlZCA9IHRoaXMuaGFuZGxlSm9pblNwYWNlTWVzc2FnZShldmVudC5kZXRhaWwpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKGhhbmRsZWQpIHJldHVybiB0cnVlO1xuXG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICByZXR1cm4gZXZlbnQuZGVmYXVsdFByZXZlbnRlZDtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlSm9pblNwYWNlTWVzc2FnZShtZXNzYWdlOiBNZXNzYWdlKTogYm9vbGVhbiB7XG4gICAgdGhpcy5yb3V0ZXIuYWRkUGF0aChtZXNzYWdlLnNyY1BhdGgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvbkNvbm5DbG9zZShldmVudDogQ29ubkNsb3NlRXZlbnQpIHtcbiAgICB0aGlzLnJvdXRlci5ybUFkZHIoZXZlbnQuZGV0YWlsLmNvbm4ucGVlcklkZW50aXR5LmFkZHIpO1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChldmVudCk7XG4gIH1cblxuICBwcml2YXRlIG9uUmVxdWVzdGVkKGV2ZW50OiBSZXF1ZXN0ZWRFdmVudCkge1xuICAgIHN3aXRjaCAoZXZlbnQuZGV0YWlsLnRlcm0pIHtcbiAgICAgIGNhc2UgJ3F1ZXJ5LWFkZHJzJzpcbiAgICAgICAgcmV0dXJuIHRoaXMub25SZXF1ZXN0ZWRBZGRycyhkZXJpdmVRdWVyeUFkZHJzTWVzc2FnZShldmVudC5kZXRhaWwpLCBldmVudCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBvblJlcXVlc3RlZEFkZHJzKG1lc3NhZ2U6IFF1ZXJ5QWRkcnNNZXNzYWdlLCBldmVudDogUmVxdWVzdGVkRXZlbnQpIHtcbiAgICBsZXQgW3NwYWNlLCBfdGFyZ2V0LCB1cHBlclNwYWNlc10gPSB0aGlzLnJvdXRlci5nZXRTcGFjZUFuZEFkZHIobWVzc2FnZS5kZXNQYXRoLCBmYWxzZSk7XG4gICAgY29uc3Qgc3JjQWRkciA9IGV4dHJhY3RBZGRyRnJvbVBhdGgobWVzc2FnZS5zcmNQYXRoKTtcbiAgICBjb25zdCByZXNwb25zZTogUXVlcnlBZGRyc1Jlc3BvbnNlTWVzc2FnZURhdGEgPSB7XG4gICAgICB0ZXJtOiAncXVlcnktYWRkcnMtcmVzcG9uc2UnLFxuICAgICAgLi4uKHNwYWNlID8gKHtcbiAgICAgICAgYWRkcnM6IFtcbiAgICAgICAgICAuLi5zcGFjZS50YWJsZS5tYXAobGluZSA9PiBsaW5lWzFdKS5maWx0ZXIoYWRkciA9PiBhZGRyICE9PSBzcmNBZGRyKSxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzcG9uc2VTcGFjZTogc3BhY2UucGF0aCxcbiAgICAgIH0pIDogKHtcbiAgICAgICAgYWRkcnM6IFtdLFxuICAgICAgICByZXNwb25zZVNwYWNlOiB1cHBlclNwYWNlc1t1cHBlclNwYWNlcy5sZW5ndGggLSAxXS5wYXRoXG4gICAgICB9KSksXG4gICAgfTtcblxuICAgIGV2ZW50LnJlc3BvbnNlKHJlc3BvbnNlKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2VudDtcbiIsImltcG9ydCBBZ2VudCBmcm9tICcuLi9hZ2VudCc7XG5pbXBvcnQgQ29ubiwgeyBNZXNzYWdlUmVjZWl2ZWRFdmVudCwgQ29ubkNsb3NlRXZlbnQgfSBmcm9tICcuLi9jb25uL2Jhc2UnO1xuaW1wb3J0IEV2ZW50VGFyZ2V0LCB7IEN1c3RvbUV2ZW50IH0gZnJvbSAnLi4vbWlzYy9ldmVudC10YXJnZXQnO1xuaW1wb3J0IHsgUGVlcklkZW50aXR5IH0gZnJvbSAnLi4vbWlzYy9pZGVudGl0eSc7XG5pbXBvcnQgeyBleHRyYWN0QWRkckZyb21QYXRoIH0gZnJvbSAnLi4vbWlzYy91dGlscyc7XG5pbXBvcnQgeyBNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9tZXNzYWdlJztcblxuaW1wb3J0IHsgT3B0aW9uYWwsIFJlcXVpcmVkIH0gZnJvbSAndXRpbGl0eS10eXBlcyc7XG5cbmludGVyZmFjZSBSZXF1ZXN0VG9Db25uRXZlbnREZXRhaWwge1xuICBwZWVyUGF0aDogc3RyaW5nO1xuICBwZWVySWRlbnRpdHk6IFBlZXJJZGVudGl0eTtcbn1cbmV4cG9ydCBjbGFzcyBSZXF1ZXN0VG9Db25uRXZlbnQgZXh0ZW5kcyBDdXN0b21FdmVudDxSZXF1ZXN0VG9Db25uRXZlbnREZXRhaWw+IHtcbiAgdHlwZSA9ICdyZXF1ZXN0LXRvLWNvbm4nXG4gIHBlZXJBZGRyOiBzdHJpbmc7XG4gIGNvbnN0cnVjdG9yKGRldGFpbDogUmVxdWVzdFRvQ29ubkV2ZW50RGV0YWlsKSB7XG4gICAgc3VwZXIoZGV0YWlsKTtcbiAgICB0aGlzLnBlZXJBZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChkZXRhaWwucGVlclBhdGgpO1xuICB9XG4gIHJlamVjdCgpIHtcbiAgICB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgTmV3Q29ubkV2ZW50RGV0YWlsIHtcbiAgY29ubjogQ29ubjtcbiAgcGVlclBhdGg6IHN0cmluZztcbiAgcmVjb25uZWN0ZWQ6IGJvb2xlYW47XG59XG5leHBvcnQgY2xhc3MgTmV3Q29ubkV2ZW50IGV4dGVuZHMgQ3VzdG9tRXZlbnQ8TmV3Q29ubkV2ZW50RGV0YWlsPiB7XG4gIHR5cGUgPSAnbmV3LWNvbm4nXG59XG5cbmludGVyZmFjZSBFdmVudE1hcCB7XG4gICdyZXF1ZXN0LXRvLWNvbm4nOiBSZXF1ZXN0VG9Db25uRXZlbnQ7XG4gICduZXctY29ubic6IE5ld0Nvbm5FdmVudDtcbiAgJ2Nsb3NlJzogQ29ubkNsb3NlRXZlbnQ7XG4gICdyZWNlaXZlJzogTWVzc2FnZVJlY2VpdmVkRXZlbnQ7XG59XG5cbmRlY2xhcmUgbmFtZXNwYWNlIENvbm5NYW5hZ2VyIHtcbiAgaW50ZXJmYWNlIENvbmZpZyB7XG4gICAgbmV3Q29ublRpbWVvdXQ6IG51bWJlcjtcbiAgICByZXF1ZXN0VG9Db25uVGltZW91dDogbnVtYmVyO1xuICB9XG4gIGludGVyZmFjZSBDb25uZWN0T3B0cyB7XG4gICAgcGVlcklkZW50aXR5PzogUGVlcklkZW50aXR5O1xuICAgIHRpbWVvdXQ/OiBudW1iZXI7XG4gICAgYmVpbmdDb25uZWN0ZWQ/OiBib29sZWFuO1xuICAgIFtvcHQ6IHN0cmluZ106IGFueTtcbiAgfVxuICB0eXBlIENvbm5lY3RPcHRzSW1wbCA9IFJlcXVpcmVkPENvbm5lY3RPcHRzLCAndGltZW91dCc+O1xufVxuXG5jb25zdCBjb25maWdEZWZhdWx0OiBDb25uTWFuYWdlci5Db25maWcgPSB7XG4gIG5ld0Nvbm5UaW1lb3V0OiAxMDAwMCxcbiAgcmVxdWVzdFRvQ29ublRpbWVvdXQ6IDEwMDAwLFxufVxuXG5hYnN0cmFjdCBjbGFzcyBDb25uTWFuYWdlciBleHRlbmRzIEV2ZW50VGFyZ2V0PEV2ZW50TWFwPiB7XG4gIHByb3RlY3RlZCBjb25uczogUmVjb3JkPHN0cmluZywgQ29ubj4gPSB7fTtcbiAgcHJvdGVjdGVkIGNvbmZpZzogQ29ubk1hbmFnZXIuQ29uZmlnO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUGFydGlhbDxDb25uTWFuYWdlci5Db25maWc+ID0ge30pIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuY29uZmlnID0geyAuLi5jb25maWdEZWZhdWx0LCAuLi5jb25maWcgfTtcbiAgfVxuXG4gIGFic3RyYWN0IHN0YXJ0KGFnZW50OiBBZ2VudCk6IFByb21pc2U8dm9pZD47XG5cbiAgY29ubmVjdChwZWVyUGF0aDogc3RyaW5nLCBvcHRzOiBDb25uTWFuYWdlci5Db25uZWN0T3B0cyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHBlZXJBZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChwZWVyUGF0aCk7XG4gICAgaWYgKHBlZXJBZGRyIGluIHRoaXMuY29ubnMpIHtcbiAgICAgIGNvbnNvbGUud2FybihgUGVlciAnJHtwZWVyQWRkcn0nIGFscmVhZHkgY29ubmVjdGVkLCBvcmlnaW5hbCBjb25uIHdpbGwgYmUgY2xvc2VkYCk7XG4gICAgfVxuICAgIGNvbnN0IHRpbWVvdXQgPSBvcHRzLmJlaW5nQ29ubmVjdGVkID8gdGhpcy5jb25maWcubmV3Q29ublRpbWVvdXQgOiB0aGlzLmNvbmZpZy5yZXF1ZXN0VG9Db25uVGltZW91dDtcbiAgICBcbiAgICBpZiAocGVlckFkZHIubWF0Y2goL153c3M/OlxcL1xcLy8pKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb25uZWN0V3MocGVlclBhdGgsIHsgdGltZW91dCwgLi4ub3B0cyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubmVjdFVubmFtZWQocGVlclBhdGgsIHsgdGltZW91dCwgLi4ub3B0cyB9KTtcbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgYWJzdHJhY3QgY29ubmVjdFdzKHBlZXJQYXRoOiBzdHJpbmcsIG9wdHM6IENvbm5NYW5hZ2VyLkNvbm5lY3RPcHRzSW1wbCk6IFByb21pc2U8dm9pZD47XG5cbiAgcHJvdGVjdGVkIGFic3RyYWN0IGNvbm5lY3RVbm5hbWVkKHBlZXJQYXRoOiBzdHJpbmcsIG9wdHM6IENvbm5NYW5hZ2VyLkNvbm5lY3RPcHRzSW1wbCk6IFByb21pc2U8dm9pZD47XG5cbiAgY29ubkNvdW50KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHRoaXMuY29ubnMpLmxlbmd0aDtcbiAgfVxuXG4gIGhhc0Nvbm4ocGVlckFkZHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBwZWVyQWRkciBpbiB0aGlzLmNvbm5zO1xuICB9XG5cbiAgc2VuZChwZWVyQWRkcjogc3RyaW5nLCBtZXNzYWdlOiBNZXNzYWdlKTogYm9vbGVhbiB7XG4gICAgY29uc3QgY29ubiA9IHRoaXMuY29ubnNbcGVlckFkZHJdO1xuICAgIGlmIChjb25uKSB7XG4gICAgICBjb25uLnNlbmQobWVzc2FnZSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJvdGVjdGVkIGFkZENvbm4ocGVlckFkZHI6IHN0cmluZywgY29ubjogQ29ubiwgcGVlclBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHJlY29ubmVjdGVkID0gcGVlckFkZHIgaW4gdGhpcy5jb25ucztcbiAgICBpZiAocmVjb25uZWN0ZWQpIHtcbiAgICAgIHRoaXMuY29ubnNbcGVlckFkZHJdLmNsb3NlKCk7XG4gICAgfVxuXG4gICAgdGhpcy5jb25uc1twZWVyQWRkcl0gPSBjb25uO1xuXG4gICAgY29ubi5hZGRFdmVudExpc3RlbmVyKCdyZWNlaXZlJywgZXZlbnQgPT4ge1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICB9KTtcbiAgICBjb25uLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgZXZlbnQgPT4ge1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICAgIGlmIChjb25uLmNvbm5JZCA9PT0gdGhpcy5jb25uc1twZWVyQWRkcl0uY29ubklkKSB7IC8vIHByZXZlbnQgcmVjb25uZWN0IGNsb3NpbmcgZGVsZXRlIG5ldyBjb25uZWN0aW9uXG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5zW3BlZXJBZGRyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgTmV3Q29ubkV2ZW50KHsgY29ubiwgcGVlclBhdGgsIHJlY29ubmVjdGVkIH0pKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25uTWFuYWdlcjtcbiIsImltcG9ydCBBZ2VudCBmcm9tICcuLi9hZ2VudCc7XG5pbXBvcnQgQ29ubk1hbmFnZXIsIHsgUmVxdWVzdFRvQ29ubkV2ZW50IH0gZnJvbSAnLi9iYXNlJztcbmltcG9ydCBXc0Nvbm4gZnJvbSAnLi4vY29ubi93cyc7XG5pbXBvcnQgV2ViU29ja2V0LCB7IFNlcnZlciBhcyBXZWJTb2NrZXRTZXJ2ZXIsIFNlcnZlck9wdGlvbnMgYXMgV3NTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnd3MnO1xuaW1wb3J0IHsgUGVlcklkZW50aXR5IH0gZnJvbSAnLi4vbWlzYy9pZGVudGl0eSc7XG5pbXBvcnQgeyBNZXNzYWdlLCB0b01lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL21lc3NhZ2UnO1xuaW1wb3J0IHsgbmV3UmVxdWVzdFRvQ29ubk1lc3NhZ2UsIG5ld1JlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9jb25uJztcbmltcG9ydCB7IG1ha2VSZXF1ZXN0VG9Db25uTWVzc2FnZSwgbWFrZVJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9jb25uJztcbmltcG9ydCB7IGV4dHJhY3RBZGRyRnJvbVBhdGggfSBmcm9tICcuLi9taXNjL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgV3NzQ29ubk1hbmFnZXIge1xuICB0eXBlIFNlcnZlck9wdGlvbnMgPSBXc1NlcnZlck9wdGlvbnNcbn1cblxuY2xhc3MgV3NzQ29ubk1hbmFnZXIgZXh0ZW5kcyBDb25uTWFuYWdlciB7XG4gIHByaXZhdGUgYWdlbnQ6IEFnZW50O1xuICBwcml2YXRlIHNlcnZlcjogV2ViU29ja2V0U2VydmVyO1xuICBwcml2YXRlIHNlcnZlck9wdHM6IFdzc0Nvbm5NYW5hZ2VyLlNlcnZlck9wdGlvbnM7XG5cbiAgcHJpdmF0ZSBwZW5kaW5nV3NDb25uczogUmVjb3JkPHN0cmluZywgV3NDb25uPiA9IHt9O1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUGFydGlhbDxDb25uTWFuYWdlci5Db25maWc+ID0ge30sIG9wdHM6IFdzc0Nvbm5NYW5hZ2VyLlNlcnZlck9wdGlvbnMgPSB7fSkge1xuICAgIHN1cGVyKGNvbmZpZyk7XG4gICAgdGhpcy5zZXJ2ZXJPcHRzID0gb3B0cztcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0KGFnZW50OiBBZ2VudCkge1xuICAgIHRoaXMuYWdlbnQgPSBhZ2VudDtcblxuICAgIGNvbnN0IHsgaG9zdG5hbWUsIHBvcnQgfSA9IG5ldyBVUkwodGhpcy5hZ2VudC5teUlkZW50aXR5LmFkZHIpO1xuICAgIHRoaXMuc2VydmVyT3B0cyA9IHtcbiAgICAgIGhvc3Q6IGhvc3RuYW1lLCBwb3J0OiBwYXJzZUludChwb3J0KSxcbiAgICAgIC4uLnRoaXMuc2VydmVyT3B0cyxcbiAgICB9XG5cbiAgICB0aGlzLnNlcnZlciA9IG5ldyBXZWJTb2NrZXRTZXJ2ZXIodGhpcy5zZXJ2ZXJPcHRzKTtcblxuICAgIHRoaXMuc2VydmVyLm9uKCdjb25uZWN0aW9uJywgKHdlYnNvY2tldDogV2ViU29ja2V0KSA9PiB7XG4gICAgICB0aGlzLm9uTmV3Q29ubmVjdGlvbih3ZWJzb2NrZXQpO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBvbk5ld0Nvbm5lY3Rpb24od3M6IFdlYlNvY2tldCkge1xuICAgIGxldCBvayA9IGZhbHNlO1xuICAgIHdzLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBhc3luYyBldmVudCA9PiB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gdG9NZXNzYWdlKEpTT04ucGFyc2UoZXZlbnQuZGF0YS50b1N0cmluZygpKSk7XG4gICAgICBzd2l0Y2ggKG1lc3NhZ2U/LnRlcm0pIHtcbiAgICAgICAgY2FzZSAncmVxdWVzdFRvQ29ubic6XG4gICAgICAgICAgb2sgPSBhd2FpdCB0aGlzLm9uTmV3Q29ublNlbnRSZXF1ZXN0VG9Db25uKHdzLCBtZXNzYWdlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncmVxdWVzdFRvQ29ublJlc3VsdCc6XG4gICAgICAgICAgb2sgPSBhd2FpdCB0aGlzLm9uTmV3Q29ublNlbnRSZXF1ZXN0VG9Db25uUmVzdWx0KHdzLCBtZXNzYWdlKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9LCB7IG9uY2U6IHRydWUgfSk7XG5cbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGlmICghb2spIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBXc3NDb25uTWFuYWdlci5vbk5ld0Nvbm5lY3Rpb246IG5ldyBjb25uZWN0aW9uIHRpbWVvdXRgKTtcbiAgICAgICAgd3MuY2xvc2UoKTtcbiAgICAgIH1cbiAgICB9LCB0aGlzLmNvbmZpZy5uZXdDb25uVGltZW91dCk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIG9uTmV3Q29ublNlbnRSZXF1ZXN0VG9Db25uKHdzOiBXZWJTb2NrZXQsIG1lc3NhZ2U6IE1lc3NhZ2UpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCByZXF1ZXN0VG9Db25uTWVzc2FnZSA9IG5ld1JlcXVlc3RUb0Nvbm5NZXNzYWdlKG1lc3NhZ2UpO1xuICAgIGlmIChyZXF1ZXN0VG9Db25uTWVzc2FnZSkge1xuICAgICAgY29uc3QgeyBzcmNQYXRoOiBwZWVyUGF0aCB9ID0gcmVxdWVzdFRvQ29ubk1lc3NhZ2U7XG4gICAgICBjb25zdCBwZWVySWRlbnRpdHkgPSBuZXcgUGVlcklkZW50aXR5KFxuICAgICAgICBwZWVyUGF0aCxcbiAgICAgICAgcmVxdWVzdFRvQ29ubk1lc3NhZ2Uuc2lnbmluZ1B1YktleSxcbiAgICAgICAgcmVxdWVzdFRvQ29ubk1lc3NhZ2UuZW5jcnlwdGlvblB1YktleSxcbiAgICAgICk7XG5cbiAgICAgIGlmIChhd2FpdCBwZWVySWRlbnRpdHkudmVyaWZ5KHJlcXVlc3RUb0Nvbm5NZXNzYWdlLnNpZ25hdHVyZSkpIHtcbiAgICAgICAgY29uc3QgZXZlbnQgPSBuZXcgUmVxdWVzdFRvQ29ubkV2ZW50KHsgcGVlclBhdGgsIHBlZXJJZGVudGl0eSB9KTtcbiAgICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblxuICAgICAgICBpZiAoIWV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgICAgICBpZiAoZXZlbnQucGVlckFkZHIubWF0Y2goL153c3M/OlxcL1xcLy8pKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ubkJ5V3Mod3MsIHBlZXJQYXRoLCBwZWVySWRlbnRpdHkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ubkJ5VW5uYW1lZCh3cywgcGVlclBhdGgsIHBlZXJJZGVudGl0eSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ubkJ5V3Mod3M6IFdlYlNvY2tldCwgcGVlclBhdGg6IHN0cmluZywgcGVlcklkZW50aXR5OiBQZWVySWRlbnRpdHkpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICB3cy5jbG9zZSgpO1xuICAgIGNvbnN0IGNvbm4gPSBuZXcgV3NDb25uKCk7XG4gICAgYXdhaXQgY29ubi5zdGFydExpbmsoe1xuICAgICAgbXlJZGVudGl0eTogdGhpcy5hZ2VudC5teUlkZW50aXR5LCBwZWVyUGF0aCxcbiAgICAgIHBlZXJJZGVudGl0eSxcbiAgICAgIGJlaW5nQ29ubmVjdGVkOiB0cnVlLFxuICAgICAgdGltZW91dDogdGhpcy5jb25maWcubmV3Q29ublRpbWVvdXRcbiAgICB9KTtcbiAgICB0aGlzLmFkZENvbm4ocGVlcklkZW50aXR5LmFkZHIsIGNvbm4sIHBlZXJQYXRoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb25OZXdDb25uU2VudFJlcXVlc3RUb0Nvbm5CeVVubmFtZWQod3M6IFdlYlNvY2tldCwgcGVlclBhdGg6IHN0cmluZywgcGVlcklkZW50aXR5OiBQZWVySWRlbnRpdHkpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBtZXNzYWdlID0gYXdhaXQgbWFrZVJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKHRoaXMuYWdlbnQubXlJZGVudGl0eSwgcGVlclBhdGgpO1xuICAgIHdzLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xuXG4gICAgY29uc3QgY29ubiA9IG5ldyBXc0Nvbm4oKTtcbiAgICBjb25uLnN0YXJ0RnJvbUV4aXN0aW5nKHdzLCB7IHBlZXJJZGVudGl0eSB9KTtcbiAgICB0aGlzLmFkZENvbm4ocGVlcklkZW50aXR5LmFkZHIsIGNvbm4sIHBlZXJQYXRoKTtcblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ublJlc3VsdCh3czogV2ViU29ja2V0LCBtZXNzYWdlOiBNZXNzYWdlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UgPSBuZXdSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZShtZXNzYWdlKTtcbiAgICBpZiAocmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UpIHtcbiAgICAgIGNvbnN0IHsgc3JjUGF0aDogcGVlclBhdGggfSA9IHJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlO1xuICAgICAgY29uc3QgcGVlckFkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHBlZXJQYXRoKTtcbiAgICAgIGNvbnN0IGNvbm4gPSB0aGlzLnBlbmRpbmdXc0Nvbm5zW3BlZXJBZGRyXTtcblxuICAgICAgaWYgKGNvbm4pIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucGVuZGluZ1dzQ29ubnNbcGVlckFkZHJdO1xuXG4gICAgICAgIGNvbm4ucGVlcklkZW50aXR5LnNldFNpZ25pbmdQdWJLZXkocmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2Uuc2lnbmluZ1B1YktleSk7XG4gICAgICAgIGNvbm4ucGVlcklkZW50aXR5LnNldEVuY3J5cHRpb25QdWJLZXkocmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UuZW5jcnlwdGlvblB1YktleSk7XG5cbiAgICAgICAgaWYgKGF3YWl0IGNvbm4ucGVlcklkZW50aXR5LnZlcmlmeShyZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZS5zaWduYXR1cmUpKSB7XG4gICAgICAgICAgY29ubi5zdGFydEZyb21FeGlzdGluZyh3cywge30pO1xuICAgICAgICAgIHRoaXMuYWRkQ29ubihwZWVyQWRkciwgY29ubiwgcGVlclBhdGgpO1xuXG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcm90ZWN0ZWQgYXN5bmMgY29ubmVjdFdzKHBlZXJQYXRoOiBzdHJpbmcsIF9vcHRzOiBDb25uTWFuYWdlci5Db25uZWN0T3B0c0ltcGwpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBjb25uID0gbmV3IFdzQ29ubigpO1xuICAgIGNvbnN0IHBlZXJJZGVudGl0eSA9IG5ldyBQZWVySWRlbnRpdHkocGVlclBhdGgpO1xuICAgIHRoaXMucGVuZGluZ1dzQ29ubnNbcGVlcklkZW50aXR5LmFkZHJdID0gY29ubjtcblxuICAgIGNvbm4uc3RhcnRMaW5rKHtcbiAgICAgIG15SWRlbnRpdHk6IHRoaXMuYWdlbnQubXlJZGVudGl0eSwgcGVlclBhdGgsXG4gICAgICBwZWVySWRlbnRpdHksXG4gICAgICB3YWl0Rm9yV3M6IHRydWUsXG4gICAgICB0aW1lb3V0OiB0aGlzLmNvbmZpZy5yZXF1ZXN0VG9Db25uVGltZW91dCxcbiAgICB9KTtcblxuICAgIGNvbnN0IHdzID0gbmV3IFdlYlNvY2tldChwZWVySWRlbnRpdHkuYWRkcik7XG4gICAgd3Mub25vcGVuID0gYXN5bmMgKCkgPT4ge1xuICAgICAgd3Muc2VuZChKU09OLnN0cmluZ2lmeShhd2FpdCBtYWtlUmVxdWVzdFRvQ29ubk1lc3NhZ2UodGhpcy5hZ2VudC5teUlkZW50aXR5LCBwZWVyUGF0aCkpKTtcbiAgICB9O1xuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICB3cy5jbG9zZSgpO1xuICAgIH0sIHRoaXMuY29uZmlnLnJlcXVlc3RUb0Nvbm5UaW1lb3V0KTtcbiAgfVxuXG4gIHByb3RlY3RlZCBhc3luYyBjb25uZWN0VW5uYW1lZChwZWVyUGF0aDogc3RyaW5nLCBfb3B0czogQ29ubk1hbmFnZXIuQ29ubmVjdE9wdHNJbXBsKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY29ubiA9IG5ldyBXc0Nvbm4oKTtcbiAgICBjb25zdCBwZWVySWRlbnRpdHkgPSBuZXcgUGVlcklkZW50aXR5KHBlZXJQYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdXc0Nvbm5zW3BlZXJJZGVudGl0eS5hZGRyXSA9IGNvbm47XG5cbiAgICBjb25zdCBzdGFydExpbmtQcm9taXNlID0gY29ubi5zdGFydExpbmsoe1xuICAgICAgbXlJZGVudGl0eTogdGhpcy5hZ2VudC5teUlkZW50aXR5LCBwZWVyUGF0aCxcbiAgICAgIHBlZXJJZGVudGl0eSxcbiAgICAgIHRpbWVvdXQ6IHRoaXMuY29uZmlnLnJlcXVlc3RUb0Nvbm5UaW1lb3V0LFxuICAgICAgd2FpdEZvcldzOiB0cnVlLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29ublZpYSA9IGF3YWl0IHRoaXMuYWdlbnQudHVubmVsTWFuYWdlci5jcmVhdGUocGVlclBhdGgpO1xuICAgIGNvbm5WaWEuc2VuZChhd2FpdCBtYWtlUmVxdWVzdFRvQ29ubk1lc3NhZ2UodGhpcy5hZ2VudC5teUlkZW50aXR5LCBwZWVyUGF0aCkpO1xuXG4gICAgYXdhaXQgc3RhcnRMaW5rUHJvbWlzZTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBXc3NDb25uTWFuYWdlcjtcbiIsImltcG9ydCBFdmVudFRhcmdldCwgeyBDdXN0b21FdmVudCB9IGZyb20gJy4uL21pc2MvZXZlbnQtdGFyZ2V0JztcbmltcG9ydCBJZGVudGl0eSwgeyBQZWVySWRlbnRpdHkgfSBmcm9tICcuLi9taXNjL2lkZW50aXR5JztcbmltcG9ydCB7IE1lc3NhZ2UsIHRvTWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvbWVzc2FnZSc7XG5pbXBvcnQgeyByYW5kb21TdHIgfSBmcm9tICcuLi9taXNjL3V0aWxzJztcbmltcG9ydCB7IGV4dHJhY3RBZGRyRnJvbVBhdGggfSBmcm9tICcuLi9taXNjL3V0aWxzJztcblxuZXhwb3J0IGNsYXNzIE1lc3NhZ2VSZWNlaXZlZEV2ZW50IGV4dGVuZHMgQ3VzdG9tRXZlbnQ8TWVzc2FnZT4ge1xuICB0eXBlID0gJ3JlY2VpdmUnO1xuICBmcm9tQ29ubjogQ29ubjtcbiAgc3JjQWRkcjogc3RyaW5nO1xuICBkZXNBZGRyOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3IoZnJvbUNvbm46IENvbm4sIGRldGFpbDogTWVzc2FnZSkge1xuICAgIHN1cGVyKGRldGFpbCk7XG4gICAgdGhpcy5mcm9tQ29ubiA9IGZyb21Db25uO1xuICAgIHRoaXMuc3JjQWRkciA9IGV4dHJhY3RBZGRyRnJvbVBhdGgoZGV0YWlsLnNyY1BhdGgpO1xuICAgIHRoaXMuZGVzQWRkciA9IGV4dHJhY3RBZGRyRnJvbVBhdGgoZGV0YWlsLmRlc1BhdGgpO1xuICB9XG59XG5cbmludGVyZmFjZSBDbG9zZUV2ZW50RGV0YWlsIHtcbiAgY29ubjogQ29ubjtcbiAgYnlTZWxmOiBib29sZWFuO1xuICB3c0V2ZW50PzogQ2xvc2VFdmVudFxufVxuXG5leHBvcnQgY2xhc3MgQ29ubkNsb3NlRXZlbnQgZXh0ZW5kcyBDdXN0b21FdmVudDxDbG9zZUV2ZW50RGV0YWlsPiB7XG4gIHR5cGUgPSAnY2xvc2UnXG59XG5cbmludGVyZmFjZSBDb25uRXZlbnRNYXAge1xuICAncmVjZWl2ZSc6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50O1xuICAnY2xvc2UnOiBDb25uQ2xvc2VFdmVudDtcbn1cblxuZGVjbGFyZSBuYW1lc3BhY2UgQ29ubiB7XG4gIGludGVyZmFjZSBTdGFydExpbmtPcHRzIHtcbiAgICBteUlkZW50aXR5OiBJZGVudGl0eTtcbiAgICBwZWVySWRlbnRpdHk/OiBQZWVySWRlbnRpdHk7XG4gICAgcGVlclBhdGg6IHN0cmluZztcbiAgICB0aW1lb3V0OiBudW1iZXI7XG4gICAgYmVpbmdDb25uZWN0ZWQ/OiBib29sZWFuO1xuICB9XG5cbiAgZXhwb3J0IGNvbnN0IGVudW0gU3RhdGUge1xuICAgIE5PVF9DT05ORUNURUQgPSAnTk9UX0NPTk5FQ1RFRCcsXG4gICAgQ09OTkVDVEVEID0gJ0NPTk5FQ1RFRCcsXG4gICAgRkFJTEVEID0gJ0ZBSUxFRCcsXG4gICAgQ0xPU0VEID0gJ0NMT1NFRCcsXG4gIH1cbn1cblxuYWJzdHJhY3QgY2xhc3MgQ29ubiBleHRlbmRzIEV2ZW50VGFyZ2V0PENvbm5FdmVudE1hcD4ge1xuICBjb25uSWQ6IHN0cmluZzsgLy8gcHJlc2VydmVkLCBtaWdodCBiZSB1c2VmdWwgaW4gdGhlIGZ1dHVyZSwgZGlmZmVyZW5jZSBiZXR3ZWVuIDIgc2lkZVxuICBwZWVySWRlbnRpdHk6IFBlZXJJZGVudGl0eTtcbiAgc3RhdGU6IENvbm4uU3RhdGUgPSBDb25uLlN0YXRlLk5PVF9DT05ORUNURUQ7XG5cbiAgY29uc3RydWN0b3IoY29ubklkPzogc3RyaW5nKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLmNvbm5JZCA9IGNvbm5JZCB8fCByYW5kb21TdHIoKTtcbiAgfVxuXG4gIGFic3RyYWN0IHN0YXJ0TGluayhvcHRzOiBDb25uLlN0YXJ0TGlua09wdHMgfCB7W186IHN0cmluZ106IGFueX0pOiBQcm9taXNlPHZvaWQ+O1xuXG4gIGFic3RyYWN0IGNsb3NlKCk6IFByb21pc2U8dm9pZD47XG5cbiAgYWJzdHJhY3Qgc2VuZChtZXNzYWdlOiBNZXNzYWdlKTogdm9pZDtcblxuICBwcm90ZWN0ZWQgb25NZXNzYWdlRGF0YShkYXRhOiBzdHJpbmcpIHtcbiAgICBjb25zdCBtZXNzYWdlQ29udGVudCA9IHRvTWVzc2FnZShKU09OLnBhcnNlKGRhdGEpKTtcbiAgICBpZiAobWVzc2FnZUNvbnRlbnQpIHtcbiAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgTWVzc2FnZVJlY2VpdmVkRXZlbnQodGhpcywgbWVzc2FnZUNvbnRlbnQpKVxuICAgIH1cbiAgfVxuXG4gIHByb3RlY3RlZCBvbkNsb3NlKGRldGFpbDogQ2xvc2VFdmVudERldGFpbCkge1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgQ29ubkNsb3NlRXZlbnQoZGV0YWlsKSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgQ29ubjtcbiIsImltcG9ydCBDb25uIGZyb20gJy4vYmFzZSdcbmltcG9ydCBJZGVudGl0eSwgeyBQZWVySWRlbnRpdHkgfSBmcm9tICcuLi9taXNjL2lkZW50aXR5JztcbmltcG9ydCB7IE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL21lc3NhZ2UnO1xuaW1wb3J0IHsgdG9SZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvY29ubic7XG5pbXBvcnQgeyBtYWtlUmVxdWVzdFRvQ29ubk1lc3NhZ2UsIG1ha2VSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvY29ubic7XG5cbmltcG9ydCBOb2RlV2ViU29ja2V0IGZyb20gJ3dzJztcbi8vIGltcG9ydGluZyAnd3MnIG5vZGVfbW9kdWxlcyB3aGVuIHRhcmdldGluZyBicm93c2VyIHdpbGwgb25seSBnZXQgYSBmdW5jdGlvbiB0aGF0IHRocm93IGVycm9yOiB3cyBkb2VzIG5vdCB3b3JrIGluIHRoZSBicm93c2VyXG5cbmNvbnN0IFdlYlNvY2tldCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8gTm9kZVdlYlNvY2tldCA6IHdpbmRvdy5XZWJTb2NrZXQ7XG5cbnR5cGUgV3MgPSBXZWJTb2NrZXQgfCBOb2RlV2ViU29ja2V0O1xudHlwZSBNc2dFdmVudCA9IE1lc3NhZ2VFdmVudCB8IE5vZGVXZWJTb2NrZXQuTWVzc2FnZUV2ZW50O1xuXG5kZWNsYXJlIG5hbWVzcGFjZSBXc0Nvbm4ge1xuICBpbnRlcmZhY2UgU3RhcnRMaW5rT3B0cyBleHRlbmRzIENvbm4uU3RhcnRMaW5rT3B0cyB7XG4gICAgd2FpdEZvcldzPzogYm9vbGVhbjtcbiAgfVxufVxuXG5jbGFzcyBXc0Nvbm4gZXh0ZW5kcyBDb25uIHtcbiAgcHJpdmF0ZSB3czogV3M7XG5cbiAgcHJpdmF0ZSBjb25uU3RhcnRSZXNvbHZlOiAoKSA9PiB2b2lkID0gKCkgPT4ge307XG4gIHByaXZhdGUgY29ublN0YXJ0UmVqZWN0OiAoZXJyOiBFcnJvcikgPT4gdm9pZCA9ICgpID0+IHt9O1xuICBwcml2YXRlIHBlbmRpbmdNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcbiAgcHJpdmF0ZSBjbG9zaW5nOiBib29sZWFuID0gZmFsc2U7XG5cbiAgc3RhcnRMaW5rKG9wdHM6IFdzQ29ubi5TdGFydExpbmtPcHRzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMucGVlcklkZW50aXR5ID0gb3B0cy5wZWVySWRlbnRpdHkgfHwgbmV3IFBlZXJJZGVudGl0eShvcHRzLnBlZXJQYXRoKTtcbiAgICAgIHRoaXMuY29ublN0YXJ0UmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICB0aGlzLmNvbm5TdGFydFJlamVjdCA9ICgpID0+IHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IENvbm4uU3RhdGUuRkFJTEVEO1xuICAgICAgICByZWplY3QoKTtcbiAgICAgIH07XG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZSAhPT0gQ29ubi5TdGF0ZS5DT05ORUNURUQpIHtcbiAgICAgICAgICB0aGlzLmNvbm5TdGFydFJlamVjdChuZXcgRXJyb3IoYGNvbm4vd3MudHM6IHN0YXJ0TGluazogY29ubmVjdGluZyB0byAke3RoaXMucGVlcklkZW50aXR5LmFkZHJ9IHRpbWVvdXRgKSk7XG4gICAgICAgIH1cbiAgICAgIH0sIG9wdHMudGltZW91dCk7XG5cbiAgICAgIGlmIChvcHRzLndhaXRGb3JXcykgcmV0dXJuO1xuXG4gICAgICB0aGlzLndzID0gbmV3IFdlYlNvY2tldCh0aGlzLnBlZXJJZGVudGl0eS5hZGRyKTtcblxuICAgICAgdGhpcy53cy5vbmVycm9yID0gKGVycm9yOiBhbnkpID0+IHtcbiAgICAgICAgY29uc29sZS5lcnJvcignd3MudHM6IHdzLm9uZXJyb3InLCBlcnJvcik7XG4gICAgICAgIHRoaXMuY29ublN0YXJ0UmVqZWN0KG5ldyBFcnJvcihgY29ubi93cy50czogc3RhcnRMaW5rOiBjb25uZWN0aW5nIHRvICR7dGhpcy5wZWVySWRlbnRpdHkuYWRkcn0gZmFpbGVkLCB3cyBlcnJvcmApKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdHMuYmVpbmdDb25uZWN0ZWQpIHtcbiAgICAgICAgLy8gYmVpbmcgY29ubmVjdGVkIGZyb20gd3NzIC0+IGJyb3dzZXI6IHdzcyBhc2sgYnJvd3NlciB0byBjb25uZWN0XG4gICAgICAgIHRoaXMuYmVpbmdDb25uZWN0aW5nRmxvdyhvcHRzLnBlZXJQYXRoLCBvcHRzLm15SWRlbnRpdHkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5jb25uZWN0aW5nRmxvdyhvcHRzLnBlZXJQYXRoLCBvcHRzLm15SWRlbnRpdHkpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBiZWluZ0Nvbm5lY3RpbmdGbG93KHBlZXJQYXRoOiBzdHJpbmcsIG15SWRlbnRpdHk6IElkZW50aXR5KSB7XG4gICAgdGhpcy53cy5vbm9wZW4gPSBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBtZXNzYWdlID0gYXdhaXQgbWFrZVJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKG15SWRlbnRpdHksIHBlZXJQYXRoKTtcbiAgICAgIHRoaXMud3Muc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG4gICAgICB0aGlzLmZpbmlzaFN0YXJ0aW5nKCk7XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgY29ubmVjdGluZ0Zsb3cocGVlclBhdGg6IHN0cmluZywgbXlJZGVudGl0eTogSWRlbnRpdHkpIHtcbiAgICB0aGlzLndzLm9ubWVzc2FnZSA9IGFzeW5jIChtZXNzYWdlOiBNc2dFdmVudCkgPT4ge1xuICAgICAgdGhpcy53cy5vbm1lc3NhZ2UgPSAobWVzc2FnZTogTXNnRXZlbnQpID0+IHtcbiAgICAgICAgdGhpcy5wZW5kaW5nTWVzc2FnZXMucHVzaChtZXNzYWdlLmRhdGEudG9TdHJpbmcoKSk7XG4gICAgICB9O1xuICAgICAgY29uc3QgcmVzdWx0TXNnID0gdG9SZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZShKU09OLnBhcnNlKG1lc3NhZ2UuZGF0YS50b1N0cmluZygpKSk7XG5cbiAgICAgIHRoaXMucGVlcklkZW50aXR5LnNldFNpZ25pbmdQdWJLZXkocmVzdWx0TXNnLnNpZ25pbmdQdWJLZXkpO1xuICAgICAgdGhpcy5wZWVySWRlbnRpdHkuc2V0RW5jcnlwdGlvblB1YktleShyZXN1bHRNc2cuZW5jcnlwdGlvblB1YktleSk7XG5cbiAgICAgIGlmIChhd2FpdCB0aGlzLnBlZXJJZGVudGl0eS52ZXJpZnkocmVzdWx0TXNnLnNpZ25hdHVyZSkpIHtcbiAgICAgICAgdGhpcy5maW5pc2hTdGFydGluZygpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLndzLm9ub3BlbiA9IGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBtYWtlUmVxdWVzdFRvQ29ubk1lc3NhZ2UobXlJZGVudGl0eSwgcGVlclBhdGgpO1xuXG4gICAgICB0aGlzLndzLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xuICAgIH1cbiAgfVxuXG4gIHN0YXJ0RnJvbUV4aXN0aW5nKHdzOiBXcywgb3B0czogUGljazxXc0Nvbm4uU3RhcnRMaW5rT3B0cywgJ3BlZXJJZGVudGl0eSc+KSB7XG4gICAgaWYgKG9wdHMucGVlcklkZW50aXR5KSB7XG4gICAgICB0aGlzLnBlZXJJZGVudGl0eSA9IG9wdHMucGVlcklkZW50aXR5O1xuICAgIH1cbiAgICB0aGlzLndzID0gd3M7XG4gICAgdGhpcy5maW5pc2hTdGFydGluZygpO1xuICB9XG5cbiAgcHJpdmF0ZSBmaW5pc2hTdGFydGluZygpIHtcbiAgICB0aGlzLnN0YXRlID0gQ29ubi5TdGF0ZS5DT05ORUNURUQ7XG4gICAgdGhpcy53cy5vbm1lc3NhZ2UgPSAobWVzc2FnZTogTXNnRXZlbnQpID0+IHtcbiAgICAgIHRoaXMub25NZXNzYWdlRGF0YShtZXNzYWdlLmRhdGEudG9TdHJpbmcoKSk7XG4gICAgfVxuICAgIHRoaXMud3Mub25jbG9zZSA9ICh3c0V2ZW50OiBDbG9zZUV2ZW50KSA9PiB7XG4gICAgICB0aGlzLnN0YXRlID0gQ29ubi5TdGF0ZS5DTE9TRUQ7XG4gICAgICB0aGlzLm9uQ2xvc2UoeyB3c0V2ZW50LCBjb25uOiB0aGlzLCBieVNlbGY6IHRoaXMuY2xvc2luZyB9KTtcbiAgICB9XG4gICAgdGhpcy5jb25uU3RhcnRSZXNvbHZlKCk7XG4gICAgcXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICAgICAgdGhpcy5wZW5kaW5nTWVzc2FnZXMuZm9yRWFjaChtc2cgPT4ge1xuICAgICAgICB0aGlzLm9uTWVzc2FnZURhdGEobXNnKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgY2xvc2UoKSB7XG4gICAgdGhpcy5jbG9zaW5nID0gdHJ1ZTtcbiAgICB0aGlzLndzLmNsb3NlKCk7XG4gIH1cblxuICBhc3luYyBzZW5kKG1lc3NhZ2U6IE1lc3NhZ2UpIHtcbiAgICB0aGlzLndzLnNlbmQoSlNPTi5zdHJpbmdpZnkobWVzc2FnZSkpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFdzQ29ubjtcbiIsImltcG9ydCBBZ2VudCBmcm9tICcuLi9hZ2VudCc7XG5pbXBvcnQgeyBSZXF1ZXN0ZWRFdmVudCB9IGZyb20gJy4uL3JlcXVlc3QnO1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcGluZyhhZ2VudDogQWdlbnQsIGRlc1BhdGg6IHN0cmluZykge1xuICBjb25zdCByZXF1ZXN0ID0gYXdhaXQgYWdlbnQucmVxdWVzdE1hbmFnZXIucmVxdWVzdChkZXNQYXRoLCB7XG4gICAgdGVybTogJ3BpbmcnLCByOiAxMCxcbiAgfSk7XG4gIGNvbnNvbGUubG9nKCdwaW5nIHJlc3BvbnNlOicsIHJlcXVlc3QucmVzcG9uc2VNZXNzYWdlKTtcbiAgcmV0dXJuIHJlcXVlc3Q7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVSZXF1ZXN0KGV2ZW50OiBSZXF1ZXN0ZWRFdmVudCkge1xuICBjb25zdCBtZXNzYWdlID0gZXZlbnQuZGV0YWlsIGFzIGFueTtcbiAgc3dpdGNoIChtZXNzYWdlLnRlcm0pIHtcbiAgICBjYXNlICdwaW5nJzpcbiAgICAgIGNvbnNvbGUubG9nKCdyZXF1ZXN0ZWQgcGluZycsIG1lc3NhZ2UpO1xuICAgICAgZXZlbnQucmVzcG9uc2UoeyB0ZXJtOiAncG9uZycsIHI6IG1lc3NhZ2UuciArIDEgfSlcbiAgICAgIGJyZWFrO1xuICB9XG59XG4iLCJpbXBvcnQgeyBNZXNzYWdlLCBBbnlNZXNzYWdlLCBtZXNzYWdlQWRkcnMgfSBmcm9tICcuL21lc3NhZ2UnO1xuaW1wb3J0IElkZW50aXR5IGZyb20gJy4uL21pc2MvaWRlbnRpdHknO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJlcXVlc3RUb0Nvbm5NZXNzYWdlIGV4dGVuZHMgTWVzc2FnZSB7XG4gIHRlcm06ICdyZXF1ZXN0VG9Db25uJ1xuICBzaWduaW5nUHViS2V5OiBzdHJpbmc7XG4gIGVuY3J5cHRpb25QdWJLZXk6IHN0cmluZztcbiAgc2lnbmF0dXJlOiBJZGVudGl0eS5TaWduYXR1cmU7XG5cbiAgb2ZmZXI/OiBSVENTZXNzaW9uRGVzY3JpcHRpb247XG59XG5leHBvcnQgZnVuY3Rpb24gdG9SZXF1ZXN0VG9Db25uTWVzc2FnZShkYXRhOiBBbnlNZXNzYWdlKTogUmVxdWVzdFRvQ29ubk1lc3NhZ2Uge1xuICByZXR1cm4gZGF0YS50ZXJtID09PSAncmVxdWVzdFRvQ29ubicgJiYgbmV3UmVxdWVzdFRvQ29ubk1lc3NhZ2UoZGF0YSk7XG59XG5leHBvcnQgZnVuY3Rpb24gbmV3UmVxdWVzdFRvQ29ubk1lc3NhZ2UoZGF0YTogQW55TWVzc2FnZSk6IFJlcXVlc3RUb0Nvbm5NZXNzYWdlIHtcbiAgaWYgKFxuICAgIHR5cGVvZiBkYXRhLnNpZ25pbmdQdWJLZXkgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIGRhdGEuZW5jcnlwdGlvblB1YktleSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgZGF0YS5zaWduYXR1cmUucmFuZG9tID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBkYXRhLnNpZ25hdHVyZS5zaWduID09PSAnc3RyaW5nJ1xuICApIHtcbiAgICBjb25zdCBtZXNzYWdlOiBSZXF1ZXN0VG9Db25uTWVzc2FnZSA9IHtcbiAgICAgIHRlcm06ICdyZXF1ZXN0VG9Db25uJyxcbiAgICAgIC4uLm1lc3NhZ2VBZGRycyhkYXRhKSxcbiAgICAgIHNpZ25pbmdQdWJLZXk6IGRhdGEuc2lnbmluZ1B1YktleSxcbiAgICAgIGVuY3J5cHRpb25QdWJLZXk6IGRhdGEuZW5jcnlwdGlvblB1YktleSxcbiAgICAgIHNpZ25hdHVyZToge1xuICAgICAgICByYW5kb206IGRhdGEuc2lnbmF0dXJlLnJhbmRvbSxcbiAgICAgICAgc2lnbjogZGF0YS5zaWduYXR1cmUuc2lnbixcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGlmICh0eXBlb2YgZGF0YS5vZmZlciA9PT0gJ29iamVjdCcpIHtcbiAgICAgIG1lc3NhZ2Uub2ZmZXIgPSBkYXRhLm9mZmVyIGFzIFJUQ1Nlc3Npb25EZXNjcmlwdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWFrZVJlcXVlc3RUb0Nvbm5NZXNzYWdlKG15SWRlbnRpdHk6IElkZW50aXR5LCBwZWVyUGF0aDogc3RyaW5nLCBvZmZlcj86IFJUQ1Nlc3Npb25EZXNjcmlwdGlvbik6IFByb21pc2U8UmVxdWVzdFRvQ29ubk1lc3NhZ2U+IHtcbiAgcmV0dXJuIHtcbiAgICB0ZXJtOiAncmVxdWVzdFRvQ29ubicsXG4gICAgc3JjUGF0aDogbXlJZGVudGl0eS5hZGRyLCBkZXNQYXRoOiBwZWVyUGF0aCxcbiAgICBzaWduaW5nUHViS2V5OiBteUlkZW50aXR5LmV4cG9ydGVkU2lnbmluZ1B1YktleSxcbiAgICBlbmNyeXB0aW9uUHViS2V5OiBteUlkZW50aXR5LmV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXksXG4gICAgc2lnbmF0dXJlOiBhd2FpdCBteUlkZW50aXR5LnNpZ25hdHVyZSgpLFxuICAgIG9mZmVyXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlIHtcbiAgdGVybTogJ3JlcXVlc3RUb0Nvbm5SZXN1bHQnXG4gIHNpZ25pbmdQdWJLZXk6IHN0cmluZztcbiAgZW5jcnlwdGlvblB1YktleTogc3RyaW5nO1xuICBzaWduYXR1cmU6IElkZW50aXR5LlNpZ25hdHVyZTtcblxuICBhbnN3ZXI/OiBSVENTZXNzaW9uRGVzY3JpcHRpb247XG59XG5leHBvcnQgZnVuY3Rpb24gdG9SZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZShkYXRhOiBBbnlNZXNzYWdlKTogUmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2Uge1xuICByZXR1cm4gZGF0YS50ZXJtID09PSAncmVxdWVzdFRvQ29ublJlc3VsdCcgJiYgbmV3UmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UoZGF0YSk7XG59XG5leHBvcnQgZnVuY3Rpb24gbmV3UmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UoZGF0YTogQW55TWVzc2FnZSk6IFJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIHtcbiAgaWYgKFxuICAgIHR5cGVvZiBkYXRhLnNpZ25pbmdQdWJLZXkgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIGRhdGEuZW5jcnlwdGlvblB1YktleSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgZGF0YS5zaWduYXR1cmUucmFuZG9tID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBkYXRhLnNpZ25hdHVyZS5zaWduID09PSAnc3RyaW5nJ1xuICApIHtcbiAgICBjb25zdCBtZXNzYWdlOiBSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSA9IHtcbiAgICAgIHRlcm06ICdyZXF1ZXN0VG9Db25uUmVzdWx0JyxcbiAgICAgIC4uLm1lc3NhZ2VBZGRycyhkYXRhKSxcbiAgICAgIHNpZ25pbmdQdWJLZXk6IGRhdGEuc2lnbmluZ1B1YktleSxcbiAgICAgIGVuY3J5cHRpb25QdWJLZXk6IGRhdGEuZW5jcnlwdGlvblB1YktleSxcbiAgICAgIHNpZ25hdHVyZToge1xuICAgICAgICByYW5kb206IGRhdGEuc2lnbmF0dXJlLnJhbmRvbSxcbiAgICAgICAgc2lnbjogZGF0YS5zaWduYXR1cmUuc2lnbixcbiAgICAgIH0sXG4gICAgfTtcblxuICAgIGlmICh0eXBlb2YgZGF0YS5hbnN3ZXIgPT09ICdvYmplY3QnKSB7XG4gICAgICBtZXNzYWdlLmFuc3dlciA9IGRhdGEuYW5zd2VyIGFzIFJUQ1Nlc3Npb25EZXNjcmlwdGlvbjtcbiAgICB9XG5cbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWFrZVJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKG15SWRlbnRpdHk6IElkZW50aXR5LCBwZWVyUGF0aDogc3RyaW5nLCBhbnN3ZXI/OiBSVENTZXNzaW9uRGVzY3JpcHRpb24pOiBQcm9taXNlPFJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlPiB7XG4gIHJldHVybiB7XG4gICAgdGVybTogJ3JlcXVlc3RUb0Nvbm5SZXN1bHQnLFxuICAgIHNyY1BhdGg6IG15SWRlbnRpdHkuYWRkciwgZGVzUGF0aDogcGVlclBhdGgsXG4gICAgc2lnbmluZ1B1YktleTogbXlJZGVudGl0eS5leHBvcnRlZFNpZ25pbmdQdWJLZXksXG4gICAgZW5jcnlwdGlvblB1YktleTogbXlJZGVudGl0eS5leHBvZXJ0ZWRFbmNyeXB0aW9uUHViS2V5LFxuICAgIHNpZ25hdHVyZTogYXdhaXQgbXlJZGVudGl0eS5zaWduYXR1cmUoKSxcbiAgICBhbnN3ZXIsXG4gIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUnRjSWNlTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2Uge1xuICB0ZXJtOiAncnRjSWNlJztcbiAgaWNlOiBSVENJY2VDYW5kaWRhdGU7XG59XG5leHBvcnQgZnVuY3Rpb24gdG9SdGNJY2VNZXNzYWdlKGRhdGE6IEFueU1lc3NhZ2UpOiBSdGNJY2VNZXNzYWdlIHtcbiAgcmV0dXJuIGRhdGEudGVybSA9PT0gJ3J0Y0ljZScgJiYgbmV3UnRjSWNlTWVzc2FnZShkYXRhKTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBuZXdSdGNJY2VNZXNzYWdlKGRhdGE6IEFueU1lc3NhZ2UpOiBSdGNJY2VNZXNzYWdlIHtcbiAgaWYgKFxuICAgIHR5cGVvZiBkYXRhLmljZSA9PT0gJ29iamVjdCdcbiAgKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIHRlcm06ICdydGNJY2UnLFxuICAgICAgLi4ubWVzc2FnZUFkZHJzKGRhdGEpLFxuICAgICAgaWNlOiBkYXRhLmljZSBhcyBSVENJY2VDYW5kaWRhdGUsXG4gICAgfTtcbiAgfVxufVxuIiwiZXhwb3J0IGludGVyZmFjZSBNZXNzYWdlIHtcbiAgdGVybTogc3RyaW5nO1xuICBzcmNQYXRoOiBzdHJpbmc7XG4gIGRlc1BhdGg6IHN0cmluZztcbn1cbmV4cG9ydCB0eXBlIE1lc3NhZ2VEYXRhID0gT21pdDxNZXNzYWdlLCAnc3JjUGF0aCcgfCAnZGVzUGF0aCc+ICYgeyBbXzogc3RyaW5nXTogYW55IH07XG5cbnR5cGUgTWVzc2FnZUFkZHJzID0gUGljazxNZXNzYWdlLCAnc3JjUGF0aCcgfCAnZGVzUGF0aCc+O1xuZXhwb3J0IHR5cGUgQW55TWVzc2FnZSA9IE1lc3NhZ2UgJiB7IFtfOiBzdHJpbmddOiBhbnkgfVxuXG5leHBvcnQgZnVuY3Rpb24gdG9NZXNzYWdlKGRhdGE6IGFueSk6IE1lc3NhZ2Uge1xuICBpZiAoXG4gICAgdHlwZW9mIGRhdGEudGVybSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgZGF0YS5zcmNQYXRoID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBkYXRhLmRlc1BhdGggPT09ICdzdHJpbmcnXG4gICkge1xuICAgIHJldHVybiBkYXRhXG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1lc3NhZ2VBZGRycyhkYXRhOiBBbnlNZXNzYWdlKTogTWVzc2FnZUFkZHJzIHtcbiAgcmV0dXJuIHsgc3JjUGF0aDogZGF0YS5zcmNQYXRoLCBkZXNQYXRoOiBkYXRhLmRlc1BhdGggfTtcbn1cbiIsImltcG9ydCB7IE1lc3NhZ2UsIEFueU1lc3NhZ2UsIHRvTWVzc2FnZSB9IGZyb20gJy4vbWVzc2FnZSc7XG5pbXBvcnQgeyBSZXF1ZXN0IH0gZnJvbSAnLi4vcmVxdWVzdCc7XG5pbXBvcnQgeyByYW5kb21TdHIgfSBmcm9tICcuLi9taXNjL3V0aWxzJztcblxuZXhwb3J0IGludGVyZmFjZSBOZXR3b3JrTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2Uge1xuICB0dGw6IG51bWJlcjtcbiAgbXNnSWQ6IHN0cmluZztcbn1cbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVOZXR3b3JrTWVzc2FnZShtZXNzYWdlOiBNZXNzYWdlLCBpbml0VHRsOiBudW1iZXIgPSAxMCk6IE5ldHdvcmtNZXNzYWdlIHtcbiAgY29uc3QgeyB0dGwsIG1zZ0lkIH0gPSBtZXNzYWdlIGFzIE5ldHdvcmtNZXNzYWdlO1xuICByZXR1cm4ge1xuICAgIC4uLm1lc3NhZ2UsXG4gICAgdHRsOiAodHRsID8/IGluaXRUdGwpIC0gMSxcbiAgICBtc2dJZDogbXNnSWQgPz8gcmFuZG9tU3RyKCksXG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBQaW5nTWVzc2FnZSB7XG4gIHRlcm06ICdwaW5nJ1xuICB0aW1lc3RhbXA6IG51bWJlclxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFF1ZXJ5QWRkcnNNZXNzYWdlRGF0YSB7XG4gIHRlcm06ICdxdWVyeS1hZGRycydcbn1cbmV4cG9ydCB0eXBlIFF1ZXJ5QWRkcnNNZXNzYWdlID0gUXVlcnlBZGRyc01lc3NhZ2VEYXRhICYgTWVzc2FnZTtcbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVRdWVyeUFkZHJzTWVzc2FnZShkYXRhOiBBbnlNZXNzYWdlKTogUXVlcnlBZGRyc01lc3NhZ2Uge1xuICByZXR1cm4ge1xuICAgIC4uLnRvTWVzc2FnZShkYXRhKSxcbiAgICB0ZXJtOiAncXVlcnktYWRkcnMnLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2VEYXRhIGV4dGVuZHMgUmVxdWVzdC5SZXNwb25zZU1lc3NhZ2VEYXRhIHtcbiAgdGVybTogJ3F1ZXJ5LWFkZHJzLXJlc3BvbnNlJztcbiAgYWRkcnM6IHN0cmluZ1tdO1xufVxuZXhwb3J0IHR5cGUgUXVlcnlBZGRyc1Jlc3BvbnNlTWVzc2FnZSA9IFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2VEYXRhICYgTWVzc2FnZTtcbmV4cG9ydCBmdW5jdGlvbiBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlKGRhdGE6IEFueU1lc3NhZ2UpOiBRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlIHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZGF0YS5hZGRycykpIHtcbiAgICByZXR1cm4ge1xuICAgICAgLi4udG9NZXNzYWdlKGRhdGEpLFxuICAgICAgdGVybTogJ3F1ZXJ5LWFkZHJzLXJlc3BvbnNlJyxcbiAgICAgIGFkZHJzOiBkYXRhLmFkZHJzLFxuICAgIH07XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBKb2luU3BhY2VOb3RpZmljYXRpb25NZXNzYWdlRGF0YSB7XG4gIHRlcm06ICdqb2luLXNwYWNlLW5vdGlmaWNhdGlvbic7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGVhdmVTcGFjZU5vdGlmaWNhdGlvbk1lc3NhZ2VEYXRhIHtcbiAgdGVybTogJ2xlYXZlLXNwYWNlLW5vdGlmaWNhdGlvbic7XG59XG4iLCJleHBvcnQgYWJzdHJhY3QgY2xhc3MgQ3VzdG9tRXZlbnQ8RGV0YWlsVD4ge1xuICBhYnN0cmFjdCByZWFkb25seSB0eXBlOiBzdHJpbmc7XG4gIHJlYWRvbmx5IGRldGFpbDogRGV0YWlsVDtcbiAgZGVmYXVsdFByZXZlbnRlZDogYm9vbGVhbiA9IGZhbHNlO1xuXG4gIGNvbnN0cnVjdG9yKGRldGFpbDogRGV0YWlsVCkge1xuICAgIHRoaXMuZGV0YWlsID0gZGV0YWlsO1xuICB9XG4gIHByZXZlbnREZWZhdWx0KCkge1xuICAgIHRoaXMuZGVmYXVsdFByZXZlbnRlZCA9IHRydWU7XG4gIH1cbn1cblxudHlwZSBFdmVudFRhcmdldExpc3RlbmVyczxFdmVudE1hcFQ+ID0ge1xuICBbaW5kZXg6IHN0cmluZ106ICgodGhpczogRXZlbnRUYXJnZXQ8RXZlbnRNYXBUPiwgZXY6IEV2ZW50TWFwVFtrZXlvZiBFdmVudE1hcFRdKSA9PiBhbnkpW11cbn1cblxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgRXZlbnRUYXJnZXQ8RXZlbnRNYXBUPiB7XG4gIGxpc3RlbmVyczogRXZlbnRUYXJnZXRMaXN0ZW5lcnM8RXZlbnRNYXBUPiA9IHt9O1xuXG4gIGFkZEV2ZW50TGlzdGVuZXI8SyBleHRlbmRzIGtleW9mIEV2ZW50TWFwVD4odHlwZTogSyAmIHN0cmluZywgbGlzdGVuZXI6ICh0aGlzOiBFdmVudFRhcmdldDxFdmVudE1hcFQ+LCBldjogRXZlbnRNYXBUW0tdKSA9PiB2b2lkKTogdm9pZCB7XG4gICAgaWYgKCEodHlwZSBpbiB0aGlzLmxpc3RlbmVycykpIHtcbiAgICAgIHRoaXMubGlzdGVuZXJzW3R5cGVdID0gW107XG4gICAgfVxuXG4gICAgdGhpcy5saXN0ZW5lcnNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIH1cblxuICByZW1vdmVFdmVudExpc3RlbmVyPEsgZXh0ZW5kcyBrZXlvZiBFdmVudE1hcFQ+KHR5cGU6IEsgJiBzdHJpbmcsIGxpc3RlbmVyOiAodGhpczogRXZlbnRUYXJnZXQ8RXZlbnRNYXBUPiwgZXY6IEV2ZW50TWFwVFtLXSkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGlmICghKHR5cGUgaW4gdGhpcy5saXN0ZW5lcnMpKSByZXR1cm47XG5cbiAgICBjb25zdCBzdGFjayA9IHRoaXMubGlzdGVuZXJzW3R5cGVdO1xuICAgIHN0YWNrLnNwbGljZShzdGFjay5pbmRleE9mKGxpc3RlbmVyLCAxKSk7XG4gIH1cblxuICBkaXNwYXRjaEV2ZW50KGV2ZW50OiBFdmVudE1hcFRba2V5b2YgRXZlbnRNYXBUXSAmIEN1c3RvbUV2ZW50PGFueT4pIDogYm9vbGVhbiB7XG4gICAgaWYgKCEoZXZlbnQudHlwZSBpbiB0aGlzLmxpc3RlbmVycykpIHJldHVybjtcblxuICAgIHRoaXMubGlzdGVuZXJzW2V2ZW50LnR5cGVdLnNsaWNlKCkuZm9yRWFjaChjYWxsYmFjayA9PiB7XG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIGV2ZW50KTtcbiAgICB9KVxuXG4gICAgcmV0dXJuICFldmVudC5kZWZhdWx0UHJldmVudGVkO1xuICB9XG59XG4iLCJpbXBvcnQgeyBDdXN0b21FdmVudCB9IGZyb20gJy4vZXZlbnQtdGFyZ2V0JztcbmltcG9ydCB7IE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL21lc3NhZ2UnO1xuaW1wb3J0IHsgTWVzc2FnZVJlY2VpdmVkRXZlbnQgfSBmcm9tICcuLi9jb25uL2Jhc2UnO1xuXG5leHBvcnQgY2xhc3MgTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50IGV4dGVuZHMgQ3VzdG9tRXZlbnQ8TWVzc2FnZT4ge1xuICB0eXBlID0gJ3JlY2VpdmUtbmV0d29yayc7XG4gIG1lc3NhZ2VSZWNlaXZlZEV2ZW50OiBNZXNzYWdlUmVjZWl2ZWRFdmVudDtcbiAgZXhhY3RGb3JNZTogYm9vbGVhbjtcblxuICBjb25zdHJ1Y3RvcihtZXNzYWdlUmVjZWl2ZWRFdmVudDogTWVzc2FnZVJlY2VpdmVkRXZlbnQsIGV4YWN0Rm9yTWU6IGJvb2xlYW4pIHtcbiAgICBzdXBlcihtZXNzYWdlUmVjZWl2ZWRFdmVudC5kZXRhaWwpO1xuICAgIHRoaXMubWVzc2FnZVJlY2VpdmVkRXZlbnQgPSBtZXNzYWdlUmVjZWl2ZWRFdmVudDtcbiAgICB0aGlzLmV4YWN0Rm9yTWUgPSBleGFjdEZvck1lO1xuICB9XG59XG5cbiIsImltcG9ydCBjcnlwdG8gZnJvbSAnaXNvbW9ycGhpYy13ZWJjcnlwdG8nO1xuaW1wb3J0IHsgYXJyYXlCdWZmZXJUb2Jhc2U2NCwgYmFzZTY0VG9BcnJheUJ1ZmZlciwgZXh0cmFjdEFkZHJGcm9tUGF0aCB9IGZyb20gJy4vdXRpbHMnO1xuXG5kZWNsYXJlIG5hbWVzcGFjZSBJZGVudGl0eSB7XG4gIGludGVyZmFjZSBDb25maWcge1xuICAgIG15QWRkcj86IHN0cmluZztcbiAgICBzaWduaW5nS2V5UGFpcj86IENyeXB0b0tleVBhaXI7XG4gICAgZW5jcnlwdGlvbktleVBhaXI/OiBDcnlwdG9LZXlQYWlyO1xuICAgIFtvcHQ6IHN0cmluZ106IGFueTtcbiAgfVxuXG4gIGludGVyZmFjZSBTaWduYXR1cmUge1xuICAgIHJhbmRvbTogc3RyaW5nO1xuICAgIHNpZ246IHN0cmluZztcbiAgfVxufVxuXG5jb25zdCBTSUdOSU5HX0tFWV9PUFRTID0ge1xuICBuYW1lOiBcIkVDRFNBXCIsXG4gIG5hbWVkQ3VydmU6IFwiUC0zODRcIlxufTtcbmNvbnN0IFNJR05JTkdfQUxHT1JJVEhNX09QVFMgPSB7XG4gIG5hbWU6IFwiRUNEU0FcIixcbiAgaGFzaDogeyBuYW1lOiBcIlNIQS0zODRcIiB9LFxufVxuY29uc3QgRU5DUllQVElPTl9LRVlfT1BUUyA9IHtcbiAgbmFtZTogXCJSU0EtT0FFUFwiLFxuICBtb2R1bHVzTGVuZ3RoOiA0MDk2LFxuICBwdWJsaWNFeHBvbmVudDogbmV3IFVpbnQ4QXJyYXkoWzEsIDAsIDFdKSxcbiAgaGFzaDogXCJTSEEtMjU2XCJcbn07XG5cbmNsYXNzIElkZW50aXR5IHtcbiAgYWRkcjogc3RyaW5nO1xuICBleHBvcnRlZFNpZ25pbmdQdWJLZXk6IHN0cmluZztcbiAgZXhwb2VydGVkRW5jcnlwdGlvblB1YktleTogc3RyaW5nO1xuXG4gIHByaXZhdGUgc2lnbmluZ0tleVBhaXI6IENyeXB0b0tleVBhaXI7XG4gIHByaXZhdGUgZW5jcnlwdGlvbktleVBhaXI6IENyeXB0b0tleVBhaXI7XG5cbiAgcHJpdmF0ZSBleHBvcnRlZFNpZ25pbmdQdWJLZXlSYXc6IEFycmF5QnVmZmVyO1xuICBwcml2YXRlIGV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXlSYXc6IEFycmF5QnVmZmVyO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUGFydGlhbDxJZGVudGl0eS5Db25maWc+ID0ge30pIHtcbiAgICBpZiAoY29uZmlnLm15QWRkcikgdGhpcy5hZGRyID0gY29uZmlnLm15QWRkcjtcbiAgICBpZiAoY29uZmlnLmVuY3J5cHRpb25LZXlQYWlyKSB0aGlzLmVuY3J5cHRpb25LZXlQYWlyID0gY29uZmlnLmVuY3J5cHRpb25LZXlQYWlyO1xuICAgIGlmIChjb25maWcuc2lnbmluZ0tleVBhaXIpIHRoaXMuc2lnbmluZ0tleVBhaXIgPSBjb25maWcuc2lnbmluZ0tleVBhaXI7XG4gIH1cblxuICBhc3luYyBnZW5lcmF0ZUlmTmVlZGVkKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGlmICghdGhpcy5zaWduaW5nS2V5UGFpcikge1xuICAgICAgdGhpcy5zaWduaW5nS2V5UGFpciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZ2VuZXJhdGVLZXkoXG4gICAgICAgIFNJR05JTkdfS0VZX09QVFMsXG4gICAgICAgIHRydWUsXG4gICAgICAgIFtcInNpZ25cIiwgXCJ2ZXJpZnlcIl0sXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5lbmNyeXB0aW9uS2V5UGFpcikge1xuICAgICAgdGhpcy5lbmNyeXB0aW9uS2V5UGFpciA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZ2VuZXJhdGVLZXkoXG4gICAgICAgIEVOQ1JZUFRJT05fS0VZX09QVFMsXG4gICAgICAgIHRydWUsXG4gICAgICAgIFtcImVuY3J5cHRcIiwgXCJkZWNyeXB0XCJdLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICB0aGlzLmV4cG9ydGVkU2lnbmluZ1B1YktleVJhdyA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZXhwb3J0S2V5KCdyYXcnLCB0aGlzLnNpZ25pbmdLZXlQYWlyLnB1YmxpY0tleSk7XG4gICAgdGhpcy5leHBvZXJ0ZWRFbmNyeXB0aW9uUHViS2V5UmF3ID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5leHBvcnRLZXkoJ3Nwa2knLCB0aGlzLmVuY3J5cHRpb25LZXlQYWlyLnB1YmxpY0tleSk7XG4gICAgdGhpcy5leHBvcnRlZFNpZ25pbmdQdWJLZXkgPSBhcnJheUJ1ZmZlclRvYmFzZTY0KHRoaXMuZXhwb3J0ZWRTaWduaW5nUHViS2V5UmF3KTtcbiAgICB0aGlzLmV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXkgPSBhcnJheUJ1ZmZlclRvYmFzZTY0KHRoaXMuZXhwb2VydGVkRW5jcnlwdGlvblB1YktleVJhdyk7XG5cbiAgICBpZiAoIXRoaXMuYWRkcikge1xuICAgICAgY29uc3QgcHViS2V5SGFzaCA9IGF3YWl0IGNhbGNVbm5hbWVkQWRkcihcbiAgICAgICAgdGhpcy5leHBvcnRlZFNpZ25pbmdQdWJLZXlSYXcsXG4gICAgICAgIHRoaXMuZXhwb2VydGVkRW5jcnlwdGlvblB1YktleVJhdyxcbiAgICAgICk7XG4gICAgICB0aGlzLmFkZHIgPSBgIyR7YXJyYXlCdWZmZXJUb2Jhc2U2NChwdWJLZXlIYXNoKX1gO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHNpZ25hdHVyZSgpOiBQcm9taXNlPElkZW50aXR5LlNpZ25hdHVyZT4ge1xuICAgIGNvbnN0IHJhbmRvbSA9IG5ldyBVaW50OEFycmF5KDMyKTtcbiAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKHJhbmRvbSk7XG4gICAgY29uc3Qgc2lnbmF0dXJlID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5zaWduKFxuICAgICAgU0lHTklOR19BTEdPUklUSE1fT1BUUyxcbiAgICAgIHRoaXMuc2lnbmluZ0tleVBhaXIucHJpdmF0ZUtleSxcbiAgICAgIGNhbGNEYXRhVG9CZVNpZ25lZCh0aGlzLmV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXlSYXcsIHJhbmRvbSksXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICByYW5kb206IGFycmF5QnVmZmVyVG9iYXNlNjQocmFuZG9tKSxcbiAgICAgIHNpZ246IGFycmF5QnVmZmVyVG9iYXNlNjQoc2lnbmF0dXJlKSxcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IElkZW50aXR5O1xuXG5leHBvcnQgY2xhc3MgUGVlcklkZW50aXR5IHtcbiAgYWRkcjogc3RyaW5nO1xuICBwcml2YXRlIHNpZ25pbmdQdWJLZXk6IEFycmF5QnVmZmVyO1xuICBwcml2YXRlIGVuY3J5cHRpb25QdWJLZXk6IEFycmF5QnVmZmVyO1xuXG4gIGNvbnN0cnVjdG9yKHBlZXJQYXRoOiBzdHJpbmcsIHBlZXJTaWduaW5nUHViS2V5QmFzZTY0Pzogc3RyaW5nLCBwZWVyRW5jcnlwdGlvblB1YktleUJhc2U2ND86IHN0cmluZykge1xuICAgIHRoaXMuYWRkciA9IGV4dHJhY3RBZGRyRnJvbVBhdGgocGVlclBhdGgpO1xuICAgIGlmIChwZWVyU2lnbmluZ1B1YktleUJhc2U2NCkge1xuICAgICAgdGhpcy5zZXRTaWduaW5nUHViS2V5KHBlZXJTaWduaW5nUHViS2V5QmFzZTY0KTtcbiAgICB9XG4gICAgaWYgKHBlZXJFbmNyeXB0aW9uUHViS2V5QmFzZTY0KSB7XG4gICAgICB0aGlzLnNldEVuY3J5cHRpb25QdWJLZXkocGVlckVuY3J5cHRpb25QdWJLZXlCYXNlNjQpO1xuICAgIH1cbiAgfVxuXG4gIHNldFNpZ25pbmdQdWJLZXkocGVlclNpZ25pbmdQdWJLZXlCYXNlNjQ6IHN0cmluZykge1xuICAgIHRoaXMuc2lnbmluZ1B1YktleSA9IGJhc2U2NFRvQXJyYXlCdWZmZXIocGVlclNpZ25pbmdQdWJLZXlCYXNlNjQpO1xuICB9XG4gIHNldEVuY3J5cHRpb25QdWJLZXkocGVlckVuY3J5cHRpb25QdWJLZXlCYXNlNjQ6IHN0cmluZykge1xuICAgIHRoaXMuZW5jcnlwdGlvblB1YktleSA9IGJhc2U2NFRvQXJyYXlCdWZmZXIocGVlckVuY3J5cHRpb25QdWJLZXlCYXNlNjQpO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5KHNpZ25hdHVyZTogSWRlbnRpdHkuU2lnbmF0dXJlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgaWYgKHRoaXMuYWRkci5tYXRjaCgvXiMvKSkge1xuICAgICAgY29uc3QgaGFzaEFkZHJWZXJpZmllZCA9IGF3YWl0IHRoaXMudmVyaWZ5VW5uYW1lZEFkZHIoKTtcblxuICAgICAgaWYgKCFoYXNoQWRkclZlcmlmaWVkKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgY29uc3Qgc2lnbmF0dXJlVmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVNpZ25hdHVyZShzaWduYXR1cmUpO1xuICAgIHJldHVybiBzaWduYXR1cmVWZXJpZmllZDtcbiAgfVxuXG4gIGFzeW5jIHZlcmlmeVVubmFtZWRBZGRyKCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHB1YktleUhhc2ggPSBhd2FpdCBjYWxjVW5uYW1lZEFkZHIodGhpcy5zaWduaW5nUHViS2V5LCB0aGlzLmVuY3J5cHRpb25QdWJLZXkpO1xuICAgIHJldHVybiBhcnJheUJ1ZmZlclRvYmFzZTY0KHB1YktleUhhc2gpID09PSB0aGlzLmFkZHIuc2xpY2UoMSk7XG4gIH1cblxuICBhc3luYyB2ZXJpZnlTaWduYXR1cmUoc2lnbmF0dXJlOiBJZGVudGl0eS5TaWduYXR1cmUpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBwZWVyU2lnbmluZ1B1YktleSA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuaW1wb3J0S2V5KFxuICAgICAgJ3JhdycsIHRoaXMuc2lnbmluZ1B1YktleSwgU0lHTklOR19LRVlfT1BUUywgZmFsc2UsIFsndmVyaWZ5J10sXG4gICAgKTtcblxuICAgIGNvbnN0IGRhdGFCZWZvcmVTaWduaW5nID0gY2FsY0RhdGFUb0JlU2lnbmVkKFxuICAgICAgdGhpcy5lbmNyeXB0aW9uUHViS2V5LCBiYXNlNjRUb0FycmF5QnVmZmVyKHNpZ25hdHVyZS5yYW5kb20pLFxuICAgICk7XG5cbiAgICByZXR1cm4gY3J5cHRvLnN1YnRsZS52ZXJpZnkoXG4gICAgICBTSUdOSU5HX0FMR09SSVRITV9PUFRTLFxuICAgICAgcGVlclNpZ25pbmdQdWJLZXksXG4gICAgICBiYXNlNjRUb0FycmF5QnVmZmVyKHNpZ25hdHVyZS5zaWduKSxcbiAgICAgIGRhdGFCZWZvcmVTaWduaW5nLFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2FsY1VubmFtZWRBZGRyKHNpZ25pbmdQdWJLZXk6IEFycmF5QnVmZmVyLCBlbmNyeXB0aW9uUHViS2V5OiBBcnJheUJ1ZmZlcik6IFByb21pc2U8QXJyYXlCdWZmZXI+IHtcbiAgcmV0dXJuIGNyeXB0by5zdWJ0bGUuZGlnZXN0KCdTSEEtNTEyJywgY29uY2F0QXJyYXlCdWZmZXIoc2lnbmluZ1B1YktleSwgZW5jcnlwdGlvblB1YktleSkpO1xufVxuXG5mdW5jdGlvbiBjYWxjRGF0YVRvQmVTaWduZWQoZW5jcnlwdGlvblB1YktleTogQXJyYXlCdWZmZXIsIHJhbmRvbTogQXJyYXlCdWZmZXIpOiBBcnJheUJ1ZmZlciB7XG4gIHJldHVybiBjb25jYXRBcnJheUJ1ZmZlcihlbmNyeXB0aW9uUHViS2V5LCByYW5kb20pO1xufVxuXG5mdW5jdGlvbiBjb25jYXRBcnJheUJ1ZmZlcihhYjE6IEFycmF5QnVmZmVyLCBhYjI6IEFycmF5QnVmZmVyKTogQXJyYXlCdWZmZXIge1xuICBjb25zdCBuZXdBcnIgPSBuZXcgVWludDhBcnJheShhYjEuYnl0ZUxlbmd0aCArIGFiMi5ieXRlTGVuZ3RoKTtcbiAgbmV3QXJyLnNldChuZXcgVWludDhBcnJheShhYjEpKTtcbiAgbmV3QXJyLnNldChuZXcgVWludDhBcnJheShhYjIpLCBhYjEuYnl0ZUxlbmd0aCk7XG4gIHJldHVybiBuZXdBcnIuYnVmZmVyO1xufVxuIiwiaW1wb3J0IGNyeXB0byBmcm9tICdpc29tb3JwaGljLXdlYmNyeXB0byc7XG5cbmV4cG9ydCBmdW5jdGlvbiByYW5kb21TdHIoKTogc3RyaW5nIHtcbiAgcmV0dXJuIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIERhdGUubm93KCkpLnRvU3RyaW5nKDM2KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFycmF5QnVmZmVyVG9iYXNlNjQoYWI6IEFycmF5QnVmZmVyKTogc3RyaW5nIHtcbiAgcmV0dXJuIGJ0b2EoU3RyaW5nLmZyb21DaGFyQ29kZS5hcHBseShudWxsLCBuZXcgVWludDhBcnJheShhYikpKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJhc2U2NFRvQXJyYXlCdWZmZXIoYmFzZTY0OiBzdHJpbmcpOiBBcnJheUJ1ZmZlciB7XG4gIHJldHVybiBVaW50OEFycmF5LmZyb20oYXRvYihiYXNlNjQpLCBjID0+IGMuY2hhckNvZGVBdCgwKSlcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RBZGRyRnJvbVBhdGgocGF0aDogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIHBhdGguc3BsaXQoJz4nKS5zbGljZSgtMSlbMF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0U3BhY2VQYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwYXRoLnNwbGl0KCc+Jykuc2xpY2UoMCwgLTEpLmpvaW4oJz4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGpvaW5QYXRoKHBhdGg6IHN0cmluZyB8IHN0cmluZ1tdLCB0YXJnZXQ6IHN0cmluZyA9ICcnKTogc3RyaW5nIHtcbiAgY29uc3QgcGF0aFNlZ3M6IHN0cmluZ1tdID0gQXJyYXkuaXNBcnJheShwYXRoKSA/IHBhdGggOiBbcGF0aF07XG4gIHJldHVybiBbIC4uLnBhdGhTZWdzLCB0YXJnZXQgXS5maWx0ZXIoc2VnID0+IHNlZy5sZW5ndGggPiAwKS5qb2luKCc+Jyk7XG59XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBjYWxjQWRkck9yU3ViU3BhY2VIYXNoKGFkZHJPclN1YlNwYWNlOiBzdHJpbmcpOiBQcm9taXNlPFVpbnQzMkFycmF5PiB7XG4gIGNvbnN0IGhhc2ggPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdCgnU0hBLTUxMicsIChuZXcgVGV4dEVuY29kZXIoKSkuZW5jb2RlKGFkZHJPclN1YlNwYWNlKSk7XG4gIHJldHVybiBuZXcgVWludDMyQXJyYXkoaGFzaCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRGaXJzdFVpbnQzMkhleChkYXRhOiBVaW50MzJBcnJheSkge1xuICByZXR1cm4gJzB4JyArICgnMDAwMDAwMDAnICsgZGF0YVswXS50b1N0cmluZygxNikpLnNsaWNlKC04KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNodWZmbGU8VD4oYXJyYXk6IFRbXSk6IFRbXSB7XG4gIGNvbnN0IG5ld0FycmF5ID0gWy4uLmFycmF5XTtcbiAgZm9yIChsZXQgaSA9IGFycmF5Lmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pIHtcbiAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XG4gICAgW2FycmF5W2ldLCBhcnJheVtqXV0gPSBbYXJyYXlbal0sIGFycmF5W2ldXTtcbiAgfVxuICByZXR1cm4gbmV3QXJyYXk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3YWl0KHRpbWVvdXQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuICByZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgc2V0VGltZW91dChyZXNvbHZlLCB0aW1lb3V0KTtcbiAgfSk7XG59XG4iLCJpbXBvcnQgQWdlbnQgZnJvbSAnLi9hZ2VudCc7XG5pbXBvcnQgRXZlbnRUYXJnZXQgZnJvbSAnLi9taXNjL2V2ZW50LXRhcmdldCc7XG5pbXBvcnQgeyBNZXNzYWdlIGFzIE9yaU1lc3NhZ2UsIE1lc3NhZ2VEYXRhIGFzIE9yaU1lc3NhZ2VEYXRhIH0gZnJvbSAnLi9tZXNzYWdlL21lc3NhZ2UnO1xuaW1wb3J0IHsgTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50IH0gZnJvbSAnLi9taXNjL2V2ZW50cyc7XG5pbXBvcnQgeyByYW5kb21TdHIgfSBmcm9tICcuL21pc2MvdXRpbHMnO1xuXG5kZWNsYXJlIG5hbWVzcGFjZSBSZXF1ZXN0IHtcbiAgZXhwb3J0IGNvbnN0IGVudW0gRGlyZWN0aW9uIHsgUmVxdWVzdCA9ICdyZXF1ZXN0JywgUmVzcG9uc2UgPSAncmVzcG9uc2UnIH1cbiAgaW50ZXJmYWNlIE1lc3NhZ2VGaWVsZHMge1xuICAgIHJlcXVlc3RJZDogc3RyaW5nO1xuICAgIGRpcmVjdGlvbjogRGlyZWN0aW9uO1xuICB9XG4gIGV4cG9ydCBpbnRlcmZhY2UgUmVzcG9uc2VNZXNzYWdlRGF0YSBleHRlbmRzIE9yaU1lc3NhZ2VEYXRhIHtcbiAgICByZXNwb25zZVNwYWNlPzogc3RyaW5nO1xuICB9XG4gIHR5cGUgTWVzc2FnZSA9IE9yaU1lc3NhZ2UgJiBNZXNzYWdlRmllbGRzO1xuICB0eXBlIFJlcXVlc3RNZXNzYWdlRGF0YSA9IE9yaU1lc3NhZ2VEYXRhICYgTWVzc2FnZUZpZWxkcztcblxuICBpbnRlcmZhY2UgTWFuYWdlckNvbmZpZyB7XG4gICAgdGltZW91dDogbnVtYmVyO1xuICB9XG5cbiAgdHlwZSBSZXNvbHZlRm4gPSAobWVzc2FnZTogUmVxdWVzdC5NZXNzYWdlKSA9PiB7fTtcbiAgdHlwZSByZXF1ZXN0SWQgPSBzdHJpbmc7XG4gIHR5cGUgUmVxdWVzdElkVG9UaHJvdWdocyA9IFJlY29yZDxyZXF1ZXN0SWQsIFtwYXRoOiBzdHJpbmcsIHBlZXJBZGRyOiBzdHJpbmddPjtcbn1cblxuZXhwb3J0IGNsYXNzIFJlcXVlc3RlZEV2ZW50IGV4dGVuZHMgTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50IHtcbiAgdHlwZSA9ICdyZXF1ZXN0ZWQnXG4gIHJlc3BvbnNlRGF0YT86IFByb21pc2U8UmVxdWVzdC5SZXNwb25zZU1lc3NhZ2VEYXRhPjtcblxuICByZXNwb25zZShtZXNzYWdlOiBSZXF1ZXN0LlJlc3BvbnNlTWVzc2FnZURhdGEgfCBQcm9taXNlPFJlcXVlc3QuUmVzcG9uc2VNZXNzYWdlRGF0YT4pIHtcbiAgICB0aGlzLnJlc3BvbnNlRGF0YSA9IChhc3luYyAoKSA9PiBhd2FpdCBtZXNzYWdlKSgpO1xuICB9XG59XG5cbmludGVyZmFjZSBFdmVudE1hcCB7XG4gICdyZXF1ZXN0ZWQnOiBSZXF1ZXN0ZWRFdmVudDtcbn1cblxuY29uc3QgREVGQVVMVF9DT05GSUc6IFJlcXVlc3QuTWFuYWdlckNvbmZpZyA9IHtcbiAgdGltZW91dDogMTAwMCxcbn07XG5cbmNsYXNzIFJlcXVlc3RNYW5hZ2VyIGV4dGVuZHMgRXZlbnRUYXJnZXQ8RXZlbnRNYXA+IHtcbiAgcHJpdmF0ZSBhZ2VudDogQWdlbnQ7XG4gIHByaXZhdGUgY29uZmlnOiBSZXF1ZXN0Lk1hbmFnZXJDb25maWc7XG4gIHByaXZhdGUgcmVxdWVzdHM6IFJlY29yZDxzdHJpbmcsIFJlcXVlc3Q+ID0ge307XG5cbiAgcHJpdmF0ZSByZXF1ZXN0SWRUb1Rocm91Z2hzOiBSZXF1ZXN0LlJlcXVlc3RJZFRvVGhyb3VnaHMgPSB7fTtcblxuICBjb25zdHJ1Y3RvcihhZ2VudDogQWdlbnQsIGNvbmZpZzogUGFydGlhbDxSZXF1ZXN0Lk1hbmFnZXJDb25maWc+ID0ge30pIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuYWdlbnQgPSBhZ2VudDtcbiAgICB0aGlzLmNvbmZpZyA9IHtcbiAgICAgIC4uLkRFRkFVTFRfQ09ORklHLFxuICAgICAgLi4uY29uZmlnLFxuICAgIH07XG4gIH1cblxuICBvblJlY2VpdmVOZXR3b3JrTWVzc2FnZShldmVudDogTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGV2ZW50LmRldGFpbCBhcyBSZXF1ZXN0Lk1lc3NhZ2U7XG4gICAgY29uc3QgeyByZXF1ZXN0SWQsIGRpcmVjdGlvbiB9ID0gbWVzc2FnZTtcbiAgICBpZiAocmVxdWVzdElkKSB7XG4gICAgICBzd2l0Y2ggKGRpcmVjdGlvbikge1xuICAgICAgICBjYXNlIFJlcXVlc3QuRGlyZWN0aW9uLlJlcXVlc3Q6XG4gICAgICAgICAgcmV0dXJuIHRoaXMub25SZWNlaXZlUmVxdWVzdE1lc3NhZ2UobWVzc2FnZSwgZXZlbnQpO1xuICAgICAgICBjYXNlIFJlcXVlc3QuRGlyZWN0aW9uLlJlc3BvbnNlOlxuICAgICAgICAgIHJldHVybiB0aGlzLm9uUmVjZWl2ZVJlc3BvbnNlTWVzc2FnZShtZXNzYWdlLCBldmVudCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSBvblJlY2VpdmVSZXF1ZXN0TWVzc2FnZShtZXNzYWdlOiBSZXF1ZXN0Lk1lc3NhZ2UsIGV2ZW50OiBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQpOiBib29sZWFuIHtcbiAgICBjb25zdCByZXF1ZXN0ZWRFdmVudCA9IG5ldyBSZXF1ZXN0ZWRFdmVudChldmVudC5tZXNzYWdlUmVjZWl2ZWRFdmVudCwgZXZlbnQuZXhhY3RGb3JNZSk7XG5cbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQocmVxdWVzdGVkRXZlbnQpO1xuXG4gICAgaWYgKHJlcXVlc3RlZEV2ZW50LnJlc3BvbnNlRGF0YSkge1xuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgcmVzcG9uc2VEYXRhID0gYXdhaXQgcmVxdWVzdGVkRXZlbnQucmVzcG9uc2VEYXRhO1xuICAgICAgICBjb25zdCByZXNwb25zZU1lc3NhZ2U6IFJlcXVlc3QuUmVxdWVzdE1lc3NhZ2VEYXRhID0ge1xuICAgICAgICAgIC4uLnJlc3BvbnNlRGF0YSxcbiAgICAgICAgICByZXF1ZXN0SWQ6IG1lc3NhZ2UucmVxdWVzdElkLFxuICAgICAgICAgIGRpcmVjdGlvbjogUmVxdWVzdC5EaXJlY3Rpb24uUmVzcG9uc2UsXG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5hZ2VudC5zZW5kKGV2ZW50LmRldGFpbC5zcmNQYXRoLCByZXNwb25zZU1lc3NhZ2UsIHJlc3BvbnNlRGF0YS5yZXNwb25zZVNwYWNlKTtcbiAgICAgIH0pKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIG9uUmVjZWl2ZVJlc3BvbnNlTWVzc2FnZShtZXNzYWdlOiBSZXF1ZXN0Lk1lc3NhZ2UsIF9ldmVudDogTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IHRoaXMucmVxdWVzdHNbbWVzc2FnZS5yZXF1ZXN0SWRdO1xuICAgIGlmIChyZXF1ZXN0KSB7XG4gICAgICByZXF1ZXN0LmNvbXBsZXRlKG1lc3NhZ2UpO1xuXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgYXN5bmMgcmVxdWVzdChkZXNQYXRoOiBzdHJpbmcsIG1lc3NhZ2VDb250ZW50OiBPcmlNZXNzYWdlRGF0YSk6IFByb21pc2U8UmVxdWVzdD4ge1xuICAgIGNvbnN0IHJlcXVlc3QgPSBuZXcgUmVxdWVzdChkZXNQYXRoLCBtZXNzYWdlQ29udGVudCk7XG4gICAgdGhpcy5yZXF1ZXN0c1tyZXF1ZXN0LnJlcXVlc3RJZF0gPSByZXF1ZXN0O1xuICAgIHRoaXMuYWdlbnQuc2VuZChkZXNQYXRoLCByZXF1ZXN0LnJlcXVlc3RNZXNzYWdlKTtcbiAgICByZXR1cm4gcmVxdWVzdC5zdGFydCh0aGlzLmNvbmZpZy50aW1lb3V0KTtcbiAgfVxuXG4gIGNhY2hlUmVjZWl2ZShmcm9tUGVlckFkZHI6IHN0cmluZywgc3JjQWRkcjogc3RyaW5nLCBtZXNzYWdlOiBPcmlNZXNzYWdlKTogdm9pZCB7XG4gICAgaWYgKGZyb21QZWVyQWRkciA9PT0gc3JjQWRkcikgcmV0dXJuO1xuICAgIGNvbnN0IHsgcmVxdWVzdElkLCBkaXJlY3Rpb24gfSA9IG1lc3NhZ2UgYXMgUmVxdWVzdC5NZXNzYWdlO1xuICAgIGlmICghcmVxdWVzdElkIHx8IGRpcmVjdGlvbiAhPT0gUmVxdWVzdC5EaXJlY3Rpb24uUmVxdWVzdCkgcmV0dXJuO1xuXG4gICAgbGV0IHRocm91Z2ggPSB0aGlzLnJlcXVlc3RJZFRvVGhyb3VnaHNbcmVxdWVzdElkXTtcbiAgICBpZiAoIXRocm91Z2gpIHtcbiAgICAgIHRoaXMucmVxdWVzdElkVG9UaHJvdWdoc1tyZXF1ZXN0SWRdID0gW21lc3NhZ2Uuc3JjUGF0aCwgZnJvbVBlZXJBZGRyXTtcbiAgICB9XG4gIH1cblxuICByb3V0ZShtZXNzYWdlOiBPcmlNZXNzYWdlKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgeyByZXF1ZXN0SWQsIGRpcmVjdGlvbiB9ID0gbWVzc2FnZSBhcyBSZXF1ZXN0Lk1lc3NhZ2U7XG5cbiAgICBpZiAocmVxdWVzdElkICYmIGRpcmVjdGlvbiA9PT0gUmVxdWVzdC5EaXJlY3Rpb24uUmVzcG9uc2UpIHtcbiAgICAgIGNvbnN0IHRocm91Z2ggPSB0aGlzLnJlcXVlc3RJZFRvVGhyb3VnaHNbcmVxdWVzdElkXTtcbiAgICAgIGlmICh0aHJvdWdoKSB7XG4gICAgICAgIGNvbnN0IFtkZXNQYXRoLCBwZWVyQWRkcl0gPSB0aHJvdWdoO1xuICAgICAgICBpZiAobWVzc2FnZS5kZXNQYXRoID09PSBkZXNQYXRoKSByZXR1cm4gcGVlckFkZHI7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IFJlcXVlc3RNYW5hZ2VyO1xuXG5jbGFzcyBSZXF1ZXN0IHtcbiAgZGVzUGF0aDogc3RyaW5nO1xuICByZXF1ZXN0SWQ6IHN0cmluZztcbiAgcmVxdWVzdE1lc3NhZ2U6IFJlcXVlc3QuUmVxdWVzdE1lc3NhZ2VEYXRhO1xuICByZXNwb25zZU1lc3NhZ2U6IFJlcXVlc3QuTWVzc2FnZTtcbiAgcHJpdmF0ZSByZXNvbHZlRm46IChyZXE6IFJlcXVlc3QpID0+IHZvaWQ7XG5cbiAgY29uc3RydWN0b3IoZGVzUGF0aDogc3RyaW5nLCBtZXNzYWdlQ29udGVudDogT3JpTWVzc2FnZURhdGEsIHJlcXVlc3RJZD86IHN0cmluZykge1xuICAgIHRoaXMuZGVzUGF0aCA9IGRlc1BhdGg7XG4gICAgdGhpcy5yZXF1ZXN0SWQgPSByZXF1ZXN0SWQgfHwgcmFuZG9tU3RyKCk7XG4gICAgdGhpcy5yZXF1ZXN0TWVzc2FnZSA9IHtcbiAgICAgIC4uLm1lc3NhZ2VDb250ZW50LFxuICAgICAgcmVxdWVzdElkOiB0aGlzLnJlcXVlc3RJZCxcbiAgICAgIGRpcmVjdGlvbjogUmVxdWVzdC5EaXJlY3Rpb24uUmVxdWVzdCxcbiAgICB9XG4gIH1cblxuICBzdGFydCh0aW1lb3V0OiBudW1iZXIpOiBQcm9taXNlPFJlcXVlc3Q+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8UmVxdWVzdD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgdGhpcy5yZXNvbHZlRm4gPSByZXNvbHZlO1xuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHJlamVjdChuZXcgRXJyb3IoYHJlcXVlc3QudHM6IHJlcXVlc3QgdGVybTogJyR7dGhpcy5yZXF1ZXN0TWVzc2FnZS50ZXJtfScgZnJvbSAnJHt0aGlzLmRlc1BhdGh9JyBoYXMgdGltZW91dGApKTtcbiAgICAgIH0sIHRpbWVvdXQpO1xuICAgIH0pO1xuICB9XG5cbiAgY29tcGxldGUobWVzc2FnZTogUmVxdWVzdC5NZXNzYWdlKSB7XG4gICAgdGhpcy5yZXNwb25zZU1lc3NhZ2UgPSBtZXNzYWdlO1xuICAgIHRoaXMucmVzb2x2ZUZuKHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCB7IFJlcXVlc3QgfTtcbiIsImltcG9ydCB7XG4gIGpvaW5QYXRoLCBleHRyYWN0QWRkckZyb21QYXRoLCBjYWxjQWRkck9yU3ViU3BhY2VIYXNoLFxuICBmb3JtYXRGaXJzdFVpbnQzMkhleCwgc2h1ZmZsZSxcbn0gZnJvbSAnLi9taXNjL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgUm91dGVyIHtcbiAgdHlwZSBSb3V0aW5nVGFibGVMaW5lID0gW2hhc2g6IFVpbnQzMkFycmF5LCBhZGRyOiBzdHJpbmddO1xuICB0eXBlIEtCdWNrZXRzID0gTWFwPG51bWJlciwgUm91dGluZ1RhYmxlTGluZVtdPjtcbiAgdHlwZSBzcGFjZVBhdGggPSBzdHJpbmc7XG4gIGludGVyZmFjZSBTcGFjZSB7XG4gICAgdGFibGU6IFJvdXRpbmdUYWJsZUxpbmVbXTtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgcGF0aDogc3RyaW5nO1xuICAgIHN1YlNwYWNlczogUmVjb3JkPHNwYWNlUGF0aCwgU3BhY2U+O1xuICB9XG4gIGludGVyZmFjZSBGaW5kQWRkckluZGV4UmVzdWx0IHtcbiAgICBleGFjdD86IG51bWJlcjtcbiAgICBsZWZ0PzogbnVtYmVyO1xuICB9XG4gIGludGVyZmFjZSBSb3V0ZVJlc3VsdCB7XG4gICAgYWRkcnM6IHN0cmluZ1tdO1xuICAgIG5vUGVlcnM/OiBib29sZWFuO1xuICAgIGludmFsaWQ/OiBib29sZWFuO1xuICAgIGJyb2FkY2FzdD86IGJvb2xlYW47XG4gICAgbWlnaHRCZUZvck1lPzogYm9vbGVhbjtcbiAgICBub3RNYWtpbmdQcm9ncmVzc0Zyb21CYXNlPzogYm9vbGVhbjtcbiAgfVxufVxuXG5jbGFzcyBSb3V0ZXIge1xuICBwcml2YXRlIG15QWRkcjogc3RyaW5nO1xuICBwcml2YXRlIG15SGFzaDogVWludDMyQXJyYXk7XG4gIHByaXZhdGUgcm9vdFNwYWNlOiBSb3V0ZXIuU3BhY2U7XG4gIFxuICBhc3luYyBzdGFydChteUFkZHI6IHN0cmluZykge1xuICAgIHRoaXMubXlBZGRyID0gbXlBZGRyO1xuICAgIHRoaXMubXlIYXNoID0gYXdhaXQgY2FsY0FkZHJPclN1YlNwYWNlSGFzaCh0aGlzLm15QWRkcik7XG4gICAgdGhpcy5yb290U3BhY2UgPSB7XG4gICAgICB0YWJsZTogW10sXG4gICAgICBuYW1lOiAnJyxcbiAgICAgIHBhdGg6ICcnLFxuICAgICAgc3ViU3BhY2VzOiB7fSxcbiAgICB9O1xuICB9XG5cbiAgaW5pdFNwYWNlKHNwYWNlUGF0aDogc3RyaW5nKTogUm91dGVyLlNwYWNlIHtcbiAgICBjb25zdCBwYXRoU2VncyA9IHNwYWNlUGF0aC5zcGxpdCgnPicpO1xuICAgIGNvbnN0IG1rU3BhY2VQID0gKGxldmVsOiBudW1iZXIsIGN1cnJlbnRTcGFjZTogUm91dGVyLlNwYWNlKTogUm91dGVyLlNwYWNlID0+IHtcbiAgICAgIGNvbnN0IGN1cnJlbnRTcGFjZU5hbWUgPSBwYXRoU2Vnc1tsZXZlbF07XG4gICAgICBpZiAoIWN1cnJlbnRTcGFjZU5hbWUpIHJldHVybiBjdXJyZW50U3BhY2U7XG5cbiAgICAgIGxldCBzdWJTcGFjZSA9IGN1cnJlbnRTcGFjZS5zdWJTcGFjZXNbY3VycmVudFNwYWNlTmFtZV07XG4gICAgICBpZiAoIXN1YlNwYWNlKSB7XG4gICAgICAgIHN1YlNwYWNlID0ge1xuICAgICAgICAgIHRhYmxlOiBbXSxcbiAgICAgICAgICBuYW1lOiBwYXRoU2Vnc1tsZXZlbF0sXG4gICAgICAgICAgcGF0aDogam9pblBhdGgocGF0aFNlZ3Muc2xpY2UoMCwgbGV2ZWwgKyAxKSksXG4gICAgICAgICAgc3ViU3BhY2VzOiB7fSxcbiAgICAgICAgfTtcbiAgICAgICAgY3VycmVudFNwYWNlLnN1YlNwYWNlc1tjdXJyZW50U3BhY2VOYW1lXSA9IHN1YlNwYWNlO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbWtTcGFjZVAobGV2ZWwgKyAxLCBzdWJTcGFjZSk7XG4gICAgfTtcblxuICAgIHJldHVybiBta1NwYWNlUCgwLCB0aGlzLnJvb3RTcGFjZSk7XG4gIH1cblxuICBhc3luYyBhZGRQYXRoKHBhdGg6IHN0cmluZykge1xuICAgIGNvbnN0IGFkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHBhdGgpO1xuICAgIGxldCBbc3BhY2UsIHRhcmdldCwgdXBwZXJTcGFjZXNdID0gdGhpcy5nZXRTcGFjZUFuZEFkZHIocGF0aCwgZmFsc2UpO1xuXG4gICAgaWYgKCFzcGFjZSkge1xuICAgICAgc3BhY2UgPSB1cHBlclNwYWNlcy5wb3AoKTtcbiAgICB9XG4gICAgY29uc3QgaGFzaCA9IGF3YWl0IGNhbGNBZGRyT3JTdWJTcGFjZUhhc2godGFyZ2V0KTtcbiAgICBhZGRMaW5lKHNwYWNlLnRhYmxlLCBbaGFzaCwgYWRkcl0pO1xuXG4gICAgY29uc3QgYWRkckhhc2ggPSBhd2FpdCBjYWxjQWRkck9yU3ViU3BhY2VIYXNoKGFkZHIpO1xuICAgIHdoaWxlICh1cHBlclNwYWNlcy5sZW5ndGggPiAwKSB7XG4gICAgICBzcGFjZSA9IHVwcGVyU3BhY2VzLnBvcCgpO1xuICAgICAgYWRkTGluZShzcGFjZS50YWJsZSwgW2FkZHJIYXNoLCBhZGRyXSk7XG4gICAgfVxuICB9XG5cbiAgcm1BZGRyKGFkZHI6IHN0cmluZykge1xuICAgIGNvbnN0IHJtQWRkclIgPSAoY3VycmVudFNwYWNlOiBSb3V0ZXIuU3BhY2UpID0+IHtcbiAgICAgIGNvbnN0IGluZGV4ID0gY3VycmVudFNwYWNlLnRhYmxlLmZpbmRJbmRleCgoW18sIGxpbmVBZGRyXSkgPT4gbGluZUFkZHIgPT09IGFkZHIpO1xuICAgICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICBjdXJyZW50U3BhY2UudGFibGUuc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgIH1cbiAgICAgIE9iamVjdC5lbnRyaWVzKGN1cnJlbnRTcGFjZS5zdWJTcGFjZXMpLmZvckVhY2goKFtfLCBzcGFjZV0pID0+IHtcbiAgICAgICAgcm1BZGRyUihzcGFjZSk7XG4gICAgICB9KTtcbiAgICB9O1xuICAgIHJtQWRkclIodGhpcy5yb290U3BhY2UpO1xuICB9XG5cbiAgZ2V0U3BhY2VBbmRBZGRyKHBhdGg6IHN0cmluZyA9ICcnLCBleGFjdCA9IHRydWUpOiBbUm91dGVyLlNwYWNlLCBzdHJpbmcsIFJvdXRlci5TcGFjZVtdXSB7XG4gICAgY29uc3QgcGF0aFNlZ3MgPSBwYXRoLnNwbGl0KCc+Jyk7XG4gICAgbGV0IGN1cnJlbnRTcGFjZSA9IHRoaXMucm9vdFNwYWNlO1xuICAgIGNvbnN0IHVwcGVyU3BhY2VzOiBSb3V0ZXIuU3BhY2VbXSA9IFtdO1xuICAgIHdoaWxlIChwYXRoU2Vncy5sZW5ndGggPiAxKSB7XG4gICAgICBpZiAocGF0aFNlZ3NbMF0pIHtcbiAgICAgICAgdXBwZXJTcGFjZXMucHVzaChjdXJyZW50U3BhY2UpO1xuICAgICAgICBjdXJyZW50U3BhY2UgPSBjdXJyZW50U3BhY2Uuc3ViU3BhY2VzW3BhdGhTZWdzWzBdXTtcbiAgICAgICAgaWYgKCFjdXJyZW50U3BhY2UpIHtcbiAgICAgICAgICBpZiAoZXhhY3QpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgcm91dGVyLnRzOiBnZXRTcGFjZUFuZEFkZHI6IHNwYWNlICR7am9pblBhdGgocGF0aFNlZ3Muc2xpY2UoMCwgLTEpKX0gbm90IGV4aXN0c2ApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gW251bGwsIHBhdGhTZWdzWzBdLCB1cHBlclNwYWNlc107XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBwYXRoU2Vncy5zaGlmdCgpO1xuICAgIH1cbiAgICByZXR1cm4gW2N1cnJlbnRTcGFjZSwgcGF0aFNlZ3NbMF0sIHVwcGVyU3BhY2VzXTtcbiAgfVxuXG4gIGdldFNwYWNlKHNwYWNlUGF0aDogc3RyaW5nLCBleGFjdCA9IHRydWUpOiBSb3V0ZXIuU3BhY2Uge1xuICAgIGNvbnN0IHBhdGhTZWdzID0gc3BhY2VQYXRoLnNwbGl0KCc+Jyk7XG4gICAgbGV0IGN1cnJlbnRTcGFjZSA9IHRoaXMucm9vdFNwYWNlO1xuICAgIHdoaWxlIChwYXRoU2Vncy5sZW5ndGggPiAwKSB7XG4gICAgICBpZiAocGF0aFNlZ3NbMF0pIHtcbiAgICAgICAgY3VycmVudFNwYWNlID0gY3VycmVudFNwYWNlLnN1YlNwYWNlc1twYXRoU2Vnc1swXV07XG4gICAgICAgIGlmICghY3VycmVudFNwYWNlICYmIGV4YWN0KSB0aHJvdyBuZXcgRXJyb3IoYHJvdXRlci50czogZ2V0U3BhY2U6IHNwYWNlICR7c3BhY2VQYXRofSBub3QgZXhpc3RzYCk7XG4gICAgICB9XG4gICAgICBwYXRoU2Vncy5zaGlmdCgpO1xuICAgIH1cbiAgICByZXR1cm4gY3VycmVudFNwYWNlO1xuICB9XG5cbiAgZ2V0TGluZShzcGFjZVBhdGg6IHN0cmluZywgYWRkcjogc3RyaW5nKTogUm91dGVyLlJvdXRpbmdUYWJsZUxpbmUge1xuICAgIGNvbnN0IHNwYWNlID0gdGhpcy5nZXRTcGFjZShzcGFjZVBhdGgpO1xuICAgIHJldHVybiBzcGFjZS50YWJsZS5maW5kKGxpbmUgPT4gbGluZVsxXSA9PT0gYWRkcik7XG4gIH1cblxuICBwcmludGFibGVUYWJsZShwYXRoV2l0aEFkZHI6IHN0cmluZykge1xuICAgIGNvbnN0IFtzcGFjZV0gPSB0aGlzLmdldFNwYWNlQW5kQWRkcihwYXRoV2l0aEFkZHIsIGZhbHNlKTtcbiAgICBpZiAoc3BhY2UpXG4gICAgICByZXR1cm4gdGhpcy5nZXRTcGFjZUFuZEFkZHIocGF0aFdpdGhBZGRyLCB0cnVlKVswXS50YWJsZS5tYXAoXG4gICAgICAgIChbaGFzaCwgYWRkcl0pID0+IGAke2Zvcm1hdEZpcnN0VWludDMySGV4KGhhc2gpfSA6ICR7YWRkcn1gXG4gICAgICApLmpvaW4oJ1xcbicpICsgJ1xcbidcbiAgICBlbHNlIHJldHVybiAnICgoIHNwYWNlIG5vdCBleGlzdHMgKSkgJztcbiAgfVxuXG4gIGFzeW5jIHJvdXRlKGRlc1BhdGg6IHN0cmluZywgYmFzZUFkZHI/OiBzdHJpbmcpOiBQcm9taXNlPFJvdXRlci5Sb3V0ZVJlc3VsdD4ge1xuICAgIGxldCBbc3BhY2UsIHRhcmdldCwgdXBwZXJTcGFjZXNdID0gdGhpcy5nZXRTcGFjZUFuZEFkZHIoZGVzUGF0aCwgZmFsc2UpO1xuXG4gICAgaWYgKCFzcGFjZSkge1xuICAgICAgc3BhY2UgPSB1cHBlclNwYWNlcy5wb3AoKTtcbiAgICB9XG4gICAgd2hpbGUgKHNwYWNlLnRhYmxlLmxlbmd0aCA9PT0gMCAmJiB1cHBlclNwYWNlcy5sZW5ndGggPiAwKSB7XG4gICAgICB0YXJnZXQgPSBzcGFjZS5uYW1lO1xuICAgICAgc3BhY2UgPSB1cHBlclNwYWNlcy5wb3AoKTtcbiAgICB9XG5cbiAgICBpZiAoIXRhcmdldCkge1xuICAgICAgY29uc29sZS53YXJuKGBkZXNQYXRoOiAnJHtkZXNQYXRofScgZG9lcyBub3QgaGF2ZSBhIHZhbGlkIHRhcmdldGApO1xuICAgICAgcmV0dXJuIHsgaW52YWxpZDogdHJ1ZSwgYWRkcnM6IFtdIH1cbiAgICB9XG4gICAgaWYgKHRhcmdldCA9PT0gJyonICYmIHNwYWNlLnBhdGggIT09ICcnKSB7IC8vIGJyb2FkY2FzdFxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYnJvYWRjYXN0OiB0cnVlLFxuICAgICAgICBhZGRyczogc3BhY2UudGFibGUubWFwKGxpbmUgPT4gbGluZVsxXSkuZmlsdGVyKGFkZHIgPT4gYWRkciAhPT0gYmFzZUFkZHIpLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKHNwYWNlLnRhYmxlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgYWRkcnM6IFtdLFxuICAgICAgICBub1BlZXJzOiB0cnVlLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjb25zdCB0YXJnZXRIYXNoID0gYXdhaXQgY2FsY0FkZHJPclN1YlNwYWNlSGFzaCh0YXJnZXQpO1xuICAgIGxldCBuZXh0QWRkcjogc3RyaW5nXG4gICAgbGV0IG1pblhvciA9IChuZXcgVWludDMyQXJyYXkoMTYpKS5maWxsKDB4RkZGRkZGRkYpO1xuXG4gICAgc3BhY2UudGFibGUuZm9yRWFjaCgoW2hhc2gsIGFkZHJdKSA9PiB7XG4gICAgICBpZiAoYWRkciA9PT0gYmFzZUFkZHIpIHJldHVybjtcbiAgICAgIGNvbnN0IHhvciA9IHhvclVpbnQzMkFycmF5KGhhc2gsIHRhcmdldEhhc2gpO1xuICAgICAgaWYgKGNvbXBhcmVVaW50MzJBcnJheSh4b3IsIG1pblhvcikgPT09IC0xKSB7XG4gICAgICAgIG1pblhvciA9IHhvcjtcbiAgICAgICAgbmV4dEFkZHIgPSBhZGRyO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbnN0IG15U2VsZlhvciA9IHhvclVpbnQzMkFycmF5KHRoaXMubXlIYXNoLCB0YXJnZXRIYXNoKTtcblxuICAgIGxldCBub3RNYWtpbmdQcm9ncmVzc0Zyb21CYXNlOiBib29sZWFuO1xuICAgIGlmIChiYXNlQWRkcikge1xuICAgICAgY29uc3QgYmFzZUhhc2ggPSBhd2FpdCBjYWxjQWRkck9yU3ViU3BhY2VIYXNoKGJhc2VBZGRyKTtcbiAgICAgIG5vdE1ha2luZ1Byb2dyZXNzRnJvbUJhc2UgPSBjb21wYXJlVWludDMyQXJyYXkoXG4gICAgICAgIHhvclVpbnQzMkFycmF5KGJhc2VIYXNoLCB0YXJnZXRIYXNoKSwgbWluWG9yLFxuICAgICAgKSA8PSAwXG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0ge1xuICAgICAgYWRkcnM6IG5leHRBZGRyID8gW25leHRBZGRyXSA6IFtdLFxuICAgICAgbm90TWFraW5nUHJvZ3Jlc3NGcm9tQmFzZSxcbiAgICAgIG1pZ2h0QmVGb3JNZTogY29tcGFyZVVpbnQzMkFycmF5KFxuICAgICAgICBteVNlbGZYb3IsIG1pblhvclxuICAgICAgKSA8PSAwXG4gICAgfTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgYnVpbGRTcGFjZUtCdWNrZXRzKHNwYWNlUGF0aDogc3RyaW5nKTogUm91dGVyLktCdWNrZXRzIHtcbiAgICByZXR1cm4gdGhpcy5idWlsZEtCdWNrZXRzKHRoaXMuZ2V0U3BhY2Uoc3BhY2VQYXRoKS50YWJsZSk7XG4gIH1cblxuICBidWlsZEtCdWNrZXRzKGxpbmVzOiBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdKTogUm91dGVyLktCdWNrZXRzIHtcbiAgICBjb25zdCBrQnVja2V0czogUm91dGVyLktCdWNrZXRzID0gbmV3IE1hcCgpO1xuICAgIGxpbmVzLmZvckVhY2goYWRkckFuZEhhc2ggPT4ge1xuICAgICAgY29uc3QgayA9IHNhbWVCaXRzVWludDMyQXJyYXkodGhpcy5teUhhc2gsIGFkZHJBbmRIYXNoWzBdKTtcbiAgICAgIGxldCBidWNrZXQ6IFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lW10gPSBrQnVja2V0cy5nZXQoayk7XG4gICAgICBpZiAoYnVja2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYnVja2V0ID0gW107XG4gICAgICAgIGtCdWNrZXRzLnNldChrLCBidWNrZXQpO1xuICAgICAgfVxuXG4gICAgICBjb25zdCB7IGV4YWN0LCBsZWZ0IH0gPSBmaW5kSGFzaEluZGV4KGJ1Y2tldCwgYWRkckFuZEhhc2hbMF0pO1xuICAgICAgaWYgKGV4YWN0ICE9PSB1bmRlZmluZWQpIHJldHVybjtcbiAgICAgIGJ1Y2tldC5zcGxpY2UobGVmdCwgMCwgYWRkckFuZEhhc2gpO1xuICAgIH0pO1xuICAgIHJldHVybiBrQnVja2V0cztcbiAgfVxuXG4gIGRiZ015SGFzaCgpIHtcbiAgICBkYmdMaW5lcygnbWUnLCBbW3RoaXMubXlIYXNoLCB0aGlzLm15QWRkcl1dKTtcbiAgfVxuICBcbiAgcmVtb3ZlTGluZXMoa0J1Y2tldHM6IFJvdXRlci5LQnVja2V0cywgbGluZXM6IFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lW10pOiB2b2lkIHtcbiAgICBbLi4ubGluZXMsIFt0aGlzLm15SGFzaCwgdGhpcy5teUFkZHJdIGFzIFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lXS5mb3JFYWNoKChbaGFzaCwgX2FkZHJdKSA9PiB7XG4gICAgICBjb25zdCBrID0gc2FtZUJpdHNVaW50MzJBcnJheSh0aGlzLm15SGFzaCwgaGFzaCk7XG4gICAgICBjb25zdCBidWNrZXQgPSBrQnVja2V0cy5nZXQoayk7XG4gICAgICBpZiAoYnVja2V0KSB7XG4gICAgICAgIGNvbnN0IHsgZXhhY3QgfSA9IGZpbmRIYXNoSW5kZXgoYnVja2V0LCBoYXNoKTtcbiAgICAgICAgaWYgKHR5cGVvZiBleGFjdCA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgICBidWNrZXQuc3BsaWNlKGV4YWN0LCAxKTtcbiAgICAgICAgICBpZiAoYnVja2V0Lmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAga0J1Y2tldHMuZGVsZXRlKGspO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcGlja0FkZHJzVG9Db25uZWN0KGtCdWNrZXRzOiBSb3V0ZXIuS0J1Y2tldHMsIGV4aXN0aW5nS0J1Y2tldHM6IFJvdXRlci5LQnVja2V0cyk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBhZGRyczogc3RyaW5nW10gPSBbXTtcbiAgICBrQnVja2V0cy5mb3JFYWNoKChsaW5lcywgaykgPT4ge1xuICAgICAgY29uc3QgYWxsb3dlZE5ld0xpbmVzID0gayA8IDMgPyAzIC0gayA6IDE7XG4gICAgICBjb25zdCBleGlzdGluZ0xpbmVzID0gZXhpc3RpbmdLQnVja2V0cy5nZXQoaykgfHwgW107XG4gICAgICBjb25zdCBsaW5lc1RvUGljayA9IE1hdGgubWluKGFsbG93ZWROZXdMaW5lcyAtIGV4aXN0aW5nTGluZXMubGVuZ3RoLCBsaW5lcy5sZW5ndGgpO1xuICAgICAgaWYgKGxpbmVzVG9QaWNrID4gMCkge1xuICAgICAgICBhZGRycy5wdXNoKFxuICAgICAgICAgIC4uLnNodWZmbGUobGluZXMpLnNsaWNlKDAsIGxpbmVzVG9QaWNrKS5tYXAobGluZSA9PiBsaW5lWzFdKVxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIGFkZHJzO1xuICB9XG59XG5cbmZ1bmN0aW9uIHhvclVpbnQzMkFycmF5KGhhc2gxOiBVaW50MzJBcnJheSwgaGFzaDI6IFVpbnQzMkFycmF5KTogVWludDMyQXJyYXkge1xuICByZXR1cm4gaGFzaDEubWFwKCh2LCBpKSA9PiB2IF4gaGFzaDJbaV0pXG59XG5cbmZ1bmN0aW9uIGNvbXBhcmVVaW50MzJBcnJheShhcnIxOiBVaW50MzJBcnJheSwgYXJyMjogVWludDMyQXJyYXkpOiBudW1iZXIge1xuICAvLyBhc3N1bWUgYXJyMSBoYXMgc2FtZSBsZW5ndGggYXMgYXJyMlxuICBmb3IobGV0IGkgPSAwOyBpIDwgYXJyMS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChhcnIxW2ldIDwgYXJyMltpXSkgcmV0dXJuIC0xO1xuICAgIGlmIChhcnIxW2ldID4gYXJyMltpXSkgcmV0dXJuIDE7XG4gIH1cbiAgcmV0dXJuIDA7XG59XG5cbmZ1bmN0aW9uIHNhbWVCaXRzVWludDMyQXJyYXkoYXJyMTogVWludDMyQXJyYXksIGFycjI6IFVpbnQzMkFycmF5KTogbnVtYmVyIHtcbiAgY29uc3QgeG9yID0geG9yVWludDMyQXJyYXkoYXJyMSwgYXJyMik7XG4gIGxldCBzYW1lQml0cyA9IDA7XG4gIGZvcihsZXQgaSA9IDA7IGkgPCB4b3IubGVuZ3RoOyBpKyspIHtcbiAgICBmb3IgKGxldCBqID0gMDsgaiA8IDMyOyBqKyspIHtcbiAgICAgIGlmICgoMHg4MDAwMDAwMCAmIHhvcltpXSkgIT09IDApIHJldHVybiBzYW1lQml0cztcbiAgICAgIHNhbWVCaXRzKys7XG4gICAgICB4b3JbaV0gPSB4b3JbaV0gPDwgMTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHNhbWVCaXRzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaGFzaExpbmUoYWRkcnM6IHN0cmluZ1tdKTogUHJvbWlzZTxSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdPiB7XG4gIHJldHVybiBQcm9taXNlLmFsbChcbiAgICBhZGRycy5tYXAoYXN5bmMgKGFkZHIpOiBQcm9taXNlPFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lPiA9PiAoW1xuICAgICAgYXdhaXQgY2FsY0FkZHJPclN1YlNwYWNlSGFzaChhZGRyKSwgYWRkclxuICAgIF0pKVxuICApO1xufVxuXG5mdW5jdGlvbiBmaW5kSGFzaEluZGV4KGxpbmVzOiBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdLCBoYXNoOiBVaW50MzJBcnJheSk6IFJvdXRlci5GaW5kQWRkckluZGV4UmVzdWx0IHtcbiAgbGV0IGxlZnQgPSAwLCByaWdodCA9IGxpbmVzLmxlbmd0aDtcbiAgd2hpbGUgKGxlZnQgIT09IHJpZ2h0KSB7XG4gICAgY29uc3QgbWlkZGxlID0gTWF0aC5mbG9vcigobGVmdCArIHJpZ2h0KSAvIDIpO1xuICAgIGNvbnN0IGNvbXBhcmVkID0gY29tcGFyZVVpbnQzMkFycmF5KGhhc2gsIGxpbmVzW21pZGRsZV1bMF0pO1xuICAgIGlmIChjb21wYXJlZCA9PT0gLTEpIHsgcmlnaHQgPSBtaWRkbGU7IH1cbiAgICBlbHNlIGlmIChjb21wYXJlZCA9PT0gMSkgeyBsZWZ0ID0gbWlkZGxlICsgMTsgfVxuICAgIGVsc2UgeyAvLyBjb21wYXJlZCA9PT0gMFxuICAgICAgcmV0dXJuIHsgZXhhY3Q6IG1pZGRsZSB9O1xuICAgIH1cbiAgfVxuICByZXR1cm4geyBsZWZ0IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZUtCdWNrZXRzKC4uLmtCdWNrZXRzQXJyOiBSb3V0ZXIuS0J1Y2tldHNbXSk6IFJvdXRlci5LQnVja2V0cyB7XG4gIGNvbnN0IG5ld0tCdWNrZXRzOiBSb3V0ZXIuS0J1Y2tldHMgPSBuZXcgTWFwKCk7XG4gIGtCdWNrZXRzQXJyLmZvckVhY2goa0J1Y2tldHMgPT4ge1xuICAgIGtCdWNrZXRzLmZvckVhY2goKGxpbmVzLCBrKSA9PiB7XG4gICAgICBsZXQgYnVja2V0OiBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdID0gbmV3S0J1Y2tldHMuZ2V0KGspO1xuICAgICAgaWYgKGJ1Y2tldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJ1Y2tldCA9IFtdO1xuICAgICAgICBuZXdLQnVja2V0cy5zZXQoaywgYnVja2V0KTtcbiAgICAgIH1cblxuICAgICAgbGluZXMuZm9yRWFjaChsaW5lID0+IHtcbiAgICAgICAgYWRkTGluZShidWNrZXQsIGxpbmUpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHJldHVybiBuZXdLQnVja2V0cztcbn1cblxuZnVuY3Rpb24gYWRkTGluZShsaW5lczogUm91dGVyLlJvdXRpbmdUYWJsZUxpbmVbXSwgbGluZTogUm91dGVyLlJvdXRpbmdUYWJsZUxpbmUpOiB2b2lkIHtcbiAgY29uc3QgeyBleGFjdCwgbGVmdCB9ID0gZmluZEhhc2hJbmRleChsaW5lcywgbGluZVswXSk7XG4gIGlmIChleGFjdCAhPT0gdW5kZWZpbmVkKSByZXR1cm47XG4gIGxpbmVzLnNwbGljZShsZWZ0LCAwLCBsaW5lKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRiZ0xpbmVzKG5hbWU6IHN0cmluZywgbGluZXM6IFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lW10pIHtcbiAgY29uc29sZS5ncm91cChuYW1lKTtcbiAgY29uc29sZS5sb2coXG4gICAgbGluZXMubWFwKChbaGFzaCwgYWRkcl0pID0+IGAke2Zvcm1hdEZpcnN0VWludDMySGV4KGhhc2gpfSA6OiAke2FkZHJ9YCkuam9pbignXFxuJylcbiAgKTtcbiAgY29uc29sZS5ncm91cEVuZCgpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGJnS0J1Y2tldHMobmFtZTogc3RyaW5nLCBrQnVja2V0czogUm91dGVyLktCdWNrZXRzKTogdm9pZCB7XG4gIGNvbnNvbGUuZ3JvdXAobmFtZSk7XG4gIGtCdWNrZXRzLmZvckVhY2goKGxpbmVzLCBrKSA9PiB7XG4gICAgZGJnTGluZXMoay50b1N0cmluZygpLCBsaW5lcyk7XG4gIH0pXG4gIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUm91dGVyO1xuIiwiaW1wb3J0IEFnZW50IGZyb20gJy4vYWdlbnQnO1xuaW1wb3J0IEV2ZW50VGFyZ2V0LCB7IEN1c3RvbUV2ZW50IH0gZnJvbSAnLi9taXNjL2V2ZW50LXRhcmdldCdcbmltcG9ydCBDb25uLCB7IE1lc3NhZ2VSZWNlaXZlZEV2ZW50IH0gZnJvbSAnLi9jb25uL2Jhc2UnO1xuaW1wb3J0IHsgUGVlcklkZW50aXR5IH0gZnJvbSAnLi9taXNjL2lkZW50aXR5JztcbmltcG9ydCB7IE1lc3NhZ2UgYXMgT3JpTWVzc2FnZSB9IGZyb20gJy4vbWVzc2FnZS9tZXNzYWdlJztcbmltcG9ydCB7IGV4dHJhY3RBZGRyRnJvbVBhdGggfSBmcm9tICcuL21pc2MvdXRpbHMnO1xuXG5kZWNsYXJlIG5hbWVzcGFjZSBUdW5uZWwge1xuICB0eXBlIE1lc3NhZ2VEYXRhID0gT21pdDxPcmlNZXNzYWdlLCAnc3JjUGF0aCcgfCAnZGVzUGF0aCc+ICYgeyBbXzogc3RyaW5nXTogYW55IH1cbiAgZXhwb3J0IGNvbnN0IGVudW0gRGlyZWN0aW9uIHsgQSA9ICdBJywgQiA9ICdCJyB9XG4gIGludGVyZmFjZSBNZXNzYWdlIGV4dGVuZHMgT3JpTWVzc2FnZSB7XG4gICAgdHVubmVsQ29ubklkOiBzdHJpbmc7XG4gICAgZGlyZWN0aW9uOiBEaXJlY3Rpb247XG4gIH1cblxuICBpbnRlcmZhY2UgU3RhcnRMaW5rT3B0cyB7XG4gICAgcGVlclBhdGg6IHN0cmluZztcbiAgICBteVBhdGg6IHN0cmluZztcbiAgICBzZW5kOiAobWVzc2FnZTogVHVubmVsLk1lc3NhZ2UpID0+IHZvaWQ7XG4gICAgY2xvc2U6ICgpID0+IHZvaWQ7XG4gIH1cblxuICB0eXBlIHR1bm5lbENvbm5JZCA9IHN0cmluZztcbiAgdHlwZSBDb25uSWRUb1Rocm91Z2hzID0gUmVjb3JkPHR1bm5lbENvbm5JZCwgUmVjb3JkPHN0cmluZywgW3BhdGg6IHN0cmluZywgcGVlckFkZHI6IHN0cmluZ10+Pjtcbn1cblxuaW50ZXJmYWNlIE5ld1R1bm5lbEV2ZW50RGV0YWlsIHtcbiAgdHVubmVsOiBUdW5uZWxDb25uO1xufVxuY2xhc3MgTmV3VHVubmVsRXZlbnQgZXh0ZW5kcyBDdXN0b21FdmVudDxOZXdUdW5uZWxFdmVudERldGFpbD4ge1xuICB0eXBlID0gJ25ldy10dW5uZWwnXG59XG5cbmludGVyZmFjZSBFdmVudE1hcCB7XG4gICduZXctdHVubmVsJzogTmV3VHVubmVsRXZlbnQ7XG59XG5cbmNsYXNzIFR1bm5lbE1hbmFnZXIgZXh0ZW5kcyBFdmVudFRhcmdldDxFdmVudE1hcD4ge1xuICBwcml2YXRlIGFnZW50OiBBZ2VudDtcbiAgcHJpdmF0ZSB0dW5uZWxzOiBSZWNvcmQ8c3RyaW5nLCBUdW5uZWxDb25uPiA9IHt9O1xuXG4gIHByaXZhdGUgY29ubklkVG9UaHJvdWdoczogVHVubmVsLkNvbm5JZFRvVGhyb3VnaHMgPSB7fTtcblxuICBjb25zdHJ1Y3RvcihhZ2VudDogQWdlbnQpIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuYWdlbnQgPSBhZ2VudDtcbiAgfVxuXG4gIG9uUmVjZWl2ZU1lc3NhZ2UoZXZlbnQ6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgeyB0dW5uZWxDb25uSWQgfSA9IGV2ZW50LmRldGFpbCBhcyBUdW5uZWwuTWVzc2FnZTtcbiAgICBpZiAodHVubmVsQ29ubklkKSB7XG4gICAgICAoYXN5bmMgKCkgPT4ge1xuICAgICAgICBjb25zdCB0dW5uZWwgPSB0aGlzLnR1bm5lbHNbdHVubmVsQ29ubklkXTtcbiAgICAgICAgaWYgKHR1bm5lbCkge1xuICAgICAgICAgIHR1bm5lbC5vblJlY2VpdmUoZXZlbnQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnN0IG5ld1R1bm5lbCA9IG5ldyBUdW5uZWxDb25uKHR1bm5lbENvbm5JZCk7XG5cbiAgICAgICAgICBjb25zdCBuZXdUdW5uZWxFdmVudCA9IG5ldyBOZXdUdW5uZWxFdmVudCh7IHR1bm5lbDogbmV3VHVubmVsIH0pO1xuICAgICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXdUdW5uZWxFdmVudCk7XG5cbiAgICAgICAgICBpZiAoIW5ld1R1bm5lbEV2ZW50LmRlZmF1bHRQcmV2ZW50ZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IHsgc3JjUGF0aDogcGVlclBhdGggfSA9IGV2ZW50LmRldGFpbDtcbiAgICAgICAgICAgIHRoaXMudHVubmVsc1tuZXdUdW5uZWwuY29ubklkXSA9IG5ld1R1bm5lbDtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc3RhcnRUdW5uZWwocGVlclBhdGgsIG5ld1R1bm5lbCk7XG4gICAgICAgICAgICBuZXdUdW5uZWwub25SZWNlaXZlKGV2ZW50KTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pKCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBjcmVhdGUocGVlclBhdGg6IHN0cmluZywgdHVubmVsQ29ubklkPzogc3RyaW5nKTogUHJvbWlzZTxUdW5uZWxDb25uPiB7XG4gICAgY29uc3QgdHVubmVsID0gbmV3IFR1bm5lbENvbm4odHVubmVsQ29ubklkKTtcbiAgICB0aGlzLnR1bm5lbHNbdHVubmVsLmNvbm5JZF0gPSB0dW5uZWw7XG4gICAgYXdhaXQgdGhpcy5zdGFydFR1bm5lbChwZWVyUGF0aCwgdHVubmVsKTtcblxuICAgIHJldHVybiB0dW5uZWw7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHN0YXJ0VHVubmVsKHBlZXJQYXRoOiBzdHJpbmcsIHR1bm5lbDogVHVubmVsQ29ubik6IFByb21pc2U8VHVubmVsQ29ubj4ge1xuICAgIGF3YWl0IHR1bm5lbC5zdGFydExpbmsoe1xuICAgICAgbXlQYXRoOiB0aGlzLmFnZW50Lm15SWRlbnRpdHkuYWRkciwgLy8gVE9ETzogc3Vic3BhY2VcbiAgICAgIHBlZXJQYXRoLFxuICAgICAgc2VuZDogKG1lc3NhZ2U6IFR1bm5lbC5NZXNzYWdlKSA9PiB7XG4gICAgICAgIHRoaXMuYWdlbnQucm91dGUobWVzc2FnZSk7XG4gICAgICB9LFxuICAgICAgY2xvc2U6ICgpID0+IHtcbiAgICAgICAgZGVsZXRlIHRoaXMudHVubmVsc1t0dW5uZWwuY29ubklkXTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICByZXR1cm4gdHVubmVsO1xuICB9XG5cbiAgY2FjaGVSZWNlaXZlKGZyb21QZWVyQWRkcjogc3RyaW5nLCBzcmNBZGRyOiBzdHJpbmcsIG1lc3NhZ2U6IE9yaU1lc3NhZ2UpOiB2b2lkIHtcbiAgICBpZiAoZnJvbVBlZXJBZGRyID09PSBzcmNBZGRyKSByZXR1cm47XG4gICAgY29uc3QgeyB0dW5uZWxDb25uSWQsIGRpcmVjdGlvbiB9ID0gbWVzc2FnZSBhcyBUdW5uZWwuTWVzc2FnZTtcbiAgICBpZiAoIXR1bm5lbENvbm5JZCkgcmV0dXJuO1xuXG4gICAgc3dpdGNoIChkaXJlY3Rpb24pIHtcbiAgICAgIGNhc2UgVHVubmVsLkRpcmVjdGlvbi5BOlxuICAgICAgICByZXR1cm4gdGhpcy5zYXZlQ2FjaGUodHVubmVsQ29ubklkLCBUdW5uZWwuRGlyZWN0aW9uLkIsIG1lc3NhZ2Uuc3JjUGF0aCwgZnJvbVBlZXJBZGRyKTtcbiAgICAgIGNhc2UgVHVubmVsLkRpcmVjdGlvbi5COlxuICAgICAgICByZXR1cm4gdGhpcy5zYXZlQ2FjaGUodHVubmVsQ29ubklkLCBUdW5uZWwuRGlyZWN0aW9uLkEsIG1lc3NhZ2Uuc3JjUGF0aCwgZnJvbVBlZXJBZGRyKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHNhdmVDYWNoZSh0dW5uZWxDb25uSWQ6IHN0cmluZywgZGlyZWN0aW9uOiBUdW5uZWwuRGlyZWN0aW9uLCBkZXNQYXRoOiBzdHJpbmcsIHBlZXJBZGRyOiBzdHJpbmcpIHtcbiAgICBsZXQgdGhyb3VnaCA9IHRoaXMuY29ubklkVG9UaHJvdWdoc1t0dW5uZWxDb25uSWRdO1xuICAgIGlmICghdGhyb3VnaCkge1xuICAgICAgdGhyb3VnaCA9IHt9O1xuICAgICAgdGhpcy5jb25uSWRUb1Rocm91Z2hzW3R1bm5lbENvbm5JZF0gPSB0aHJvdWdoO1xuICAgIH1cblxuICAgIGlmICghdGhyb3VnaFtkaXJlY3Rpb25dKSB7XG4gICAgICB0aHJvdWdoW2RpcmVjdGlvbl0gPSBbZGVzUGF0aCwgcGVlckFkZHJdO1xuICAgIH1cbiAgfVxuXG4gIHJvdXRlKG1lc3NhZ2U6IE9yaU1lc3NhZ2UpOiBzdHJpbmcgfCBudWxsIHtcbiAgICBjb25zdCB7IHR1bm5lbENvbm5JZCwgZGlyZWN0aW9uIH0gPSBtZXNzYWdlIGFzIFR1bm5lbC5NZXNzYWdlO1xuXG4gICAgaWYgKHR1bm5lbENvbm5JZCAmJiBkaXJlY3Rpb24pIHtcbiAgICAgIGNvbnN0IHRocm91Z2ggPSB0aGlzLmNvbm5JZFRvVGhyb3VnaHNbdHVubmVsQ29ubklkXT8uW2RpcmVjdGlvbl07XG4gICAgICBpZiAodGhyb3VnaCkge1xuICAgICAgICBjb25zdCBbZGVzUGF0aCwgcGVlckFkZHJdID0gdGhyb3VnaDtcbiAgICAgICAgaWYgKG1lc3NhZ2UuZGVzUGF0aCA9PT0gZGVzUGF0aCkgcmV0dXJuIHBlZXJBZGRyO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBUdW5uZWxNYW5hZ2VyO1xuXG5jbGFzcyBUdW5uZWxDb25uIGV4dGVuZHMgQ29ubiB7XG4gIHByaXZhdGUgcGVlclBhdGg6IHN0cmluZztcbiAgcHJpdmF0ZSBteVBhdGg6IHN0cmluZztcbiAgcHJpdmF0ZSBkaXJlY3Rpb246IFR1bm5lbC5EaXJlY3Rpb247XG4gIHByaXZhdGUgc2VuZEZ1bmM6IChtZXNzYWdlOiBUdW5uZWwuTWVzc2FnZSkgPT4gdm9pZDtcbiAgcHJpdmF0ZSBjbG9zZUZ1bmM6ICgpID0+IHZvaWQ7XG5cbiAgY29uc3RydWN0b3IodHVubmVsQ29ubklkPzogc3RyaW5nKSB7XG4gICAgc3VwZXIodHVubmVsQ29ubklkKTtcbiAgICB0aGlzLmRpcmVjdGlvbiA9IHR1bm5lbENvbm5JZCA/IFR1bm5lbC5EaXJlY3Rpb24uQiA6IFR1bm5lbC5EaXJlY3Rpb24uQTtcbiAgfVxuXG4gIGFzeW5jIHN0YXJ0TGluayhvcHRzOiBUdW5uZWwuU3RhcnRMaW5rT3B0cyk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucGVlclBhdGggPSBvcHRzLnBlZXJQYXRoO1xuICAgIHRoaXMucGVlcklkZW50aXR5ID0gbmV3IFBlZXJJZGVudGl0eShvcHRzLnBlZXJQYXRoKTtcbiAgICB0aGlzLm15UGF0aCA9IG9wdHMubXlQYXRoO1xuICAgIHRoaXMuc2VuZEZ1bmMgPSBvcHRzLnNlbmQ7XG4gICAgdGhpcy5jbG9zZUZ1bmMgPSBvcHRzLmNsb3NlO1xuXG4gICAgdGhpcy5zdGF0ZSA9IENvbm4uU3RhdGUuQ09OTkVDVEVEO1xuICB9XG5cbiAgb25SZWNlaXZlKGV2ZW50OiBNZXNzYWdlUmVjZWl2ZWRFdmVudCkge1xuICAgIGNvbnN0IGRldGFpbCA9IGV2ZW50LmRldGFpbCBhcyBUdW5uZWwuTWVzc2FnZTtcbiAgICBjb25zdCBzcmNBZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChkZXRhaWwuc3JjUGF0aCk7XG4gICAgaWYgKFxuICAgICAgc3JjQWRkciA9PT0gdGhpcy5wZWVySWRlbnRpdHkuYWRkciAmJlxuICAgICAgZGV0YWlsLnR1bm5lbENvbm5JZCA9PT0gdGhpcy5jb25uSWRcbiAgICApIHtcbiAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChldmVudCk7XG4gICAgfVxuICB9XG5cbiAgc2VuZChtZXNzYWdlQ29udGVudDogVHVubmVsLk1lc3NhZ2VEYXRhKSB7XG4gICAgY29uc3QgbWVzc2FnZTogVHVubmVsLk1lc3NhZ2UgPSB7XG4gICAgICBzcmNQYXRoOiB0aGlzLm15UGF0aCxcbiAgICAgIGRlc1BhdGg6IHRoaXMucGVlclBhdGgsXG4gICAgICB0dW5uZWxDb25uSWQ6IHRoaXMuY29ubklkLFxuICAgICAgZGlyZWN0aW9uOiB0aGlzLmRpcmVjdGlvbixcbiAgICAgIC4uLm1lc3NhZ2VDb250ZW50LFxuICAgIH1cbiAgICB0aGlzLnNlbmRGdW5jKG1lc3NhZ2UpO1xuICB9XG5cbiAgYXN5bmMgY2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5zdGF0ZSA9IENvbm4uU3RhdGUuQ0xPU0VEO1xuICAgIHRoaXMuY2xvc2VGdW5jKCk7XG4gIH1cbn1cblxuZXhwb3J0IHsgVHVubmVsQ29ubiwgTmV3VHVubmVsRXZlbnQgfTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcImlzb21vcnBoaWMtd2ViY3J5cHRvXCIpOyIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZShcInJlcGxcIik7IiwibW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKFwid3NcIik7IiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIGdldERlZmF1bHRFeHBvcnQgZnVuY3Rpb24gZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBub24taGFybW9ueSBtb2R1bGVzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLm4gPSAobW9kdWxlKSA9PiB7XG5cdHZhciBnZXR0ZXIgPSBtb2R1bGUgJiYgbW9kdWxlLl9fZXNNb2R1bGUgP1xuXHRcdCgpID0+IChtb2R1bGVbJ2RlZmF1bHQnXSkgOlxuXHRcdCgpID0+IChtb2R1bGUpO1xuXHRfX3dlYnBhY2tfcmVxdWlyZV9fLmQoZ2V0dGVyLCB7IGE6IGdldHRlciB9KTtcblx0cmV0dXJuIGdldHRlcjtcbn07IiwiLy8gZGVmaW5lIGdldHRlciBmdW5jdGlvbnMgZm9yIGhhcm1vbnkgZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5kID0gKGV4cG9ydHMsIGRlZmluaXRpb24pID0+IHtcblx0Zm9yKHZhciBrZXkgaW4gZGVmaW5pdGlvbikge1xuXHRcdGlmKF9fd2VicGFja19yZXF1aXJlX18ubyhkZWZpbml0aW9uLCBrZXkpICYmICFfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZXhwb3J0cywga2V5KSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIGtleSwgeyBlbnVtZXJhYmxlOiB0cnVlLCBnZXQ6IGRlZmluaXRpb25ba2V5XSB9KTtcblx0XHR9XG5cdH1cbn07IiwiX193ZWJwYWNrX3JlcXVpcmVfXy5vID0gKG9iaiwgcHJvcCkgPT4gKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApKSIsIi8vIGRlZmluZSBfX2VzTW9kdWxlIG9uIGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uciA9IChleHBvcnRzKSA9PiB7XG5cdGlmKHR5cGVvZiBTeW1ib2wgIT09ICd1bmRlZmluZWQnICYmIFN5bWJvbC50b1N0cmluZ1RhZykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBTeW1ib2wudG9TdHJpbmdUYWcsIHsgdmFsdWU6ICdNb2R1bGUnIH0pO1xuXHR9XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCAnX19lc01vZHVsZScsIHsgdmFsdWU6IHRydWUgfSk7XG59OyIsImltcG9ydCBBZ2VudCBmcm9tICcuLi9hZ2VudCc7XG5pbXBvcnQgV3NzQ29ubk1hbmFnZXIgZnJvbSAnLi4vY29ubi1tYW5hZ2VyL3dzcyc7XG5pbXBvcnQgcmVwbCBmcm9tICdyZXBsJztcblxuaW1wb3J0IHsgUGluZ01lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL25ldHdvcmsnO1xuaW1wb3J0IHsgcGluZywgaGFuZGxlUmVxdWVzdCB9IGZyb20gJy4vc2hhcmUnO1xuXG5wcm9jZXNzLm9uKCd1bmNhdWdodEV4Y2VwdGlvbicsIGVyciA9PiB7XG4gIGNvbnNvbGUubG9nKCdDYXVnaHQgZXhjZXB0aW9uOiAnLCBlcnIpO1xufSk7XG5cbmNvbnN0IHNlcnZlck9wdHM6IFdzc0Nvbm5NYW5hZ2VyLlNlcnZlck9wdGlvbnMgPSB7fTtcbmlmIChwcm9jZXNzLmVudi5IT1NUKSBzZXJ2ZXJPcHRzLmhvc3QgPSBwcm9jZXNzLmVudi5IT1NUO1xuaWYgKHByb2Nlc3MuZW52LlBPUlQpIHNlcnZlck9wdHMucG9ydCA9IHBhcnNlSW50KHByb2Nlc3MuZW52LlBPUlQpO1xuXG5jb25zdCBjb25uTWFuYWdlciA9IG5ldyBXc3NDb25uTWFuYWdlcih7fSwgc2VydmVyT3B0cyk7XG5cbmNvbnN0IGFnZW50ID0gbmV3IEFnZW50KGNvbm5NYW5hZ2VyLCB7XG4gIG15QWRkcjogcHJvY2Vzcy5lbnYuQUREUiB8fCAnd3M6Ly9sb2NhbGhvc3Q6ODA4MScsXG59KTtcbihnbG9iYWwgYXMgYW55KS5hZ2VudCA9IGFnZW50O1xuXG4oYXN5bmMgKCkgPT4ge1xuICAvLyBERVYgbW9uaXRvcjpcbiAgYWdlbnQuYWRkRXZlbnRMaXN0ZW5lcignbmV3LWNvbm4nLCBldmVudCA9PiB7XG4gICAgY29uc29sZS5sb2coJ25ldy1jb25uJywgZXZlbnQuZGV0YWlsLmNvbm4ucGVlcklkZW50aXR5LmFkZHIpO1xuXG4gICAgY29uc3QgcGluZ01lc3NhZ2U6IFBpbmdNZXNzYWdlID0ge1xuICAgICAgdGVybTogJ3BpbmcnLCB0aW1lc3RhbXA6IERhdGUubm93KCksXG4gICAgfTtcbiAgICBhZ2VudC5zZW5kKGV2ZW50LmRldGFpbC5jb25uLnBlZXJJZGVudGl0eS5hZGRyLCBwaW5nTWVzc2FnZSk7XG4gIH0pO1xuICBhZ2VudC5hZGRFdmVudExpc3RlbmVyKCdyZWNlaXZlLW5ldHdvcmsnLCBldmVudCA9PiB7XG4gICAgY29uc29sZS5sb2coJ3JlY2VpdmUtbmV0d29yaycsIGV2ZW50KTtcbiAgfSk7XG4gIGFnZW50LmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgZXZlbnQgPT4ge1xuICAgIGNvbnNvbGUubG9nKCdjbG9zZScsIGV2ZW50KTtcbiAgfSk7XG4gIGFnZW50LnJlcXVlc3RNYW5hZ2VyLmFkZEV2ZW50TGlzdGVuZXIoJ3JlcXVlc3RlZCcsIGV2ZW50ID0+IHtcbiAgICBoYW5kbGVSZXF1ZXN0KGV2ZW50KTtcbiAgfSk7XG4gIC8vID09PT09XG5cbiAgYXdhaXQgYWdlbnQuc3RhcnQoKTtcbiAgY29uc29sZS5sb2coJ2FnZW50IHN0YXJ0ZWQnLCBhZ2VudC5teUlkZW50aXR5LmFkZHIpO1xuXG4gIHJlcGwuc3RhcnQoeyBwcm9tcHQ6ICc+ICcgfSk7XG59KSgpO1xuXG4oZ2xvYmFsIGFzIGFueSkucGluZyA9IChkZXNBZGRyOiBzdHJpbmcpID0+IHBpbmcoYWdlbnQsIGRlc0FkZHIpO1xuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9
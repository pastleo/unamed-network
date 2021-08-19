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

/***/ "./src/conn-manager/browser.ts":
/*!*************************************!*\
  !*** ./src/conn-manager/browser.ts ***!
  \*************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _base__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base */ "./src/conn-manager/base.ts");
/* harmony import */ var _conn_ws__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../conn/ws */ "./src/conn/ws.ts");
/* harmony import */ var _conn_rtc__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../conn/rtc */ "./src/conn/rtc.ts");
/* harmony import */ var _misc_identity__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../misc/identity */ "./src/misc/identity.ts");
/* harmony import */ var _message_conn__WEBPACK_IMPORTED_MODULE_4__ = __webpack_require__(/*! ../message/conn */ "./src/message/conn.ts");





class BrowserConnManager extends _base__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor() {
        super(...arguments);
        this.pendingRtcConns = {};
    }
    async start(agent) {
        this.agent = agent;
        this.agent.tunnelManager.addEventListener('new-tunnel', event => {
            const { tunnel } = event.detail;
            tunnel.addEventListener('receive', event => {
                switch (event.detail.term) {
                    case 'requestToConn':
                        return this.onReceiveRequestToConn((0,_message_conn__WEBPACK_IMPORTED_MODULE_4__.newRequestToConnMessage)(event.detail), tunnel);
                }
            });
        });
    }
    async onReceiveRequestToConn(message, connVia) {
        const { srcPath: peerPath } = message;
        const peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_3__.PeerIdentity(peerPath, message.signingPubKey, message.encryptionPubKey);
        if (await peerIdentity.verify(message.signature)) {
            const event = new _base__WEBPACK_IMPORTED_MODULE_0__.RequestToConnEvent({ peerPath, peerIdentity });
            this.dispatchEvent(event);
            if (!event.defaultPrevented) {
                this.connect(peerPath, {
                    offer: message.offer,
                    beingConnected: true,
                    peerIdentity,
                    connVia,
                });
            }
        }
    }
    async connectWs(peerPath, opts) {
        const conn = new _conn_ws__WEBPACK_IMPORTED_MODULE_1__.default();
        const peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_3__.PeerIdentity(peerPath);
        await conn.startLink({
            myIdentity: this.agent.myIdentity,
            peerIdentity, peerPath,
            ...opts,
        });
        this.addConn(conn.peerIdentity.addr, conn, peerPath);
    }
    async connectUnnamed(peerPath, opts) {
        const rtcConn = new _conn_rtc__WEBPACK_IMPORTED_MODULE_2__.default();
        const peerIdentity = new _misc_identity__WEBPACK_IMPORTED_MODULE_3__.PeerIdentity(peerPath);
        this.pendingRtcConns[peerIdentity.addr] = rtcConn;
        const connVia = await this.agent.tunnelManager.create(peerPath);
        try {
            await rtcConn.startLink({
                myIdentity: this.agent.myIdentity,
                peerIdentity, peerPath, connVia,
                ...opts,
            });
            this.addConn(peerIdentity.addr, rtcConn, peerPath);
        }
        catch (error) {
            console.error(error);
        }
        finally {
            delete this.pendingRtcConns[peerIdentity.addr];
        }
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (BrowserConnManager);


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

/***/ "./src/conn/rtc.ts":
/*!*************************!*\
  !*** ./src/conn/rtc.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "default": () => (__WEBPACK_DEFAULT_EXPORT__)
/* harmony export */ });
/* harmony import */ var _base__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./base */ "./src/conn/base.ts");
/* harmony import */ var _misc_identity__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ../misc/identity */ "./src/misc/identity.ts");
/* harmony import */ var _message_conn__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../message/conn */ "./src/message/conn.ts");




const DATA_CHANNEL_NAME = 'data';
class RtcConn extends _base__WEBPACK_IMPORTED_MODULE_0__.default {
    constructor(rtcConfig = {}) {
        super();
        this.pendingMessages = [];
        this.pendingIce = [];
        this.pendingReceivedIce = [];
        this.rtcConn = new RTCPeerConnection(rtcConfig);
        this.rtcConn.ondatachannel = ({ channel }) => this.setupChannel(channel);
        this.rtcConn.oniceconnectionstatechange = () => {
            this.checkRtcConnState();
        };
        window.rtc = this.rtcConn;
    }
    startLink(opts) {
        const { myIdentity, peerPath, connVia, beingConnected, timeout, offer } = opts;
        this.peerIdentity = opts.peerIdentity || new _misc_identity__WEBPACK_IMPORTED_MODULE_1__.PeerIdentity(peerPath);
        return new Promise((resolve, reject) => {
            this.startLinkResolve = resolve;
            this.startLinkReject = reject;
            this.setupConnVia(connVia);
            this.setupIceCandidate(connVia);
            setTimeout(() => {
                if (this.state !== "CONNECTED" /* CONNECTED */) {
                    this.startLinkReject(new Error(`conn/rtc.ts: startLink: connecting to ${this.peerIdentity.addr} timeout`));
                }
            }, timeout);
            if (beingConnected) {
                this.rtcAnsweringFlow(peerPath, myIdentity, connVia, offer);
            }
            else {
                this.rtcOfferingFlow(peerPath, myIdentity, connVia);
            }
        });
    }
    async rtcOfferingFlow(peerPath, myIdentity, connVia) {
        this.setupChannel(this.rtcConn.createDataChannel(DATA_CHANNEL_NAME));
        await this.rtcConn.setLocalDescription(await this.rtcConn.createOffer());
        const offer = this.rtcConn.localDescription;
        const message = await (0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.makeRequestToConnMessage)(myIdentity, peerPath, offer);
        connVia.send(message);
    }
    async rtcAnsweringFlow(peerPath, myIdentity, connVia, offer) {
        await this.rtcConn.setRemoteDescription(offer);
        await this.rtcConn.setLocalDescription(await this.rtcConn.createAnswer());
        const answer = this.rtcConn.localDescription;
        const message = await (0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.makeRequestToConnResultMessage)(myIdentity, peerPath, answer);
        connVia.send(message);
    }
    setupConnVia(connVia) {
        connVia.addEventListener('receive', event => {
            switch (event.detail.term) {
                case 'requestToConnResult':
                    return this.onReceiveRequestToConnResult((0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.newRequestToConnResultMessage)(event.detail), connVia);
                case 'rtcIce':
                    return this.onReceiveRtcIce((0,_message_conn__WEBPACK_IMPORTED_MODULE_2__.newRtcIceMessage)(event.detail));
            }
        });
    }
    async onReceiveRequestToConnResult(message, connVia) {
        this.peerIdentity.setSigningPubKey(message.signingPubKey);
        this.peerIdentity.setEncryptionPubKey(message.encryptionPubKey);
        if (await this.peerIdentity.verify(message.signature)) {
            await this.rtcConn.setRemoteDescription(message.answer);
            if (this.pendingReceivedIce.length > 0) {
                this.pendingReceivedIce.forEach(ice => {
                    this.rtcConn.addIceCandidate(ice);
                });
            }
            if (this.pendingIce.length > 0) {
                this.pendingIce.forEach(ice => {
                    connVia.send({ term: 'rtcIce', ice });
                });
            }
        }
        else {
            console.error(`peerIdentity '${this.peerIdentity.addr}' verification failed`);
        }
    }
    onReceiveRtcIce(message) {
        const ice = message.ice;
        if (this.rtcConn.remoteDescription) {
            this.rtcConn.addIceCandidate(ice);
        }
        else {
            this.pendingReceivedIce.push(ice);
        }
    }
    setupIceCandidate(connVia) {
        this.rtcConn.onicecandidate = ({ candidate }) => {
            if (candidate) {
                if (this.rtcConn.remoteDescription) {
                    connVia.send({ term: 'rtcIce', ice: candidate });
                }
                else {
                    this.pendingIce.push(candidate);
                }
            }
        };
    }
    setupChannel(channel) {
        channel.onopen = () => {
            switch (channel.label) {
                case DATA_CHANNEL_NAME:
                    this.rtcDataChannel = channel;
                    this.rtcDataChannel.onmessage = ({ data }) => {
                        this.pendingMessages.push(data.toString());
                    };
                    break;
            }
            this.checkRtcConnState();
        };
    }
    checkRtcConnState() {
        if (this.state === "NOT_CONNECTED" /* NOT_CONNECTED */) {
            if (['connected', 'completed'].indexOf(this.rtcConn.iceConnectionState) >= 0 &&
                this.rtcDataChannel &&
                this.rtcDataChannel.readyState === 'open') {
                this.finishStarting();
            }
            else if (this.rtcConn.iceConnectionState === 'failed') {
                this.state = "FAILED" /* FAILED */;
                this.startLinkReject(new Error(`conn/rtc.ts: checkRtcConnState: connecting to ${this.peerIdentity.addr} ICE state failed`));
            }
        }
        else if (this.state === "CONNECTED" /* CONNECTED */) {
            if (['disconnected', 'closed', 'failed'].indexOf(this.rtcConn.iceConnectionState) >= 0) {
                this.state = "CLOSED" /* CLOSED */;
                this.onClose({ conn: this, bySelf: false });
            }
        }
    }
    finishStarting() {
        this.state = "CONNECTED" /* CONNECTED */;
        this.rtcDataChannel.onmessage = ({ data }) => {
            this.onMessageData(data);
        };
        this.startLinkResolve();
        queueMicrotask(() => {
            this.pendingMessages.forEach(msg => {
                this.onMessageData(msg);
            });
        });
    }
    async send(message) {
        this.rtcDataChannel.send(JSON.stringify(message));
    }
    async close() {
        this.rtcConn.close();
        this.onClose({ conn: this, bySelf: true });
    }
}
/* harmony default export */ const __WEBPACK_DEFAULT_EXPORT__ = (RtcConn);


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
/*!**********************!*\
  !*** ./src/index.ts ***!
  \**********************/
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   "Agent": () => (/* reexport safe */ _agent__WEBPACK_IMPORTED_MODULE_0__.default),
/* harmony export */   "BrowserConnManager": () => (/* reexport safe */ _conn_manager_browser__WEBPACK_IMPORTED_MODULE_1__.default),
/* harmony export */   "WssConnManager": () => (/* reexport safe */ _conn_manager_wss__WEBPACK_IMPORTED_MODULE_2__.default)
/* harmony export */ });
/* harmony import */ var _agent__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./agent */ "./src/agent.ts");
/* harmony import */ var _conn_manager_browser__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! ./conn-manager/browser */ "./src/conn-manager/browser.ts");
/* harmony import */ var _conn_manager_wss__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ./conn-manager/wss */ "./src/conn-manager/wss.ts");





})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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UUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFRCxLQUFLLENBQUMsS0FBSztRQUNULElBQUksQ0FBQyxLQUFLLHdCQUFvQixDQUFDO1FBQy9CLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztJQUNuQixDQUFDO0NBQ0Y7QUFFcUM7Ozs7Ozs7Ozs7O0FDMUx0QyxpRDs7Ozs7Ozs7OztBQ0FBLCtCOzs7Ozs7VUNBQTtVQUNBOztVQUVBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBO1VBQ0E7VUFDQTtVQUNBOztVQUVBO1VBQ0E7O1VBRUE7VUFDQTtVQUNBOzs7OztXQ3RCQTtXQUNBO1dBQ0E7V0FDQTtXQUNBO1dBQ0EsaUNBQWlDLFdBQVc7V0FDNUM7V0FDQSxFOzs7OztXQ1BBO1dBQ0E7V0FDQTtXQUNBO1dBQ0EseUNBQXlDLHdDQUF3QztXQUNqRjtXQUNBO1dBQ0EsRTs7Ozs7V0NQQSx3Rjs7Ozs7V0NBQTtXQUNBO1dBQ0E7V0FDQSx1REFBdUQsaUJBQWlCO1dBQ3hFO1dBQ0EsZ0RBQWdELGFBQWE7V0FDN0QsRTs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQ040QjtBQUM0QjtBQUNSO0FBRUsiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvYWdlbnQudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL2Nvbm4tbWFuYWdlci9iYXNlLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9jb25uLW1hbmFnZXIvYnJvd3Nlci50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvY29ubi1tYW5hZ2VyL3dzcy50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvY29ubi9iYXNlLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9jb25uL3J0Yy50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvY29ubi93cy50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvbWVzc2FnZS9jb25uLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9tZXNzYWdlL21lc3NhZ2UudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL21lc3NhZ2UvbmV0d29yay50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvLi9zcmMvbWlzYy9ldmVudC10YXJnZXQudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL21pc2MvZXZlbnRzLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9taXNjL2lkZW50aXR5LnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9taXNjL3V0aWxzLnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9yZXF1ZXN0LnRzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9yb3V0ZXIudHMiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrLy4vc3JjL3R1bm5lbC50cyIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvZXh0ZXJuYWwgXCJpc29tb3JwaGljLXdlYmNyeXB0b1wiIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay9leHRlcm5hbCBcIndzXCIiLCJ3ZWJwYWNrOi8vdW5uYW1lZC1uZXR3b3JrL3dlYnBhY2svYm9vdHN0cmFwIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay93ZWJwYWNrL3J1bnRpbWUvY29tcGF0IGdldCBkZWZhdWx0IGV4cG9ydCIsIndlYnBhY2s6Ly91bm5hbWVkLW5ldHdvcmsvd2VicGFjay9ydW50aW1lL2RlZmluZSBwcm9wZXJ0eSBnZXR0ZXJzIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay93ZWJwYWNrL3J1bnRpbWUvaGFzT3duUHJvcGVydHkgc2hvcnRoYW5kIiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay93ZWJwYWNrL3J1bnRpbWUvbWFrZSBuYW1lc3BhY2Ugb2JqZWN0Iiwid2VicGFjazovL3VubmFtZWQtbmV0d29yay8uL3NyYy9pbmRleC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgRXZlbnRUYXJnZXQgZnJvbSAnLi9taXNjL2V2ZW50LXRhcmdldCc7XG5pbXBvcnQgQ29ubk1hbmFnZXIsIHsgTmV3Q29ubkV2ZW50IH0gZnJvbSAnLi9jb25uLW1hbmFnZXIvYmFzZSc7XG5pbXBvcnQgeyBDb25uQ2xvc2VFdmVudCB9IGZyb20gJy4vY29ubi9iYXNlJztcbmltcG9ydCBSb3V0ZXIsIHsgaGFzaExpbmUsIG1lcmdlS0J1Y2tldHMgfSBmcm9tICcuL3JvdXRlcic7XG5pbXBvcnQgeyBNZXNzYWdlLCBNZXNzYWdlRGF0YSB9IGZyb20gJy4vbWVzc2FnZS9tZXNzYWdlJztcbmltcG9ydCB7XG4gIGRlcml2ZU5ldHdvcmtNZXNzYWdlLFxuICBRdWVyeUFkZHJzTWVzc2FnZSwgZGVyaXZlUXVlcnlBZGRyc01lc3NhZ2UsXG4gIFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2UsIFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2VEYXRhLCBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlLFxuICBKb2luU3BhY2VOb3RpZmljYXRpb25NZXNzYWdlRGF0YSxcbn0gZnJvbSAnLi9tZXNzYWdlL25ldHdvcmsnO1xuaW1wb3J0IHsgTWVzc2FnZVJlY2VpdmVkRXZlbnQgfSBmcm9tICcuL2Nvbm4vYmFzZSc7XG5pbXBvcnQgeyBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQgfSBmcm9tICcuL21pc2MvZXZlbnRzJztcbmltcG9ydCBJZGVudGl0eSBmcm9tICcuL21pc2MvaWRlbnRpdHknO1xuaW1wb3J0IFR1bm5lbE1hbmFnZXIgZnJvbSAnLi90dW5uZWwnO1xuaW1wb3J0IFJlcXVlc3RNYW5hZ2VyLCB7IFJlcXVlc3RlZEV2ZW50IH0gZnJvbSAnLi9yZXF1ZXN0JztcbmltcG9ydCB7IGpvaW5QYXRoLCBleHRyYWN0QWRkckZyb21QYXRoLCBleHRyYWN0U3BhY2VQYXRoLCB3YWl0IH0gZnJvbSAnLi9taXNjL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgQWdlbnQge1xuICB0eXBlIENvbmZpZyA9IHtcbiAgICByb3V0ZVR0bDogbnVtYmVyO1xuICAgIHJlcXVlc3RUaW1lb3V0OiBudW1iZXI7XG4gIH0gJiBJZGVudGl0eS5Db25maWc7XG59XG5cbmludGVyZmFjZSBFdmVudE1hcCB7XG4gICdyZWNlaXZlLW5ldHdvcmsnOiBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQ7XG4gICduZXctY29ubic6IE5ld0Nvbm5FdmVudDtcbiAgJ2Nsb3NlJzogQ29ubkNsb3NlRXZlbnQ7XG59XG5cbmNvbnN0IGFnZW50RGVmYXVsdENvbmZpZzogQWdlbnQuQ29uZmlnID0ge1xuICByb3V0ZVR0bDogMTAsXG4gIHJlcXVlc3RUaW1lb3V0OiAxMDAwLFxufVxuXG5jbGFzcyBBZ2VudCBleHRlbmRzIEV2ZW50VGFyZ2V0PEV2ZW50TWFwPiB7XG4gIG15SWRlbnRpdHk6IElkZW50aXR5O1xuICBjb25uTWFuYWdlcjogQ29ubk1hbmFnZXI7XG4gIHR1bm5lbE1hbmFnZXI6IFR1bm5lbE1hbmFnZXI7XG4gIHJlcXVlc3RNYW5hZ2VyOiBSZXF1ZXN0TWFuYWdlcjtcbiAgcHJpdmF0ZSBjb25maWc6IEFnZW50LkNvbmZpZztcbiAgcHJpdmF0ZSByb3V0ZXI6IFJvdXRlcjtcbiAgcHJpdmF0ZSByZWNlaXZlZE1zZ0lkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cbiAgY29uc3RydWN0b3IoY29ubk1hbmFnZXI6IENvbm5NYW5hZ2VyLCBjb25maWc6IFBhcnRpYWw8QWdlbnQuQ29uZmlnPiA9IHt9KSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLm15SWRlbnRpdHkgPSBuZXcgSWRlbnRpdHkoY29uZmlnKTtcbiAgICB0aGlzLmNvbmZpZyA9IHsgLi4uYWdlbnREZWZhdWx0Q29uZmlnLCAuLi5jb25maWcgfTtcbiAgICB0aGlzLmNvbm5NYW5hZ2VyID0gY29ubk1hbmFnZXI7XG4gICAgdGhpcy5yb3V0ZXIgPSBuZXcgUm91dGVyKCk7XG4gICAgdGhpcy50dW5uZWxNYW5hZ2VyID0gbmV3IFR1bm5lbE1hbmFnZXIodGhpcyk7XG4gICAgdGhpcy5yZXF1ZXN0TWFuYWdlciA9IG5ldyBSZXF1ZXN0TWFuYWdlcih0aGlzLCB7XG4gICAgICB0aW1lb3V0OiB0aGlzLmNvbmZpZy5yZXF1ZXN0VGltZW91dCxcbiAgICB9KTtcblxuICAgIHRoaXMuY29ubk1hbmFnZXIuYWRkRXZlbnRMaXN0ZW5lcignbmV3LWNvbm4nLCBldmVudCA9PiB7XG4gICAgICB0aGlzLm9uTmV3Q29ubihldmVudCk7XG4gICAgfSk7XG4gICAgdGhpcy5jb25uTWFuYWdlci5hZGRFdmVudExpc3RlbmVyKCdjbG9zZScsIGV2ZW50ID0+IHtcbiAgICAgIHRoaXMub25Db25uQ2xvc2UoZXZlbnQpO1xuICAgIH0pO1xuICAgIHRoaXMuY29ubk1hbmFnZXIuYWRkRXZlbnRMaXN0ZW5lcigncmVjZWl2ZScsIGV2ZW50ID0+IHtcbiAgICAgIHRoaXMub25SZWNlaXZlKGV2ZW50KTtcbiAgICB9KTtcblxuICAgIHRoaXMucmVxdWVzdE1hbmFnZXIuYWRkRXZlbnRMaXN0ZW5lcigncmVxdWVzdGVkJywgZXZlbnQgPT4ge1xuICAgICAgdGhpcy5vblJlcXVlc3RlZChldmVudCk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBzdGFydCgpIHtcbiAgICBhd2FpdCB0aGlzLm15SWRlbnRpdHkuZ2VuZXJhdGVJZk5lZWRlZCgpO1xuICAgIGF3YWl0IHRoaXMuY29ubk1hbmFnZXIuc3RhcnQodGhpcyk7XG4gICAgYXdhaXQgdGhpcy5yb3V0ZXIuc3RhcnQodGhpcy5teUlkZW50aXR5LmFkZHIpO1xuICB9XG5cbiAgYXN5bmMgY29ubmVjdChwZWVyUGF0aDogc3RyaW5nLCBzcGFjZVBhdGg6IHN0cmluZyA9ICcnKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcGVlckFkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHBlZXJQYXRoKTtcbiAgICBpZiAoIXRoaXMuY29ubk1hbmFnZXIuaGFzQ29ubihwZWVyQWRkcikpIHtcbiAgICAgIGF3YWl0IHRoaXMuY29ubk1hbmFnZXIuY29ubmVjdChwZWVyUGF0aCwge30pO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJvdXRlci5hZGRQYXRoKHBlZXJQYXRoKTtcbiAgICBjb25zdCBub3RpZmljYXRpb25NZXNzYWdlOiBKb2luU3BhY2VOb3RpZmljYXRpb25NZXNzYWdlRGF0YSA9IHtcbiAgICAgIHRlcm06ICdqb2luLXNwYWNlLW5vdGlmaWNhdGlvbicsXG4gICAgfVxuICAgIHRoaXMuc2VuZChwZWVyUGF0aCwgbm90aWZpY2F0aW9uTWVzc2FnZSwgc3BhY2VQYXRoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGFzeW5jIGpvaW4oc3BhY2VQYXRoOiBzdHJpbmcgPSAnJyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHNwYWNlID0gdGhpcy5yb3V0ZXIuaW5pdFNwYWNlKHNwYWNlUGF0aCk7XG5cbiAgICBsZXQgY29ubmVjdFNwYWNlTmVpZ2hib3JTdWNjZWVkID0gZmFsc2U7XG4gICAgbGV0IGNvbm5lY3RTcGFjZU5laWdoYm9yVHJpZWQgPSAwO1xuICAgIGxldCBhZGRyUmVzcG9uc2U6IFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2U7XG4gICAgd2hpbGUoIWNvbm5lY3RTcGFjZU5laWdoYm9yU3VjY2VlZCAmJiBjb25uZWN0U3BhY2VOZWlnaGJvclRyaWVkIDwgMykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29ubmVjdFNwYWNlTmVpZ2hib3JUcmllZCsrO1xuICAgICAgICBhZGRyUmVzcG9uc2UgPSBhd2FpdCB0aGlzLmNvbm5lY3RTcGFjZU5laWdoYm9yKHNwYWNlKTtcbiAgICAgICAgY29ubmVjdFNwYWNlTmVpZ2hib3JTdWNjZWVkID0gdHJ1ZTtcbiAgICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgICBjb25zb2xlLndhcm4oYGFnZW50LnRzOiBqb2luOiBjb25uZWN0U3BhY2VOZWlnaGJvciBmYWlsZWQsICMke2Nvbm5lY3RTcGFjZU5laWdoYm9yVHJpZWR9IHJldHJ5IGluIDMgc2Vjcy4uLmAsIGVycik7XG4gICAgICAgIGF3YWl0IHdhaXQoMzAwMCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICghY29ubmVjdFNwYWNlTmVpZ2hib3JTdWNjZWVkKSByZXR1cm4gZmFsc2U7XG5cbiAgICBsZXQgY29ubmVjdFNwYWNlUGVlcnNTdWNjZWVkID0gZmFsc2U7XG4gICAgbGV0IGNvbm5lY3RTcGFjZVBlZXJzVHJpZWQgPSAwO1xuICAgIHdoaWxlKCFjb25uZWN0U3BhY2VQZWVyc1N1Y2NlZWQgJiYgY29ubmVjdFNwYWNlUGVlcnNUcmllZCA8IDMpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbm5lY3RTcGFjZVBlZXJzVHJpZWQrKztcbiAgICAgICAgYXdhaXQgdGhpcy5jb25uZWN0U3BhY2VQZWVycyhcbiAgICAgICAgICBzcGFjZSxcbiAgICAgICAgICBhZGRyUmVzcG9uc2UuYWRkcnMsXG4gICAgICAgICAgZXh0cmFjdEFkZHJGcm9tUGF0aChhZGRyUmVzcG9uc2Uuc3JjUGF0aCksXG4gICAgICAgICk7XG4gICAgICAgIGNvbm5lY3RTcGFjZVBlZXJzU3VjY2VlZCA9IHRydWU7XG4gICAgICB9IGNhdGNoIChlcnIpIHtcbiAgICAgICAgY29uc29sZS53YXJuKGBhZ2VudC50czogam9pbjogY29ubmVjdFNwYWNlUGVlcnMgZmFpbGVkLCAjJHtjb25uZWN0U3BhY2VQZWVyc1RyaWVkfSByZXRyeSBpbiAzIHNlY3MuLi5gLCBlcnIpO1xuICAgICAgICBhd2FpdCB3YWl0KDMwMDApO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0U3BhY2VOZWlnaGJvcihzcGFjZTogUm91dGVyLlNwYWNlKTogUHJvbWlzZTxRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlPiB7XG4gICAgY29uc3QgcmVxdWVzdCA9IGF3YWl0IHRoaXMucmVxdWVzdE1hbmFnZXIucmVxdWVzdChqb2luUGF0aChzcGFjZS5wYXRoLCB0aGlzLm15SWRlbnRpdHkuYWRkciksIHsgdGVybTogJ3F1ZXJ5LWFkZHJzJyB9KTtcbiAgICBjb25zdCBhZGRyUmVzcG9uc2UgPSBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlKHJlcXVlc3QucmVzcG9uc2VNZXNzYWdlKTtcblxuICAgIGF3YWl0IHRoaXMuY29ubmVjdChhZGRyUmVzcG9uc2Uuc3JjUGF0aCwgc3BhY2UucGF0aCk7XG5cbiAgICByZXR1cm4gYWRkclJlc3BvbnNlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBjb25uZWN0U3BhY2VQZWVycyhzcGFjZTogUm91dGVyLlNwYWNlLCBrbm93bkFkZHJzOiBzdHJpbmdbXSwgbmVpZ2hib3JQYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbbmVpZ2hib3JTcGFjZSwgbmVpZ2hib3JBZGRyXSA9IHRoaXMucm91dGVyLmdldFNwYWNlQW5kQWRkcihuZWlnaGJvclBhdGgpO1xuICAgIGlmIChuZWlnaGJvclNwYWNlICE9PSBzcGFjZSkgcmV0dXJuO1xuXG4gICAgY29uc3QgYWRkckFuZEhhc2hlcyA9IGF3YWl0IGhhc2hMaW5lKGtub3duQWRkcnMpO1xuXG4gICAgY29uc3QgZXhpc3RpbmdLQnVja2V0cyA9IHRoaXMucm91dGVyLmJ1aWxkU3BhY2VLQnVja2V0cyhzcGFjZS5wYXRoKTtcbiAgICBjb25zdCByZXNwb25zZUtCdWNrZXRzID0gdGhpcy5yb3V0ZXIuYnVpbGRLQnVja2V0cyhhZGRyQW5kSGFzaGVzKTtcbiAgICBjb25zdCBuZXh0UmVxdWVzdEtCdWNrZXRzID0gbWVyZ2VLQnVja2V0cyhleGlzdGluZ0tCdWNrZXRzLCByZXNwb25zZUtCdWNrZXRzKTtcbiAgICB0aGlzLnJvdXRlci5yZW1vdmVMaW5lcyhcbiAgICAgIG5leHRSZXF1ZXN0S0J1Y2tldHMsXG4gICAgICBbdGhpcy5yb3V0ZXIuZ2V0TGluZShzcGFjZS5wYXRoLCBuZWlnaGJvckFkZHIpXVxuICAgICk7XG5cbiAgICBsZXQgbmV4dFJlcXVlc3RNYXhLID0gLTE7XG4gICAgbGV0IG5leHRSZXF1ZXN0TWluSyA9IE51bWJlci5NQVhfVkFMVUU7XG4gICAgbmV4dFJlcXVlc3RLQnVja2V0cy5mb3JFYWNoKChfYnVja2V0LCBrKSA9PiB7XG4gICAgICBpZiAoayA8IG5leHRSZXF1ZXN0TWluSykgbmV4dFJlcXVlc3RNaW5LID0gaztcbiAgICAgIGlmIChrID4gbmV4dFJlcXVlc3RNYXhLKSBuZXh0UmVxdWVzdE1heEsgPSBrO1xuICAgIH0pO1xuXG4gICAgY29uc3QgbmV4dFJlcXVlc3RBZGRycyA9IChuZXh0UmVxdWVzdEtCdWNrZXRzLnNpemUgPiAwID8gKFxuICAgICAgbmV4dFJlcXVlc3RLQnVja2V0cy5zaXplID49IDIgPyBbbmV4dFJlcXVlc3RNYXhLLCBuZXh0UmVxdWVzdE1pbktdIDogW25leHRSZXF1ZXN0TWF4S11cbiAgICApIDogW10pLm1hcChcbiAgICAgIGsgPT4gbmV4dFJlcXVlc3RLQnVja2V0cy5nZXQoaylcbiAgICApLm1hcChcbiAgICAgIGxpbmVzID0+IGxpbmVzW01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIGxpbmVzLmxlbmd0aCldWzFdXG4gICAgKTtcblxuICAgIGxldCBjb25uZWN0aW5nS0J1Y2tldHMgPSByZXNwb25zZUtCdWNrZXRzO1xuXG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBuZXh0UmVxdWVzdEFkZHJzLm1hcChhc3luYyBhZGRyID0+IHtcbiAgICAgICAgY29uc3Qgc3ViUmVxdWVzdCA9IGF3YWl0IHRoaXMucmVxdWVzdE1hbmFnZXIucmVxdWVzdChqb2luUGF0aChzcGFjZS5wYXRoLCBhZGRyKSwgeyB0ZXJtOiAncXVlcnktYWRkcnMnIH0pO1xuICAgICAgICBjb25zdCBzdWJBZGRyUmVzcG9uc2UgPSBkZXJpdmVRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlKHN1YlJlcXVlc3QucmVzcG9uc2VNZXNzYWdlKTtcbiAgICAgICAgY29uc3QgYWRkckFuZEhhc2hlcyA9IGF3YWl0IGhhc2hMaW5lKHN1YkFkZHJSZXNwb25zZS5hZGRycyk7XG4gICAgICAgIGNvbm5lY3RpbmdLQnVja2V0cyA9IG1lcmdlS0J1Y2tldHMoXG4gICAgICAgICAgY29ubmVjdGluZ0tCdWNrZXRzLCB0aGlzLnJvdXRlci5idWlsZEtCdWNrZXRzKFxuICAgICAgICAgICAgYWRkckFuZEhhc2hlc1xuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgICB0aGlzLnJvdXRlci5yZW1vdmVMaW5lcyhjb25uZWN0aW5nS0J1Y2tldHMsIHNwYWNlLnRhYmxlKTtcblxuICAgIGNvbnN0IGFkZHJzVG9Db25uZWN0ID0gdGhpcy5yb3V0ZXIucGlja0FkZHJzVG9Db25uZWN0KGNvbm5lY3RpbmdLQnVja2V0cywgZXhpc3RpbmdLQnVja2V0cyk7XG5cbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIGFkZHJzVG9Db25uZWN0Lm1hcChhZGRyID0+IChcbiAgICAgICAgdGhpcy5jb25uZWN0KGpvaW5QYXRoKHNwYWNlLnBhdGgsIGFkZHIpLCBzcGFjZS5wYXRoKVxuICAgICAgKSlcbiAgICApO1xuICB9XG5cbiAgLy8gV0lQXG4gIGxlYXZlKF9zcGFjZVBhdGg6IHN0cmluZykge31cbiAgbGlzdEtub3duQWRkcnMoX3NwYWNlUGF0aDogc3RyaW5nKSB7fVxuICBicm9hZGNhc3QoX3NwYWNlUGF0aDogc3RyaW5nKSB7fVxuXG4gIHNlbmQocGF0aDogc3RyaW5nLCBtZXNzYWdlOiBNZXNzYWdlRGF0YSwgc3JjU3BhY2VQYXRoPzogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgcmV0dXJuIHRoaXMucm91dGUoe1xuICAgICAgc3JjUGF0aDogam9pblBhdGgoc3JjU3BhY2VQYXRoIHx8ICcnLCB0aGlzLm15SWRlbnRpdHkuYWRkciksXG4gICAgICBkZXNQYXRoOiBwYXRoLFxuICAgICAgLi4ubWVzc2FnZSxcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb25OZXdDb25uKGV2ZW50OiBOZXdDb25uRXZlbnQpIHtcbiAgICBhd2FpdCB0aGlzLnJvdXRlci5hZGRQYXRoKGV2ZW50LmRldGFpbC5wZWVyUGF0aCk7XG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgfVxuXG4gIHByaXZhdGUgb25SZWNlaXZlKGV2ZW50OiBNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IHZvaWQge1xuICAgIHRoaXMudHVubmVsTWFuYWdlci5jYWNoZVJlY2VpdmUoZXZlbnQuZnJvbUNvbm4ucGVlcklkZW50aXR5LmFkZHIsIGV2ZW50LnNyY0FkZHIsIGV2ZW50LmRldGFpbCk7XG4gICAgdGhpcy5yZXF1ZXN0TWFuYWdlci5jYWNoZVJlY2VpdmUoZXZlbnQuZnJvbUNvbm4ucGVlcklkZW50aXR5LmFkZHIsIGV2ZW50LnNyY0FkZHIsIGV2ZW50LmRldGFpbCk7XG5cbiAgICAvLyBUT0RPOiB3aGF0IGlmIHRoaXMgY2xpZW50IGlzIG5vdCBpbiB0aGUgZGlybmFtZT9cbiAgICBpZiAoZXZlbnQuZGVzQWRkciA9PT0gdGhpcy5teUlkZW50aXR5LmFkZHIpIHtcbiAgICAgIHRoaXMub25SZWNlaXZlTWVzc2FnZShldmVudCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMucm91dGUoZXZlbnQuZGV0YWlsLCBldmVudCk7XG4gICAgfVxuICB9XG5cbiAgcHJvdGVjdGVkIGFzeW5jIG9uUmVjZWl2ZU1lc3NhZ2UoZXZlbnQ6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50KSB7XG4gICAgaWYgKFxuICAgICAgdGhpcy50dW5uZWxNYW5hZ2VyLm9uUmVjZWl2ZU1lc3NhZ2UoZXZlbnQpXG4gICAgKSByZXR1cm47XG5cbiAgICB0aGlzLmhhbmRsZVJlY2VpdmVOZXR3b3JrTWVzc2FnZShuZXcgTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KGV2ZW50LCB0cnVlKSk7XG4gIH1cblxuICBhc3luYyByb3V0ZShtZXNzYWdlOiBNZXNzYWdlLCByZWNlaXZlRXZlbnQ/OiBNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IG5ldHdvcmtNZXNzYWdlID0gZGVyaXZlTmV0d29ya01lc3NhZ2UobWVzc2FnZSwgdGhpcy5jb25maWcucm91dGVUdGwpO1xuICAgIGNvbnN0IHsgc3JjUGF0aCwgZGVzUGF0aCwgbXNnSWQgfSA9IG5ldHdvcmtNZXNzYWdlO1xuICAgIGNvbnN0IHNyY0FkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHNyY1BhdGgpO1xuICAgIGNvbnN0IGRlc0FkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKGRlc1BhdGgpO1xuXG4gICAgaWYgKG5ldHdvcmtNZXNzYWdlLnR0bCA8IDApIHtcbiAgICAgIGNvbnNvbGUud2FybihgbWVzc2FnZSBydW4gb3V0IG9mIHR0bCBmcm9tICcke3NyY1BhdGh9JyB0byAnJHtkZXNQYXRofScsIGRyb3BwaW5nIG1lc3NhZ2U6YCwgbWVzc2FnZSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucmVjZWl2ZWRNc2dJZC5oYXMobXNnSWQpKSB7XG4gICAgICBjb25zb2xlLndhcm4oYHJlY2VpdmVkIHR3aWNlIChvciBtb3JlKSBzYW1lIG1lc3NhZ2Ugd2l0aCBtc2dJZCAnJHttc2dJZH0nIGZyb20gJyR7c3JjUGF0aH0nIHRvICcke2Rlc1BhdGh9JywgZHJvcHBpbmcgbWVzc2FnZTpgLCBtZXNzYWdlKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5yZWNlaXZlZE1zZ0lkLmFkZChtc2dJZCk7XG4gICAgfVxuXG4gICAgLy8gVE9ETzogYWZ0ZXIgREhUIGlzIGRvbmUsIHRoaXMgbWlnaHQgYmUgcmVtb3ZlZCBtYWtpbmcgc3VyZSBub3Qgcm91dGluZyBiYWNrIGZvciBpbml0aWFsIHF1ZXJ5LW5vZGVcbiAgICBpZiAodGhpcy5jb25uTWFuYWdlci5oYXNDb25uKGRlc0FkZHIpICYmIHJlY2VpdmVFdmVudD8uZnJvbUNvbm4ucGVlcklkZW50aXR5LmFkZHIgIT09IGRlc0FkZHIpIHtcbiAgICAgIHJldHVybiB0aGlzLmNvbm5NYW5hZ2VyLnNlbmQoZGVzQWRkciwgbmV0d29ya01lc3NhZ2UpO1xuICAgIH1cblxuICAgIGNvbnN0IHR1bm5lbFRocm91Z2hBZGRyID0gdGhpcy50dW5uZWxNYW5hZ2VyLnJvdXRlKG5ldHdvcmtNZXNzYWdlKTtcbiAgICBpZiAodGhpcy5jb25uTWFuYWdlci5oYXNDb25uKHR1bm5lbFRocm91Z2hBZGRyKSkge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubk1hbmFnZXIuc2VuZCh0dW5uZWxUaHJvdWdoQWRkciwgbmV0d29ya01lc3NhZ2UpO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcXVlc3RUaHJvdWdoQWRkciA9IHRoaXMucmVxdWVzdE1hbmFnZXIucm91dGUobmV0d29ya01lc3NhZ2UpO1xuICAgIGlmICh0aGlzLmNvbm5NYW5hZ2VyLmhhc0Nvbm4ocmVxdWVzdFRocm91Z2hBZGRyKSkge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubk1hbmFnZXIuc2VuZChyZXF1ZXN0VGhyb3VnaEFkZHIsIG5ldHdvcmtNZXNzYWdlKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLnJvdXRlci5yb3V0ZShkZXNQYXRoLCByZWNlaXZlRXZlbnQ/LmZyb21Db25uLnBlZXJJZGVudGl0eS5hZGRyKTtcblxuICAgIGlmIChyZWNlaXZlRXZlbnQgJiYgcmVzdWx0Lm1pZ2h0QmVGb3JNZSAmJiBzcmNBZGRyICE9PSB0aGlzLm15SWRlbnRpdHkuYWRkcikge1xuICAgICAgaWYgKHRoaXMucm91dGVNZXNzYWdlTWlnaHRCZUZvck1lKHJlY2VpdmVFdmVudCkpIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmIChyZXN1bHQuYWRkcnMubGVuZ3RoID09PSAwKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIFtcbiAgICAgICAgICAnYWdlbnQudHM6IHNlbmQ6IG5vIGF2YWlsYWJsZSBhZGRyIHRvIHNlbmQsIHJvdXRlciB0YWJsZTonLFxuICAgICAgICAgIHRoaXMucm91dGVyLnByaW50YWJsZVRhYmxlKGRlc1BhdGgpLFxuICAgICAgICBdLmpvaW4oJ1xcbicpLFxuICAgICAgICB7IHJlc3VsdCwgbWVzc2FnZSB9XG4gICAgICApO1xuXG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgaWYgKHJlc3VsdC5icm9hZGNhc3QpIHsgLy8gbWlnaHQgbmVlZCB0byBkbyBzb21ldGhpbmcgYmVmb3JlIHNlbmRpbmcgb3V0XG4gICAgICByZXN1bHQuYWRkcnMuZm9yRWFjaChhZGRyID0+IHRoaXMuY29ubk1hbmFnZXIuc2VuZChhZGRyLCBuZXR3b3JrTWVzc2FnZSkpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChyZXN1bHQubm90TWFraW5nUHJvZ3Jlc3NGcm9tQmFzZSkge1xuICAgICAgICAvLyBUT0RPOiBhZnRlciBqb2luIGZsb3cgY29tcGxldGUsIHRoaXMgc2hvdWxkIGRyb3AgbWVzc2FnZVxuICAgICAgICAvLyBidXQgYWxsb3cgc3JjQWRkciA9PT0gZnJvbUFkZHIgYmVjYXVzZSBzcmNQZWVyIGNhbiBiZSBjb25uZWN0aW5nIGZpcnN0IHBlZXJcbiAgICAgICAgY29uc29sZS53YXJuKFxuICAgICAgICAgIFtcbiAgICAgICAgICAgIGBhZ2VudC50czogb25Sb3V0ZTogbWVzc2FnZSBmcm9tICR7c3JjUGF0aH0gdG8gJHtkZXNQYXRofSBub3QgbWFraW5nIHByb2dyZXNzLCByb3V0ZXIgdGFibGU6YCxcbiAgICAgICAgICAgIHRoaXMucm91dGVyLnByaW50YWJsZVRhYmxlKGRlc1BhdGgpLFxuICAgICAgICAgIF0uam9pbignXFxuJyksXG4gICAgICAgICAgeyByZXN1bHQsIG1lc3NhZ2UgfVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgcmVzdWx0LmFkZHJzLmZvckVhY2goYWRkciA9PiB0aGlzLmNvbm5NYW5hZ2VyLnNlbmQoYWRkciwgbmV0d29ya01lc3NhZ2UpKTtcbiAgICAgIHJldHVybiB0cnVlXG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByb3V0ZU1lc3NhZ2VNaWdodEJlRm9yTWUoZXZlbnQ6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgbmV0d29ya01lc3NhZ2VFdmVudCA9IG5ldyBOZXR3b3JrTWVzc2FnZVJlY2VpdmVkRXZlbnQoZXZlbnQsIGZhbHNlKTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVSZWNlaXZlTmV0d29ya01lc3NhZ2UobmV0d29ya01lc3NhZ2VFdmVudCk7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZVJlY2VpdmVOZXR3b3JrTWVzc2FnZShldmVudDogTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgaWYgKFxuICAgICAgdGhpcy5yZXF1ZXN0TWFuYWdlci5vblJlY2VpdmVOZXR3b3JrTWVzc2FnZShldmVudClcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH07XG5cbiAgICBsZXQgaGFuZGxlZCA9IGZhbHNlO1xuICAgIHN3aXRjaCAoZXZlbnQuZGV0YWlsLnRlcm0pIHtcbiAgICAgIGNhc2UgJ2pvaW4tc3BhY2Utbm90aWZpY2F0aW9uJzpcbiAgICAgICAgaGFuZGxlZCA9IHRoaXMuaGFuZGxlSm9pblNwYWNlTWVzc2FnZShldmVudC5kZXRhaWwpO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgaWYgKGhhbmRsZWQpIHJldHVybiB0cnVlO1xuXG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICByZXR1cm4gZXZlbnQuZGVmYXVsdFByZXZlbnRlZDtcbiAgfVxuXG4gIHByaXZhdGUgaGFuZGxlSm9pblNwYWNlTWVzc2FnZShtZXNzYWdlOiBNZXNzYWdlKTogYm9vbGVhbiB7XG4gICAgdGhpcy5yb3V0ZXIuYWRkUGF0aChtZXNzYWdlLnNyY1BhdGgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvbkNvbm5DbG9zZShldmVudDogQ29ubkNsb3NlRXZlbnQpIHtcbiAgICB0aGlzLnJvdXRlci5ybUFkZHIoZXZlbnQuZGV0YWlsLmNvbm4ucGVlcklkZW50aXR5LmFkZHIpO1xuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChldmVudCk7XG4gIH1cblxuICBwcml2YXRlIG9uUmVxdWVzdGVkKGV2ZW50OiBSZXF1ZXN0ZWRFdmVudCkge1xuICAgIHN3aXRjaCAoZXZlbnQuZGV0YWlsLnRlcm0pIHtcbiAgICAgIGNhc2UgJ3F1ZXJ5LWFkZHJzJzpcbiAgICAgICAgcmV0dXJuIHRoaXMub25SZXF1ZXN0ZWRBZGRycyhkZXJpdmVRdWVyeUFkZHJzTWVzc2FnZShldmVudC5kZXRhaWwpLCBldmVudCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBvblJlcXVlc3RlZEFkZHJzKG1lc3NhZ2U6IFF1ZXJ5QWRkcnNNZXNzYWdlLCBldmVudDogUmVxdWVzdGVkRXZlbnQpIHtcbiAgICBsZXQgW3NwYWNlLCBfdGFyZ2V0LCB1cHBlclNwYWNlc10gPSB0aGlzLnJvdXRlci5nZXRTcGFjZUFuZEFkZHIobWVzc2FnZS5kZXNQYXRoLCBmYWxzZSk7XG4gICAgY29uc3Qgc3JjQWRkciA9IGV4dHJhY3RBZGRyRnJvbVBhdGgobWVzc2FnZS5zcmNQYXRoKTtcbiAgICBjb25zdCByZXNwb25zZTogUXVlcnlBZGRyc1Jlc3BvbnNlTWVzc2FnZURhdGEgPSB7XG4gICAgICB0ZXJtOiAncXVlcnktYWRkcnMtcmVzcG9uc2UnLFxuICAgICAgLi4uKHNwYWNlID8gKHtcbiAgICAgICAgYWRkcnM6IFtcbiAgICAgICAgICAuLi5zcGFjZS50YWJsZS5tYXAobGluZSA9PiBsaW5lWzFdKS5maWx0ZXIoYWRkciA9PiBhZGRyICE9PSBzcmNBZGRyKSxcbiAgICAgICAgXSxcbiAgICAgICAgcmVzcG9uc2VTcGFjZTogc3BhY2UucGF0aCxcbiAgICAgIH0pIDogKHtcbiAgICAgICAgYWRkcnM6IFtdLFxuICAgICAgICByZXNwb25zZVNwYWNlOiB1cHBlclNwYWNlc1t1cHBlclNwYWNlcy5sZW5ndGggLSAxXS5wYXRoXG4gICAgICB9KSksXG4gICAgfTtcblxuICAgIGV2ZW50LnJlc3BvbnNlKHJlc3BvbnNlKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBBZ2VudDtcbiIsImltcG9ydCBBZ2VudCBmcm9tICcuLi9hZ2VudCc7XG5pbXBvcnQgQ29ubiwgeyBNZXNzYWdlUmVjZWl2ZWRFdmVudCwgQ29ubkNsb3NlRXZlbnQgfSBmcm9tICcuLi9jb25uL2Jhc2UnO1xuaW1wb3J0IEV2ZW50VGFyZ2V0LCB7IEN1c3RvbUV2ZW50IH0gZnJvbSAnLi4vbWlzYy9ldmVudC10YXJnZXQnO1xuaW1wb3J0IHsgUGVlcklkZW50aXR5IH0gZnJvbSAnLi4vbWlzYy9pZGVudGl0eSc7XG5pbXBvcnQgeyBleHRyYWN0QWRkckZyb21QYXRoIH0gZnJvbSAnLi4vbWlzYy91dGlscyc7XG5pbXBvcnQgeyBNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9tZXNzYWdlJztcblxuaW1wb3J0IHsgT3B0aW9uYWwsIFJlcXVpcmVkIH0gZnJvbSAndXRpbGl0eS10eXBlcyc7XG5cbmludGVyZmFjZSBSZXF1ZXN0VG9Db25uRXZlbnREZXRhaWwge1xuICBwZWVyUGF0aDogc3RyaW5nO1xuICBwZWVySWRlbnRpdHk6IFBlZXJJZGVudGl0eTtcbn1cbmV4cG9ydCBjbGFzcyBSZXF1ZXN0VG9Db25uRXZlbnQgZXh0ZW5kcyBDdXN0b21FdmVudDxSZXF1ZXN0VG9Db25uRXZlbnREZXRhaWw+IHtcbiAgdHlwZSA9ICdyZXF1ZXN0LXRvLWNvbm4nXG4gIHBlZXJBZGRyOiBzdHJpbmc7XG4gIGNvbnN0cnVjdG9yKGRldGFpbDogUmVxdWVzdFRvQ29ubkV2ZW50RGV0YWlsKSB7XG4gICAgc3VwZXIoZGV0YWlsKTtcbiAgICB0aGlzLnBlZXJBZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChkZXRhaWwucGVlclBhdGgpO1xuICB9XG4gIHJlamVjdCgpIHtcbiAgICB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSBmYWxzZTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgTmV3Q29ubkV2ZW50RGV0YWlsIHtcbiAgY29ubjogQ29ubjtcbiAgcGVlclBhdGg6IHN0cmluZztcbiAgcmVjb25uZWN0ZWQ6IGJvb2xlYW47XG59XG5leHBvcnQgY2xhc3MgTmV3Q29ubkV2ZW50IGV4dGVuZHMgQ3VzdG9tRXZlbnQ8TmV3Q29ubkV2ZW50RGV0YWlsPiB7XG4gIHR5cGUgPSAnbmV3LWNvbm4nXG59XG5cbmludGVyZmFjZSBFdmVudE1hcCB7XG4gICdyZXF1ZXN0LXRvLWNvbm4nOiBSZXF1ZXN0VG9Db25uRXZlbnQ7XG4gICduZXctY29ubic6IE5ld0Nvbm5FdmVudDtcbiAgJ2Nsb3NlJzogQ29ubkNsb3NlRXZlbnQ7XG4gICdyZWNlaXZlJzogTWVzc2FnZVJlY2VpdmVkRXZlbnQ7XG59XG5cbmRlY2xhcmUgbmFtZXNwYWNlIENvbm5NYW5hZ2VyIHtcbiAgaW50ZXJmYWNlIENvbmZpZyB7XG4gICAgbmV3Q29ublRpbWVvdXQ6IG51bWJlcjtcbiAgICByZXF1ZXN0VG9Db25uVGltZW91dDogbnVtYmVyO1xuICB9XG4gIGludGVyZmFjZSBDb25uZWN0T3B0cyB7XG4gICAgcGVlcklkZW50aXR5PzogUGVlcklkZW50aXR5O1xuICAgIHRpbWVvdXQ/OiBudW1iZXI7XG4gICAgYmVpbmdDb25uZWN0ZWQ/OiBib29sZWFuO1xuICAgIFtvcHQ6IHN0cmluZ106IGFueTtcbiAgfVxuICB0eXBlIENvbm5lY3RPcHRzSW1wbCA9IFJlcXVpcmVkPENvbm5lY3RPcHRzLCAndGltZW91dCc+O1xufVxuXG5jb25zdCBjb25maWdEZWZhdWx0OiBDb25uTWFuYWdlci5Db25maWcgPSB7XG4gIG5ld0Nvbm5UaW1lb3V0OiAxMDAwMCxcbiAgcmVxdWVzdFRvQ29ublRpbWVvdXQ6IDEwMDAwLFxufVxuXG5hYnN0cmFjdCBjbGFzcyBDb25uTWFuYWdlciBleHRlbmRzIEV2ZW50VGFyZ2V0PEV2ZW50TWFwPiB7XG4gIHByb3RlY3RlZCBjb25uczogUmVjb3JkPHN0cmluZywgQ29ubj4gPSB7fTtcbiAgcHJvdGVjdGVkIGNvbmZpZzogQ29ubk1hbmFnZXIuQ29uZmlnO1xuXG4gIGNvbnN0cnVjdG9yKGNvbmZpZzogUGFydGlhbDxDb25uTWFuYWdlci5Db25maWc+ID0ge30pIHtcbiAgICBzdXBlcigpO1xuICAgIHRoaXMuY29uZmlnID0geyAuLi5jb25maWdEZWZhdWx0LCAuLi5jb25maWcgfTtcbiAgfVxuXG4gIGFic3RyYWN0IHN0YXJ0KGFnZW50OiBBZ2VudCk6IFByb21pc2U8dm9pZD47XG5cbiAgY29ubmVjdChwZWVyUGF0aDogc3RyaW5nLCBvcHRzOiBDb25uTWFuYWdlci5Db25uZWN0T3B0cyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHBlZXJBZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChwZWVyUGF0aCk7XG4gICAgaWYgKHBlZXJBZGRyIGluIHRoaXMuY29ubnMpIHtcbiAgICAgIGNvbnNvbGUud2FybihgUGVlciAnJHtwZWVyQWRkcn0nIGFscmVhZHkgY29ubmVjdGVkLCBvcmlnaW5hbCBjb25uIHdpbGwgYmUgY2xvc2VkYCk7XG4gICAgfVxuICAgIGNvbnN0IHRpbWVvdXQgPSBvcHRzLmJlaW5nQ29ubmVjdGVkID8gdGhpcy5jb25maWcubmV3Q29ublRpbWVvdXQgOiB0aGlzLmNvbmZpZy5yZXF1ZXN0VG9Db25uVGltZW91dDtcbiAgICBcbiAgICBpZiAocGVlckFkZHIubWF0Y2goL153c3M/OlxcL1xcLy8pKSB7XG4gICAgICByZXR1cm4gdGhpcy5jb25uZWN0V3MocGVlclBhdGgsIHsgdGltZW91dCwgLi4ub3B0cyB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRoaXMuY29ubmVjdFVubmFtZWQocGVlclBhdGgsIHsgdGltZW91dCwgLi4ub3B0cyB9KTtcbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgYWJzdHJhY3QgY29ubmVjdFdzKHBlZXJQYXRoOiBzdHJpbmcsIG9wdHM6IENvbm5NYW5hZ2VyLkNvbm5lY3RPcHRzSW1wbCk6IFByb21pc2U8dm9pZD47XG5cbiAgcHJvdGVjdGVkIGFic3RyYWN0IGNvbm5lY3RVbm5hbWVkKHBlZXJQYXRoOiBzdHJpbmcsIG9wdHM6IENvbm5NYW5hZ2VyLkNvbm5lY3RPcHRzSW1wbCk6IFByb21pc2U8dm9pZD47XG5cbiAgY29ubkNvdW50KCk6IG51bWJlciB7XG4gICAgcmV0dXJuIE9iamVjdC5lbnRyaWVzKHRoaXMuY29ubnMpLmxlbmd0aDtcbiAgfVxuXG4gIGhhc0Nvbm4ocGVlckFkZHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIHJldHVybiBwZWVyQWRkciBpbiB0aGlzLmNvbm5zO1xuICB9XG5cbiAgc2VuZChwZWVyQWRkcjogc3RyaW5nLCBtZXNzYWdlOiBNZXNzYWdlKTogYm9vbGVhbiB7XG4gICAgY29uc3QgY29ubiA9IHRoaXMuY29ubnNbcGVlckFkZHJdO1xuICAgIGlmIChjb25uKSB7XG4gICAgICBjb25uLnNlbmQobWVzc2FnZSk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJvdGVjdGVkIGFkZENvbm4ocGVlckFkZHI6IHN0cmluZywgY29ubjogQ29ubiwgcGVlclBhdGg6IHN0cmluZyk6IHZvaWQge1xuICAgIGNvbnN0IHJlY29ubmVjdGVkID0gcGVlckFkZHIgaW4gdGhpcy5jb25ucztcbiAgICBpZiAocmVjb25uZWN0ZWQpIHtcbiAgICAgIHRoaXMuY29ubnNbcGVlckFkZHJdLmNsb3NlKCk7XG4gICAgfVxuXG4gICAgdGhpcy5jb25uc1twZWVyQWRkcl0gPSBjb25uO1xuXG4gICAgY29ubi5hZGRFdmVudExpc3RlbmVyKCdyZWNlaXZlJywgZXZlbnQgPT4ge1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICB9KTtcbiAgICBjb25uLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgZXZlbnQgPT4ge1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcbiAgICAgIGlmIChjb25uLmNvbm5JZCA9PT0gdGhpcy5jb25uc1twZWVyQWRkcl0uY29ubklkKSB7IC8vIHByZXZlbnQgcmVjb25uZWN0IGNsb3NpbmcgZGVsZXRlIG5ldyBjb25uZWN0aW9uXG4gICAgICAgIGRlbGV0ZSB0aGlzLmNvbm5zW3BlZXJBZGRyXTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuZGlzcGF0Y2hFdmVudChuZXcgTmV3Q29ubkV2ZW50KHsgY29ubiwgcGVlclBhdGgsIHJlY29ubmVjdGVkIH0pKTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25uTWFuYWdlcjtcbiIsImltcG9ydCBBZ2VudCBmcm9tICcuLi9hZ2VudCc7XG5pbXBvcnQgQ29ubk1hbmFnZXIsIHsgUmVxdWVzdFRvQ29ubkV2ZW50IH0gZnJvbSAnLi9iYXNlJztcbmltcG9ydCBXc0Nvbm4gZnJvbSAnLi4vY29ubi93cyc7XG5pbXBvcnQgUnRjQ29ubiBmcm9tICcuLi9jb25uL3J0Yyc7XG5pbXBvcnQgeyBQZWVySWRlbnRpdHkgfSBmcm9tICcuLi9taXNjL2lkZW50aXR5JztcbmltcG9ydCB7IFR1bm5lbENvbm4gfSBmcm9tICcuLi90dW5uZWwnO1xuaW1wb3J0IHsgUmVxdWVzdFRvQ29ubk1lc3NhZ2UsIG5ld1JlcXVlc3RUb0Nvbm5NZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9jb25uJztcblxuY2xhc3MgQnJvd3NlckNvbm5NYW5hZ2VyIGV4dGVuZHMgQ29ubk1hbmFnZXIge1xuICBwcml2YXRlIGFnZW50OiBBZ2VudDtcbiAgcHJpdmF0ZSBwZW5kaW5nUnRjQ29ubnM6IFJlY29yZDxzdHJpbmcsIFJ0Y0Nvbm4+ID0ge307XG5cbiAgYXN5bmMgc3RhcnQoYWdlbnQ6IEFnZW50KSB7XG4gICAgdGhpcy5hZ2VudCA9IGFnZW50O1xuICAgIHRoaXMuYWdlbnQudHVubmVsTWFuYWdlci5hZGRFdmVudExpc3RlbmVyKCduZXctdHVubmVsJywgZXZlbnQgPT4ge1xuICAgICAgY29uc3QgeyB0dW5uZWwgfSA9IGV2ZW50LmRldGFpbDtcbiAgICAgIHR1bm5lbC5hZGRFdmVudExpc3RlbmVyKCdyZWNlaXZlJywgZXZlbnQgPT4ge1xuICAgICAgICBzd2l0Y2ggKGV2ZW50LmRldGFpbC50ZXJtKSB7XG4gICAgICAgICAgY2FzZSAncmVxdWVzdFRvQ29ubic6XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5vblJlY2VpdmVSZXF1ZXN0VG9Db25uKG5ld1JlcXVlc3RUb0Nvbm5NZXNzYWdlKGV2ZW50LmRldGFpbCksIHR1bm5lbCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvblJlY2VpdmVSZXF1ZXN0VG9Db25uKG1lc3NhZ2U6IFJlcXVlc3RUb0Nvbm5NZXNzYWdlLCBjb25uVmlhOiBUdW5uZWxDb25uKSB7XG4gICAgY29uc3QgeyBzcmNQYXRoOiBwZWVyUGF0aCB9ID0gbWVzc2FnZTtcbiAgICBcbiAgICBjb25zdCBwZWVySWRlbnRpdHkgPSBuZXcgUGVlcklkZW50aXR5KHBlZXJQYXRoLCBtZXNzYWdlLnNpZ25pbmdQdWJLZXksIG1lc3NhZ2UuZW5jcnlwdGlvblB1YktleSk7XG4gICAgaWYgKGF3YWl0IHBlZXJJZGVudGl0eS52ZXJpZnkobWVzc2FnZS5zaWduYXR1cmUpKSB7XG4gICAgICBjb25zdCBldmVudCA9IG5ldyBSZXF1ZXN0VG9Db25uRXZlbnQoeyBwZWVyUGF0aCwgcGVlcklkZW50aXR5IH0pO1xuICAgICAgdGhpcy5kaXNwYXRjaEV2ZW50KGV2ZW50KTtcblxuICAgICAgaWYgKCFldmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICAgIHRoaXMuY29ubmVjdChwZWVyUGF0aCwge1xuICAgICAgICAgIG9mZmVyOiBtZXNzYWdlLm9mZmVyLFxuICAgICAgICAgIGJlaW5nQ29ubmVjdGVkOiB0cnVlLFxuICAgICAgICAgIHBlZXJJZGVudGl0eSxcbiAgICAgICAgICBjb25uVmlhLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgYXN5bmMgY29ubmVjdFdzKHBlZXJQYXRoOiBzdHJpbmcsIG9wdHM6IENvbm5NYW5hZ2VyLkNvbm5lY3RPcHRzSW1wbCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbm4gPSBuZXcgV3NDb25uKCk7XG4gICAgY29uc3QgcGVlcklkZW50aXR5ID0gbmV3IFBlZXJJZGVudGl0eShwZWVyUGF0aCk7XG4gICAgYXdhaXQgY29ubi5zdGFydExpbmsoe1xuICAgICAgbXlJZGVudGl0eTogdGhpcy5hZ2VudC5teUlkZW50aXR5LFxuICAgICAgcGVlcklkZW50aXR5LCBwZWVyUGF0aCxcbiAgICAgIC4uLm9wdHMsXG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb25uKGNvbm4ucGVlcklkZW50aXR5LmFkZHIsIGNvbm4sIHBlZXJQYXRoKTtcbiAgfVxuXG4gIHByb3RlY3RlZCBhc3luYyBjb25uZWN0VW5uYW1lZChwZWVyUGF0aDogc3RyaW5nLCBvcHRzOiBDb25uTWFuYWdlci5Db25uZWN0T3B0c0ltcGwpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBydGNDb25uID0gbmV3IFJ0Y0Nvbm4oKTtcbiAgICBjb25zdCBwZWVySWRlbnRpdHkgPSBuZXcgUGVlcklkZW50aXR5KHBlZXJQYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdSdGNDb25uc1twZWVySWRlbnRpdHkuYWRkcl0gPSBydGNDb25uO1xuICAgIGNvbnN0IGNvbm5WaWEgPSBhd2FpdCB0aGlzLmFnZW50LnR1bm5lbE1hbmFnZXIuY3JlYXRlKHBlZXJQYXRoKTtcblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBydGNDb25uLnN0YXJ0TGluayh7XG4gICAgICAgIG15SWRlbnRpdHk6IHRoaXMuYWdlbnQubXlJZGVudGl0eSxcbiAgICAgICAgcGVlcklkZW50aXR5LCBwZWVyUGF0aCwgY29ublZpYSxcbiAgICAgICAgLi4ub3B0cyxcbiAgICAgIH0pO1xuICAgICAgdGhpcy5hZGRDb25uKHBlZXJJZGVudGl0eS5hZGRyLCBydGNDb25uLCBwZWVyUGF0aCk7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBkZWxldGUgdGhpcy5wZW5kaW5nUnRjQ29ubnNbcGVlcklkZW50aXR5LmFkZHJdO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBCcm93c2VyQ29ubk1hbmFnZXI7XG4iLCJpbXBvcnQgQWdlbnQgZnJvbSAnLi4vYWdlbnQnO1xuaW1wb3J0IENvbm5NYW5hZ2VyLCB7IFJlcXVlc3RUb0Nvbm5FdmVudCB9IGZyb20gJy4vYmFzZSc7XG5pbXBvcnQgV3NDb25uIGZyb20gJy4uL2Nvbm4vd3MnO1xuaW1wb3J0IFdlYlNvY2tldCwgeyBTZXJ2ZXIgYXMgV2ViU29ja2V0U2VydmVyLCBTZXJ2ZXJPcHRpb25zIGFzIFdzU2VydmVyT3B0aW9ucyB9IGZyb20gJ3dzJztcbmltcG9ydCB7IFBlZXJJZGVudGl0eSB9IGZyb20gJy4uL21pc2MvaWRlbnRpdHknO1xuaW1wb3J0IHsgTWVzc2FnZSwgdG9NZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9tZXNzYWdlJztcbmltcG9ydCB7IG5ld1JlcXVlc3RUb0Nvbm5NZXNzYWdlLCBuZXdSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvY29ubic7XG5pbXBvcnQgeyBtYWtlUmVxdWVzdFRvQ29ubk1lc3NhZ2UsIG1ha2VSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvY29ubic7XG5pbXBvcnQgeyBleHRyYWN0QWRkckZyb21QYXRoIH0gZnJvbSAnLi4vbWlzYy91dGlscyc7XG5cbmRlY2xhcmUgbmFtZXNwYWNlIFdzc0Nvbm5NYW5hZ2VyIHtcbiAgdHlwZSBTZXJ2ZXJPcHRpb25zID0gV3NTZXJ2ZXJPcHRpb25zXG59XG5cbmNsYXNzIFdzc0Nvbm5NYW5hZ2VyIGV4dGVuZHMgQ29ubk1hbmFnZXIge1xuICBwcml2YXRlIGFnZW50OiBBZ2VudDtcbiAgcHJpdmF0ZSBzZXJ2ZXI6IFdlYlNvY2tldFNlcnZlcjtcbiAgcHJpdmF0ZSBzZXJ2ZXJPcHRzOiBXc3NDb25uTWFuYWdlci5TZXJ2ZXJPcHRpb25zO1xuXG4gIHByaXZhdGUgcGVuZGluZ1dzQ29ubnM6IFJlY29yZDxzdHJpbmcsIFdzQ29ubj4gPSB7fTtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IFBhcnRpYWw8Q29ubk1hbmFnZXIuQ29uZmlnPiA9IHt9LCBvcHRzOiBXc3NDb25uTWFuYWdlci5TZXJ2ZXJPcHRpb25zID0ge30pIHtcbiAgICBzdXBlcihjb25maWcpO1xuICAgIHRoaXMuc2VydmVyT3B0cyA9IG9wdHM7XG4gIH1cblxuICBhc3luYyBzdGFydChhZ2VudDogQWdlbnQpIHtcbiAgICB0aGlzLmFnZW50ID0gYWdlbnQ7XG5cbiAgICBjb25zdCB7IGhvc3RuYW1lLCBwb3J0IH0gPSBuZXcgVVJMKHRoaXMuYWdlbnQubXlJZGVudGl0eS5hZGRyKTtcbiAgICB0aGlzLnNlcnZlck9wdHMgPSB7XG4gICAgICBob3N0OiBob3N0bmFtZSwgcG9ydDogcGFyc2VJbnQocG9ydCksXG4gICAgICAuLi50aGlzLnNlcnZlck9wdHMsXG4gICAgfVxuXG4gICAgdGhpcy5zZXJ2ZXIgPSBuZXcgV2ViU29ja2V0U2VydmVyKHRoaXMuc2VydmVyT3B0cyk7XG5cbiAgICB0aGlzLnNlcnZlci5vbignY29ubmVjdGlvbicsICh3ZWJzb2NrZXQ6IFdlYlNvY2tldCkgPT4ge1xuICAgICAgdGhpcy5vbk5ld0Nvbm5lY3Rpb24od2Vic29ja2V0KTtcbiAgICB9KTtcbiAgfVxuXG4gIHByaXZhdGUgb25OZXdDb25uZWN0aW9uKHdzOiBXZWJTb2NrZXQpIHtcbiAgICBsZXQgb2sgPSBmYWxzZTtcbiAgICB3cy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgYXN5bmMgZXZlbnQgPT4ge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IHRvTWVzc2FnZShKU09OLnBhcnNlKGV2ZW50LmRhdGEudG9TdHJpbmcoKSkpO1xuICAgICAgc3dpdGNoIChtZXNzYWdlPy50ZXJtKSB7XG4gICAgICAgIGNhc2UgJ3JlcXVlc3RUb0Nvbm4nOlxuICAgICAgICAgIG9rID0gYXdhaXQgdGhpcy5vbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ubih3cywgbWVzc2FnZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JlcXVlc3RUb0Nvbm5SZXN1bHQnOlxuICAgICAgICAgIG9rID0gYXdhaXQgdGhpcy5vbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ublJlc3VsdCh3cywgbWVzc2FnZSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfSwgeyBvbmNlOiB0cnVlIH0pO1xuXG4gICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBpZiAoIW9rKSB7XG4gICAgICAgIGNvbnNvbGUud2FybihgV3NzQ29ubk1hbmFnZXIub25OZXdDb25uZWN0aW9uOiBuZXcgY29ubmVjdGlvbiB0aW1lb3V0YCk7XG4gICAgICAgIHdzLmNsb3NlKCk7XG4gICAgICB9XG4gICAgfSwgdGhpcy5jb25maWcubmV3Q29ublRpbWVvdXQpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvbk5ld0Nvbm5TZW50UmVxdWVzdFRvQ29ubih3czogV2ViU29ja2V0LCBtZXNzYWdlOiBNZXNzYWdlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcmVxdWVzdFRvQ29ubk1lc3NhZ2UgPSBuZXdSZXF1ZXN0VG9Db25uTWVzc2FnZShtZXNzYWdlKTtcbiAgICBpZiAocmVxdWVzdFRvQ29ubk1lc3NhZ2UpIHtcbiAgICAgIGNvbnN0IHsgc3JjUGF0aDogcGVlclBhdGggfSA9IHJlcXVlc3RUb0Nvbm5NZXNzYWdlO1xuICAgICAgY29uc3QgcGVlcklkZW50aXR5ID0gbmV3IFBlZXJJZGVudGl0eShcbiAgICAgICAgcGVlclBhdGgsXG4gICAgICAgIHJlcXVlc3RUb0Nvbm5NZXNzYWdlLnNpZ25pbmdQdWJLZXksXG4gICAgICAgIHJlcXVlc3RUb0Nvbm5NZXNzYWdlLmVuY3J5cHRpb25QdWJLZXksXG4gICAgICApO1xuXG4gICAgICBpZiAoYXdhaXQgcGVlcklkZW50aXR5LnZlcmlmeShyZXF1ZXN0VG9Db25uTWVzc2FnZS5zaWduYXR1cmUpKSB7XG4gICAgICAgIGNvbnN0IGV2ZW50ID0gbmV3IFJlcXVlc3RUb0Nvbm5FdmVudCh7IHBlZXJQYXRoLCBwZWVySWRlbnRpdHkgfSk7XG4gICAgICAgIHRoaXMuZGlzcGF0Y2hFdmVudChldmVudCk7XG5cbiAgICAgICAgaWYgKCFldmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICAgICAgaWYgKGV2ZW50LnBlZXJBZGRyLm1hdGNoKC9ed3NzPzpcXC9cXC8vKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25OZXdDb25uU2VudFJlcXVlc3RUb0Nvbm5CeVdzKHdzLCBwZWVyUGF0aCwgcGVlcklkZW50aXR5KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMub25OZXdDb25uU2VudFJlcXVlc3RUb0Nvbm5CeVVubmFtZWQod3MsIHBlZXJQYXRoLCBwZWVySWRlbnRpdHkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb25OZXdDb25uU2VudFJlcXVlc3RUb0Nvbm5CeVdzKHdzOiBXZWJTb2NrZXQsIHBlZXJQYXRoOiBzdHJpbmcsIHBlZXJJZGVudGl0eTogUGVlcklkZW50aXR5KTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgd3MuY2xvc2UoKTtcbiAgICBjb25zdCBjb25uID0gbmV3IFdzQ29ubigpO1xuICAgIGF3YWl0IGNvbm4uc3RhcnRMaW5rKHtcbiAgICAgIG15SWRlbnRpdHk6IHRoaXMuYWdlbnQubXlJZGVudGl0eSwgcGVlclBhdGgsXG4gICAgICBwZWVySWRlbnRpdHksXG4gICAgICBiZWluZ0Nvbm5lY3RlZDogdHJ1ZSxcbiAgICAgIHRpbWVvdXQ6IHRoaXMuY29uZmlnLm5ld0Nvbm5UaW1lb3V0XG4gICAgfSk7XG4gICAgdGhpcy5hZGRDb25uKHBlZXJJZGVudGl0eS5hZGRyLCBjb25uLCBwZWVyUGF0aCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIG9uTmV3Q29ublNlbnRSZXF1ZXN0VG9Db25uQnlVbm5hbWVkKHdzOiBXZWJTb2NrZXQsIHBlZXJQYXRoOiBzdHJpbmcsIHBlZXJJZGVudGl0eTogUGVlcklkZW50aXR5KTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgbWVzc2FnZSA9IGF3YWl0IG1ha2VSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSh0aGlzLmFnZW50Lm15SWRlbnRpdHksIHBlZXJQYXRoKTtcbiAgICB3cy5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcblxuICAgIGNvbnN0IGNvbm4gPSBuZXcgV3NDb25uKCk7XG4gICAgY29ubi5zdGFydEZyb21FeGlzdGluZyh3cywgeyBwZWVySWRlbnRpdHkgfSk7XG4gICAgdGhpcy5hZGRDb25uKHBlZXJJZGVudGl0eS5hZGRyLCBjb25uLCBwZWVyUGF0aCk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHByaXZhdGUgYXN5bmMgb25OZXdDb25uU2VudFJlcXVlc3RUb0Nvbm5SZXN1bHQod3M6IFdlYlNvY2tldCwgbWVzc2FnZTogTWVzc2FnZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGNvbnN0IHJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlID0gbmV3UmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UobWVzc2FnZSk7XG4gICAgaWYgKHJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKSB7XG4gICAgICBjb25zdCB7IHNyY1BhdGg6IHBlZXJQYXRoIH0gPSByZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZTtcbiAgICAgIGNvbnN0IHBlZXJBZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChwZWVyUGF0aCk7XG4gICAgICBjb25zdCBjb25uID0gdGhpcy5wZW5kaW5nV3NDb25uc1twZWVyQWRkcl07XG5cbiAgICAgIGlmIChjb25uKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnBlbmRpbmdXc0Nvbm5zW3BlZXJBZGRyXTtcblxuICAgICAgICBjb25uLnBlZXJJZGVudGl0eS5zZXRTaWduaW5nUHViS2V5KHJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlLnNpZ25pbmdQdWJLZXkpO1xuICAgICAgICBjb25uLnBlZXJJZGVudGl0eS5zZXRFbmNyeXB0aW9uUHViS2V5KHJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlLmVuY3J5cHRpb25QdWJLZXkpO1xuXG4gICAgICAgIGlmIChhd2FpdCBjb25uLnBlZXJJZGVudGl0eS52ZXJpZnkocmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2Uuc2lnbmF0dXJlKSkge1xuICAgICAgICAgIGNvbm4uc3RhcnRGcm9tRXhpc3Rpbmcod3MsIHt9KTtcbiAgICAgICAgICB0aGlzLmFkZENvbm4ocGVlckFkZHIsIGNvbm4sIHBlZXJQYXRoKTtcblxuICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJvdGVjdGVkIGFzeW5jIGNvbm5lY3RXcyhwZWVyUGF0aDogc3RyaW5nLCBfb3B0czogQ29ubk1hbmFnZXIuQ29ubmVjdE9wdHNJbXBsKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgY29ubiA9IG5ldyBXc0Nvbm4oKTtcbiAgICBjb25zdCBwZWVySWRlbnRpdHkgPSBuZXcgUGVlcklkZW50aXR5KHBlZXJQYXRoKTtcbiAgICB0aGlzLnBlbmRpbmdXc0Nvbm5zW3BlZXJJZGVudGl0eS5hZGRyXSA9IGNvbm47XG5cbiAgICBjb25uLnN0YXJ0TGluayh7XG4gICAgICBteUlkZW50aXR5OiB0aGlzLmFnZW50Lm15SWRlbnRpdHksIHBlZXJQYXRoLFxuICAgICAgcGVlcklkZW50aXR5LFxuICAgICAgd2FpdEZvcldzOiB0cnVlLFxuICAgICAgdGltZW91dDogdGhpcy5jb25maWcucmVxdWVzdFRvQ29ublRpbWVvdXQsXG4gICAgfSk7XG5cbiAgICBjb25zdCB3cyA9IG5ldyBXZWJTb2NrZXQocGVlcklkZW50aXR5LmFkZHIpO1xuICAgIHdzLm9ub3BlbiA9IGFzeW5jICgpID0+IHtcbiAgICAgIHdzLnNlbmQoSlNPTi5zdHJpbmdpZnkoYXdhaXQgbWFrZVJlcXVlc3RUb0Nvbm5NZXNzYWdlKHRoaXMuYWdlbnQubXlJZGVudGl0eSwgcGVlclBhdGgpKSk7XG4gICAgfTtcblxuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgd3MuY2xvc2UoKTtcbiAgICB9LCB0aGlzLmNvbmZpZy5yZXF1ZXN0VG9Db25uVGltZW91dCk7XG4gIH1cblxuICBwcm90ZWN0ZWQgYXN5bmMgY29ubmVjdFVubmFtZWQocGVlclBhdGg6IHN0cmluZywgX29wdHM6IENvbm5NYW5hZ2VyLkNvbm5lY3RPcHRzSW1wbCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IGNvbm4gPSBuZXcgV3NDb25uKCk7XG4gICAgY29uc3QgcGVlcklkZW50aXR5ID0gbmV3IFBlZXJJZGVudGl0eShwZWVyUGF0aCk7XG4gICAgdGhpcy5wZW5kaW5nV3NDb25uc1twZWVySWRlbnRpdHkuYWRkcl0gPSBjb25uO1xuXG4gICAgY29uc3Qgc3RhcnRMaW5rUHJvbWlzZSA9IGNvbm4uc3RhcnRMaW5rKHtcbiAgICAgIG15SWRlbnRpdHk6IHRoaXMuYWdlbnQubXlJZGVudGl0eSwgcGVlclBhdGgsXG4gICAgICBwZWVySWRlbnRpdHksXG4gICAgICB0aW1lb3V0OiB0aGlzLmNvbmZpZy5yZXF1ZXN0VG9Db25uVGltZW91dCxcbiAgICAgIHdhaXRGb3JXczogdHJ1ZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IGNvbm5WaWEgPSBhd2FpdCB0aGlzLmFnZW50LnR1bm5lbE1hbmFnZXIuY3JlYXRlKHBlZXJQYXRoKTtcbiAgICBjb25uVmlhLnNlbmQoYXdhaXQgbWFrZVJlcXVlc3RUb0Nvbm5NZXNzYWdlKHRoaXMuYWdlbnQubXlJZGVudGl0eSwgcGVlclBhdGgpKTtcblxuICAgIGF3YWl0IHN0YXJ0TGlua1Byb21pc2U7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgV3NzQ29ubk1hbmFnZXI7XG4iLCJpbXBvcnQgRXZlbnRUYXJnZXQsIHsgQ3VzdG9tRXZlbnQgfSBmcm9tICcuLi9taXNjL2V2ZW50LXRhcmdldCc7XG5pbXBvcnQgSWRlbnRpdHksIHsgUGVlcklkZW50aXR5IH0gZnJvbSAnLi4vbWlzYy9pZGVudGl0eSc7XG5pbXBvcnQgeyBNZXNzYWdlLCB0b01lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL21lc3NhZ2UnO1xuaW1wb3J0IHsgcmFuZG9tU3RyIH0gZnJvbSAnLi4vbWlzYy91dGlscyc7XG5pbXBvcnQgeyBleHRyYWN0QWRkckZyb21QYXRoIH0gZnJvbSAnLi4vbWlzYy91dGlscyc7XG5cbmV4cG9ydCBjbGFzcyBNZXNzYWdlUmVjZWl2ZWRFdmVudCBleHRlbmRzIEN1c3RvbUV2ZW50PE1lc3NhZ2U+IHtcbiAgdHlwZSA9ICdyZWNlaXZlJztcbiAgZnJvbUNvbm46IENvbm47XG4gIHNyY0FkZHI6IHN0cmluZztcbiAgZGVzQWRkcjogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKGZyb21Db25uOiBDb25uLCBkZXRhaWw6IE1lc3NhZ2UpIHtcbiAgICBzdXBlcihkZXRhaWwpO1xuICAgIHRoaXMuZnJvbUNvbm4gPSBmcm9tQ29ubjtcbiAgICB0aGlzLnNyY0FkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKGRldGFpbC5zcmNQYXRoKTtcbiAgICB0aGlzLmRlc0FkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKGRldGFpbC5kZXNQYXRoKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgQ2xvc2VFdmVudERldGFpbCB7XG4gIGNvbm46IENvbm47XG4gIGJ5U2VsZjogYm9vbGVhbjtcbiAgd3NFdmVudD86IENsb3NlRXZlbnRcbn1cblxuZXhwb3J0IGNsYXNzIENvbm5DbG9zZUV2ZW50IGV4dGVuZHMgQ3VzdG9tRXZlbnQ8Q2xvc2VFdmVudERldGFpbD4ge1xuICB0eXBlID0gJ2Nsb3NlJ1xufVxuXG5pbnRlcmZhY2UgQ29ubkV2ZW50TWFwIHtcbiAgJ3JlY2VpdmUnOiBNZXNzYWdlUmVjZWl2ZWRFdmVudDtcbiAgJ2Nsb3NlJzogQ29ubkNsb3NlRXZlbnQ7XG59XG5cbmRlY2xhcmUgbmFtZXNwYWNlIENvbm4ge1xuICBpbnRlcmZhY2UgU3RhcnRMaW5rT3B0cyB7XG4gICAgbXlJZGVudGl0eTogSWRlbnRpdHk7XG4gICAgcGVlcklkZW50aXR5PzogUGVlcklkZW50aXR5O1xuICAgIHBlZXJQYXRoOiBzdHJpbmc7XG4gICAgdGltZW91dDogbnVtYmVyO1xuICAgIGJlaW5nQ29ubmVjdGVkPzogYm9vbGVhbjtcbiAgfVxuXG4gIGV4cG9ydCBjb25zdCBlbnVtIFN0YXRlIHtcbiAgICBOT1RfQ09OTkVDVEVEID0gJ05PVF9DT05ORUNURUQnLFxuICAgIENPTk5FQ1RFRCA9ICdDT05ORUNURUQnLFxuICAgIEZBSUxFRCA9ICdGQUlMRUQnLFxuICAgIENMT1NFRCA9ICdDTE9TRUQnLFxuICB9XG59XG5cbmFic3RyYWN0IGNsYXNzIENvbm4gZXh0ZW5kcyBFdmVudFRhcmdldDxDb25uRXZlbnRNYXA+IHtcbiAgY29ubklkOiBzdHJpbmc7IC8vIHByZXNlcnZlZCwgbWlnaHQgYmUgdXNlZnVsIGluIHRoZSBmdXR1cmUsIGRpZmZlcmVuY2UgYmV0d2VlbiAyIHNpZGVcbiAgcGVlcklkZW50aXR5OiBQZWVySWRlbnRpdHk7XG4gIHN0YXRlOiBDb25uLlN0YXRlID0gQ29ubi5TdGF0ZS5OT1RfQ09OTkVDVEVEO1xuXG4gIGNvbnN0cnVjdG9yKGNvbm5JZD86IHN0cmluZykge1xuICAgIHN1cGVyKCk7XG4gICAgdGhpcy5jb25uSWQgPSBjb25uSWQgfHwgcmFuZG9tU3RyKCk7XG4gIH1cblxuICBhYnN0cmFjdCBzdGFydExpbmsob3B0czogQ29ubi5TdGFydExpbmtPcHRzIHwge1tfOiBzdHJpbmddOiBhbnl9KTogUHJvbWlzZTx2b2lkPjtcblxuICBhYnN0cmFjdCBjbG9zZSgpOiBQcm9taXNlPHZvaWQ+O1xuXG4gIGFic3RyYWN0IHNlbmQobWVzc2FnZTogTWVzc2FnZSk6IHZvaWQ7XG5cbiAgcHJvdGVjdGVkIG9uTWVzc2FnZURhdGEoZGF0YTogc3RyaW5nKSB7XG4gICAgY29uc3QgbWVzc2FnZUNvbnRlbnQgPSB0b01lc3NhZ2UoSlNPTi5wYXJzZShkYXRhKSk7XG4gICAgaWYgKG1lc3NhZ2VDb250ZW50KSB7XG4gICAgICB0aGlzLmRpc3BhdGNoRXZlbnQobmV3IE1lc3NhZ2VSZWNlaXZlZEV2ZW50KHRoaXMsIG1lc3NhZ2VDb250ZW50KSlcbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgb25DbG9zZShkZXRhaWw6IENsb3NlRXZlbnREZXRhaWwpIHtcbiAgICB0aGlzLmRpc3BhdGNoRXZlbnQobmV3IENvbm5DbG9zZUV2ZW50KGRldGFpbCkpO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IENvbm47XG4iLCJpbXBvcnQgQ29ubiBmcm9tICcuL2Jhc2UnO1xuaW1wb3J0IElkZW50aXR5LCB7IFBlZXJJZGVudGl0eSB9IGZyb20gJy4uL21pc2MvaWRlbnRpdHknO1xuaW1wb3J0IHsgTWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvbWVzc2FnZSc7XG5pbXBvcnQgeyBSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSwgbmV3UmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UsIFJ0Y0ljZU1lc3NhZ2UsIG5ld1J0Y0ljZU1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL2Nvbm4nO1xuaW1wb3J0IHsgbWFrZVJlcXVlc3RUb0Nvbm5NZXNzYWdlLCBtYWtlUmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UgfSBmcm9tICcuLi9tZXNzYWdlL2Nvbm4nO1xuaW1wb3J0IHsgVHVubmVsQ29ubiB9IGZyb20gJy4uL3R1bm5lbCc7XG5cbmNvbnN0IERBVEFfQ0hBTk5FTF9OQU1FID0gJ2RhdGEnO1xuXG5kZWNsYXJlIG5hbWVzcGFjZSBSdGNDb25uIHtcbiAgaW50ZXJmYWNlIFN0YXJ0TGlua09wdHMgZXh0ZW5kcyBDb25uLlN0YXJ0TGlua09wdHMge1xuICAgIGNvbm5WaWE6IFR1bm5lbENvbm47XG4gICAgb2ZmZXI/OiBSVENTZXNzaW9uRGVzY3JpcHRpb247XG4gIH1cbn1cblxuY2xhc3MgUnRjQ29ubiBleHRlbmRzIENvbm4ge1xuICBwcml2YXRlIHJ0Y0Nvbm46IFJUQ1BlZXJDb25uZWN0aW9uO1xuICBwcml2YXRlIHJ0Y0RhdGFDaGFubmVsOiBSVENEYXRhQ2hhbm5lbDtcbiAgXG4gIHByaXZhdGUgc3RhcnRMaW5rUmVzb2x2ZTogKCkgPT4gdm9pZDtcbiAgcHJpdmF0ZSBzdGFydExpbmtSZWplY3Q6IChlcnI6IEVycm9yKSA9PiB2b2lkO1xuICBwcml2YXRlIHBlbmRpbmdNZXNzYWdlczogc3RyaW5nW10gPSBbXTtcblxuICBwcml2YXRlIHBlbmRpbmdJY2U6IFJUQ0ljZUNhbmRpZGF0ZVtdID0gW107XG4gIHByaXZhdGUgcGVuZGluZ1JlY2VpdmVkSWNlOiBSVENJY2VDYW5kaWRhdGVbXSA9IFtdO1xuXG4gIGNvbnN0cnVjdG9yKHJ0Y0NvbmZpZzogUlRDQ29uZmlndXJhdGlvbiA9IHt9KSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLnJ0Y0Nvbm4gPSBuZXcgUlRDUGVlckNvbm5lY3Rpb24ocnRjQ29uZmlnKTtcbiAgICB0aGlzLnJ0Y0Nvbm4ub25kYXRhY2hhbm5lbCA9ICh7IGNoYW5uZWwgfSkgPT4gdGhpcy5zZXR1cENoYW5uZWwoY2hhbm5lbCk7XG4gICAgdGhpcy5ydGNDb25uLm9uaWNlY29ubmVjdGlvbnN0YXRlY2hhbmdlID0gKCkgPT4ge1xuICAgICAgdGhpcy5jaGVja1J0Y0Nvbm5TdGF0ZSgpO1xuICAgIH07XG5cbiAgICAod2luZG93IGFzIGFueSkucnRjID0gdGhpcy5ydGNDb25uO1xuICB9XG5cbiAgc3RhcnRMaW5rKG9wdHM6IFJ0Y0Nvbm4uU3RhcnRMaW5rT3B0cyk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHsgbXlJZGVudGl0eSwgcGVlclBhdGgsIGNvbm5WaWEsIGJlaW5nQ29ubmVjdGVkLCB0aW1lb3V0LCBvZmZlciB9ID0gb3B0cztcbiAgICB0aGlzLnBlZXJJZGVudGl0eSA9IG9wdHMucGVlcklkZW50aXR5IHx8IG5ldyBQZWVySWRlbnRpdHkocGVlclBhdGgpO1xuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICB0aGlzLnN0YXJ0TGlua1Jlc29sdmUgPSByZXNvbHZlO1xuICAgICAgdGhpcy5zdGFydExpbmtSZWplY3QgPSByZWplY3Q7XG4gICAgICB0aGlzLnNldHVwQ29ublZpYShjb25uVmlhKTtcbiAgICAgIHRoaXMuc2V0dXBJY2VDYW5kaWRhdGUoY29ublZpYSk7XG5cbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAodGhpcy5zdGF0ZSAhPT0gQ29ubi5TdGF0ZS5DT05ORUNURUQpIHtcbiAgICAgICAgICB0aGlzLnN0YXJ0TGlua1JlamVjdChuZXcgRXJyb3IoYGNvbm4vcnRjLnRzOiBzdGFydExpbms6IGNvbm5lY3RpbmcgdG8gJHt0aGlzLnBlZXJJZGVudGl0eS5hZGRyfSB0aW1lb3V0YCkpO1xuICAgICAgICB9XG4gICAgICB9LCB0aW1lb3V0KTtcblxuICAgICAgaWYgKGJlaW5nQ29ubmVjdGVkKSB7XG4gICAgICAgIHRoaXMucnRjQW5zd2VyaW5nRmxvdyhwZWVyUGF0aCwgbXlJZGVudGl0eSwgY29ublZpYSwgb2ZmZXIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5ydGNPZmZlcmluZ0Zsb3cocGVlclBhdGgsIG15SWRlbnRpdHksIGNvbm5WaWEpO1xuICAgICAgfVxuICAgIH0pXG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJ0Y09mZmVyaW5nRmxvdyhwZWVyUGF0aDogc3RyaW5nLCBteUlkZW50aXR5OiBJZGVudGl0eSwgY29ublZpYTogVHVubmVsQ29ubikge1xuICAgIHRoaXMuc2V0dXBDaGFubmVsKHRoaXMucnRjQ29ubi5jcmVhdGVEYXRhQ2hhbm5lbChEQVRBX0NIQU5ORUxfTkFNRSkpO1xuXG4gICAgYXdhaXQgdGhpcy5ydGNDb25uLnNldExvY2FsRGVzY3JpcHRpb24oYXdhaXQgdGhpcy5ydGNDb25uLmNyZWF0ZU9mZmVyKCkpO1xuICAgIGNvbnN0IG9mZmVyID0gdGhpcy5ydGNDb25uLmxvY2FsRGVzY3JpcHRpb247XG5cbiAgICBjb25zdCBtZXNzYWdlID0gYXdhaXQgbWFrZVJlcXVlc3RUb0Nvbm5NZXNzYWdlKG15SWRlbnRpdHksIHBlZXJQYXRoLCBvZmZlcik7XG4gICAgY29ublZpYS5zZW5kKG1lc3NhZ2UpO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBydGNBbnN3ZXJpbmdGbG93KHBlZXJQYXRoOiBzdHJpbmcsIG15SWRlbnRpdHk6IElkZW50aXR5LCBjb25uVmlhOiBUdW5uZWxDb25uLCBvZmZlcjogUlRDU2Vzc2lvbkRlc2NyaXB0aW9uKSB7XG4gICAgYXdhaXQgdGhpcy5ydGNDb25uLnNldFJlbW90ZURlc2NyaXB0aW9uKG9mZmVyKTtcbiAgICBhd2FpdCB0aGlzLnJ0Y0Nvbm4uc2V0TG9jYWxEZXNjcmlwdGlvbihhd2FpdCB0aGlzLnJ0Y0Nvbm4uY3JlYXRlQW5zd2VyKCkpO1xuICAgIGNvbnN0IGFuc3dlciA9IHRoaXMucnRjQ29ubi5sb2NhbERlc2NyaXB0aW9uO1xuXG4gICAgY29uc3QgbWVzc2FnZSA9IGF3YWl0IG1ha2VSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZShteUlkZW50aXR5LCBwZWVyUGF0aCwgYW5zd2VyKTtcbiAgICBjb25uVmlhLnNlbmQobWVzc2FnZSk7XG4gIH1cblxuICBwcml2YXRlIHNldHVwQ29ublZpYShjb25uVmlhOiBUdW5uZWxDb25uKSB7XG4gICAgY29ublZpYS5hZGRFdmVudExpc3RlbmVyKCdyZWNlaXZlJywgZXZlbnQgPT4ge1xuICAgICAgc3dpdGNoIChldmVudC5kZXRhaWwudGVybSkge1xuICAgICAgICBjYXNlICdyZXF1ZXN0VG9Db25uUmVzdWx0JzpcbiAgICAgICAgICByZXR1cm4gdGhpcy5vblJlY2VpdmVSZXF1ZXN0VG9Db25uUmVzdWx0KFxuICAgICAgICAgICAgbmV3UmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UoZXZlbnQuZGV0YWlsKSxcbiAgICAgICAgICAgIGNvbm5WaWEsXG4gICAgICAgICAgKTtcbiAgICAgICAgY2FzZSAncnRjSWNlJzpcbiAgICAgICAgICByZXR1cm4gdGhpcy5vblJlY2VpdmVSdGNJY2UoXG4gICAgICAgICAgICBuZXdSdGNJY2VNZXNzYWdlKGV2ZW50LmRldGFpbClcbiAgICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBvblJlY2VpdmVSZXF1ZXN0VG9Db25uUmVzdWx0KG1lc3NhZ2U6IFJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlLCBjb25uVmlhOiBUdW5uZWxDb25uKSB7XG4gICAgdGhpcy5wZWVySWRlbnRpdHkuc2V0U2lnbmluZ1B1YktleShtZXNzYWdlLnNpZ25pbmdQdWJLZXkpO1xuICAgIHRoaXMucGVlcklkZW50aXR5LnNldEVuY3J5cHRpb25QdWJLZXkobWVzc2FnZS5lbmNyeXB0aW9uUHViS2V5KTtcblxuICAgIGlmIChhd2FpdCB0aGlzLnBlZXJJZGVudGl0eS52ZXJpZnkobWVzc2FnZS5zaWduYXR1cmUpKSB7XG4gICAgICBhd2FpdCB0aGlzLnJ0Y0Nvbm4uc2V0UmVtb3RlRGVzY3JpcHRpb24obWVzc2FnZS5hbnN3ZXIpO1xuXG4gICAgICBpZiAodGhpcy5wZW5kaW5nUmVjZWl2ZWRJY2UubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLnBlbmRpbmdSZWNlaXZlZEljZS5mb3JFYWNoKGljZSA9PiB7XG4gICAgICAgICAgdGhpcy5ydGNDb25uLmFkZEljZUNhbmRpZGF0ZShpY2UpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIGlmICh0aGlzLnBlbmRpbmdJY2UubGVuZ3RoID4gMCkge1xuICAgICAgICB0aGlzLnBlbmRpbmdJY2UuZm9yRWFjaChpY2UgPT4ge1xuICAgICAgICAgIGNvbm5WaWEuc2VuZCh7IHRlcm06ICdydGNJY2UnLCBpY2UgfSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBjb25zb2xlLmVycm9yKGBwZWVySWRlbnRpdHkgJyR7dGhpcy5wZWVySWRlbnRpdHkuYWRkcn0nIHZlcmlmaWNhdGlvbiBmYWlsZWRgKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIG9uUmVjZWl2ZVJ0Y0ljZShtZXNzYWdlOiBSdGNJY2VNZXNzYWdlKSB7XG4gICAgY29uc3QgaWNlID0gbWVzc2FnZS5pY2U7XG4gICAgaWYgKHRoaXMucnRjQ29ubi5yZW1vdGVEZXNjcmlwdGlvbikge1xuICAgICAgdGhpcy5ydGNDb25uLmFkZEljZUNhbmRpZGF0ZShpY2UpO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnBlbmRpbmdSZWNlaXZlZEljZS5wdXNoKGljZSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzZXR1cEljZUNhbmRpZGF0ZShjb25uVmlhOiBUdW5uZWxDb25uKSB7XG4gICAgdGhpcy5ydGNDb25uLm9uaWNlY2FuZGlkYXRlID0gKHsgY2FuZGlkYXRlIH0pID0+IHtcbiAgICAgIGlmIChjYW5kaWRhdGUpIHtcbiAgICAgICAgaWYgKHRoaXMucnRjQ29ubi5yZW1vdGVEZXNjcmlwdGlvbikge1xuICAgICAgICAgIGNvbm5WaWEuc2VuZCh7IHRlcm06ICdydGNJY2UnLCBpY2U6IGNhbmRpZGF0ZSB9KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLnBlbmRpbmdJY2UucHVzaChjYW5kaWRhdGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgc2V0dXBDaGFubmVsKGNoYW5uZWw6IFJUQ0RhdGFDaGFubmVsKSB7XG4gICAgY2hhbm5lbC5vbm9wZW4gPSAoKSA9PiB7XG4gICAgICBzd2l0Y2ggKGNoYW5uZWwubGFiZWwpIHtcbiAgICAgICAgY2FzZSBEQVRBX0NIQU5ORUxfTkFNRTpcbiAgICAgICAgICB0aGlzLnJ0Y0RhdGFDaGFubmVsID0gY2hhbm5lbDtcbiAgICAgICAgICB0aGlzLnJ0Y0RhdGFDaGFubmVsLm9ubWVzc2FnZSA9ICh7IGRhdGEgfSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wZW5kaW5nTWVzc2FnZXMucHVzaChkYXRhLnRvU3RyaW5nKCkpO1xuICAgICAgICAgIH07XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICB0aGlzLmNoZWNrUnRjQ29ublN0YXRlKCk7XG4gICAgfTtcbiAgfVxuXG4gIHByaXZhdGUgY2hlY2tSdGNDb25uU3RhdGUoKSB7XG4gICAgaWYgKHRoaXMuc3RhdGUgPT09IENvbm4uU3RhdGUuTk9UX0NPTk5FQ1RFRCkge1xuICAgICAgaWYgKFxuICAgICAgICBbJ2Nvbm5lY3RlZCcsICdjb21wbGV0ZWQnXS5pbmRleE9mKFxuICAgICAgICAgIHRoaXMucnRjQ29ubi5pY2VDb25uZWN0aW9uU3RhdGVcbiAgICAgICAgKSA+PSAwICYmXG4gICAgICAgIHRoaXMucnRjRGF0YUNoYW5uZWwgJiZcbiAgICAgICAgdGhpcy5ydGNEYXRhQ2hhbm5lbC5yZWFkeVN0YXRlID09PSAnb3BlbidcbiAgICAgICkge1xuICAgICAgICB0aGlzLmZpbmlzaFN0YXJ0aW5nKCk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0aGlzLnJ0Y0Nvbm4uaWNlQ29ubmVjdGlvblN0YXRlID09PSAnZmFpbGVkJ1xuICAgICAgKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBDb25uLlN0YXRlLkZBSUxFRDtcbiAgICAgICAgdGhpcy5zdGFydExpbmtSZWplY3QobmV3IEVycm9yKGBjb25uL3J0Yy50czogY2hlY2tSdGNDb25uU3RhdGU6IGNvbm5lY3RpbmcgdG8gJHt0aGlzLnBlZXJJZGVudGl0eS5hZGRyfSBJQ0Ugc3RhdGUgZmFpbGVkYCkpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gQ29ubi5TdGF0ZS5DT05ORUNURUQpIHtcbiAgICAgIGlmIChcbiAgICAgICAgWydkaXNjb25uZWN0ZWQnLCAnY2xvc2VkJywgJ2ZhaWxlZCddLmluZGV4T2YoXG4gICAgICAgICAgdGhpcy5ydGNDb25uLmljZUNvbm5lY3Rpb25TdGF0ZVxuICAgICAgICApID49IDBcbiAgICAgICkge1xuICAgICAgICB0aGlzLnN0YXRlID0gQ29ubi5TdGF0ZS5DTE9TRUQ7XG4gICAgICAgIHRoaXMub25DbG9zZSh7IGNvbm46IHRoaXMsIGJ5U2VsZjogZmFsc2UgfSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBmaW5pc2hTdGFydGluZygpIHtcbiAgICB0aGlzLnN0YXRlID0gQ29ubi5TdGF0ZS5DT05ORUNURUQ7XG4gICAgdGhpcy5ydGNEYXRhQ2hhbm5lbC5vbm1lc3NhZ2UgPSAoeyBkYXRhIH0pID0+IHtcbiAgICAgIHRoaXMub25NZXNzYWdlRGF0YShkYXRhKTtcbiAgICB9XG4gICAgdGhpcy5zdGFydExpbmtSZXNvbHZlKCk7XG4gICAgcXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuICAgICAgdGhpcy5wZW5kaW5nTWVzc2FnZXMuZm9yRWFjaChtc2cgPT4ge1xuICAgICAgICB0aGlzLm9uTWVzc2FnZURhdGEobXNnKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG5cbiAgYXN5bmMgc2VuZChtZXNzYWdlOiBNZXNzYWdlKSB7XG4gICAgdGhpcy5ydGNEYXRhQ2hhbm5lbC5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgfVxuXG4gIGFzeW5jIGNsb3NlKCkge1xuICAgIHRoaXMucnRjQ29ubi5jbG9zZSgpO1xuICAgIHRoaXMub25DbG9zZSh7IGNvbm46IHRoaXMsIGJ5U2VsZjogdHJ1ZSB9KTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBSdGNDb25uO1xuIiwiaW1wb3J0IENvbm4gZnJvbSAnLi9iYXNlJ1xuaW1wb3J0IElkZW50aXR5LCB7IFBlZXJJZGVudGl0eSB9IGZyb20gJy4uL21pc2MvaWRlbnRpdHknO1xuaW1wb3J0IHsgTWVzc2FnZSB9IGZyb20gJy4uL21lc3NhZ2UvbWVzc2FnZSc7XG5pbXBvcnQgeyB0b1JlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9jb25uJztcbmltcG9ydCB7IG1ha2VSZXF1ZXN0VG9Db25uTWVzc2FnZSwgbWFrZVJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9jb25uJztcblxuaW1wb3J0IE5vZGVXZWJTb2NrZXQgZnJvbSAnd3MnO1xuLy8gaW1wb3J0aW5nICd3cycgbm9kZV9tb2R1bGVzIHdoZW4gdGFyZ2V0aW5nIGJyb3dzZXIgd2lsbCBvbmx5IGdldCBhIGZ1bmN0aW9uIHRoYXQgdGhyb3cgZXJyb3I6IHdzIGRvZXMgbm90IHdvcmsgaW4gdGhlIGJyb3dzZXJcblxuY29uc3QgV2ViU29ja2V0ID0gdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyBOb2RlV2ViU29ja2V0IDogd2luZG93LldlYlNvY2tldDtcblxudHlwZSBXcyA9IFdlYlNvY2tldCB8IE5vZGVXZWJTb2NrZXQ7XG50eXBlIE1zZ0V2ZW50ID0gTWVzc2FnZUV2ZW50IHwgTm9kZVdlYlNvY2tldC5NZXNzYWdlRXZlbnQ7XG5cbmRlY2xhcmUgbmFtZXNwYWNlIFdzQ29ubiB7XG4gIGludGVyZmFjZSBTdGFydExpbmtPcHRzIGV4dGVuZHMgQ29ubi5TdGFydExpbmtPcHRzIHtcbiAgICB3YWl0Rm9yV3M/OiBib29sZWFuO1xuICB9XG59XG5cbmNsYXNzIFdzQ29ubiBleHRlbmRzIENvbm4ge1xuICBwcml2YXRlIHdzOiBXcztcblxuICBwcml2YXRlIGNvbm5TdGFydFJlc29sdmU6ICgpID0+IHZvaWQgPSAoKSA9PiB7fTtcbiAgcHJpdmF0ZSBjb25uU3RhcnRSZWplY3Q6IChlcnI6IEVycm9yKSA9PiB2b2lkID0gKCkgPT4ge307XG4gIHByaXZhdGUgcGVuZGluZ01lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuICBwcml2YXRlIGNsb3Npbmc6IGJvb2xlYW4gPSBmYWxzZTtcblxuICBzdGFydExpbmsob3B0czogV3NDb25uLlN0YXJ0TGlua09wdHMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgdGhpcy5wZWVySWRlbnRpdHkgPSBvcHRzLnBlZXJJZGVudGl0eSB8fCBuZXcgUGVlcklkZW50aXR5KG9wdHMucGVlclBhdGgpO1xuICAgICAgdGhpcy5jb25uU3RhcnRSZXNvbHZlID0gcmVzb2x2ZTtcbiAgICAgIHRoaXMuY29ublN0YXJ0UmVqZWN0ID0gKCkgPT4ge1xuICAgICAgICB0aGlzLnN0YXRlID0gQ29ubi5TdGF0ZS5GQUlMRUQ7XG4gICAgICAgIHJlamVjdCgpO1xuICAgICAgfTtcblxuICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIGlmICh0aGlzLnN0YXRlICE9PSBDb25uLlN0YXRlLkNPTk5FQ1RFRCkge1xuICAgICAgICAgIHRoaXMuY29ublN0YXJ0UmVqZWN0KG5ldyBFcnJvcihgY29ubi93cy50czogc3RhcnRMaW5rOiBjb25uZWN0aW5nIHRvICR7dGhpcy5wZWVySWRlbnRpdHkuYWRkcn0gdGltZW91dGApKTtcbiAgICAgICAgfVxuICAgICAgfSwgb3B0cy50aW1lb3V0KTtcblxuICAgICAgaWYgKG9wdHMud2FpdEZvcldzKSByZXR1cm47XG5cbiAgICAgIHRoaXMud3MgPSBuZXcgV2ViU29ja2V0KHRoaXMucGVlcklkZW50aXR5LmFkZHIpO1xuXG4gICAgICB0aGlzLndzLm9uZXJyb3IgPSAoZXJyb3I6IGFueSkgPT4ge1xuICAgICAgICBjb25zb2xlLmVycm9yKCd3cy50czogd3Mub25lcnJvcicsIGVycm9yKTtcbiAgICAgICAgdGhpcy5jb25uU3RhcnRSZWplY3QobmV3IEVycm9yKGBjb25uL3dzLnRzOiBzdGFydExpbms6IGNvbm5lY3RpbmcgdG8gJHt0aGlzLnBlZXJJZGVudGl0eS5hZGRyfSBmYWlsZWQsIHdzIGVycm9yYCkpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3B0cy5iZWluZ0Nvbm5lY3RlZCkge1xuICAgICAgICAvLyBiZWluZyBjb25uZWN0ZWQgZnJvbSB3c3MgLT4gYnJvd3Nlcjogd3NzIGFzayBicm93c2VyIHRvIGNvbm5lY3RcbiAgICAgICAgdGhpcy5iZWluZ0Nvbm5lY3RpbmdGbG93KG9wdHMucGVlclBhdGgsIG9wdHMubXlJZGVudGl0eSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmNvbm5lY3RpbmdGbG93KG9wdHMucGVlclBhdGgsIG9wdHMubXlJZGVudGl0eSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGJlaW5nQ29ubmVjdGluZ0Zsb3cocGVlclBhdGg6IHN0cmluZywgbXlJZGVudGl0eTogSWRlbnRpdHkpIHtcbiAgICB0aGlzLndzLm9ub3BlbiA9IGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IG1lc3NhZ2UgPSBhd2FpdCBtYWtlUmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UobXlJZGVudGl0eSwgcGVlclBhdGgpO1xuICAgICAgdGhpcy53cy5zZW5kKEpTT04uc3RyaW5naWZ5KG1lc3NhZ2UpKTtcbiAgICAgIHRoaXMuZmluaXNoU3RhcnRpbmcoKTtcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBjb25uZWN0aW5nRmxvdyhwZWVyUGF0aDogc3RyaW5nLCBteUlkZW50aXR5OiBJZGVudGl0eSkge1xuICAgIHRoaXMud3Mub25tZXNzYWdlID0gYXN5bmMgKG1lc3NhZ2U6IE1zZ0V2ZW50KSA9PiB7XG4gICAgICB0aGlzLndzLm9ubWVzc2FnZSA9IChtZXNzYWdlOiBNc2dFdmVudCkgPT4ge1xuICAgICAgICB0aGlzLnBlbmRpbmdNZXNzYWdlcy5wdXNoKG1lc3NhZ2UuZGF0YS50b1N0cmluZygpKTtcbiAgICAgIH07XG4gICAgICBjb25zdCByZXN1bHRNc2cgPSB0b1JlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKEpTT04ucGFyc2UobWVzc2FnZS5kYXRhLnRvU3RyaW5nKCkpKTtcblxuICAgICAgdGhpcy5wZWVySWRlbnRpdHkuc2V0U2lnbmluZ1B1YktleShyZXN1bHRNc2cuc2lnbmluZ1B1YktleSk7XG4gICAgICB0aGlzLnBlZXJJZGVudGl0eS5zZXRFbmNyeXB0aW9uUHViS2V5KHJlc3VsdE1zZy5lbmNyeXB0aW9uUHViS2V5KTtcblxuICAgICAgaWYgKGF3YWl0IHRoaXMucGVlcklkZW50aXR5LnZlcmlmeShyZXN1bHRNc2cuc2lnbmF0dXJlKSkge1xuICAgICAgICB0aGlzLmZpbmlzaFN0YXJ0aW5nKCk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMud3Mub25vcGVuID0gYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgbWVzc2FnZSA9IGF3YWl0IG1ha2VSZXF1ZXN0VG9Db25uTWVzc2FnZShteUlkZW50aXR5LCBwZWVyUGF0aCk7XG5cbiAgICAgIHRoaXMud3Muc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG4gICAgfVxuICB9XG5cbiAgc3RhcnRGcm9tRXhpc3Rpbmcod3M6IFdzLCBvcHRzOiBQaWNrPFdzQ29ubi5TdGFydExpbmtPcHRzLCAncGVlcklkZW50aXR5Jz4pIHtcbiAgICBpZiAob3B0cy5wZWVySWRlbnRpdHkpIHtcbiAgICAgIHRoaXMucGVlcklkZW50aXR5ID0gb3B0cy5wZWVySWRlbnRpdHk7XG4gICAgfVxuICAgIHRoaXMud3MgPSB3cztcbiAgICB0aGlzLmZpbmlzaFN0YXJ0aW5nKCk7XG4gIH1cblxuICBwcml2YXRlIGZpbmlzaFN0YXJ0aW5nKCkge1xuICAgIHRoaXMuc3RhdGUgPSBDb25uLlN0YXRlLkNPTk5FQ1RFRDtcbiAgICB0aGlzLndzLm9ubWVzc2FnZSA9IChtZXNzYWdlOiBNc2dFdmVudCkgPT4ge1xuICAgICAgdGhpcy5vbk1lc3NhZ2VEYXRhKG1lc3NhZ2UuZGF0YS50b1N0cmluZygpKTtcbiAgICB9XG4gICAgdGhpcy53cy5vbmNsb3NlID0gKHdzRXZlbnQ6IENsb3NlRXZlbnQpID0+IHtcbiAgICAgIHRoaXMuc3RhdGUgPSBDb25uLlN0YXRlLkNMT1NFRDtcbiAgICAgIHRoaXMub25DbG9zZSh7IHdzRXZlbnQsIGNvbm46IHRoaXMsIGJ5U2VsZjogdGhpcy5jbG9zaW5nIH0pO1xuICAgIH1cbiAgICB0aGlzLmNvbm5TdGFydFJlc29sdmUoKTtcbiAgICBxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG4gICAgICB0aGlzLnBlbmRpbmdNZXNzYWdlcy5mb3JFYWNoKG1zZyA9PiB7XG4gICAgICAgIHRoaXMub25NZXNzYWdlRGF0YShtc2cpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICBhc3luYyBjbG9zZSgpIHtcbiAgICB0aGlzLmNsb3NpbmcgPSB0cnVlO1xuICAgIHRoaXMud3MuY2xvc2UoKTtcbiAgfVxuXG4gIGFzeW5jIHNlbmQobWVzc2FnZTogTWVzc2FnZSkge1xuICAgIHRoaXMud3Muc2VuZChKU09OLnN0cmluZ2lmeShtZXNzYWdlKSk7XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgV3NDb25uO1xuIiwiaW1wb3J0IHsgTWVzc2FnZSwgQW55TWVzc2FnZSwgbWVzc2FnZUFkZHJzIH0gZnJvbSAnLi9tZXNzYWdlJztcbmltcG9ydCBJZGVudGl0eSBmcm9tICcuLi9taXNjL2lkZW50aXR5JztcblxuZXhwb3J0IGludGVyZmFjZSBSZXF1ZXN0VG9Db25uTWVzc2FnZSBleHRlbmRzIE1lc3NhZ2Uge1xuICB0ZXJtOiAncmVxdWVzdFRvQ29ubidcbiAgc2lnbmluZ1B1YktleTogc3RyaW5nO1xuICBlbmNyeXB0aW9uUHViS2V5OiBzdHJpbmc7XG4gIHNpZ25hdHVyZTogSWRlbnRpdHkuU2lnbmF0dXJlO1xuXG4gIG9mZmVyPzogUlRDU2Vzc2lvbkRlc2NyaXB0aW9uO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRvUmVxdWVzdFRvQ29ubk1lc3NhZ2UoZGF0YTogQW55TWVzc2FnZSk6IFJlcXVlc3RUb0Nvbm5NZXNzYWdlIHtcbiAgcmV0dXJuIGRhdGEudGVybSA9PT0gJ3JlcXVlc3RUb0Nvbm4nICYmIG5ld1JlcXVlc3RUb0Nvbm5NZXNzYWdlKGRhdGEpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG5ld1JlcXVlc3RUb0Nvbm5NZXNzYWdlKGRhdGE6IEFueU1lc3NhZ2UpOiBSZXF1ZXN0VG9Db25uTWVzc2FnZSB7XG4gIGlmIChcbiAgICB0eXBlb2YgZGF0YS5zaWduaW5nUHViS2V5ID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBkYXRhLmVuY3J5cHRpb25QdWJLZXkgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIGRhdGEuc2lnbmF0dXJlLnJhbmRvbSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgZGF0YS5zaWduYXR1cmUuc2lnbiA9PT0gJ3N0cmluZydcbiAgKSB7XG4gICAgY29uc3QgbWVzc2FnZTogUmVxdWVzdFRvQ29ubk1lc3NhZ2UgPSB7XG4gICAgICB0ZXJtOiAncmVxdWVzdFRvQ29ubicsXG4gICAgICAuLi5tZXNzYWdlQWRkcnMoZGF0YSksXG4gICAgICBzaWduaW5nUHViS2V5OiBkYXRhLnNpZ25pbmdQdWJLZXksXG4gICAgICBlbmNyeXB0aW9uUHViS2V5OiBkYXRhLmVuY3J5cHRpb25QdWJLZXksXG4gICAgICBzaWduYXR1cmU6IHtcbiAgICAgICAgcmFuZG9tOiBkYXRhLnNpZ25hdHVyZS5yYW5kb20sXG4gICAgICAgIHNpZ246IGRhdGEuc2lnbmF0dXJlLnNpZ24sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIGRhdGEub2ZmZXIgPT09ICdvYmplY3QnKSB7XG4gICAgICBtZXNzYWdlLm9mZmVyID0gZGF0YS5vZmZlciBhcyBSVENTZXNzaW9uRGVzY3JpcHRpb247XG4gICAgfVxuXG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1ha2VSZXF1ZXN0VG9Db25uTWVzc2FnZShteUlkZW50aXR5OiBJZGVudGl0eSwgcGVlclBhdGg6IHN0cmluZywgb2ZmZXI/OiBSVENTZXNzaW9uRGVzY3JpcHRpb24pOiBQcm9taXNlPFJlcXVlc3RUb0Nvbm5NZXNzYWdlPiB7XG4gIHJldHVybiB7XG4gICAgdGVybTogJ3JlcXVlc3RUb0Nvbm4nLFxuICAgIHNyY1BhdGg6IG15SWRlbnRpdHkuYWRkciwgZGVzUGF0aDogcGVlclBhdGgsXG4gICAgc2lnbmluZ1B1YktleTogbXlJZGVudGl0eS5leHBvcnRlZFNpZ25pbmdQdWJLZXksXG4gICAgZW5jcnlwdGlvblB1YktleTogbXlJZGVudGl0eS5leHBvZXJ0ZWRFbmNyeXB0aW9uUHViS2V5LFxuICAgIHNpZ25hdHVyZTogYXdhaXQgbXlJZGVudGl0eS5zaWduYXR1cmUoKSxcbiAgICBvZmZlclxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIGV4dGVuZHMgTWVzc2FnZSB7XG4gIHRlcm06ICdyZXF1ZXN0VG9Db25uUmVzdWx0J1xuICBzaWduaW5nUHViS2V5OiBzdHJpbmc7XG4gIGVuY3J5cHRpb25QdWJLZXk6IHN0cmluZztcbiAgc2lnbmF0dXJlOiBJZGVudGl0eS5TaWduYXR1cmU7XG5cbiAgYW5zd2VyPzogUlRDU2Vzc2lvbkRlc2NyaXB0aW9uO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRvUmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UoZGF0YTogQW55TWVzc2FnZSk6IFJlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlIHtcbiAgcmV0dXJuIGRhdGEudGVybSA9PT0gJ3JlcXVlc3RUb0Nvbm5SZXN1bHQnICYmIG5ld1JlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKGRhdGEpO1xufVxuZXhwb3J0IGZ1bmN0aW9uIG5ld1JlcXVlc3RUb0Nvbm5SZXN1bHRNZXNzYWdlKGRhdGE6IEFueU1lc3NhZ2UpOiBSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZSB7XG4gIGlmIChcbiAgICB0eXBlb2YgZGF0YS5zaWduaW5nUHViS2V5ID09PSAnc3RyaW5nJyAmJlxuICAgIHR5cGVvZiBkYXRhLmVuY3J5cHRpb25QdWJLZXkgPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIGRhdGEuc2lnbmF0dXJlLnJhbmRvbSA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgZGF0YS5zaWduYXR1cmUuc2lnbiA9PT0gJ3N0cmluZydcbiAgKSB7XG4gICAgY29uc3QgbWVzc2FnZTogUmVxdWVzdFRvQ29ublJlc3VsdE1lc3NhZ2UgPSB7XG4gICAgICB0ZXJtOiAncmVxdWVzdFRvQ29ublJlc3VsdCcsXG4gICAgICAuLi5tZXNzYWdlQWRkcnMoZGF0YSksXG4gICAgICBzaWduaW5nUHViS2V5OiBkYXRhLnNpZ25pbmdQdWJLZXksXG4gICAgICBlbmNyeXB0aW9uUHViS2V5OiBkYXRhLmVuY3J5cHRpb25QdWJLZXksXG4gICAgICBzaWduYXR1cmU6IHtcbiAgICAgICAgcmFuZG9tOiBkYXRhLnNpZ25hdHVyZS5yYW5kb20sXG4gICAgICAgIHNpZ246IGRhdGEuc2lnbmF0dXJlLnNpZ24sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICBpZiAodHlwZW9mIGRhdGEuYW5zd2VyID09PSAnb2JqZWN0Jykge1xuICAgICAgbWVzc2FnZS5hbnN3ZXIgPSBkYXRhLmFuc3dlciBhcyBSVENTZXNzaW9uRGVzY3JpcHRpb247XG4gICAgfVxuXG4gICAgcmV0dXJuIG1lc3NhZ2U7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1ha2VSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZShteUlkZW50aXR5OiBJZGVudGl0eSwgcGVlclBhdGg6IHN0cmluZywgYW5zd2VyPzogUlRDU2Vzc2lvbkRlc2NyaXB0aW9uKTogUHJvbWlzZTxSZXF1ZXN0VG9Db25uUmVzdWx0TWVzc2FnZT4ge1xuICByZXR1cm4ge1xuICAgIHRlcm06ICdyZXF1ZXN0VG9Db25uUmVzdWx0JyxcbiAgICBzcmNQYXRoOiBteUlkZW50aXR5LmFkZHIsIGRlc1BhdGg6IHBlZXJQYXRoLFxuICAgIHNpZ25pbmdQdWJLZXk6IG15SWRlbnRpdHkuZXhwb3J0ZWRTaWduaW5nUHViS2V5LFxuICAgIGVuY3J5cHRpb25QdWJLZXk6IG15SWRlbnRpdHkuZXhwb2VydGVkRW5jcnlwdGlvblB1YktleSxcbiAgICBzaWduYXR1cmU6IGF3YWl0IG15SWRlbnRpdHkuc2lnbmF0dXJlKCksXG4gICAgYW5zd2VyLFxuICB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJ0Y0ljZU1lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlIHtcbiAgdGVybTogJ3J0Y0ljZSc7XG4gIGljZTogUlRDSWNlQ2FuZGlkYXRlO1xufVxuZXhwb3J0IGZ1bmN0aW9uIHRvUnRjSWNlTWVzc2FnZShkYXRhOiBBbnlNZXNzYWdlKTogUnRjSWNlTWVzc2FnZSB7XG4gIHJldHVybiBkYXRhLnRlcm0gPT09ICdydGNJY2UnICYmIG5ld1J0Y0ljZU1lc3NhZ2UoZGF0YSk7XG59XG5leHBvcnQgZnVuY3Rpb24gbmV3UnRjSWNlTWVzc2FnZShkYXRhOiBBbnlNZXNzYWdlKTogUnRjSWNlTWVzc2FnZSB7XG4gIGlmIChcbiAgICB0eXBlb2YgZGF0YS5pY2UgPT09ICdvYmplY3QnXG4gICkge1xuICAgIHJldHVybiB7XG4gICAgICB0ZXJtOiAncnRjSWNlJyxcbiAgICAgIC4uLm1lc3NhZ2VBZGRycyhkYXRhKSxcbiAgICAgIGljZTogZGF0YS5pY2UgYXMgUlRDSWNlQ2FuZGlkYXRlLFxuICAgIH07XG4gIH1cbn1cbiIsImV4cG9ydCBpbnRlcmZhY2UgTWVzc2FnZSB7XG4gIHRlcm06IHN0cmluZztcbiAgc3JjUGF0aDogc3RyaW5nO1xuICBkZXNQYXRoOiBzdHJpbmc7XG59XG5leHBvcnQgdHlwZSBNZXNzYWdlRGF0YSA9IE9taXQ8TWVzc2FnZSwgJ3NyY1BhdGgnIHwgJ2Rlc1BhdGgnPiAmIHsgW186IHN0cmluZ106IGFueSB9O1xuXG50eXBlIE1lc3NhZ2VBZGRycyA9IFBpY2s8TWVzc2FnZSwgJ3NyY1BhdGgnIHwgJ2Rlc1BhdGgnPjtcbmV4cG9ydCB0eXBlIEFueU1lc3NhZ2UgPSBNZXNzYWdlICYgeyBbXzogc3RyaW5nXTogYW55IH1cblxuZXhwb3J0IGZ1bmN0aW9uIHRvTWVzc2FnZShkYXRhOiBhbnkpOiBNZXNzYWdlIHtcbiAgaWYgKFxuICAgIHR5cGVvZiBkYXRhLnRlcm0gPT09ICdzdHJpbmcnICYmXG4gICAgdHlwZW9mIGRhdGEuc3JjUGF0aCA9PT0gJ3N0cmluZycgJiZcbiAgICB0eXBlb2YgZGF0YS5kZXNQYXRoID09PSAnc3RyaW5nJ1xuICApIHtcbiAgICByZXR1cm4gZGF0YVxuICB9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXNzYWdlQWRkcnMoZGF0YTogQW55TWVzc2FnZSk6IE1lc3NhZ2VBZGRycyB7XG4gIHJldHVybiB7IHNyY1BhdGg6IGRhdGEuc3JjUGF0aCwgZGVzUGF0aDogZGF0YS5kZXNQYXRoIH07XG59XG4iLCJpbXBvcnQgeyBNZXNzYWdlLCBBbnlNZXNzYWdlLCB0b01lc3NhZ2UgfSBmcm9tICcuL21lc3NhZ2UnO1xuaW1wb3J0IHsgUmVxdWVzdCB9IGZyb20gJy4uL3JlcXVlc3QnO1xuaW1wb3J0IHsgcmFuZG9tU3RyIH0gZnJvbSAnLi4vbWlzYy91dGlscyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTmV0d29ya01lc3NhZ2UgZXh0ZW5kcyBNZXNzYWdlIHtcbiAgdHRsOiBudW1iZXI7XG4gIG1zZ0lkOiBzdHJpbmc7XG59XG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlTmV0d29ya01lc3NhZ2UobWVzc2FnZTogTWVzc2FnZSwgaW5pdFR0bDogbnVtYmVyID0gMTApOiBOZXR3b3JrTWVzc2FnZSB7XG4gIGNvbnN0IHsgdHRsLCBtc2dJZCB9ID0gbWVzc2FnZSBhcyBOZXR3b3JrTWVzc2FnZTtcbiAgcmV0dXJuIHtcbiAgICAuLi5tZXNzYWdlLFxuICAgIHR0bDogKHR0bCA/PyBpbml0VHRsKSAtIDEsXG4gICAgbXNnSWQ6IG1zZ0lkID8/IHJhbmRvbVN0cigpLFxuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgUGluZ01lc3NhZ2Uge1xuICB0ZXJtOiAncGluZydcbiAgdGltZXN0YW1wOiBudW1iZXJcbn1cblxuZXhwb3J0IGludGVyZmFjZSBRdWVyeUFkZHJzTWVzc2FnZURhdGEge1xuICB0ZXJtOiAncXVlcnktYWRkcnMnXG59XG5leHBvcnQgdHlwZSBRdWVyeUFkZHJzTWVzc2FnZSA9IFF1ZXJ5QWRkcnNNZXNzYWdlRGF0YSAmIE1lc3NhZ2U7XG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlUXVlcnlBZGRyc01lc3NhZ2UoZGF0YTogQW55TWVzc2FnZSk6IFF1ZXJ5QWRkcnNNZXNzYWdlIHtcbiAgcmV0dXJuIHtcbiAgICAuLi50b01lc3NhZ2UoZGF0YSksXG4gICAgdGVybTogJ3F1ZXJ5LWFkZHJzJyxcbiAgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlRGF0YSBleHRlbmRzIFJlcXVlc3QuUmVzcG9uc2VNZXNzYWdlRGF0YSB7XG4gIHRlcm06ICdxdWVyeS1hZGRycy1yZXNwb25zZSc7XG4gIGFkZHJzOiBzdHJpbmdbXTtcbn1cbmV4cG9ydCB0eXBlIFF1ZXJ5QWRkcnNSZXNwb25zZU1lc3NhZ2UgPSBRdWVyeUFkZHJzUmVzcG9uc2VNZXNzYWdlRGF0YSAmIE1lc3NhZ2U7XG5leHBvcnQgZnVuY3Rpb24gZGVyaXZlUXVlcnlBZGRyc1Jlc3BvbnNlTWVzc2FnZShkYXRhOiBBbnlNZXNzYWdlKTogUXVlcnlBZGRyc1Jlc3BvbnNlTWVzc2FnZSB7XG4gIGlmIChBcnJheS5pc0FycmF5KGRhdGEuYWRkcnMpKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIC4uLnRvTWVzc2FnZShkYXRhKSxcbiAgICAgIHRlcm06ICdxdWVyeS1hZGRycy1yZXNwb25zZScsXG4gICAgICBhZGRyczogZGF0YS5hZGRycyxcbiAgICB9O1xuICB9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSm9pblNwYWNlTm90aWZpY2F0aW9uTWVzc2FnZURhdGEge1xuICB0ZXJtOiAnam9pbi1zcGFjZS1ub3RpZmljYXRpb24nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIExlYXZlU3BhY2VOb3RpZmljYXRpb25NZXNzYWdlRGF0YSB7XG4gIHRlcm06ICdsZWF2ZS1zcGFjZS1ub3RpZmljYXRpb24nO1xufVxuIiwiZXhwb3J0IGFic3RyYWN0IGNsYXNzIEN1c3RvbUV2ZW50PERldGFpbFQ+IHtcbiAgYWJzdHJhY3QgcmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuICByZWFkb25seSBkZXRhaWw6IERldGFpbFQ7XG4gIGRlZmF1bHRQcmV2ZW50ZWQ6IGJvb2xlYW4gPSBmYWxzZTtcblxuICBjb25zdHJ1Y3RvcihkZXRhaWw6IERldGFpbFQpIHtcbiAgICB0aGlzLmRldGFpbCA9IGRldGFpbDtcbiAgfVxuICBwcmV2ZW50RGVmYXVsdCgpIHtcbiAgICB0aGlzLmRlZmF1bHRQcmV2ZW50ZWQgPSB0cnVlO1xuICB9XG59XG5cbnR5cGUgRXZlbnRUYXJnZXRMaXN0ZW5lcnM8RXZlbnRNYXBUPiA9IHtcbiAgW2luZGV4OiBzdHJpbmddOiAoKHRoaXM6IEV2ZW50VGFyZ2V0PEV2ZW50TWFwVD4sIGV2OiBFdmVudE1hcFRba2V5b2YgRXZlbnRNYXBUXSkgPT4gYW55KVtdXG59XG5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEV2ZW50VGFyZ2V0PEV2ZW50TWFwVD4ge1xuICBsaXN0ZW5lcnM6IEV2ZW50VGFyZ2V0TGlzdGVuZXJzPEV2ZW50TWFwVD4gPSB7fTtcblxuICBhZGRFdmVudExpc3RlbmVyPEsgZXh0ZW5kcyBrZXlvZiBFdmVudE1hcFQ+KHR5cGU6IEsgJiBzdHJpbmcsIGxpc3RlbmVyOiAodGhpczogRXZlbnRUYXJnZXQ8RXZlbnRNYXBUPiwgZXY6IEV2ZW50TWFwVFtLXSkgPT4gdm9pZCk6IHZvaWQge1xuICAgIGlmICghKHR5cGUgaW4gdGhpcy5saXN0ZW5lcnMpKSB7XG4gICAgICB0aGlzLmxpc3RlbmVyc1t0eXBlXSA9IFtdO1xuICAgIH1cblxuICAgIHRoaXMubGlzdGVuZXJzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICB9XG5cbiAgcmVtb3ZlRXZlbnRMaXN0ZW5lcjxLIGV4dGVuZHMga2V5b2YgRXZlbnRNYXBUPih0eXBlOiBLICYgc3RyaW5nLCBsaXN0ZW5lcjogKHRoaXM6IEV2ZW50VGFyZ2V0PEV2ZW50TWFwVD4sIGV2OiBFdmVudE1hcFRbS10pID0+IHZvaWQpOiB2b2lkIHtcbiAgICBpZiAoISh0eXBlIGluIHRoaXMubGlzdGVuZXJzKSkgcmV0dXJuO1xuXG4gICAgY29uc3Qgc3RhY2sgPSB0aGlzLmxpc3RlbmVyc1t0eXBlXTtcbiAgICBzdGFjay5zcGxpY2Uoc3RhY2suaW5kZXhPZihsaXN0ZW5lciwgMSkpO1xuICB9XG5cbiAgZGlzcGF0Y2hFdmVudChldmVudDogRXZlbnRNYXBUW2tleW9mIEV2ZW50TWFwVF0gJiBDdXN0b21FdmVudDxhbnk+KSA6IGJvb2xlYW4ge1xuICAgIGlmICghKGV2ZW50LnR5cGUgaW4gdGhpcy5saXN0ZW5lcnMpKSByZXR1cm47XG5cbiAgICB0aGlzLmxpc3RlbmVyc1tldmVudC50eXBlXS5zbGljZSgpLmZvckVhY2goY2FsbGJhY2sgPT4ge1xuICAgICAgY2FsbGJhY2suY2FsbCh0aGlzLCBldmVudCk7XG4gICAgfSlcblxuICAgIHJldHVybiAhZXZlbnQuZGVmYXVsdFByZXZlbnRlZDtcbiAgfVxufVxuIiwiaW1wb3J0IHsgQ3VzdG9tRXZlbnQgfSBmcm9tICcuL2V2ZW50LXRhcmdldCc7XG5pbXBvcnQgeyBNZXNzYWdlIH0gZnJvbSAnLi4vbWVzc2FnZS9tZXNzYWdlJztcbmltcG9ydCB7IE1lc3NhZ2VSZWNlaXZlZEV2ZW50IH0gZnJvbSAnLi4vY29ubi9iYXNlJztcblxuZXhwb3J0IGNsYXNzIE5ldHdvcmtNZXNzYWdlUmVjZWl2ZWRFdmVudCBleHRlbmRzIEN1c3RvbUV2ZW50PE1lc3NhZ2U+IHtcbiAgdHlwZSA9ICdyZWNlaXZlLW5ldHdvcmsnO1xuICBtZXNzYWdlUmVjZWl2ZWRFdmVudDogTWVzc2FnZVJlY2VpdmVkRXZlbnQ7XG4gIGV4YWN0Rm9yTWU6IGJvb2xlYW47XG5cbiAgY29uc3RydWN0b3IobWVzc2FnZVJlY2VpdmVkRXZlbnQ6IE1lc3NhZ2VSZWNlaXZlZEV2ZW50LCBleGFjdEZvck1lOiBib29sZWFuKSB7XG4gICAgc3VwZXIobWVzc2FnZVJlY2VpdmVkRXZlbnQuZGV0YWlsKTtcbiAgICB0aGlzLm1lc3NhZ2VSZWNlaXZlZEV2ZW50ID0gbWVzc2FnZVJlY2VpdmVkRXZlbnQ7XG4gICAgdGhpcy5leGFjdEZvck1lID0gZXhhY3RGb3JNZTtcbiAgfVxufVxuXG4iLCJpbXBvcnQgY3J5cHRvIGZyb20gJ2lzb21vcnBoaWMtd2ViY3J5cHRvJztcbmltcG9ydCB7IGFycmF5QnVmZmVyVG9iYXNlNjQsIGJhc2U2NFRvQXJyYXlCdWZmZXIsIGV4dHJhY3RBZGRyRnJvbVBhdGggfSBmcm9tICcuL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgSWRlbnRpdHkge1xuICBpbnRlcmZhY2UgQ29uZmlnIHtcbiAgICBteUFkZHI/OiBzdHJpbmc7XG4gICAgc2lnbmluZ0tleVBhaXI/OiBDcnlwdG9LZXlQYWlyO1xuICAgIGVuY3J5cHRpb25LZXlQYWlyPzogQ3J5cHRvS2V5UGFpcjtcbiAgICBbb3B0OiBzdHJpbmddOiBhbnk7XG4gIH1cblxuICBpbnRlcmZhY2UgU2lnbmF0dXJlIHtcbiAgICByYW5kb206IHN0cmluZztcbiAgICBzaWduOiBzdHJpbmc7XG4gIH1cbn1cblxuY29uc3QgU0lHTklOR19LRVlfT1BUUyA9IHtcbiAgbmFtZTogXCJFQ0RTQVwiLFxuICBuYW1lZEN1cnZlOiBcIlAtMzg0XCJcbn07XG5jb25zdCBTSUdOSU5HX0FMR09SSVRITV9PUFRTID0ge1xuICBuYW1lOiBcIkVDRFNBXCIsXG4gIGhhc2g6IHsgbmFtZTogXCJTSEEtMzg0XCIgfSxcbn1cbmNvbnN0IEVOQ1JZUFRJT05fS0VZX09QVFMgPSB7XG4gIG5hbWU6IFwiUlNBLU9BRVBcIixcbiAgbW9kdWx1c0xlbmd0aDogNDA5NixcbiAgcHVibGljRXhwb25lbnQ6IG5ldyBVaW50OEFycmF5KFsxLCAwLCAxXSksXG4gIGhhc2g6IFwiU0hBLTI1NlwiXG59O1xuXG5jbGFzcyBJZGVudGl0eSB7XG4gIGFkZHI6IHN0cmluZztcbiAgZXhwb3J0ZWRTaWduaW5nUHViS2V5OiBzdHJpbmc7XG4gIGV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXk6IHN0cmluZztcblxuICBwcml2YXRlIHNpZ25pbmdLZXlQYWlyOiBDcnlwdG9LZXlQYWlyO1xuICBwcml2YXRlIGVuY3J5cHRpb25LZXlQYWlyOiBDcnlwdG9LZXlQYWlyO1xuXG4gIHByaXZhdGUgZXhwb3J0ZWRTaWduaW5nUHViS2V5UmF3OiBBcnJheUJ1ZmZlcjtcbiAgcHJpdmF0ZSBleHBvZXJ0ZWRFbmNyeXB0aW9uUHViS2V5UmF3OiBBcnJheUJ1ZmZlcjtcblxuICBjb25zdHJ1Y3Rvcihjb25maWc6IFBhcnRpYWw8SWRlbnRpdHkuQ29uZmlnPiA9IHt9KSB7XG4gICAgaWYgKGNvbmZpZy5teUFkZHIpIHRoaXMuYWRkciA9IGNvbmZpZy5teUFkZHI7XG4gICAgaWYgKGNvbmZpZy5lbmNyeXB0aW9uS2V5UGFpcikgdGhpcy5lbmNyeXB0aW9uS2V5UGFpciA9IGNvbmZpZy5lbmNyeXB0aW9uS2V5UGFpcjtcbiAgICBpZiAoY29uZmlnLnNpZ25pbmdLZXlQYWlyKSB0aGlzLnNpZ25pbmdLZXlQYWlyID0gY29uZmlnLnNpZ25pbmdLZXlQYWlyO1xuICB9XG5cbiAgYXN5bmMgZ2VuZXJhdGVJZk5lZWRlZCgpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBpZiAoIXRoaXMuc2lnbmluZ0tleVBhaXIpIHtcbiAgICAgIHRoaXMuc2lnbmluZ0tleVBhaXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmdlbmVyYXRlS2V5KFxuICAgICAgICBTSUdOSU5HX0tFWV9PUFRTLFxuICAgICAgICB0cnVlLFxuICAgICAgICBbXCJzaWduXCIsIFwidmVyaWZ5XCJdLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuZW5jcnlwdGlvbktleVBhaXIpIHtcbiAgICAgIHRoaXMuZW5jcnlwdGlvbktleVBhaXIgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmdlbmVyYXRlS2V5KFxuICAgICAgICBFTkNSWVBUSU9OX0tFWV9PUFRTLFxuICAgICAgICB0cnVlLFxuICAgICAgICBbXCJlbmNyeXB0XCIsIFwiZGVjcnlwdFwiXSxcbiAgICAgICk7XG4gICAgfVxuXG4gICAgdGhpcy5leHBvcnRlZFNpZ25pbmdQdWJLZXlSYXcgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmV4cG9ydEtleSgncmF3JywgdGhpcy5zaWduaW5nS2V5UGFpci5wdWJsaWNLZXkpO1xuICAgIHRoaXMuZXhwb2VydGVkRW5jcnlwdGlvblB1YktleVJhdyA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuZXhwb3J0S2V5KCdzcGtpJywgdGhpcy5lbmNyeXB0aW9uS2V5UGFpci5wdWJsaWNLZXkpO1xuICAgIHRoaXMuZXhwb3J0ZWRTaWduaW5nUHViS2V5ID0gYXJyYXlCdWZmZXJUb2Jhc2U2NCh0aGlzLmV4cG9ydGVkU2lnbmluZ1B1YktleVJhdyk7XG4gICAgdGhpcy5leHBvZXJ0ZWRFbmNyeXB0aW9uUHViS2V5ID0gYXJyYXlCdWZmZXJUb2Jhc2U2NCh0aGlzLmV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXlSYXcpO1xuXG4gICAgaWYgKCF0aGlzLmFkZHIpIHtcbiAgICAgIGNvbnN0IHB1YktleUhhc2ggPSBhd2FpdCBjYWxjVW5uYW1lZEFkZHIoXG4gICAgICAgIHRoaXMuZXhwb3J0ZWRTaWduaW5nUHViS2V5UmF3LFxuICAgICAgICB0aGlzLmV4cG9lcnRlZEVuY3J5cHRpb25QdWJLZXlSYXcsXG4gICAgICApO1xuICAgICAgdGhpcy5hZGRyID0gYCMke2FycmF5QnVmZmVyVG9iYXNlNjQocHViS2V5SGFzaCl9YDtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzaWduYXR1cmUoKTogUHJvbWlzZTxJZGVudGl0eS5TaWduYXR1cmU+IHtcbiAgICBjb25zdCByYW5kb20gPSBuZXcgVWludDhBcnJheSgzMik7XG4gICAgY3J5cHRvLmdldFJhbmRvbVZhbHVlcyhyYW5kb20pO1xuICAgIGNvbnN0IHNpZ25hdHVyZSA9IGF3YWl0IGNyeXB0by5zdWJ0bGUuc2lnbihcbiAgICAgIFNJR05JTkdfQUxHT1JJVEhNX09QVFMsXG4gICAgICB0aGlzLnNpZ25pbmdLZXlQYWlyLnByaXZhdGVLZXksXG4gICAgICBjYWxjRGF0YVRvQmVTaWduZWQodGhpcy5leHBvZXJ0ZWRFbmNyeXB0aW9uUHViS2V5UmF3LCByYW5kb20pLFxuICAgICk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgcmFuZG9tOiBhcnJheUJ1ZmZlclRvYmFzZTY0KHJhbmRvbSksXG4gICAgICBzaWduOiBhcnJheUJ1ZmZlclRvYmFzZTY0KHNpZ25hdHVyZSksXG4gICAgfTtcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBJZGVudGl0eTtcblxuZXhwb3J0IGNsYXNzIFBlZXJJZGVudGl0eSB7XG4gIGFkZHI6IHN0cmluZztcbiAgcHJpdmF0ZSBzaWduaW5nUHViS2V5OiBBcnJheUJ1ZmZlcjtcbiAgcHJpdmF0ZSBlbmNyeXB0aW9uUHViS2V5OiBBcnJheUJ1ZmZlcjtcblxuICBjb25zdHJ1Y3RvcihwZWVyUGF0aDogc3RyaW5nLCBwZWVyU2lnbmluZ1B1YktleUJhc2U2ND86IHN0cmluZywgcGVlckVuY3J5cHRpb25QdWJLZXlCYXNlNjQ/OiBzdHJpbmcpIHtcbiAgICB0aGlzLmFkZHIgPSBleHRyYWN0QWRkckZyb21QYXRoKHBlZXJQYXRoKTtcbiAgICBpZiAocGVlclNpZ25pbmdQdWJLZXlCYXNlNjQpIHtcbiAgICAgIHRoaXMuc2V0U2lnbmluZ1B1YktleShwZWVyU2lnbmluZ1B1YktleUJhc2U2NCk7XG4gICAgfVxuICAgIGlmIChwZWVyRW5jcnlwdGlvblB1YktleUJhc2U2NCkge1xuICAgICAgdGhpcy5zZXRFbmNyeXB0aW9uUHViS2V5KHBlZXJFbmNyeXB0aW9uUHViS2V5QmFzZTY0KTtcbiAgICB9XG4gIH1cblxuICBzZXRTaWduaW5nUHViS2V5KHBlZXJTaWduaW5nUHViS2V5QmFzZTY0OiBzdHJpbmcpIHtcbiAgICB0aGlzLnNpZ25pbmdQdWJLZXkgPSBiYXNlNjRUb0FycmF5QnVmZmVyKHBlZXJTaWduaW5nUHViS2V5QmFzZTY0KTtcbiAgfVxuICBzZXRFbmNyeXB0aW9uUHViS2V5KHBlZXJFbmNyeXB0aW9uUHViS2V5QmFzZTY0OiBzdHJpbmcpIHtcbiAgICB0aGlzLmVuY3J5cHRpb25QdWJLZXkgPSBiYXNlNjRUb0FycmF5QnVmZmVyKHBlZXJFbmNyeXB0aW9uUHViS2V5QmFzZTY0KTtcbiAgfVxuXG4gIGFzeW5jIHZlcmlmeShzaWduYXR1cmU6IElkZW50aXR5LlNpZ25hdHVyZSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuICAgIGlmICh0aGlzLmFkZHIubWF0Y2goL14jLykpIHtcbiAgICAgIGNvbnN0IGhhc2hBZGRyVmVyaWZpZWQgPSBhd2FpdCB0aGlzLnZlcmlmeVVubmFtZWRBZGRyKCk7XG5cbiAgICAgIGlmICghaGFzaEFkZHJWZXJpZmllZCkgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGNvbnN0IHNpZ25hdHVyZVZlcmlmaWVkID0gYXdhaXQgdGhpcy52ZXJpZnlTaWduYXR1cmUoc2lnbmF0dXJlKTtcbiAgICByZXR1cm4gc2lnbmF0dXJlVmVyaWZpZWQ7XG4gIH1cblxuICBhc3luYyB2ZXJpZnlVbm5hbWVkQWRkcigpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgICBjb25zdCBwdWJLZXlIYXNoID0gYXdhaXQgY2FsY1VubmFtZWRBZGRyKHRoaXMuc2lnbmluZ1B1YktleSwgdGhpcy5lbmNyeXB0aW9uUHViS2V5KTtcbiAgICByZXR1cm4gYXJyYXlCdWZmZXJUb2Jhc2U2NChwdWJLZXlIYXNoKSA9PT0gdGhpcy5hZGRyLnNsaWNlKDEpO1xuICB9XG5cbiAgYXN5bmMgdmVyaWZ5U2lnbmF0dXJlKHNpZ25hdHVyZTogSWRlbnRpdHkuU2lnbmF0dXJlKTogUHJvbWlzZTxib29sZWFuPiB7XG4gICAgY29uc3QgcGVlclNpZ25pbmdQdWJLZXkgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmltcG9ydEtleShcbiAgICAgICdyYXcnLCB0aGlzLnNpZ25pbmdQdWJLZXksIFNJR05JTkdfS0VZX09QVFMsIGZhbHNlLCBbJ3ZlcmlmeSddLFxuICAgICk7XG5cbiAgICBjb25zdCBkYXRhQmVmb3JlU2lnbmluZyA9IGNhbGNEYXRhVG9CZVNpZ25lZChcbiAgICAgIHRoaXMuZW5jcnlwdGlvblB1YktleSwgYmFzZTY0VG9BcnJheUJ1ZmZlcihzaWduYXR1cmUucmFuZG9tKSxcbiAgICApO1xuXG4gICAgcmV0dXJuIGNyeXB0by5zdWJ0bGUudmVyaWZ5KFxuICAgICAgU0lHTklOR19BTEdPUklUSE1fT1BUUyxcbiAgICAgIHBlZXJTaWduaW5nUHViS2V5LFxuICAgICAgYmFzZTY0VG9BcnJheUJ1ZmZlcihzaWduYXR1cmUuc2lnbiksXG4gICAgICBkYXRhQmVmb3JlU2lnbmluZyxcbiAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIGNhbGNVbm5hbWVkQWRkcihzaWduaW5nUHViS2V5OiBBcnJheUJ1ZmZlciwgZW5jcnlwdGlvblB1YktleTogQXJyYXlCdWZmZXIpOiBQcm9taXNlPEFycmF5QnVmZmVyPiB7XG4gIHJldHVybiBjcnlwdG8uc3VidGxlLmRpZ2VzdCgnU0hBLTUxMicsIGNvbmNhdEFycmF5QnVmZmVyKHNpZ25pbmdQdWJLZXksIGVuY3J5cHRpb25QdWJLZXkpKTtcbn1cblxuZnVuY3Rpb24gY2FsY0RhdGFUb0JlU2lnbmVkKGVuY3J5cHRpb25QdWJLZXk6IEFycmF5QnVmZmVyLCByYW5kb206IEFycmF5QnVmZmVyKTogQXJyYXlCdWZmZXIge1xuICByZXR1cm4gY29uY2F0QXJyYXlCdWZmZXIoZW5jcnlwdGlvblB1YktleSwgcmFuZG9tKTtcbn1cblxuZnVuY3Rpb24gY29uY2F0QXJyYXlCdWZmZXIoYWIxOiBBcnJheUJ1ZmZlciwgYWIyOiBBcnJheUJ1ZmZlcik6IEFycmF5QnVmZmVyIHtcbiAgY29uc3QgbmV3QXJyID0gbmV3IFVpbnQ4QXJyYXkoYWIxLmJ5dGVMZW5ndGggKyBhYjIuYnl0ZUxlbmd0aCk7XG4gIG5ld0Fyci5zZXQobmV3IFVpbnQ4QXJyYXkoYWIxKSk7XG4gIG5ld0Fyci5zZXQobmV3IFVpbnQ4QXJyYXkoYWIyKSwgYWIxLmJ5dGVMZW5ndGgpO1xuICByZXR1cm4gbmV3QXJyLmJ1ZmZlcjtcbn1cbiIsImltcG9ydCBjcnlwdG8gZnJvbSAnaXNvbW9ycGhpYy13ZWJjcnlwdG8nO1xuXG5leHBvcnQgZnVuY3Rpb24gcmFuZG9tU3RyKCk6IHN0cmluZyB7XG4gIHJldHVybiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBEYXRlLm5vdygpKS50b1N0cmluZygzNik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcnJheUJ1ZmZlclRvYmFzZTY0KGFiOiBBcnJheUJ1ZmZlcik6IHN0cmluZyB7XG4gIHJldHVybiBidG9hKFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgbmV3IFVpbnQ4QXJyYXkoYWIpKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBiYXNlNjRUb0FycmF5QnVmZmVyKGJhc2U2NDogc3RyaW5nKTogQXJyYXlCdWZmZXIge1xuICByZXR1cm4gVWludDhBcnJheS5mcm9tKGF0b2IoYmFzZTY0KSwgYyA9PiBjLmNoYXJDb2RlQXQoMCkpXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0QWRkckZyb21QYXRoKHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBwYXRoLnNwbGl0KCc+Jykuc2xpY2UoLTEpWzBdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFNwYWNlUGF0aChwYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gcGF0aC5zcGxpdCgnPicpLnNsaWNlKDAsIC0xKS5qb2luKCc+Jyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBqb2luUGF0aChwYXRoOiBzdHJpbmcgfCBzdHJpbmdbXSwgdGFyZ2V0OiBzdHJpbmcgPSAnJyk6IHN0cmluZyB7XG4gIGNvbnN0IHBhdGhTZWdzOiBzdHJpbmdbXSA9IEFycmF5LmlzQXJyYXkocGF0aCkgPyBwYXRoIDogW3BhdGhdO1xuICByZXR1cm4gWyAuLi5wYXRoU2VncywgdGFyZ2V0IF0uZmlsdGVyKHNlZyA9PiBzZWcubGVuZ3RoID4gMCkuam9pbignPicpO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gY2FsY0FkZHJPclN1YlNwYWNlSGFzaChhZGRyT3JTdWJTcGFjZTogc3RyaW5nKTogUHJvbWlzZTxVaW50MzJBcnJheT4ge1xuICBjb25zdCBoYXNoID0gYXdhaXQgY3J5cHRvLnN1YnRsZS5kaWdlc3QoJ1NIQS01MTInLCAobmV3IFRleHRFbmNvZGVyKCkpLmVuY29kZShhZGRyT3JTdWJTcGFjZSkpO1xuICByZXR1cm4gbmV3IFVpbnQzMkFycmF5KGhhc2gpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0Rmlyc3RVaW50MzJIZXgoZGF0YTogVWludDMyQXJyYXkpIHtcbiAgcmV0dXJuICcweCcgKyAoJzAwMDAwMDAwJyArIGRhdGFbMF0udG9TdHJpbmcoMTYpKS5zbGljZSgtOCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaHVmZmxlPFQ+KGFycmF5OiBUW10pOiBUW10ge1xuICBjb25zdCBuZXdBcnJheSA9IFsuLi5hcnJheV07XG4gIGZvciAobGV0IGkgPSBhcnJheS5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgY29uc3QgaiA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChpICsgMSkpO1xuICAgIFthcnJheVtpXSwgYXJyYXlbal1dID0gW2FycmF5W2pdLCBhcnJheVtpXV07XG4gIH1cbiAgcmV0dXJuIG5ld0FycmF5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2FpdCh0aW1lb3V0OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4ge1xuICAgIHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZW91dCk7XG4gIH0pO1xufVxuIiwiaW1wb3J0IEFnZW50IGZyb20gJy4vYWdlbnQnO1xuaW1wb3J0IEV2ZW50VGFyZ2V0IGZyb20gJy4vbWlzYy9ldmVudC10YXJnZXQnO1xuaW1wb3J0IHsgTWVzc2FnZSBhcyBPcmlNZXNzYWdlLCBNZXNzYWdlRGF0YSBhcyBPcmlNZXNzYWdlRGF0YSB9IGZyb20gJy4vbWVzc2FnZS9tZXNzYWdlJztcbmltcG9ydCB7IE5ldHdvcmtNZXNzYWdlUmVjZWl2ZWRFdmVudCB9IGZyb20gJy4vbWlzYy9ldmVudHMnO1xuaW1wb3J0IHsgcmFuZG9tU3RyIH0gZnJvbSAnLi9taXNjL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgUmVxdWVzdCB7XG4gIGV4cG9ydCBjb25zdCBlbnVtIERpcmVjdGlvbiB7IFJlcXVlc3QgPSAncmVxdWVzdCcsIFJlc3BvbnNlID0gJ3Jlc3BvbnNlJyB9XG4gIGludGVyZmFjZSBNZXNzYWdlRmllbGRzIHtcbiAgICByZXF1ZXN0SWQ6IHN0cmluZztcbiAgICBkaXJlY3Rpb246IERpcmVjdGlvbjtcbiAgfVxuICBleHBvcnQgaW50ZXJmYWNlIFJlc3BvbnNlTWVzc2FnZURhdGEgZXh0ZW5kcyBPcmlNZXNzYWdlRGF0YSB7XG4gICAgcmVzcG9uc2VTcGFjZT86IHN0cmluZztcbiAgfVxuICB0eXBlIE1lc3NhZ2UgPSBPcmlNZXNzYWdlICYgTWVzc2FnZUZpZWxkcztcbiAgdHlwZSBSZXF1ZXN0TWVzc2FnZURhdGEgPSBPcmlNZXNzYWdlRGF0YSAmIE1lc3NhZ2VGaWVsZHM7XG5cbiAgaW50ZXJmYWNlIE1hbmFnZXJDb25maWcge1xuICAgIHRpbWVvdXQ6IG51bWJlcjtcbiAgfVxuXG4gIHR5cGUgUmVzb2x2ZUZuID0gKG1lc3NhZ2U6IFJlcXVlc3QuTWVzc2FnZSkgPT4ge307XG4gIHR5cGUgcmVxdWVzdElkID0gc3RyaW5nO1xuICB0eXBlIFJlcXVlc3RJZFRvVGhyb3VnaHMgPSBSZWNvcmQ8cmVxdWVzdElkLCBbcGF0aDogc3RyaW5nLCBwZWVyQWRkcjogc3RyaW5nXT47XG59XG5cbmV4cG9ydCBjbGFzcyBSZXF1ZXN0ZWRFdmVudCBleHRlbmRzIE5ldHdvcmtNZXNzYWdlUmVjZWl2ZWRFdmVudCB7XG4gIHR5cGUgPSAncmVxdWVzdGVkJ1xuICByZXNwb25zZURhdGE/OiBQcm9taXNlPFJlcXVlc3QuUmVzcG9uc2VNZXNzYWdlRGF0YT47XG5cbiAgcmVzcG9uc2UobWVzc2FnZTogUmVxdWVzdC5SZXNwb25zZU1lc3NhZ2VEYXRhIHwgUHJvbWlzZTxSZXF1ZXN0LlJlc3BvbnNlTWVzc2FnZURhdGE+KSB7XG4gICAgdGhpcy5yZXNwb25zZURhdGEgPSAoYXN5bmMgKCkgPT4gYXdhaXQgbWVzc2FnZSkoKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgRXZlbnRNYXAge1xuICAncmVxdWVzdGVkJzogUmVxdWVzdGVkRXZlbnQ7XG59XG5cbmNvbnN0IERFRkFVTFRfQ09ORklHOiBSZXF1ZXN0Lk1hbmFnZXJDb25maWcgPSB7XG4gIHRpbWVvdXQ6IDEwMDAsXG59O1xuXG5jbGFzcyBSZXF1ZXN0TWFuYWdlciBleHRlbmRzIEV2ZW50VGFyZ2V0PEV2ZW50TWFwPiB7XG4gIHByaXZhdGUgYWdlbnQ6IEFnZW50O1xuICBwcml2YXRlIGNvbmZpZzogUmVxdWVzdC5NYW5hZ2VyQ29uZmlnO1xuICBwcml2YXRlIHJlcXVlc3RzOiBSZWNvcmQ8c3RyaW5nLCBSZXF1ZXN0PiA9IHt9O1xuXG4gIHByaXZhdGUgcmVxdWVzdElkVG9UaHJvdWdoczogUmVxdWVzdC5SZXF1ZXN0SWRUb1Rocm91Z2hzID0ge307XG5cbiAgY29uc3RydWN0b3IoYWdlbnQ6IEFnZW50LCBjb25maWc6IFBhcnRpYWw8UmVxdWVzdC5NYW5hZ2VyQ29uZmlnPiA9IHt9KSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLmFnZW50ID0gYWdlbnQ7XG4gICAgdGhpcy5jb25maWcgPSB7XG4gICAgICAuLi5ERUZBVUxUX0NPTkZJRyxcbiAgICAgIC4uLmNvbmZpZyxcbiAgICB9O1xuICB9XG5cbiAgb25SZWNlaXZlTmV0d29ya01lc3NhZ2UoZXZlbnQ6IE5ldHdvcmtNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IG1lc3NhZ2UgPSBldmVudC5kZXRhaWwgYXMgUmVxdWVzdC5NZXNzYWdlO1xuICAgIGNvbnN0IHsgcmVxdWVzdElkLCBkaXJlY3Rpb24gfSA9IG1lc3NhZ2U7XG4gICAgaWYgKHJlcXVlc3RJZCkge1xuICAgICAgc3dpdGNoIChkaXJlY3Rpb24pIHtcbiAgICAgICAgY2FzZSBSZXF1ZXN0LkRpcmVjdGlvbi5SZXF1ZXN0OlxuICAgICAgICAgIHJldHVybiB0aGlzLm9uUmVjZWl2ZVJlcXVlc3RNZXNzYWdlKG1lc3NhZ2UsIGV2ZW50KTtcbiAgICAgICAgY2FzZSBSZXF1ZXN0LkRpcmVjdGlvbi5SZXNwb25zZTpcbiAgICAgICAgICByZXR1cm4gdGhpcy5vblJlY2VpdmVSZXNwb25zZU1lc3NhZ2UobWVzc2FnZSwgZXZlbnQpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgb25SZWNlaXZlUmVxdWVzdE1lc3NhZ2UobWVzc2FnZTogUmVxdWVzdC5NZXNzYWdlLCBldmVudDogTmV0d29ya01lc3NhZ2VSZWNlaXZlZEV2ZW50KTogYm9vbGVhbiB7XG4gICAgY29uc3QgcmVxdWVzdGVkRXZlbnQgPSBuZXcgUmVxdWVzdGVkRXZlbnQoZXZlbnQubWVzc2FnZVJlY2VpdmVkRXZlbnQsIGV2ZW50LmV4YWN0Rm9yTWUpO1xuXG4gICAgdGhpcy5kaXNwYXRjaEV2ZW50KHJlcXVlc3RlZEV2ZW50KTtcblxuICAgIGlmIChyZXF1ZXN0ZWRFdmVudC5yZXNwb25zZURhdGEpIHtcbiAgICAgIChhc3luYyAoKSA9PiB7XG4gICAgICAgIGNvbnN0IHJlc3BvbnNlRGF0YSA9IGF3YWl0IHJlcXVlc3RlZEV2ZW50LnJlc3BvbnNlRGF0YTtcbiAgICAgICAgY29uc3QgcmVzcG9uc2VNZXNzYWdlOiBSZXF1ZXN0LlJlcXVlc3RNZXNzYWdlRGF0YSA9IHtcbiAgICAgICAgICAuLi5yZXNwb25zZURhdGEsXG4gICAgICAgICAgcmVxdWVzdElkOiBtZXNzYWdlLnJlcXVlc3RJZCxcbiAgICAgICAgICBkaXJlY3Rpb246IFJlcXVlc3QuRGlyZWN0aW9uLlJlc3BvbnNlLFxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMuYWdlbnQuc2VuZChldmVudC5kZXRhaWwuc3JjUGF0aCwgcmVzcG9uc2VNZXNzYWdlLCByZXNwb25zZURhdGEucmVzcG9uc2VTcGFjZSk7XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgcHJpdmF0ZSBvblJlY2VpdmVSZXNwb25zZU1lc3NhZ2UobWVzc2FnZTogUmVxdWVzdC5NZXNzYWdlLCBfZXZlbnQ6IE5ldHdvcmtNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHJlcXVlc3QgPSB0aGlzLnJlcXVlc3RzW21lc3NhZ2UucmVxdWVzdElkXTtcbiAgICBpZiAocmVxdWVzdCkge1xuICAgICAgcmVxdWVzdC5jb21wbGV0ZShtZXNzYWdlKTtcblxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGFzeW5jIHJlcXVlc3QoZGVzUGF0aDogc3RyaW5nLCBtZXNzYWdlQ29udGVudDogT3JpTWVzc2FnZURhdGEpOiBQcm9taXNlPFJlcXVlc3Q+IHtcbiAgICBjb25zdCByZXF1ZXN0ID0gbmV3IFJlcXVlc3QoZGVzUGF0aCwgbWVzc2FnZUNvbnRlbnQpO1xuICAgIHRoaXMucmVxdWVzdHNbcmVxdWVzdC5yZXF1ZXN0SWRdID0gcmVxdWVzdDtcbiAgICB0aGlzLmFnZW50LnNlbmQoZGVzUGF0aCwgcmVxdWVzdC5yZXF1ZXN0TWVzc2FnZSk7XG4gICAgcmV0dXJuIHJlcXVlc3Quc3RhcnQodGhpcy5jb25maWcudGltZW91dCk7XG4gIH1cblxuICBjYWNoZVJlY2VpdmUoZnJvbVBlZXJBZGRyOiBzdHJpbmcsIHNyY0FkZHI6IHN0cmluZywgbWVzc2FnZTogT3JpTWVzc2FnZSk6IHZvaWQge1xuICAgIGlmIChmcm9tUGVlckFkZHIgPT09IHNyY0FkZHIpIHJldHVybjtcbiAgICBjb25zdCB7IHJlcXVlc3RJZCwgZGlyZWN0aW9uIH0gPSBtZXNzYWdlIGFzIFJlcXVlc3QuTWVzc2FnZTtcbiAgICBpZiAoIXJlcXVlc3RJZCB8fCBkaXJlY3Rpb24gIT09IFJlcXVlc3QuRGlyZWN0aW9uLlJlcXVlc3QpIHJldHVybjtcblxuICAgIGxldCB0aHJvdWdoID0gdGhpcy5yZXF1ZXN0SWRUb1Rocm91Z2hzW3JlcXVlc3RJZF07XG4gICAgaWYgKCF0aHJvdWdoKSB7XG4gICAgICB0aGlzLnJlcXVlc3RJZFRvVGhyb3VnaHNbcmVxdWVzdElkXSA9IFttZXNzYWdlLnNyY1BhdGgsIGZyb21QZWVyQWRkcl07XG4gICAgfVxuICB9XG5cbiAgcm91dGUobWVzc2FnZTogT3JpTWVzc2FnZSk6IHN0cmluZyB8IG51bGwge1xuICAgIGNvbnN0IHsgcmVxdWVzdElkLCBkaXJlY3Rpb24gfSA9IG1lc3NhZ2UgYXMgUmVxdWVzdC5NZXNzYWdlO1xuXG4gICAgaWYgKHJlcXVlc3RJZCAmJiBkaXJlY3Rpb24gPT09IFJlcXVlc3QuRGlyZWN0aW9uLlJlc3BvbnNlKSB7XG4gICAgICBjb25zdCB0aHJvdWdoID0gdGhpcy5yZXF1ZXN0SWRUb1Rocm91Z2hzW3JlcXVlc3RJZF07XG4gICAgICBpZiAodGhyb3VnaCkge1xuICAgICAgICBjb25zdCBbZGVzUGF0aCwgcGVlckFkZHJdID0gdGhyb3VnaDtcbiAgICAgICAgaWYgKG1lc3NhZ2UuZGVzUGF0aCA9PT0gZGVzUGF0aCkgcmV0dXJuIHBlZXJBZGRyO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBSZXF1ZXN0TWFuYWdlcjtcblxuY2xhc3MgUmVxdWVzdCB7XG4gIGRlc1BhdGg6IHN0cmluZztcbiAgcmVxdWVzdElkOiBzdHJpbmc7XG4gIHJlcXVlc3RNZXNzYWdlOiBSZXF1ZXN0LlJlcXVlc3RNZXNzYWdlRGF0YTtcbiAgcmVzcG9uc2VNZXNzYWdlOiBSZXF1ZXN0Lk1lc3NhZ2U7XG4gIHByaXZhdGUgcmVzb2x2ZUZuOiAocmVxOiBSZXF1ZXN0KSA9PiB2b2lkO1xuXG4gIGNvbnN0cnVjdG9yKGRlc1BhdGg6IHN0cmluZywgbWVzc2FnZUNvbnRlbnQ6IE9yaU1lc3NhZ2VEYXRhLCByZXF1ZXN0SWQ/OiBzdHJpbmcpIHtcbiAgICB0aGlzLmRlc1BhdGggPSBkZXNQYXRoO1xuICAgIHRoaXMucmVxdWVzdElkID0gcmVxdWVzdElkIHx8IHJhbmRvbVN0cigpO1xuICAgIHRoaXMucmVxdWVzdE1lc3NhZ2UgPSB7XG4gICAgICAuLi5tZXNzYWdlQ29udGVudCxcbiAgICAgIHJlcXVlc3RJZDogdGhpcy5yZXF1ZXN0SWQsXG4gICAgICBkaXJlY3Rpb246IFJlcXVlc3QuRGlyZWN0aW9uLlJlcXVlc3QsXG4gICAgfVxuICB9XG5cbiAgc3RhcnQodGltZW91dDogbnVtYmVyKTogUHJvbWlzZTxSZXF1ZXN0PiB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPFJlcXVlc3Q+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgIHRoaXMucmVzb2x2ZUZuID0gcmVzb2x2ZTtcbiAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICByZWplY3QobmV3IEVycm9yKGByZXF1ZXN0LnRzOiByZXF1ZXN0IHRlcm06ICcke3RoaXMucmVxdWVzdE1lc3NhZ2UudGVybX0nIGZyb20gJyR7dGhpcy5kZXNQYXRofScgaGFzIHRpbWVvdXRgKSk7XG4gICAgICB9LCB0aW1lb3V0KTtcbiAgICB9KTtcbiAgfVxuXG4gIGNvbXBsZXRlKG1lc3NhZ2U6IFJlcXVlc3QuTWVzc2FnZSkge1xuICAgIHRoaXMucmVzcG9uc2VNZXNzYWdlID0gbWVzc2FnZTtcbiAgICB0aGlzLnJlc29sdmVGbih0aGlzKTtcbiAgfVxufVxuXG5leHBvcnQgeyBSZXF1ZXN0IH07XG4iLCJpbXBvcnQge1xuICBqb2luUGF0aCwgZXh0cmFjdEFkZHJGcm9tUGF0aCwgY2FsY0FkZHJPclN1YlNwYWNlSGFzaCxcbiAgZm9ybWF0Rmlyc3RVaW50MzJIZXgsIHNodWZmbGUsXG59IGZyb20gJy4vbWlzYy91dGlscyc7XG5cbmRlY2xhcmUgbmFtZXNwYWNlIFJvdXRlciB7XG4gIHR5cGUgUm91dGluZ1RhYmxlTGluZSA9IFtoYXNoOiBVaW50MzJBcnJheSwgYWRkcjogc3RyaW5nXTtcbiAgdHlwZSBLQnVja2V0cyA9IE1hcDxudW1iZXIsIFJvdXRpbmdUYWJsZUxpbmVbXT47XG4gIHR5cGUgc3BhY2VQYXRoID0gc3RyaW5nO1xuICBpbnRlcmZhY2UgU3BhY2Uge1xuICAgIHRhYmxlOiBSb3V0aW5nVGFibGVMaW5lW107XG4gICAgbmFtZTogc3RyaW5nO1xuICAgIHBhdGg6IHN0cmluZztcbiAgICBzdWJTcGFjZXM6IFJlY29yZDxzcGFjZVBhdGgsIFNwYWNlPjtcbiAgfVxuICBpbnRlcmZhY2UgRmluZEFkZHJJbmRleFJlc3VsdCB7XG4gICAgZXhhY3Q/OiBudW1iZXI7XG4gICAgbGVmdD86IG51bWJlcjtcbiAgfVxuICBpbnRlcmZhY2UgUm91dGVSZXN1bHQge1xuICAgIGFkZHJzOiBzdHJpbmdbXTtcbiAgICBub1BlZXJzPzogYm9vbGVhbjtcbiAgICBpbnZhbGlkPzogYm9vbGVhbjtcbiAgICBicm9hZGNhc3Q/OiBib29sZWFuO1xuICAgIG1pZ2h0QmVGb3JNZT86IGJvb2xlYW47XG4gICAgbm90TWFraW5nUHJvZ3Jlc3NGcm9tQmFzZT86IGJvb2xlYW47XG4gIH1cbn1cblxuY2xhc3MgUm91dGVyIHtcbiAgcHJpdmF0ZSBteUFkZHI6IHN0cmluZztcbiAgcHJpdmF0ZSBteUhhc2g6IFVpbnQzMkFycmF5O1xuICBwcml2YXRlIHJvb3RTcGFjZTogUm91dGVyLlNwYWNlO1xuICBcbiAgYXN5bmMgc3RhcnQobXlBZGRyOiBzdHJpbmcpIHtcbiAgICB0aGlzLm15QWRkciA9IG15QWRkcjtcbiAgICB0aGlzLm15SGFzaCA9IGF3YWl0IGNhbGNBZGRyT3JTdWJTcGFjZUhhc2godGhpcy5teUFkZHIpO1xuICAgIHRoaXMucm9vdFNwYWNlID0ge1xuICAgICAgdGFibGU6IFtdLFxuICAgICAgbmFtZTogJycsXG4gICAgICBwYXRoOiAnJyxcbiAgICAgIHN1YlNwYWNlczoge30sXG4gICAgfTtcbiAgfVxuXG4gIGluaXRTcGFjZShzcGFjZVBhdGg6IHN0cmluZyk6IFJvdXRlci5TcGFjZSB7XG4gICAgY29uc3QgcGF0aFNlZ3MgPSBzcGFjZVBhdGguc3BsaXQoJz4nKTtcbiAgICBjb25zdCBta1NwYWNlUCA9IChsZXZlbDogbnVtYmVyLCBjdXJyZW50U3BhY2U6IFJvdXRlci5TcGFjZSk6IFJvdXRlci5TcGFjZSA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50U3BhY2VOYW1lID0gcGF0aFNlZ3NbbGV2ZWxdO1xuICAgICAgaWYgKCFjdXJyZW50U3BhY2VOYW1lKSByZXR1cm4gY3VycmVudFNwYWNlO1xuXG4gICAgICBsZXQgc3ViU3BhY2UgPSBjdXJyZW50U3BhY2Uuc3ViU3BhY2VzW2N1cnJlbnRTcGFjZU5hbWVdO1xuICAgICAgaWYgKCFzdWJTcGFjZSkge1xuICAgICAgICBzdWJTcGFjZSA9IHtcbiAgICAgICAgICB0YWJsZTogW10sXG4gICAgICAgICAgbmFtZTogcGF0aFNlZ3NbbGV2ZWxdLFxuICAgICAgICAgIHBhdGg6IGpvaW5QYXRoKHBhdGhTZWdzLnNsaWNlKDAsIGxldmVsICsgMSkpLFxuICAgICAgICAgIHN1YlNwYWNlczoge30sXG4gICAgICAgIH07XG4gICAgICAgIGN1cnJlbnRTcGFjZS5zdWJTcGFjZXNbY3VycmVudFNwYWNlTmFtZV0gPSBzdWJTcGFjZTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG1rU3BhY2VQKGxldmVsICsgMSwgc3ViU3BhY2UpO1xuICAgIH07XG5cbiAgICByZXR1cm4gbWtTcGFjZVAoMCwgdGhpcy5yb290U3BhY2UpO1xuICB9XG5cbiAgYXN5bmMgYWRkUGF0aChwYXRoOiBzdHJpbmcpIHtcbiAgICBjb25zdCBhZGRyID0gZXh0cmFjdEFkZHJGcm9tUGF0aChwYXRoKTtcbiAgICBsZXQgW3NwYWNlLCB0YXJnZXQsIHVwcGVyU3BhY2VzXSA9IHRoaXMuZ2V0U3BhY2VBbmRBZGRyKHBhdGgsIGZhbHNlKTtcblxuICAgIGlmICghc3BhY2UpIHtcbiAgICAgIHNwYWNlID0gdXBwZXJTcGFjZXMucG9wKCk7XG4gICAgfVxuICAgIGNvbnN0IGhhc2ggPSBhd2FpdCBjYWxjQWRkck9yU3ViU3BhY2VIYXNoKHRhcmdldCk7XG4gICAgYWRkTGluZShzcGFjZS50YWJsZSwgW2hhc2gsIGFkZHJdKTtcblxuICAgIGNvbnN0IGFkZHJIYXNoID0gYXdhaXQgY2FsY0FkZHJPclN1YlNwYWNlSGFzaChhZGRyKTtcbiAgICB3aGlsZSAodXBwZXJTcGFjZXMubGVuZ3RoID4gMCkge1xuICAgICAgc3BhY2UgPSB1cHBlclNwYWNlcy5wb3AoKTtcbiAgICAgIGFkZExpbmUoc3BhY2UudGFibGUsIFthZGRySGFzaCwgYWRkcl0pO1xuICAgIH1cbiAgfVxuXG4gIHJtQWRkcihhZGRyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBybUFkZHJSID0gKGN1cnJlbnRTcGFjZTogUm91dGVyLlNwYWNlKSA9PiB7XG4gICAgICBjb25zdCBpbmRleCA9IGN1cnJlbnRTcGFjZS50YWJsZS5maW5kSW5kZXgoKFtfLCBsaW5lQWRkcl0pID0+IGxpbmVBZGRyID09PSBhZGRyKTtcbiAgICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgY3VycmVudFNwYWNlLnRhYmxlLnNwbGljZShpbmRleCwgMSk7XG4gICAgICB9XG4gICAgICBPYmplY3QuZW50cmllcyhjdXJyZW50U3BhY2Uuc3ViU3BhY2VzKS5mb3JFYWNoKChbXywgc3BhY2VdKSA9PiB7XG4gICAgICAgIHJtQWRkclIoc3BhY2UpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgICBybUFkZHJSKHRoaXMucm9vdFNwYWNlKTtcbiAgfVxuXG4gIGdldFNwYWNlQW5kQWRkcihwYXRoOiBzdHJpbmcgPSAnJywgZXhhY3QgPSB0cnVlKTogW1JvdXRlci5TcGFjZSwgc3RyaW5nLCBSb3V0ZXIuU3BhY2VbXV0ge1xuICAgIGNvbnN0IHBhdGhTZWdzID0gcGF0aC5zcGxpdCgnPicpO1xuICAgIGxldCBjdXJyZW50U3BhY2UgPSB0aGlzLnJvb3RTcGFjZTtcbiAgICBjb25zdCB1cHBlclNwYWNlczogUm91dGVyLlNwYWNlW10gPSBbXTtcbiAgICB3aGlsZSAocGF0aFNlZ3MubGVuZ3RoID4gMSkge1xuICAgICAgaWYgKHBhdGhTZWdzWzBdKSB7XG4gICAgICAgIHVwcGVyU3BhY2VzLnB1c2goY3VycmVudFNwYWNlKTtcbiAgICAgICAgY3VycmVudFNwYWNlID0gY3VycmVudFNwYWNlLnN1YlNwYWNlc1twYXRoU2Vnc1swXV07XG4gICAgICAgIGlmICghY3VycmVudFNwYWNlKSB7XG4gICAgICAgICAgaWYgKGV4YWN0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYHJvdXRlci50czogZ2V0U3BhY2VBbmRBZGRyOiBzcGFjZSAke2pvaW5QYXRoKHBhdGhTZWdzLnNsaWNlKDAsIC0xKSl9IG5vdCBleGlzdHNgKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIFtudWxsLCBwYXRoU2Vnc1swXSwgdXBwZXJTcGFjZXNdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcGF0aFNlZ3Muc2hpZnQoKTtcbiAgICB9XG4gICAgcmV0dXJuIFtjdXJyZW50U3BhY2UsIHBhdGhTZWdzWzBdLCB1cHBlclNwYWNlc107XG4gIH1cblxuICBnZXRTcGFjZShzcGFjZVBhdGg6IHN0cmluZywgZXhhY3QgPSB0cnVlKTogUm91dGVyLlNwYWNlIHtcbiAgICBjb25zdCBwYXRoU2VncyA9IHNwYWNlUGF0aC5zcGxpdCgnPicpO1xuICAgIGxldCBjdXJyZW50U3BhY2UgPSB0aGlzLnJvb3RTcGFjZTtcbiAgICB3aGlsZSAocGF0aFNlZ3MubGVuZ3RoID4gMCkge1xuICAgICAgaWYgKHBhdGhTZWdzWzBdKSB7XG4gICAgICAgIGN1cnJlbnRTcGFjZSA9IGN1cnJlbnRTcGFjZS5zdWJTcGFjZXNbcGF0aFNlZ3NbMF1dO1xuICAgICAgICBpZiAoIWN1cnJlbnRTcGFjZSAmJiBleGFjdCkgdGhyb3cgbmV3IEVycm9yKGByb3V0ZXIudHM6IGdldFNwYWNlOiBzcGFjZSAke3NwYWNlUGF0aH0gbm90IGV4aXN0c2ApO1xuICAgICAgfVxuICAgICAgcGF0aFNlZ3Muc2hpZnQoKTtcbiAgICB9XG4gICAgcmV0dXJuIGN1cnJlbnRTcGFjZTtcbiAgfVxuXG4gIGdldExpbmUoc3BhY2VQYXRoOiBzdHJpbmcsIGFkZHI6IHN0cmluZyk6IFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lIHtcbiAgICBjb25zdCBzcGFjZSA9IHRoaXMuZ2V0U3BhY2Uoc3BhY2VQYXRoKTtcbiAgICByZXR1cm4gc3BhY2UudGFibGUuZmluZChsaW5lID0+IGxpbmVbMV0gPT09IGFkZHIpO1xuICB9XG5cbiAgcHJpbnRhYmxlVGFibGUocGF0aFdpdGhBZGRyOiBzdHJpbmcpIHtcbiAgICBjb25zdCBbc3BhY2VdID0gdGhpcy5nZXRTcGFjZUFuZEFkZHIocGF0aFdpdGhBZGRyLCBmYWxzZSk7XG4gICAgaWYgKHNwYWNlKVxuICAgICAgcmV0dXJuIHRoaXMuZ2V0U3BhY2VBbmRBZGRyKHBhdGhXaXRoQWRkciwgdHJ1ZSlbMF0udGFibGUubWFwKFxuICAgICAgICAoW2hhc2gsIGFkZHJdKSA9PiBgJHtmb3JtYXRGaXJzdFVpbnQzMkhleChoYXNoKX0gOiAke2FkZHJ9YFxuICAgICAgKS5qb2luKCdcXG4nKSArICdcXG4nXG4gICAgZWxzZSByZXR1cm4gJyAoKCBzcGFjZSBub3QgZXhpc3RzICkpICc7XG4gIH1cblxuICBhc3luYyByb3V0ZShkZXNQYXRoOiBzdHJpbmcsIGJhc2VBZGRyPzogc3RyaW5nKTogUHJvbWlzZTxSb3V0ZXIuUm91dGVSZXN1bHQ+IHtcbiAgICBsZXQgW3NwYWNlLCB0YXJnZXQsIHVwcGVyU3BhY2VzXSA9IHRoaXMuZ2V0U3BhY2VBbmRBZGRyKGRlc1BhdGgsIGZhbHNlKTtcblxuICAgIGlmICghc3BhY2UpIHtcbiAgICAgIHNwYWNlID0gdXBwZXJTcGFjZXMucG9wKCk7XG4gICAgfVxuICAgIHdoaWxlIChzcGFjZS50YWJsZS5sZW5ndGggPT09IDAgJiYgdXBwZXJTcGFjZXMubGVuZ3RoID4gMCkge1xuICAgICAgdGFyZ2V0ID0gc3BhY2UubmFtZTtcbiAgICAgIHNwYWNlID0gdXBwZXJTcGFjZXMucG9wKCk7XG4gICAgfVxuXG4gICAgaWYgKCF0YXJnZXQpIHtcbiAgICAgIGNvbnNvbGUud2FybihgZGVzUGF0aDogJyR7ZGVzUGF0aH0nIGRvZXMgbm90IGhhdmUgYSB2YWxpZCB0YXJnZXRgKTtcbiAgICAgIHJldHVybiB7IGludmFsaWQ6IHRydWUsIGFkZHJzOiBbXSB9XG4gICAgfVxuICAgIGlmICh0YXJnZXQgPT09ICcqJyAmJiBzcGFjZS5wYXRoICE9PSAnJykgeyAvLyBicm9hZGNhc3RcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGJyb2FkY2FzdDogdHJ1ZSxcbiAgICAgICAgYWRkcnM6IHNwYWNlLnRhYmxlLm1hcChsaW5lID0+IGxpbmVbMV0pLmZpbHRlcihhZGRyID0+IGFkZHIgIT09IGJhc2VBZGRyKSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmIChzcGFjZS50YWJsZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGFkZHJzOiBbXSxcbiAgICAgICAgbm9QZWVyczogdHJ1ZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgdGFyZ2V0SGFzaCA9IGF3YWl0IGNhbGNBZGRyT3JTdWJTcGFjZUhhc2godGFyZ2V0KTtcbiAgICBsZXQgbmV4dEFkZHI6IHN0cmluZ1xuICAgIGxldCBtaW5Yb3IgPSAobmV3IFVpbnQzMkFycmF5KDE2KSkuZmlsbCgweEZGRkZGRkZGKTtcblxuICAgIHNwYWNlLnRhYmxlLmZvckVhY2goKFtoYXNoLCBhZGRyXSkgPT4ge1xuICAgICAgaWYgKGFkZHIgPT09IGJhc2VBZGRyKSByZXR1cm47XG4gICAgICBjb25zdCB4b3IgPSB4b3JVaW50MzJBcnJheShoYXNoLCB0YXJnZXRIYXNoKTtcbiAgICAgIGlmIChjb21wYXJlVWludDMyQXJyYXkoeG9yLCBtaW5Yb3IpID09PSAtMSkge1xuICAgICAgICBtaW5Yb3IgPSB4b3I7XG4gICAgICAgIG5leHRBZGRyID0gYWRkcjtcbiAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBteVNlbGZYb3IgPSB4b3JVaW50MzJBcnJheSh0aGlzLm15SGFzaCwgdGFyZ2V0SGFzaCk7XG5cbiAgICBsZXQgbm90TWFraW5nUHJvZ3Jlc3NGcm9tQmFzZTogYm9vbGVhbjtcbiAgICBpZiAoYmFzZUFkZHIpIHtcbiAgICAgIGNvbnN0IGJhc2VIYXNoID0gYXdhaXQgY2FsY0FkZHJPclN1YlNwYWNlSGFzaChiYXNlQWRkcik7XG4gICAgICBub3RNYWtpbmdQcm9ncmVzc0Zyb21CYXNlID0gY29tcGFyZVVpbnQzMkFycmF5KFxuICAgICAgICB4b3JVaW50MzJBcnJheShiYXNlSGFzaCwgdGFyZ2V0SGFzaCksIG1pblhvcixcbiAgICAgICkgPD0gMFxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IHtcbiAgICAgIGFkZHJzOiBuZXh0QWRkciA/IFtuZXh0QWRkcl0gOiBbXSxcbiAgICAgIG5vdE1ha2luZ1Byb2dyZXNzRnJvbUJhc2UsXG4gICAgICBtaWdodEJlRm9yTWU6IGNvbXBhcmVVaW50MzJBcnJheShcbiAgICAgICAgbXlTZWxmWG9yLCBtaW5Yb3JcbiAgICAgICkgPD0gMFxuICAgIH07XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIGJ1aWxkU3BhY2VLQnVja2V0cyhzcGFjZVBhdGg6IHN0cmluZyk6IFJvdXRlci5LQnVja2V0cyB7XG4gICAgcmV0dXJuIHRoaXMuYnVpbGRLQnVja2V0cyh0aGlzLmdldFNwYWNlKHNwYWNlUGF0aCkudGFibGUpO1xuICB9XG5cbiAgYnVpbGRLQnVja2V0cyhsaW5lczogUm91dGVyLlJvdXRpbmdUYWJsZUxpbmVbXSk6IFJvdXRlci5LQnVja2V0cyB7XG4gICAgY29uc3Qga0J1Y2tldHM6IFJvdXRlci5LQnVja2V0cyA9IG5ldyBNYXAoKTtcbiAgICBsaW5lcy5mb3JFYWNoKGFkZHJBbmRIYXNoID0+IHtcbiAgICAgIGNvbnN0IGsgPSBzYW1lQml0c1VpbnQzMkFycmF5KHRoaXMubXlIYXNoLCBhZGRyQW5kSGFzaFswXSk7XG4gICAgICBsZXQgYnVja2V0OiBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdID0ga0J1Y2tldHMuZ2V0KGspO1xuICAgICAgaWYgKGJ1Y2tldCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGJ1Y2tldCA9IFtdO1xuICAgICAgICBrQnVja2V0cy5zZXQoaywgYnVja2V0KTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgeyBleGFjdCwgbGVmdCB9ID0gZmluZEhhc2hJbmRleChidWNrZXQsIGFkZHJBbmRIYXNoWzBdKTtcbiAgICAgIGlmIChleGFjdCAhPT0gdW5kZWZpbmVkKSByZXR1cm47XG4gICAgICBidWNrZXQuc3BsaWNlKGxlZnQsIDAsIGFkZHJBbmRIYXNoKTtcbiAgICB9KTtcbiAgICByZXR1cm4ga0J1Y2tldHM7XG4gIH1cblxuICBkYmdNeUhhc2goKSB7XG4gICAgZGJnTGluZXMoJ21lJywgW1t0aGlzLm15SGFzaCwgdGhpcy5teUFkZHJdXSk7XG4gIH1cbiAgXG4gIHJlbW92ZUxpbmVzKGtCdWNrZXRzOiBSb3V0ZXIuS0J1Y2tldHMsIGxpbmVzOiBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdKTogdm9pZCB7XG4gICAgWy4uLmxpbmVzLCBbdGhpcy5teUhhc2gsIHRoaXMubXlBZGRyXSBhcyBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZV0uZm9yRWFjaCgoW2hhc2gsIF9hZGRyXSkgPT4ge1xuICAgICAgY29uc3QgayA9IHNhbWVCaXRzVWludDMyQXJyYXkodGhpcy5teUhhc2gsIGhhc2gpO1xuICAgICAgY29uc3QgYnVja2V0ID0ga0J1Y2tldHMuZ2V0KGspO1xuICAgICAgaWYgKGJ1Y2tldCkge1xuICAgICAgICBjb25zdCB7IGV4YWN0IH0gPSBmaW5kSGFzaEluZGV4KGJ1Y2tldCwgaGFzaCk7XG4gICAgICAgIGlmICh0eXBlb2YgZXhhY3QgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgYnVja2V0LnNwbGljZShleGFjdCwgMSk7XG4gICAgICAgICAgaWYgKGJ1Y2tldC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGtCdWNrZXRzLmRlbGV0ZShrKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIHBpY2tBZGRyc1RvQ29ubmVjdChrQnVja2V0czogUm91dGVyLktCdWNrZXRzLCBleGlzdGluZ0tCdWNrZXRzOiBSb3V0ZXIuS0J1Y2tldHMpOiBzdHJpbmdbXSB7XG4gICAgY29uc3QgYWRkcnM6IHN0cmluZ1tdID0gW107XG4gICAga0J1Y2tldHMuZm9yRWFjaCgobGluZXMsIGspID0+IHtcbiAgICAgIGNvbnN0IGFsbG93ZWROZXdMaW5lcyA9IGsgPCAzID8gMyAtIGsgOiAxO1xuICAgICAgY29uc3QgZXhpc3RpbmdMaW5lcyA9IGV4aXN0aW5nS0J1Y2tldHMuZ2V0KGspIHx8IFtdO1xuICAgICAgY29uc3QgbGluZXNUb1BpY2sgPSBNYXRoLm1pbihhbGxvd2VkTmV3TGluZXMgLSBleGlzdGluZ0xpbmVzLmxlbmd0aCwgbGluZXMubGVuZ3RoKTtcbiAgICAgIGlmIChsaW5lc1RvUGljayA+IDApIHtcbiAgICAgICAgYWRkcnMucHVzaChcbiAgICAgICAgICAuLi5zaHVmZmxlKGxpbmVzKS5zbGljZSgwLCBsaW5lc1RvUGljaykubWFwKGxpbmUgPT4gbGluZVsxXSlcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBhZGRycztcbiAgfVxufVxuXG5mdW5jdGlvbiB4b3JVaW50MzJBcnJheShoYXNoMTogVWludDMyQXJyYXksIGhhc2gyOiBVaW50MzJBcnJheSk6IFVpbnQzMkFycmF5IHtcbiAgcmV0dXJuIGhhc2gxLm1hcCgodiwgaSkgPT4gdiBeIGhhc2gyW2ldKVxufVxuXG5mdW5jdGlvbiBjb21wYXJlVWludDMyQXJyYXkoYXJyMTogVWludDMyQXJyYXksIGFycjI6IFVpbnQzMkFycmF5KTogbnVtYmVyIHtcbiAgLy8gYXNzdW1lIGFycjEgaGFzIHNhbWUgbGVuZ3RoIGFzIGFycjJcbiAgZm9yKGxldCBpID0gMDsgaSA8IGFycjEubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoYXJyMVtpXSA8IGFycjJbaV0pIHJldHVybiAtMTtcbiAgICBpZiAoYXJyMVtpXSA+IGFycjJbaV0pIHJldHVybiAxO1xuICB9XG4gIHJldHVybiAwO1xufVxuXG5mdW5jdGlvbiBzYW1lQml0c1VpbnQzMkFycmF5KGFycjE6IFVpbnQzMkFycmF5LCBhcnIyOiBVaW50MzJBcnJheSk6IG51bWJlciB7XG4gIGNvbnN0IHhvciA9IHhvclVpbnQzMkFycmF5KGFycjEsIGFycjIpO1xuICBsZXQgc2FtZUJpdHMgPSAwO1xuICBmb3IobGV0IGkgPSAwOyBpIDwgeG9yLmxlbmd0aDsgaSsrKSB7XG4gICAgZm9yIChsZXQgaiA9IDA7IGogPCAzMjsgaisrKSB7XG4gICAgICBpZiAoKDB4ODAwMDAwMDAgJiB4b3JbaV0pICE9PSAwKSByZXR1cm4gc2FtZUJpdHM7XG4gICAgICBzYW1lQml0cysrO1xuICAgICAgeG9yW2ldID0geG9yW2ldIDw8IDE7XG4gICAgfVxuICB9XG4gIHJldHVybiBzYW1lQml0cztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc2hMaW5lKGFkZHJzOiBzdHJpbmdbXSk6IFByb21pc2U8Um91dGVyLlJvdXRpbmdUYWJsZUxpbmVbXT4ge1xuICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgYWRkcnMubWFwKGFzeW5jIChhZGRyKTogUHJvbWlzZTxSb3V0ZXIuUm91dGluZ1RhYmxlTGluZT4gPT4gKFtcbiAgICAgIGF3YWl0IGNhbGNBZGRyT3JTdWJTcGFjZUhhc2goYWRkciksIGFkZHJcbiAgICBdKSlcbiAgKTtcbn1cblxuZnVuY3Rpb24gZmluZEhhc2hJbmRleChsaW5lczogUm91dGVyLlJvdXRpbmdUYWJsZUxpbmVbXSwgaGFzaDogVWludDMyQXJyYXkpOiBSb3V0ZXIuRmluZEFkZHJJbmRleFJlc3VsdCB7XG4gIGxldCBsZWZ0ID0gMCwgcmlnaHQgPSBsaW5lcy5sZW5ndGg7XG4gIHdoaWxlIChsZWZ0ICE9PSByaWdodCkge1xuICAgIGNvbnN0IG1pZGRsZSA9IE1hdGguZmxvb3IoKGxlZnQgKyByaWdodCkgLyAyKTtcbiAgICBjb25zdCBjb21wYXJlZCA9IGNvbXBhcmVVaW50MzJBcnJheShoYXNoLCBsaW5lc1ttaWRkbGVdWzBdKTtcbiAgICBpZiAoY29tcGFyZWQgPT09IC0xKSB7IHJpZ2h0ID0gbWlkZGxlOyB9XG4gICAgZWxzZSBpZiAoY29tcGFyZWQgPT09IDEpIHsgbGVmdCA9IG1pZGRsZSArIDE7IH1cbiAgICBlbHNlIHsgLy8gY29tcGFyZWQgPT09IDBcbiAgICAgIHJldHVybiB7IGV4YWN0OiBtaWRkbGUgfTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHsgbGVmdCB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VLQnVja2V0cyguLi5rQnVja2V0c0FycjogUm91dGVyLktCdWNrZXRzW10pOiBSb3V0ZXIuS0J1Y2tldHMge1xuICBjb25zdCBuZXdLQnVja2V0czogUm91dGVyLktCdWNrZXRzID0gbmV3IE1hcCgpO1xuICBrQnVja2V0c0Fyci5mb3JFYWNoKGtCdWNrZXRzID0+IHtcbiAgICBrQnVja2V0cy5mb3JFYWNoKChsaW5lcywgaykgPT4ge1xuICAgICAgbGV0IGJ1Y2tldDogUm91dGVyLlJvdXRpbmdUYWJsZUxpbmVbXSA9IG5ld0tCdWNrZXRzLmdldChrKTtcbiAgICAgIGlmIChidWNrZXQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBidWNrZXQgPSBbXTtcbiAgICAgICAgbmV3S0J1Y2tldHMuc2V0KGssIGJ1Y2tldCk7XG4gICAgICB9XG5cbiAgICAgIGxpbmVzLmZvckVhY2gobGluZSA9PiB7XG4gICAgICAgIGFkZExpbmUoYnVja2V0LCBsaW5lKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICByZXR1cm4gbmV3S0J1Y2tldHM7XG59XG5cbmZ1bmN0aW9uIGFkZExpbmUobGluZXM6IFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lW10sIGxpbmU6IFJvdXRlci5Sb3V0aW5nVGFibGVMaW5lKTogdm9pZCB7XG4gIGNvbnN0IHsgZXhhY3QsIGxlZnQgfSA9IGZpbmRIYXNoSW5kZXgobGluZXMsIGxpbmVbMF0pO1xuICBpZiAoZXhhY3QgIT09IHVuZGVmaW5lZCkgcmV0dXJuO1xuICBsaW5lcy5zcGxpY2UobGVmdCwgMCwgbGluZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkYmdMaW5lcyhuYW1lOiBzdHJpbmcsIGxpbmVzOiBSb3V0ZXIuUm91dGluZ1RhYmxlTGluZVtdKSB7XG4gIGNvbnNvbGUuZ3JvdXAobmFtZSk7XG4gIGNvbnNvbGUubG9nKFxuICAgIGxpbmVzLm1hcCgoW2hhc2gsIGFkZHJdKSA9PiBgJHtmb3JtYXRGaXJzdFVpbnQzMkhleChoYXNoKX0gOjogJHthZGRyfWApLmpvaW4oJ1xcbicpXG4gICk7XG4gIGNvbnNvbGUuZ3JvdXBFbmQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGRiZ0tCdWNrZXRzKG5hbWU6IHN0cmluZywga0J1Y2tldHM6IFJvdXRlci5LQnVja2V0cyk6IHZvaWQge1xuICBjb25zb2xlLmdyb3VwKG5hbWUpO1xuICBrQnVja2V0cy5mb3JFYWNoKChsaW5lcywgaykgPT4ge1xuICAgIGRiZ0xpbmVzKGsudG9TdHJpbmcoKSwgbGluZXMpO1xuICB9KVxuICBjb25zb2xlLmdyb3VwRW5kKCk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IFJvdXRlcjtcbiIsImltcG9ydCBBZ2VudCBmcm9tICcuL2FnZW50JztcbmltcG9ydCBFdmVudFRhcmdldCwgeyBDdXN0b21FdmVudCB9IGZyb20gJy4vbWlzYy9ldmVudC10YXJnZXQnXG5pbXBvcnQgQ29ubiwgeyBNZXNzYWdlUmVjZWl2ZWRFdmVudCB9IGZyb20gJy4vY29ubi9iYXNlJztcbmltcG9ydCB7IFBlZXJJZGVudGl0eSB9IGZyb20gJy4vbWlzYy9pZGVudGl0eSc7XG5pbXBvcnQgeyBNZXNzYWdlIGFzIE9yaU1lc3NhZ2UgfSBmcm9tICcuL21lc3NhZ2UvbWVzc2FnZSc7XG5pbXBvcnQgeyBleHRyYWN0QWRkckZyb21QYXRoIH0gZnJvbSAnLi9taXNjL3V0aWxzJztcblxuZGVjbGFyZSBuYW1lc3BhY2UgVHVubmVsIHtcbiAgdHlwZSBNZXNzYWdlRGF0YSA9IE9taXQ8T3JpTWVzc2FnZSwgJ3NyY1BhdGgnIHwgJ2Rlc1BhdGgnPiAmIHsgW186IHN0cmluZ106IGFueSB9XG4gIGV4cG9ydCBjb25zdCBlbnVtIERpcmVjdGlvbiB7IEEgPSAnQScsIEIgPSAnQicgfVxuICBpbnRlcmZhY2UgTWVzc2FnZSBleHRlbmRzIE9yaU1lc3NhZ2Uge1xuICAgIHR1bm5lbENvbm5JZDogc3RyaW5nO1xuICAgIGRpcmVjdGlvbjogRGlyZWN0aW9uO1xuICB9XG5cbiAgaW50ZXJmYWNlIFN0YXJ0TGlua09wdHMge1xuICAgIHBlZXJQYXRoOiBzdHJpbmc7XG4gICAgbXlQYXRoOiBzdHJpbmc7XG4gICAgc2VuZDogKG1lc3NhZ2U6IFR1bm5lbC5NZXNzYWdlKSA9PiB2b2lkO1xuICAgIGNsb3NlOiAoKSA9PiB2b2lkO1xuICB9XG5cbiAgdHlwZSB0dW5uZWxDb25uSWQgPSBzdHJpbmc7XG4gIHR5cGUgQ29ubklkVG9UaHJvdWdocyA9IFJlY29yZDx0dW5uZWxDb25uSWQsIFJlY29yZDxzdHJpbmcsIFtwYXRoOiBzdHJpbmcsIHBlZXJBZGRyOiBzdHJpbmddPj47XG59XG5cbmludGVyZmFjZSBOZXdUdW5uZWxFdmVudERldGFpbCB7XG4gIHR1bm5lbDogVHVubmVsQ29ubjtcbn1cbmNsYXNzIE5ld1R1bm5lbEV2ZW50IGV4dGVuZHMgQ3VzdG9tRXZlbnQ8TmV3VHVubmVsRXZlbnREZXRhaWw+IHtcbiAgdHlwZSA9ICduZXctdHVubmVsJ1xufVxuXG5pbnRlcmZhY2UgRXZlbnRNYXAge1xuICAnbmV3LXR1bm5lbCc6IE5ld1R1bm5lbEV2ZW50O1xufVxuXG5jbGFzcyBUdW5uZWxNYW5hZ2VyIGV4dGVuZHMgRXZlbnRUYXJnZXQ8RXZlbnRNYXA+IHtcbiAgcHJpdmF0ZSBhZ2VudDogQWdlbnQ7XG4gIHByaXZhdGUgdHVubmVsczogUmVjb3JkPHN0cmluZywgVHVubmVsQ29ubj4gPSB7fTtcblxuICBwcml2YXRlIGNvbm5JZFRvVGhyb3VnaHM6IFR1bm5lbC5Db25uSWRUb1Rocm91Z2hzID0ge307XG5cbiAgY29uc3RydWN0b3IoYWdlbnQ6IEFnZW50KSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLmFnZW50ID0gYWdlbnQ7XG4gIH1cblxuICBvblJlY2VpdmVNZXNzYWdlKGV2ZW50OiBNZXNzYWdlUmVjZWl2ZWRFdmVudCk6IGJvb2xlYW4ge1xuICAgIGNvbnN0IHsgdHVubmVsQ29ubklkIH0gPSBldmVudC5kZXRhaWwgYXMgVHVubmVsLk1lc3NhZ2U7XG4gICAgaWYgKHR1bm5lbENvbm5JZCkge1xuICAgICAgKGFzeW5jICgpID0+IHtcbiAgICAgICAgY29uc3QgdHVubmVsID0gdGhpcy50dW5uZWxzW3R1bm5lbENvbm5JZF07XG4gICAgICAgIGlmICh0dW5uZWwpIHtcbiAgICAgICAgICB0dW5uZWwub25SZWNlaXZlKGV2ZW50KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zdCBuZXdUdW5uZWwgPSBuZXcgVHVubmVsQ29ubih0dW5uZWxDb25uSWQpO1xuXG4gICAgICAgICAgY29uc3QgbmV3VHVubmVsRXZlbnQgPSBuZXcgTmV3VHVubmVsRXZlbnQoeyB0dW5uZWw6IG5ld1R1bm5lbCB9KTtcbiAgICAgICAgICB0aGlzLmRpc3BhdGNoRXZlbnQobmV3VHVubmVsRXZlbnQpO1xuXG4gICAgICAgICAgaWYgKCFuZXdUdW5uZWxFdmVudC5kZWZhdWx0UHJldmVudGVkKSB7XG4gICAgICAgICAgICBjb25zdCB7IHNyY1BhdGg6IHBlZXJQYXRoIH0gPSBldmVudC5kZXRhaWw7XG4gICAgICAgICAgICB0aGlzLnR1bm5lbHNbbmV3VHVubmVsLmNvbm5JZF0gPSBuZXdUdW5uZWw7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnN0YXJ0VHVubmVsKHBlZXJQYXRoLCBuZXdUdW5uZWwpO1xuICAgICAgICAgICAgbmV3VHVubmVsLm9uUmVjZWl2ZShldmVudCk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgY3JlYXRlKHBlZXJQYXRoOiBzdHJpbmcsIHR1bm5lbENvbm5JZD86IHN0cmluZyk6IFByb21pc2U8VHVubmVsQ29ubj4ge1xuICAgIGNvbnN0IHR1bm5lbCA9IG5ldyBUdW5uZWxDb25uKHR1bm5lbENvbm5JZCk7XG4gICAgdGhpcy50dW5uZWxzW3R1bm5lbC5jb25uSWRdID0gdHVubmVsO1xuICAgIGF3YWl0IHRoaXMuc3RhcnRUdW5uZWwocGVlclBhdGgsIHR1bm5lbCk7XG5cbiAgICByZXR1cm4gdHVubmVsO1xuICB9XG5cbiAgcHJpdmF0ZSBhc3luYyBzdGFydFR1bm5lbChwZWVyUGF0aDogc3RyaW5nLCB0dW5uZWw6IFR1bm5lbENvbm4pOiBQcm9taXNlPFR1bm5lbENvbm4+IHtcbiAgICBhd2FpdCB0dW5uZWwuc3RhcnRMaW5rKHtcbiAgICAgIG15UGF0aDogdGhpcy5hZ2VudC5teUlkZW50aXR5LmFkZHIsIC8vIFRPRE86IHN1YnNwYWNlXG4gICAgICBwZWVyUGF0aCxcbiAgICAgIHNlbmQ6IChtZXNzYWdlOiBUdW5uZWwuTWVzc2FnZSkgPT4ge1xuICAgICAgICB0aGlzLmFnZW50LnJvdXRlKG1lc3NhZ2UpO1xuICAgICAgfSxcbiAgICAgIGNsb3NlOiAoKSA9PiB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnR1bm5lbHNbdHVubmVsLmNvbm5JZF07XG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHR1bm5lbDtcbiAgfVxuXG4gIGNhY2hlUmVjZWl2ZShmcm9tUGVlckFkZHI6IHN0cmluZywgc3JjQWRkcjogc3RyaW5nLCBtZXNzYWdlOiBPcmlNZXNzYWdlKTogdm9pZCB7XG4gICAgaWYgKGZyb21QZWVyQWRkciA9PT0gc3JjQWRkcikgcmV0dXJuO1xuICAgIGNvbnN0IHsgdHVubmVsQ29ubklkLCBkaXJlY3Rpb24gfSA9IG1lc3NhZ2UgYXMgVHVubmVsLk1lc3NhZ2U7XG4gICAgaWYgKCF0dW5uZWxDb25uSWQpIHJldHVybjtcblxuICAgIHN3aXRjaCAoZGlyZWN0aW9uKSB7XG4gICAgICBjYXNlIFR1bm5lbC5EaXJlY3Rpb24uQTpcbiAgICAgICAgcmV0dXJuIHRoaXMuc2F2ZUNhY2hlKHR1bm5lbENvbm5JZCwgVHVubmVsLkRpcmVjdGlvbi5CLCBtZXNzYWdlLnNyY1BhdGgsIGZyb21QZWVyQWRkcik7XG4gICAgICBjYXNlIFR1bm5lbC5EaXJlY3Rpb24uQjpcbiAgICAgICAgcmV0dXJuIHRoaXMuc2F2ZUNhY2hlKHR1bm5lbENvbm5JZCwgVHVubmVsLkRpcmVjdGlvbi5BLCBtZXNzYWdlLnNyY1BhdGgsIGZyb21QZWVyQWRkcik7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBzYXZlQ2FjaGUodHVubmVsQ29ubklkOiBzdHJpbmcsIGRpcmVjdGlvbjogVHVubmVsLkRpcmVjdGlvbiwgZGVzUGF0aDogc3RyaW5nLCBwZWVyQWRkcjogc3RyaW5nKSB7XG4gICAgbGV0IHRocm91Z2ggPSB0aGlzLmNvbm5JZFRvVGhyb3VnaHNbdHVubmVsQ29ubklkXTtcbiAgICBpZiAoIXRocm91Z2gpIHtcbiAgICAgIHRocm91Z2ggPSB7fTtcbiAgICAgIHRoaXMuY29ubklkVG9UaHJvdWdoc1t0dW5uZWxDb25uSWRdID0gdGhyb3VnaDtcbiAgICB9XG5cbiAgICBpZiAoIXRocm91Z2hbZGlyZWN0aW9uXSkge1xuICAgICAgdGhyb3VnaFtkaXJlY3Rpb25dID0gW2Rlc1BhdGgsIHBlZXJBZGRyXTtcbiAgICB9XG4gIH1cblxuICByb3V0ZShtZXNzYWdlOiBPcmlNZXNzYWdlKTogc3RyaW5nIHwgbnVsbCB7XG4gICAgY29uc3QgeyB0dW5uZWxDb25uSWQsIGRpcmVjdGlvbiB9ID0gbWVzc2FnZSBhcyBUdW5uZWwuTWVzc2FnZTtcblxuICAgIGlmICh0dW5uZWxDb25uSWQgJiYgZGlyZWN0aW9uKSB7XG4gICAgICBjb25zdCB0aHJvdWdoID0gdGhpcy5jb25uSWRUb1Rocm91Z2hzW3R1bm5lbENvbm5JZF0/LltkaXJlY3Rpb25dO1xuICAgICAgaWYgKHRocm91Z2gpIHtcbiAgICAgICAgY29uc3QgW2Rlc1BhdGgsIHBlZXJBZGRyXSA9IHRocm91Z2g7XG4gICAgICAgIGlmIChtZXNzYWdlLmRlc1BhdGggPT09IGRlc1BhdGgpIHJldHVybiBwZWVyQWRkcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgVHVubmVsTWFuYWdlcjtcblxuY2xhc3MgVHVubmVsQ29ubiBleHRlbmRzIENvbm4ge1xuICBwcml2YXRlIHBlZXJQYXRoOiBzdHJpbmc7XG4gIHByaXZhdGUgbXlQYXRoOiBzdHJpbmc7XG4gIHByaXZhdGUgZGlyZWN0aW9uOiBUdW5uZWwuRGlyZWN0aW9uO1xuICBwcml2YXRlIHNlbmRGdW5jOiAobWVzc2FnZTogVHVubmVsLk1lc3NhZ2UpID0+IHZvaWQ7XG4gIHByaXZhdGUgY2xvc2VGdW5jOiAoKSA9PiB2b2lkO1xuXG4gIGNvbnN0cnVjdG9yKHR1bm5lbENvbm5JZD86IHN0cmluZykge1xuICAgIHN1cGVyKHR1bm5lbENvbm5JZCk7XG4gICAgdGhpcy5kaXJlY3Rpb24gPSB0dW5uZWxDb25uSWQgPyBUdW5uZWwuRGlyZWN0aW9uLkIgOiBUdW5uZWwuRGlyZWN0aW9uLkE7XG4gIH1cblxuICBhc3luYyBzdGFydExpbmsob3B0czogVHVubmVsLlN0YXJ0TGlua09wdHMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICB0aGlzLnBlZXJQYXRoID0gb3B0cy5wZWVyUGF0aDtcbiAgICB0aGlzLnBlZXJJZGVudGl0eSA9IG5ldyBQZWVySWRlbnRpdHkob3B0cy5wZWVyUGF0aCk7XG4gICAgdGhpcy5teVBhdGggPSBvcHRzLm15UGF0aDtcbiAgICB0aGlzLnNlbmRGdW5jID0gb3B0cy5zZW5kO1xuICAgIHRoaXMuY2xvc2VGdW5jID0gb3B0cy5jbG9zZTtcblxuICAgIHRoaXMuc3RhdGUgPSBDb25uLlN0YXRlLkNPTk5FQ1RFRDtcbiAgfVxuXG4gIG9uUmVjZWl2ZShldmVudDogTWVzc2FnZVJlY2VpdmVkRXZlbnQpIHtcbiAgICBjb25zdCBkZXRhaWwgPSBldmVudC5kZXRhaWwgYXMgVHVubmVsLk1lc3NhZ2U7XG4gICAgY29uc3Qgc3JjQWRkciA9IGV4dHJhY3RBZGRyRnJvbVBhdGgoZGV0YWlsLnNyY1BhdGgpO1xuICAgIGlmIChcbiAgICAgIHNyY0FkZHIgPT09IHRoaXMucGVlcklkZW50aXR5LmFkZHIgJiZcbiAgICAgIGRldGFpbC50dW5uZWxDb25uSWQgPT09IHRoaXMuY29ubklkXG4gICAgKSB7XG4gICAgICB0aGlzLmRpc3BhdGNoRXZlbnQoZXZlbnQpO1xuICAgIH1cbiAgfVxuXG4gIHNlbmQobWVzc2FnZUNvbnRlbnQ6IFR1bm5lbC5NZXNzYWdlRGF0YSkge1xuICAgIGNvbnN0IG1lc3NhZ2U6IFR1bm5lbC5NZXNzYWdlID0ge1xuICAgICAgc3JjUGF0aDogdGhpcy5teVBhdGgsXG4gICAgICBkZXNQYXRoOiB0aGlzLnBlZXJQYXRoLFxuICAgICAgdHVubmVsQ29ubklkOiB0aGlzLmNvbm5JZCxcbiAgICAgIGRpcmVjdGlvbjogdGhpcy5kaXJlY3Rpb24sXG4gICAgICAuLi5tZXNzYWdlQ29udGVudCxcbiAgICB9XG4gICAgdGhpcy5zZW5kRnVuYyhtZXNzYWdlKTtcbiAgfVxuXG4gIGFzeW5jIGNsb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMuc3RhdGUgPSBDb25uLlN0YXRlLkNMT1NFRDtcbiAgICB0aGlzLmNsb3NlRnVuYygpO1xuICB9XG59XG5cbmV4cG9ydCB7IFR1bm5lbENvbm4sIE5ld1R1bm5lbEV2ZW50IH07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJpc29tb3JwaGljLXdlYmNyeXB0b1wiKTsiLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoXCJ3c1wiKTsiLCIvLyBUaGUgbW9kdWxlIGNhY2hlXG52YXIgX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fID0ge307XG5cbi8vIFRoZSByZXF1aXJlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfX3dlYnBhY2tfcmVxdWlyZV9fKG1vZHVsZUlkKSB7XG5cdC8vIENoZWNrIGlmIG1vZHVsZSBpcyBpbiBjYWNoZVxuXHR2YXIgY2FjaGVkTW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXTtcblx0aWYgKGNhY2hlZE1vZHVsZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIGNhY2hlZE1vZHVsZS5leHBvcnRzO1xuXHR9XG5cdC8vIENyZWF0ZSBhIG5ldyBtb2R1bGUgKGFuZCBwdXQgaXQgaW50byB0aGUgY2FjaGUpXG5cdHZhciBtb2R1bGUgPSBfX3dlYnBhY2tfbW9kdWxlX2NhY2hlX19bbW9kdWxlSWRdID0ge1xuXHRcdC8vIG5vIG1vZHVsZS5pZCBuZWVkZWRcblx0XHQvLyBubyBtb2R1bGUubG9hZGVkIG5lZWRlZFxuXHRcdGV4cG9ydHM6IHt9XG5cdH07XG5cblx0Ly8gRXhlY3V0ZSB0aGUgbW9kdWxlIGZ1bmN0aW9uXG5cdF9fd2VicGFja19tb2R1bGVzX19bbW9kdWxlSWRdKG1vZHVsZSwgbW9kdWxlLmV4cG9ydHMsIF9fd2VicGFja19yZXF1aXJlX18pO1xuXG5cdC8vIFJldHVybiB0aGUgZXhwb3J0cyBvZiB0aGUgbW9kdWxlXG5cdHJldHVybiBtb2R1bGUuZXhwb3J0cztcbn1cblxuIiwiLy8gZ2V0RGVmYXVsdEV4cG9ydCBmdW5jdGlvbiBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIG5vbi1oYXJtb255IG1vZHVsZXNcbl9fd2VicGFja19yZXF1aXJlX18ubiA9IChtb2R1bGUpID0+IHtcblx0dmFyIGdldHRlciA9IG1vZHVsZSAmJiBtb2R1bGUuX19lc01vZHVsZSA/XG5cdFx0KCkgPT4gKG1vZHVsZVsnZGVmYXVsdCddKSA6XG5cdFx0KCkgPT4gKG1vZHVsZSk7XG5cdF9fd2VicGFja19yZXF1aXJlX18uZChnZXR0ZXIsIHsgYTogZ2V0dGVyIH0pO1xuXHRyZXR1cm4gZ2V0dGVyO1xufTsiLCIvLyBkZWZpbmUgZ2V0dGVyIGZ1bmN0aW9ucyBmb3IgaGFybW9ueSBleHBvcnRzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLmQgPSAoZXhwb3J0cywgZGVmaW5pdGlvbikgPT4ge1xuXHRmb3IodmFyIGtleSBpbiBkZWZpbml0aW9uKSB7XG5cdFx0aWYoX193ZWJwYWNrX3JlcXVpcmVfXy5vKGRlZmluaXRpb24sIGtleSkgJiYgIV9fd2VicGFja19yZXF1aXJlX18ubyhleHBvcnRzLCBrZXkpKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywga2V5LCB7IGVudW1lcmFibGU6IHRydWUsIGdldDogZGVmaW5pdGlvbltrZXldIH0pO1xuXHRcdH1cblx0fVxufTsiLCJfX3dlYnBhY2tfcmVxdWlyZV9fLm8gPSAob2JqLCBwcm9wKSA9PiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCkpIiwiLy8gZGVmaW5lIF9fZXNNb2R1bGUgb24gZXhwb3J0c1xuX193ZWJwYWNrX3JlcXVpcmVfXy5yID0gKGV4cG9ydHMpID0+IHtcblx0aWYodHlwZW9mIFN5bWJvbCAhPT0gJ3VuZGVmaW5lZCcgJiYgU3ltYm9sLnRvU3RyaW5nVGFnKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFN5bWJvbC50b1N0cmluZ1RhZywgeyB2YWx1ZTogJ01vZHVsZScgfSk7XG5cdH1cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsICdfX2VzTW9kdWxlJywgeyB2YWx1ZTogdHJ1ZSB9KTtcbn07IiwiaW1wb3J0IEFnZW50IGZyb20gJy4vYWdlbnQnO1xuaW1wb3J0IEJyb3dzZXJDb25uTWFuYWdlciBmcm9tICcuL2Nvbm4tbWFuYWdlci9icm93c2VyJztcbmltcG9ydCBXc3NDb25uTWFuYWdlciBmcm9tICcuL2Nvbm4tbWFuYWdlci93c3MnO1xuXG5leHBvcnQgeyBBZ2VudCwgQnJvd3NlckNvbm5NYW5hZ2VyLCBXc3NDb25uTWFuYWdlciB9O1xuIl0sIm5hbWVzIjpbXSwic291cmNlUm9vdCI6IiJ9
import { EventDispatcher, request, onRequested, randomStr, sleepPromise } from './utils.js';
import WsConn from './conn/ws.js';

const knownAddrsKey = 'knownAddrs'
const groupRequestDefaultSettings = {
  timeout: 10000,
  aliveTimeout: 500,
};
const GROUP_REQ_NEGATIVE_RESPONSE = (() => {})();
const RUNNING = 'RUNNING';
const WILL_RUN_NEXT_ROUND = 'WILL_RUN_NEXT_ROUND';

const randomlyCycleArr = (arr, enabled = true) => {
  if (!enabled) { return arr; }
  const index = Math.floor(arr.length * Math.random());
  return [
    ...arr.slice(index),
    ...arr.slice(0, index),
  ];
}

// Network Client by PastLeo, 2019/8
class Client {
  constructor(connManager, localStorage, config) {
    this._connManager = connManager;
    this._localStorage = localStorage;
    this._knownAddrs = JSON.parse(this._localStorage.getItem(knownAddrsKey) || '[]');
    this._connecting = [];

    // routing
    this._groupRoutes = {};

    // group
    this._joinedGroups = {}; // [neighbors]
    this._addrToJoinedGroups = {}; // [groups]
    this._groupInfo = {} // { buoy }
    this._groupPayload = {}; // { ... }

    // group maintaining
    this._groupGoingToMaintain = {}; // timeout number
    this._groupRejoining = {}; // boolean
    this._groupMemberTreeCache = {};

    // connection garbage collecting
    this._garbageCollecting = null;
    this._gcCandidateAddrs = [];

    // broadcast
    this._broadcastMsgs = {}

    this._registeredReqs = {};
    this._eventDispatcher = new EventDispatcher();

    this._config = {
      groupNeighborLow: 3,
      groupNeighborHigh: 6,
      groupNeighborMax: 8,
      groupNeighborMaxWss: 100,
      routeTtl: 10,
      joinRetryWait: 1500,
      rejoinRetryWait: 1000,
      broadcastMsgIdExpires: 600000,
      routeExpires: 60000,
      groupMaintainingWait: 700,
      groupNeighboringHops: 4,
      groupMemberTreeCacheExpires: 10000,
      gcWait: 4000,
      ...config,
    };
  }

  know(addr) {
    if (
      this._knownAddrs.indexOf(addr) === -1 &&
      WsConn.protocols.indexOf((new URL(addr)).protocol) >= 0
    ) {
      this._knownAddrs.push(addr);
      this._writeLocalStorage();
    }
  }
  forget(addr) {
    this._make_unknown(addr);
    if (this._connManager.isConnected(addr)) {
      this._connManager.close(addr);
    }
  }
  known(addr) {
    return this._knownAddrs.indexOf(addr) >= 0;
  }
  _make_unknown(addr) {
    const knownAddrIndex = this._knownAddrs.indexOf(addr);
    if (knownAddrIndex >= 0) {
      this._knownAddrs.splice(knownAddrIndex, 1);
      this._writeLocalStorage();
    }
  }
  _writeLocalStorage() {
    this._localStorage.setItem(knownAddrsKey, JSON.stringify(this._knownAddrs));
  }

  _connectingCheck(addr) {
    if (this._connecting.indexOf(addr) >= 0) { return false; }
    this._connecting.push(addr);
    return true;
  }
  _connectingRelease(addr) {
    const connectingIndex = this._connecting.indexOf(addr);
    if (connectingIndex >= 0) {
      this._connecting.splice(connectingIndex, 1);
    }
  }

  _addJoined(group, addr) {
    const groupNeighbors = this._joinedGroups[group];
    if (addr) {
      if (groupNeighbors) {
        if (groupNeighbors.indexOf(addr) === -1) {
          groupNeighbors.push(addr);
        }
      } else {
        this._joinedGroups[group] = [addr];
      }
    } else  {
      if (!groupNeighbors) {
        this._joinedGroups[group] = [];
      }
      return
    }
    const groupsWithAddr = this._addrToJoinedGroups[addr];
    if (groupsWithAddr) {
      if (groupsWithAddr.indexOf(group) === -1) {
        groupsWithAddr.push(group);
      }
    } else {
      this._addrToJoinedGroups[addr] = [group];
    }
  }
  _hasJoined(group, addr = null) {
    const groupNeighbors = this._joinedGroups[group];
    if (addr && groupNeighbors) {
      return groupNeighbors.indexOf(addr) >= 0;
    } else {
      return !!groupNeighbors;
    }
  }
  _hasJoinedWithNeighbor(group, neighborCnt = 0) {
    const groupNeighbors = this._joinedGroups[group];
    return groupNeighbors && groupNeighbors.length > neighborCnt;
  }
  _getNeighbors(group, excludedAddrs = [], randomCycled = false) {
    return randomlyCycleArr(
      (this._joinedGroups[group] || []).filter(
        x => excludedAddrs.indexOf(x) === -1
      ),
      randomCycled
    );
  }
  _rmJoinedAddr(addr) {
    const groupsWithAddr = this._addrToJoinedGroups[addr];
    if (groupsWithAddr) {
      groupsWithAddr.forEach(group => {
        const groupNeighbors = this._joinedGroups[group];
        const removingIndex = groupNeighbors.indexOf(addr);
        if (removingIndex >= 0) {
          groupNeighbors.splice(removingIndex, 1);
        }
      });
      delete this._addrToJoinedGroups[addr];
    }

    Object.keys(this._groupRoutes).forEach(group => {
      if (this._groupRoutes[group].indexOf(addr) >= 0) {
        delete this._groupRoutes[group];
      }
    });
  }
  _rmJoinedGroup(group) {
    const groupNeighbors = this._joinedGroups[group];
    if (groupNeighbors) {
      groupNeighbors.forEach(addr => {
        const groupsWithAddr = this._addrToJoinedGroups[addr];
        const removingIndex = groupsWithAddr.indexOf(addr);
        if (removingIndex >= 0) {
          groupsWithAddr.splice(removingIndex, 1);
        }
      });
      delete this._joinedGroups[group];
      delete this._groupInfo[group];
      delete this._groupPayload[group];
    }
  }
  _rmJoined(group, addr) {
    const groupsWithAddr = this._addrToJoinedGroups[addr];
    if (groupsWithAddr) {
      const removingIndex = groupsWithAddr.indexOf(group);
      if (removingIndex >= 0) {
        groupsWithAddr.splice(removingIndex, 1);
      }
    }
    const groupNeighbors = this._joinedGroups[group];
    if (groupNeighbors) {
      const removingIndex = groupNeighbors.indexOf(addr);
      if (removingIndex >= 0) {
        groupNeighbors.splice(removingIndex, 1);
      }
    }
  }

  _checkMsgId(msgId) {
    if (this._broadcastMsgs[msgId]) { return false; }
    this._broadcastMsgs[msgId] = true;
    setTimeout(() => { delete this._broadcastMsgs[msgId]; }, this._config.broadcastMsgIdExpires);
    return true
  }

  /*
   * _registerGroupRequest(term, callbackFirst, callbackSecond) => method
   *
   * method: async (group, payload = {}) => ({ ...response }) | {}
   * callbackFirst: async (group, payload = {}, { requestNextsRace, requestNextsAll }) => ({ ...response }) | GROUP_REQ_NEGATIVE_RESPONSE
   * callbackSecond: (group, payload = {}) => ({ ...response }) | GROUP_REQ_NEGATIVE_RESPONSE
   *
   * requestNextsRace: async (payload = {}) => ({ ...response }) | {}
   * requestNextsAll: async (payload = {}) => ([{ ...response }])
   * requestNextOne: async (addr, payload = {}) => ({ ...response }) | {}
   */
  _registerGroupRequest(term, callbackFirst, callbackSecond, registeredSettings = {}) {
    const reqTerm = `group-request:${term}`;
    const requestNextsRace = (group, msgId, fromAddr = '') => (payload = {}, reqSettings = {}) => (
      new Promise(resolve => {
        const settings = { ...groupRequestDefaultSettings, ...registeredSettings, ...reqSettings };
        const addrsToReq = this._getNeighbors(group, [fromAddr], settings.randomCycled);
        if (addrsToReq.length === 0) { resolve({}); }
        let responsedCnt = 0;
        addrsToReq.forEach(addr => {
          request(this._connManager, addr, reqTerm, { group, msgId, payload }, settings.timeout, settings.aliveTimeout)
            .then(({ result, response }) => {
              if (result) { resolve(response); }
            }).catch(
              e => console.warn(`${reqTerm} error:`, e, 'requestNextsRace', { group, msgId, fromAddr, payload, addrsToReq })
            ).finally(() => {
              if (++responsedCnt >= addrsToReq.length) { resolve({}); }
            })
        });
      })
    );
    const requestNextsAll = (group, msgId, fromAddr = '') => async (payload = {}, reqSettings = {}) => {
      const settings = { ...groupRequestDefaultSettings, ...registeredSettings, ...reqSettings };
      const addrsToReq = this._getNeighbors(group, [fromAddr], settings.randomCycled);
      if (addrsToReq.length === 0) { return []; }
      const responses = await Promise.all(
        addrsToReq.map(async addr => {
          try {
            const { result, response } = (
              await request(this._connManager, addr, reqTerm, { group, msgId, payload }, settings.timeout, settings.aliveTimeout)
            );
            if (result) { return [response]; }
          } catch (e) { console.warn(`${reqTerm} error:`, e, 'requestNextsAll', { group, msgId, fromAddr, payload, addr }); }
          return [];
        })
      );
      return responses.flat();
    };
    const requestNextOne = (group, msgId, fromAddr = '') => async (addr, payload = {}, reqSettings = {}) => {
      const settings = { ...groupRequestDefaultSettings, ...registeredSettings, ...reqSettings };
      try {
        if (!this._hasJoined(group, addr) || fromAddr === addr) { return {}; }
        const { result, response } = await request(this._connManager, addr, reqTerm, { group, msgId, payload }, settings.timeout, settings.aliveTimeout);
        if (result) {
          return response;
        }
      } catch (e) {
        console.warn(`${reqTerm} error:`, e)
      }
      return {};
    }

    onRequested(this._connManager, reqTerm, async (fromAddr, { group, msgId, payload }) => {
      let response;
      if (this._checkMsgId(msgId)) {
        response = await callbackFirst(group, payload || {}, {
          requestNextsRace: requestNextsRace(group, msgId, fromAddr),
          requestNextsAll: requestNextsAll(group, msgId, fromAddr),
          requestNextOne: requestNextOne(group, msgId, fromAddr),
        });
      } else {
        response = callbackSecond(group, payload || {});
      }
      if (response === GROUP_REQ_NEGATIVE_RESPONSE) {
        return { result: false };
      }
      return { result: true, response };
    });

    return async (group, payload = {}) => {
      const msgId = randomStr();
      const response = await callbackFirst(group, payload, {
        requestNextsRace: requestNextsRace(group, msgId),
        requestNextsAll: requestNextsAll(group, msgId),
        requestNextOne: requestNextOne(group, msgId),
      });
      if (response === GROUP_REQ_NEGATIVE_RESPONSE) {
        return {};
      }
      return response;
    }
  }

  async startLink(rootGroupPayload = {}) {
    this._isWss = (
      WsConn.protocols.indexOf((new URL(this._connManager.getMyAddr())).protocol) >= 0
    );

    this._connManager.on('req', async ({ addr, offer, accept }) => {
      const { join: group, payload, viaAddr } = offer;
      if (group) {
        accept(
          this._connectingCheck(addr) &&
          (await this._handleReqJoinGroup(addr, group, payload || {}, viaAddr))
        );
      }
      accept(false);
    });
    this._connManager.on('req-relay', ({ toAddr, fromAddr, offer, accept }) => {
      accept(true);
    });
    this._connManager.on('ready', ({ addr }) => {
      this.know(addr);
    });
    this._connManager.on('close', ({ addr }) => {
      this._connectingRelease(addr);
      [...(this._addrToJoinedGroups[addr] || [])].forEach(group => {
        this._afterNeighborLeft(group, addr);
      });
      this._rmJoinedAddr(addr);
    });

    onRequested(this._connManager, 'join-group', async (addr, { group, payload, viaAddr }) => {
      return { ok: await this._handleReqJoinGroup(addr, group, payload || {}, viaAddr) };
    });

    this._registeredReqs.routeGroup = this._registerGroupRequest(
      'route-group',
      (_group, payload, { requestNextsRace, requestNextOne }) => this._handleRouteGroupReq(payload, requestNextsRace, requestNextOne),
      () => this._handleRouteGroupReqSec(),
    )

    this._registeredReqs.queryGroupMembers = this._registerGroupRequest(
      'query-group-members',
      (group, payload, { requestNextsAll }) => this._handleQueryGroupMembersReq(group, payload, requestNextsAll),
      () => this._handleQueryGroupMembersReqSec()
    )

    this._connManager.on('receive:group-broadcast', ({ addr, payload: { group, msgId, term, payload } }) => {
      this._handleBroadcast(addr, group, msgId, term, payload || {});
    });

    this._connManager.on('receive:leave-group', ({ addr, payload: { group } }) => {
      this._afterNeighborLeft(group, addr);
    });

    onRequested(this._connManager, 'group-info', async (_addr, { group }) => {
      if (this._hasJoined(group)) {
        return { info: this._groupInfo[group] };
      }
      return {};
    });

    onRequested(this._connManager, 'group-neighbors', async (_addr, { group }) => {
      if (this._hasJoined(group)) {
        return { neighbors: this._getNeighbors(group) };
      }
      return {};
    });

    this._connManager.start();
    await this.join('/', rootGroupPayload);
    this._eventDispatcher.emit('ready', {});
  }

  _getGroupNeighborMax() {
    return this._isWss ? this._config.groupNeighborMaxWss : this._config.groupNeighborMax;
  }

  async _handleReqJoinGroup(addr, group, payload, _viaAddr) {
    if (this._hasJoined(group, addr)) { return true; }
    if (
      !this._hasJoined(group) ||
      this._hasJoinedWithNeighbor(group, this._getGroupNeighborMax())
    ) { return false; }
    const accepted = await new Promise(accept => {
      this._eventDispatcher.emit('req-join-group', { addr, group, payload, accept });
      this._eventDispatcher.emit(`${group}:req-join-group`, { addr, payload, accept });
    });
    if (accepted) {
      this._afterNeighborJoined(group, addr);
      return true;
    }
    return false;
  }

  async _handleRouteGroupReq({ targetGroup, ttl, startAddr, noCache }, requestNextsRace, requestNextOne) {
    if (ttl === 0) { return GROUP_REQ_NEGATIVE_RESPONSE; }
    if (this._hasJoined(targetGroup) && !startAddr) {
      if (this._hasJoinedWithNeighbor(targetGroup, this._getGroupNeighborMax())) {
        return GROUP_REQ_NEGATIVE_RESPONSE;
      }
      return { route: [this._connManager.getMyAddr()] };
    }
    if (!noCache) {
      const cachedGroupRoute = this._groupRoutes[targetGroup];
      if (cachedGroupRoute) {
        return { route: cachedGroupRoute };
      }
    }

    const { route } = await (startAddr ? (
      requestNextOne(startAddr, { targetGroup, ttl: ttl - 1, noCache })
    ) : (
      requestNextsRace({ targetGroup, ttl: ttl - 1, noCache })
    ));
    if (route) {
      const routeAnswer = [this._connManager.getMyAddr(), ...route];
      this._groupRoutes[targetGroup] = routeAnswer;
      setTimeout(() => { delete this._groupRoutes[targetGroup]; }, this._config.routeExpires);
      return { route: routeAnswer };
    }
    return GROUP_REQ_NEGATIVE_RESPONSE;
  }
  _handleRouteGroupReqSec() {
    return GROUP_REQ_NEGATIVE_RESPONSE;
  }

  async _handleQueryGroupMembersReq(group, { ttl, withLevels }, requestNextsAll) {
    if (!this._hasJoined(group) || ttl === 0) {
      return GROUP_REQ_NEGATIVE_RESPONSE;
    }

    const nextMembers = (await requestNextsAll({ ttl : ttl - 1, withLevels })).flatMap(({ members }) => (members ? [members] : []));
    if (withLevels) {
      return { members: [this._connManager.getMyAddr(), nextMembers] };
    }
    return { members: [this._connManager.getMyAddr(), ...nextMembers] };
  }
  _handleQueryGroupMembersReqSec() {
    return GROUP_REQ_NEGATIVE_RESPONSE;
  }

  _handleBroadcast(fromAddr, group, msgId, term, payload) {
    if (!this._checkMsgId(msgId) || !this._hasJoined(group) || group === '/') { return; }
    this._eventDispatcher.emit(term, { group, payload });
    this._eventDispatcher.emit(`${group}:${term}`, { ...payload });
    this._broadcast(group, msgId, term, payload, [fromAddr])
  }

  async _reqRouteGroup(group, targetGroup, ttl, startAddr, noCache) {
    return await this._registeredReqs.routeGroup(group, { targetGroup, ttl, startAddr, noCache });
  }

  async _reqQueryGroupMembers(group, ttl, withLevels) {
    return await this._registeredReqs.queryGroupMembers(group, { ttl, withLevels });
  }

  hasGroup(group) {
    return this._hasJoined(group);
  }

  async join(group, payload = {}) {
    if (this._hasJoined(group)) { return true; }
    this._groupPayload[group] = payload;
    const memberConnected = await this._doJoin(group);
    if (!memberConnected) {
      this._initGroup(group);
    }
    this._afterJoined(group);
  }

  async _doJoin(group) {
    const payload = this._groupPayload[group];
    let memberConnected = false;
    if (group === '/') {
      const tryKnownAddrs = this._randomlyShiftKnownAddr();
      let memberConnected = false, i = 0;
      while(i < tryKnownAddrs.length && !memberConnected) {
        memberConnected = await this._joinViaAddr(group, payload, tryKnownAddrs[i]);
        i++;
      }
    } else {
      const memberConnected = await this._routeAndJoin(group);
    }
    return memberConnected;
  }

  async _routeAndJoin(group, startAddr = null, pathGroup = '/', noCache = false) {
    await this._ensureJoinedWithNeighbor(pathGroup);
    const { route } = await this._reqRouteGroup(
      pathGroup, group, this._config.routeTtl, startAddr, noCache
    );
    if (!route) { return false; }
    try {
      return await this._joinWithRoute(group, route, pathGroup);
    } catch (error) {
      const wait = this._config.joinRetryWait;
      console.warn(`route given can not join '${group}', try again without cache after ${wait}ms...`, error);
      await sleepPromise(wait);
      return await this._routeAndJoin(group, startAddr, pathGroup, true)
    }
  }

  async _joinWithRoute(group, route, pathGroup = '/') {
    await this._ensureJoinedWithNeighbor(pathGroup);
    const routeTargetI = route.length - 1;
    for(let i = 1; i < routeTargetI; i++) {
      const joinPathOk = await this._joinViaAddr(pathGroup, {}, route[i], route[i-1]);
      if (!joinPathOk) {
        throw new Error(`join ${group} failed: route ${route[i]} via ${route[i-1]} connecting failed`);
      }
    }
    const payload = this._groupPayload[group];
    const joinGroupOk = await this._joinViaAddr(group, payload, route[routeTargetI], route[routeTargetI - 1]);
    if (!joinGroupOk) {
      throw new Error(`join ${group} failed: target ${route[routeTargetI]} via ${route[routeTargetI - 1]} connecting failed`);
    }
    return true
  }

  async _ensureJoinedWithNeighbor(group) {
    if (!this._hasJoinedWithNeighbor(group)) {
      await this._doJoin(group);
    }
  }

  _randomlyShiftKnownAddr() {
    const myAddrs = this._isWss ? [this._connManager.getMyAddr()] : [];
    return randomlyCycleArr([
      ...this._knownAddrs,
      ...myAddrs,
    ]);
  }

  _initGroup(group) {
    this._groupInfo[group] = {
      buoy: this._randomlyShiftKnownAddr()[0],
    };
  }

  async _joinViaAddr(group, payload, addr, viaAddr) {
    if (this._hasJoined(group, addr)) { return true; }
    if (addr === this._connManager.getMyAddr()) {
      this._afterJoined(group);
      return true;
    }
    let ok;
    if (this._connectingCheck(addr)) {
      try {
        await this._connManager.connect(addr, { viaAddr, offer: { join: group, payload, viaAddr } });
        ok = true;
      } catch (error) {
        console.warn('connect and join failed', { addr, group, error });
        this._connectingRelease(addr);
        this.forget(addr);
        ok = false;
      }
    } else {
      try {
        ok = (await request(this._connManager, addr, 'join-group', { group, payload, viaAddr })).ok;
      } catch (error) {
        console.warn('join request failed', { addr, group, error });
        ok = false;
      }
    }
    if (ok) this._afterNeighborJoined(group, addr);
    return ok;
  }

  _afterJoined(group) {
    if (!this._hasJoined(group)) {
      this._addJoined(group);
      this._eventDispatcher.emit('joined', { group });
      this._eventDispatcher.emit(`${group}:joined`, {});
    }
  }

  _afterNeighborJoined(group, addr) {
    this._afterJoined(group);
    this._addJoined(group, addr);
    this._maintainGroupLater(group, false);
    this._eventDispatcher.emit('new-neighbor', { group, addr })
    this._eventDispatcher.emit(`${group}:new-neighbor`, { addr })
  }

  leave(group) {
    if (group === '/') { console.warn('leaving group \'/\', things will not work'); }
    if (!this._hasJoined(group)) { return; }
    if (this._groupGoingToMaintain[group]) {
      clearTimeout(this._groupGoingToMaintain[group]);
    }
    this._getNeighbors(group).forEach(addr => {
      this._connManager.send(addr, 'leave-group', { group });
    });
    this._rmJoinedGroup(group);
    this._eventDispatcher.emit('left', { group })
    this._eventDispatcher.emit(`${group}:left`, {});
  }

  async _afterNeighborLeft(group, addr) {
    this._rmJoined(group, addr);
    this._gcCandidateAddrs.push(addr);
    this._maintainGroupLater(group, true);
    this._eventDispatcher.emit('neighbor-left', { group, addr })
    this._eventDispatcher.emit(`${group}:neighbor-left`, { addr })
  }

  _maintainGroupLater(group, rejoin) {
    if (rejoin) { this._groupRejoining[group] = true; }
    const maintainState = this._groupGoingToMaintain[group];
    if (maintainState) {
      if ([RUNNING, WILL_RUN_NEXT_ROUND].indexOf(maintainState) >= 0) {
        this._groupGoingToMaintain[group] = WILL_RUN_NEXT_ROUND;
        return;
      } else {
        clearTimeout(maintainState);
      }
    }
    this._groupGoingToMaintain[group] = setTimeout(async () => {
      this._groupGoingToMaintain[group] = RUNNING;
      let [nextRound, nextRejoin] = await this._maintainGroup(group);
      nextRound = nextRound || this._groupGoingToMaintain[group] === WILL_RUN_NEXT_ROUND;
      delete this._groupGoingToMaintain[group];
      if (nextRound) {
        this._maintainGroupLater(group, nextRejoin);
      } else {
        this._gcConnsLater();
      }
    }, this._config.groupMaintainingWait);
  }

  async _maintainGroup(group) {
    let nextRound = false, nextRejoin = false;
    if (this._hasJoined(group)) {
      await this._ensureGroupInfo(group);

      const neighbors = this._getNeighbors(group);
      if (this._groupRejoining[group] && group !== '/') {
        delete this._groupRejoining[group];
        [nextRound, nextRejoin] = await this._rejoin(group);
      } else if (neighbors.length > this._config.groupNeighborHigh) {
        [nextRound, nextRejoin] = this._tooManyNeighbor(group);
      } else if (neighbors.length < this._config.groupNeighborLow) {
        [nextRound, nextRejoin] = await this._tooLessNeighbor(group);
      }
    }
    return [nextRound, nextRejoin];
  }

  async _ensureGroupInfo(group) {
    const neighbors = this._getNeighbors(group);
    if (!this._groupInfo[group]) {
      this._groupInfo[group] = await request(
        this._connManager,
        neighbors[Math.floor(neighbors.length * Math.random())],
        'group-info',
        { group }
      );
    }
  }

  async _rejoin(group) {
    const buoyAddr = this._groupInfo[group].buoy;
    const buoyOk = await this._joinViaAddr('/', this._groupPayload[group], buoyAddr);
    if (!buoyOk) {
      const wait = this._config.rejoinRetryWait;
      console.warn(`cannot connect to group '${group}' buoy '${buoyAddr}', try again without cache after ${wait}ms...`);
      await sleepPromise(wait);
      return [true, true]
    }
    try {
      const rejoinHasRoute = await this._routeAndJoin(group, buoyAddr);
      if (!rejoinHasRoute) {
        console.warn(`no route to rejoin group '${group}'`);
      }
    } catch (error) {
      console.warn('rejoin failed, retrying...', { group, buoyAddr, error });
      return [true, true]
    }
    return [true, false]
  }

  _tooManyNeighbor(group) {
    const neighbors = this._getNeighbors(group);
    const neighborToSayBye = neighbors[Math.floor(neighbors.length * Math.random())];
    this._connManager.send(neighborToSayBye, 'leave-group', { group });
    this._afterNeighborLeft(group, neighborToSayBye);
    return [true, false]
  }

  async _tooLessNeighbor(group) {
    let memberTree = this._groupMemberTreeCache[group];
    let memberTreeCacheTimer;

    if (!memberTree) {
      memberTree = (await this._reqQueryGroupMembers(
        group, this._config.groupNeighboringHops, true
      )).members;
      this._groupMemberTreeCache[group] = memberTree;
      memberTreeCacheTimer = setTimeout(
        () => { delete this._groupMemberTreeCache[group]; },
        this._config.groupMemberTreeCacheExpires,
      )
    }
    const route = this._pickAMemberWithRoute(memberTree, [
      this._connManager.getMyAddr(),
      ...this._getNeighbors(group),
      ...this._gcCandidateAddrs,
    ]);

    if (!route) { return [false, false]; }
    try {
      await this._joinWithRoute(group, route, group);
    } catch (error) {
      console.warn('adding more neighbors failed, retrying...', { group, error });
      clearTimeout(memberTreeCacheTimer);
      delete this._groupMemberTreeCache[group];
      return [true, false];
    }
    return [true, false];
  }

  _pickAMemberWithRoute(memberTreeNode, excludedAddrs) {
    const [addr, memberBranches] = memberTreeNode;
    const notExcluded = excludedAddrs.indexOf(addr) === -1;
    const branches = randomlyCycleArr(memberBranches || []);
    if (
      notExcluded &&
      branches.length <= this._config.groupNeighborHigh
    ) { return [addr]; }
    for (let branch of branches) {
      const route = this._pickAMemberWithRoute(branch, excludedAddrs)
      if (route) {
        return [addr, ...route];
      }
    }
    return false;
  }

  _gcConnsLater() {
    if (this._garbageCollecting) {
      if ([RUNNING, WILL_RUN_NEXT_ROUND].indexOf(this._garbageCollecting) >= 0) {
        this._garbageCollecting = WILL_RUN_NEXT_ROUND;
        return;
      } else {
        clearTimeout(this._garbageCollecting);
      }
    }
    this._garbageCollecting = setTimeout(async () => {
      this._garbageCollecting = RUNNING;
      await this._gcConns();
      const nextRound = this._garbageCollecting === WILL_RUN_NEXT_ROUND;
      this._garbageCollecting = null;
      if (nextRound) {
        this._gcConnsLater();
      }
    }, this._config.gcWait);
  }

  async _gcConns() {
    while(this._gcCandidateAddrs.length > 0) {
      const addr = this._gcCandidateAddrs.shift();
      const groupsWithAddr = this._addrToJoinedGroups[addr];
      if (groupsWithAddr && groupsWithAddr.length === 0) {
        this._connManager.close(addr);
      }
    }
  }

  /**
   * .on('ready', ({})  => {})
   * .on('req-join-group', ({ addr, group, payload, accept })  => {})
   * .on('joined', ({ group })  => {})
   * .on('left', ({ group })  => {})
   * .on('new-neighbor', ({ group, addr })  => {})
   * .on('neighbor-left', ({ group, addr })  => {})
   * .on(term, ({ group, payload })  => {})
   * .on(`${group}:req-join-group`, ({ addr, payload, accept })  => {})
   * .on(`${group}:joined`, ({})  => {})
   * .on(`${group}:left`, ({})  => {})
   * .on(`${group}:new-neighbor`, ({ addr })  => {})
   * .on(`${group}:neighbor-left`, ({ addr })  => {})
   * .on(`${group}:${term}`, ({ ...payload })  => {})
   */
  on(eventName, callback) {
    return this._eventDispatcher.on(eventName, callback);
  }

  broadcast(group, term, payload = {}) {
    if (group === '/') { throw new Error('should not broadcast to /'); }
    if (!this._hasJoined(group)) { throw new Error(`not joined to ${group}`); }
    let msgId = randomStr();
    if (!this._checkMsgId(msgId)) {
      return this.broadcast(group, term, payload, excludedAddrs);
    }
    this._broadcast(group, msgId, term, payload, []);
  }

  _broadcast(group, msgId, term, payload, excludedAddrs) {
    this._getNeighbors(group, excludedAddrs)
      .forEach(addr => {
        this._connManager.send(addr, 'group-broadcast', { group, msgId, term, payload });
      });
  }
}

export default Client;

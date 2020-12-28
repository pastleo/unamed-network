export class EventDispatcher {
  constructor() {
    this._ons = {};
  }

  on(eventName, callback) {
    if (!this._ons[eventName]) {
      this._ons[eventName] = []
    }
    const index = this._ons[eventName].push(callback) - 1;
    return () => {
      this._ons[eventName][index] = () => null
    }
  }
  emit(eventName, ...args) {
    (this._ons[eventName] || []).forEach(callback => callback(...args));
  }
}

export const randomStr = () => Math.floor(Math.random() * Date.now()).toString(36);

export const request = (connManager, addr, term, payload = {}, timeout = 10000, aliveTimeout = 500) => (
  new Promise((resolve, reject) => {
    const reqId = randomStr();
    let timer = (
      setTimeout(() => reject(new Error(`request ${term} to ${addr} alive check timeout`)), aliveTimeout)
    );

    const rmResponseListener = connManager.on(`receive:${term}-response`, (
      { addr: fromAddr, payload: { reqId: reqIdBack, payload: responsePayload }}
    ) => {
      if (fromAddr !== addr || reqId !== reqIdBack) { return; }
      if (responsePayload) {
        rmResponseListener();
        clearTimeout(timer);
        resolve({ ...responsePayload });
      } else {
        clearTimeout(timer);
        timer = (
          setTimeout(() => reject(new Error(`request ${term} to ${addr} response timeout`)), timeout)
        );
      }
    });
    connManager.send(addr, term, { payload, reqId });
  })
)
export const onRequested = (connManager, term, callback) => (
  connManager.on(`receive:${term}`, async (
    { addr, payload: { reqId, payload: requestPayload }}
  ) => {
    connManager.send(addr, `${term}-response`, { reqId });
    const responsePayload = await callback(addr, { ...requestPayload });
    connManager.send(addr, `${term}-response`, { payload: { ...responsePayload }, reqId });
  })
)

export const sleepPromise = duration => new Promise(resolve =>
  setTimeout(() => resolve(), duration)
);

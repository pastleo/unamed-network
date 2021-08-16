import {
  joinPath, extractAddrFromPath, calcAddrOrSubSpaceHash,
  formatFirstUint32Hex, shuffle,
} from './misc/utils';

declare namespace Router {
  type RoutingTableLine = [hash: Uint32Array, addr: string];
  type KBuckets = Map<number, RoutingTableLine[]>;
  type spacePath = string;
  interface Space {
    table: RoutingTableLine[];
    name: string;
    path: string;
    subSpaces: Record<spacePath, Space>;
  }
  interface FindAddrIndexResult {
    exact?: number;
    left?: number;
  }
  interface RouteResult {
    addrs: string[];
    noPeers?: boolean;
    invalid?: boolean;
    broadcast?: boolean;
    mightBeForMe?: boolean;
    notMakingProgressFromBase?: boolean;
  }
}

class Router {
  private myAddr: string;
  private myHash: Uint32Array;
  private rootSpace: Router.Space;
  
  async start(myAddr: string) {
    this.myAddr = myAddr;
    this.myHash = await calcAddrOrSubSpaceHash(this.myAddr);
    this.rootSpace = {
      table: [],
      name: '',
      path: '',
      subSpaces: {},
    };
  }

  initSpace(spacePath: string): Router.Space {
    const pathSegs = spacePath.split('>');
    const mkSpaceP = (level: number, currentSpace: Router.Space): Router.Space => {
      const currentSpaceName = pathSegs[level];
      if (!currentSpaceName) return currentSpace;

      let subSpace = currentSpace.subSpaces[currentSpaceName];
      if (!subSpace) {
        subSpace = {
          table: [],
          name: pathSegs[level],
          path: joinPath(pathSegs.slice(0, level + 1)),
          subSpaces: {},
        };
        currentSpace.subSpaces[currentSpaceName] = subSpace;
      }

      return mkSpaceP(level + 1, subSpace);
    };

    return mkSpaceP(0, this.rootSpace);
  }

  async addPath(path: string) {
    const addr = extractAddrFromPath(path);
    let [space, target, upperSpaces] = this.getSpaceAndAddr(path, false);

    if (!space) {
      space = upperSpaces.pop();
    }
    const hash = await calcAddrOrSubSpaceHash(target);
    addLine(space.table, [hash, addr]);

    const addrHash = await calcAddrOrSubSpaceHash(addr);
    while (upperSpaces.length > 0) {
      space = upperSpaces.pop();
      addLine(space.table, [addrHash, addr]);
    }
  }

  rmAddr(addr: string) {
    const rmAddrR = (currentSpace: Router.Space) => {
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

  getSpaceAndAddr(path: string = '', exact = true): [Router.Space, string, Router.Space[]] {
    const pathSegs = path.split('>');
    let currentSpace = this.rootSpace;
    const upperSpaces: Router.Space[] = [];
    while (pathSegs.length > 1) {
      if (pathSegs[0]) {
        upperSpaces.push(currentSpace);
        currentSpace = currentSpace.subSpaces[pathSegs[0]];
        if (!currentSpace) {
          if (exact) {
            throw new Error(`router.ts: getSpaceAndAddr: space ${joinPath(pathSegs.slice(0, -1))} not exists`);
          } else {
            return [null, pathSegs[0], upperSpaces];
          }
        }
      }
      pathSegs.shift();
    }
    return [currentSpace, pathSegs[0], upperSpaces];
  }

  getSpace(spacePath: string, exact = true): Router.Space {
    const pathSegs = spacePath.split('>');
    let currentSpace = this.rootSpace;
    while (pathSegs.length > 0) {
      if (pathSegs[0]) {
        currentSpace = currentSpace.subSpaces[pathSegs[0]];
        if (!currentSpace && exact) throw new Error(`router.ts: getSpace: space ${spacePath} not exists`);
      }
      pathSegs.shift();
    }
    return currentSpace;
  }

  getLine(spacePath: string, addr: string): Router.RoutingTableLine {
    const space = this.getSpace(spacePath);
    return space.table.find(line => line[1] === addr);
  }

  printableTable(pathWithAddr: string) {
    const [space] = this.getSpaceAndAddr(pathWithAddr, false);
    if (space)
      return this.getSpaceAndAddr(pathWithAddr, true)[0].table.map(
        ([hash, addr]) => `${formatFirstUint32Hex(hash)} : ${addr}`
      ).join('\n') + '\n'
    else return ' (( space not exists )) ';
  }

  async route(desPath: string, baseAddr?: string): Promise<Router.RouteResult> {
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
      return { invalid: true, addrs: [] }
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

    const targetHash = await calcAddrOrSubSpaceHash(target);
    let nextAddr: string
    let minXor = (new Uint32Array(16)).fill(0xFFFFFFFF);

    space.table.forEach(([hash, addr]) => {
      if (addr === baseAddr) return;
      const xor = xorUint32Array(hash, targetHash);
      if (compareUint32Array(xor, minXor) === -1) {
        minXor = xor;
        nextAddr = addr;
      }
    });
    const mySelfXor = xorUint32Array(this.myHash, targetHash);

    let notMakingProgressFromBase: boolean;
    if (baseAddr) {
      const baseHash = await calcAddrOrSubSpaceHash(baseAddr);
      notMakingProgressFromBase = compareUint32Array(
        xorUint32Array(baseHash, targetHash), minXor,
      ) <= 0
    }

    const result = {
      addrs: nextAddr ? [nextAddr] : [],
      notMakingProgressFromBase,
      mightBeForMe: compareUint32Array(
        mySelfXor, minXor
      ) <= 0
    };
    return result;
  }

  buildSpaceKBuckets(spacePath: string): Router.KBuckets {
    return this.buildKBuckets(this.getSpace(spacePath).table);
  }

  buildKBuckets(lines: Router.RoutingTableLine[]): Router.KBuckets {
    const kBuckets: Router.KBuckets = new Map();
    lines.forEach(addrAndHash => {
      const k = sameBitsUint32Array(this.myHash, addrAndHash[0]);
      let bucket: Router.RoutingTableLine[] = kBuckets.get(k);
      if (bucket === undefined) {
        bucket = [];
        kBuckets.set(k, bucket);
      }

      const { exact, left } = findHashIndex(bucket, addrAndHash[0]);
      if (exact !== undefined) return;
      bucket.splice(left, 0, addrAndHash);
    });
    return kBuckets;
  }

  dbgMyHash() {
    dbgLines('me', [[this.myHash, this.myAddr]]);
  }
  
  removeLines(kBuckets: Router.KBuckets, lines: Router.RoutingTableLine[]): void {
    [...lines, [this.myHash, this.myAddr] as Router.RoutingTableLine].forEach(([hash, _addr]) => {
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

  pickAddrsToConnect(kBuckets: Router.KBuckets, existingKBuckets: Router.KBuckets): string[] {
    const addrs: string[] = [];
    kBuckets.forEach((lines, k) => {
      const allowedNewLines = k < 3 ? 3 - k : 1;
      const existingLines = existingKBuckets.get(k) || [];
      const linesToPick = Math.min(allowedNewLines - existingLines.length, lines.length);
      if (linesToPick > 0) {
        addrs.push(
          ...shuffle(lines).slice(0, linesToPick).map(line => line[1])
        );
      }
    });

    return addrs;
  }
}

function xorUint32Array(hash1: Uint32Array, hash2: Uint32Array): Uint32Array {
  return hash1.map((v, i) => v ^ hash2[i])
}

function compareUint32Array(arr1: Uint32Array, arr2: Uint32Array): number {
  // assume arr1 has same length as arr2
  for(let i = 0; i < arr1.length; i++) {
    if (arr1[i] < arr2[i]) return -1;
    if (arr1[i] > arr2[i]) return 1;
  }
  return 0;
}

function sameBitsUint32Array(arr1: Uint32Array, arr2: Uint32Array): number {
  const xor = xorUint32Array(arr1, arr2);
  let sameBits = 0;
  for(let i = 0; i < xor.length; i++) {
    for (let j = 0; j < 32; j++) {
      if ((0x80000000 & xor[i]) !== 0) return sameBits;
      sameBits++;
      xor[i] = xor[i] << 1;
    }
  }
  return sameBits;
}

export function hashLine(addrs: string[]): Promise<Router.RoutingTableLine[]> {
  return Promise.all(
    addrs.map(async (addr): Promise<Router.RoutingTableLine> => ([
      await calcAddrOrSubSpaceHash(addr), addr
    ]))
  );
}

function findHashIndex(lines: Router.RoutingTableLine[], hash: Uint32Array): Router.FindAddrIndexResult {
  let left = 0, right = lines.length;
  while (left !== right) {
    const middle = Math.floor((left + right) / 2);
    const compared = compareUint32Array(hash, lines[middle][0]);
    if (compared === -1) { right = middle; }
    else if (compared === 1) { left = middle + 1; }
    else { // compared === 0
      return { exact: middle };
    }
  }
  return { left };
}

export function mergeKBuckets(...kBucketsArr: Router.KBuckets[]): Router.KBuckets {
  const newKBuckets: Router.KBuckets = new Map();
  kBucketsArr.forEach(kBuckets => {
    kBuckets.forEach((lines, k) => {
      let bucket: Router.RoutingTableLine[] = newKBuckets.get(k);
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

function addLine(lines: Router.RoutingTableLine[], line: Router.RoutingTableLine): void {
  const { exact, left } = findHashIndex(lines, line[0]);
  if (exact !== undefined) return;
  lines.splice(left, 0, line);
}

export function dbgLines(name: string, lines: Router.RoutingTableLine[]) {
  console.group(name);
  console.log(
    lines.map(([hash, addr]) => `${formatFirstUint32Hex(hash)} :: ${addr}`).join('\n')
  );
  console.groupEnd();
}

export function dbgKBuckets(name: string, kBuckets: Router.KBuckets): void {
  console.group(name);
  kBuckets.forEach((lines, k) => {
    dbgLines(k.toString(), lines);
  })
  console.groupEnd();
}

export default Router;

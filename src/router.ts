import {
  joinPath, calcAddrOrSubSpaceHash, formatFirstUint32Hex,
  shuffle,
} from './misc/utils';

type RoutingTableLine = [hash: Uint32Array, addr: string];
type KBuckets = Map<number, RoutingTableLine[]>;
type pathWithoutAddr = string;
interface Space {
  table: RoutingTableLine[];
  path: string;
  subSpaces: Record<pathWithoutAddr, Space>;
}
interface FindAddrIndexResult {
  exact?: number;
  left?: number;
};
interface RouteResult {
  addrs: string[];
  invalid?: boolean;
  broadcast?: boolean;
  mightBeForMe?: boolean;
  notMakingProgressFromBase?: boolean;
}

class Router {
  private myAddr: string;
  private myHash: Uint32Array;
  private rootSpace: Space;
  
  async start(myAddr: string) {
    this.myAddr = myAddr;
    this.myHash = await calcAddrOrSubSpaceHash(this.myAddr);
    this.rootSpace = {
      table: [],
      path: '',
      subSpaces: {},
    };
  }

  initSpace(pathWithoutAddr: string) {
    const pathSegs = pathWithoutAddr.split('>');
    const mkSpaceP = (level: number, currentSpace: Space) => {
      const currentSpaceName = pathSegs[level];
      if (!currentSpaceName) return;

      let subSpace = currentSpace.subSpaces[currentSpaceName];
      if (!subSpace) {
        subSpace = {
          table: [],
          path: joinPath(pathSegs.slice(0, level + 1)),
          subSpaces: {},
        };
        currentSpace.subSpaces[currentSpaceName] = subSpace;
      }

      mkSpaceP(level + 1, subSpace);
    };

    mkSpaceP(0, this.rootSpace);
  }

  async addPath(path: string) {
    const [space, addr] = this.getSpaceAndAddr(path);
    const hash = await calcAddrOrSubSpaceHash(addr);
    addLine(space.table, [hash, addr]);
  }

  rmAddr(addr: string) {
    const rmAddrR = (currentSpace: Space) => {
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

  getSpaceAndAddr(path: string = '', exact = true): [Space, string] {
    const pathSegs = path.split('>');
    let currentSpace = this.rootSpace;
    while (pathSegs.length > 1) {
      if (pathSegs[0]) {
        currentSpace = currentSpace.subSpaces[pathSegs[0]];
        if (!currentSpace && exact) throw new Error(`router.ts: getSpaceAndAddr: space ${joinPath(pathSegs.slice(0, -1))} not exists`);
      }
      pathSegs.shift();
    }
    return [currentSpace, pathSegs[0]];
  }

  getSpace(spacePath: string, exact = true): Space {
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

  getLine(spacePath: string, addr: string): RoutingTableLine {
    const space = this.getSpace(spacePath);
    return space.table.find(line => line[1] === addr);
  }

  printableTable(pathWithAddr: string) {
    return this.getSpaceAndAddr(pathWithAddr, true)[0].table.map(
      ([hash, addr]) => `${formatFirstUint32Hex(hash)} : ${addr}`
    ).join('\n') + '\n'
  }

  async route(desPath: string, baseAddr?: string): Promise<RouteResult> {
    const [space, target] = this.getSpaceAndAddr(desPath, false);

    if (!target) {
      console.warn(`desPath: '${desPath}' does not have a valid target`);
      return { invalid: true, addrs: [] }
    }
    if (target === '*') { // broadcast
      return {
        broadcast: true,
        addrs: space.table.map(line => line[1]).filter(addr => addr !== baseAddr),
      };
    }
    if (space.table.length === 0) {
      return { addrs: [] };
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

  buildSpaceKBuckets(spacePath: string): KBuckets {
    return this.buildKBuckets(this.getSpace(spacePath).table);
  }

  buildKBuckets(lines: RoutingTableLine[]): KBuckets {
    const kBuckets: KBuckets = new Map();
    lines.forEach(addrAndHash => {
      const k = sameBitsUint32Array(this.myHash, addrAndHash[0]);
      let bucket: RoutingTableLine[] = kBuckets.get(k);
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
  
  removeLines(kBuckets: KBuckets, lines: RoutingTableLine[]): void {
    [...lines, [this.myHash, this.myAddr] as RoutingTableLine].forEach(([hash, _addr]) => {
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

  pickAddrsToConnect(kBuckets: KBuckets, existingKBuckets: KBuckets): string[] {
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

export function hashLine(addrs: string[]): Promise<RoutingTableLine[]> {
  return Promise.all(
    addrs.map(async (addr): Promise<RoutingTableLine> => ([
      await calcAddrOrSubSpaceHash(addr), addr
    ]))
  );
}

function findHashIndex(lines: RoutingTableLine[], hash: Uint32Array): FindAddrIndexResult {
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

export function mergeKBuckets(...kBucketsArr: KBuckets[]): KBuckets {
  const newKBuckets: KBuckets = new Map();
  kBucketsArr.forEach(kBuckets => {
    kBuckets.forEach((lines, k) => {
      let bucket: RoutingTableLine[] = newKBuckets.get(k);
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

function addLine(lines: RoutingTableLine[], line: RoutingTableLine): void {
  const { exact, left } = findHashIndex(lines, line[0]);
  if (exact !== undefined) return;
  lines.splice(left, 0, line);
}

export function dbgLines(name: string, lines: RoutingTableLine[]) {
  console.group(name);
  console.log(
    lines.map(([hash, addr]) => `${formatFirstUint32Hex(hash)} :: ${addr}`).join('\n')
  );
  console.groupEnd();
}

export function dbgKBuckets(name: string, kBuckets: KBuckets): void {
  console.group(name);
  kBuckets.forEach((lines, k) => {
    dbgLines(k.toString(), lines);
  })
  console.groupEnd();
}

export default Router;

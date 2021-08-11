import { calcAddrOrSubSpaceHash, formatFirstUint32Hex } from './misc/utils';

type RoutingTableLine = [hash: Uint32Array, addr: string];
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
  private joinedSpace: Space;
  
  async start(myAddr: string) {
    this.myAddr = myAddr;
    this.myHash = await calcAddrOrSubSpaceHash(this.myAddr);
    this.joinedSpace = {
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
          path: pathSegs.slice(0, level + 1).join('>'),
          subSpaces: {},
        };
        currentSpace.subSpaces[currentSpaceName] = subSpace;
      }

      mkSpaceP(level + 1, subSpace);
    };

    mkSpaceP(0, this.joinedSpace);
  }

  async addPath(path: string) {
    const [space, addr] = this.getSpaceAndAddr(path);
    const hash = await calcAddrOrSubSpaceHash(addr);
    const { exact, left } = findHashIndex(space, hash);
    if (exact !== undefined) throw new Error(`path ${path} exists in the table of space`);
    space.table.splice(left, 0, [hash, addr]);
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
    rmAddrR(this.joinedSpace);
  }

  getSpaceAndAddr(path: string = ''): [Space, string] {
    const pathSegs = path.split('>');
    let currentSpace = this.joinedSpace;
    while (pathSegs.length > 1) {
      currentSpace = currentSpace.subSpaces[pathSegs[0]];
      if (!currentSpace) throw new Error(`router.ts: addPath: space ${pathSegs.slice(0, -1).join('>')} not exists`);
      pathSegs.shift();
    }
    return [currentSpace, pathSegs[0]];
  }
  getSpace(pathWithoutAddr: string): Space {
    const pathSegs = pathWithoutAddr.split('>');
    let currentSpace = this.joinedSpace;
    while (pathSegs.length > 0) {
      currentSpace = currentSpace.subSpaces[pathSegs[0]];
      if (!currentSpace) throw new Error(`router.ts: addPath: space ${pathSegs.slice(0, -1).join('>')} not exists`);
      pathSegs.shift();
    }
    return currentSpace;
  }

  printableTable(pathWithAddr: string) {
    return this.getSpaceAndAddr(pathWithAddr)[0].table.map(
      ([hash, addr]) => `${formatFirstUint32Hex(hash)} : ${addr}`
    ).join('\n') + '\n'
  }

  async route(desPath: string, baseAddr?: string): Promise<RouteResult> {
    const [space, target] = this.getSpaceAndAddr(desPath);

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

function findHashIndex(space: Space, hash: Uint32Array): FindAddrIndexResult {
  let left = 0, right = space.table.length;
  while (left !== right) {
    const middle = Math.floor((left + right) / 2);
    const compared = compareUint32Array(hash, space.table[middle][0]);
    if (compared === -1) { right = middle; }
    else if (compared === 1) { left = middle + 1; }
    else { // compared === 0
      return { exact: middle };
    }
  }
  return { left };
}

export default Router;

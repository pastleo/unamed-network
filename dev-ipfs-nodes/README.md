## Setup

### IPFS CLI

https://docs.ipfs.io/install/command-line

### `dev-1`

```bash
export IPFS_PATH=./dev-ipfs-nodes/dev-1
export IPFS_API=http://localhost:5011

rm -rf dev-ipfs-nodes/dev-1
ipfs init
git checkout dev-ipfs-nodes/dev-1
ipfs id

# start IPFS deamon
IPFS_PATH=./dev-ipfs-nodes/dev-1 ipfs daemon

# start unamed-network node
. ./dev-ipfs-nodes/dev-1/env
npm start
```

### `dev-2`

```bash
# start unamed-network node
. ./dev-ipfs-nodes/dev-2/env
npm start
```

### `dev-3`

```bash
# start unamed-network node
. ./dev-ipfs-nodes/dev-3/env
npm start
```

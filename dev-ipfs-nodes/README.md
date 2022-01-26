## Setup

### IPFS CLI

https://docs.ipfs.io/install/command-line

### `dev-1`

```bash
. ./dev-ipfs-nodes/dev-1/env

# init ipfs
rm -rf dev-ipfs-nodes/dev-1
ipfs init
git checkout dev-ipfs-nodes/dev-1
ipfs id

# start IPFS deamon
ipfs daemon

# start unamed-network node
npm start
```

### `dev-2`

```bash
. ./dev-ipfs-nodes/dev-2/env

# start unamed-network node
npm start
```

### `dev-3`

```bash
. ./dev-ipfs-nodes/dev-3/env

# start unamed-network node
npm start
```

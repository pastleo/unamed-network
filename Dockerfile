FROM node:16.12.0-alpine

ENV NO_PATCH_IPFS_CORE_NODE_MODULE=true
WORKDIR /unamed-network

COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm install

COPY . .
COPY env.js.docker env.js

CMD ["npm", "start"]

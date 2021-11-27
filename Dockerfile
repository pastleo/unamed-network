FROM node:16.12.0-alpine

ENV NO_PATCH_IPFS_CORE_NODE_MODULE=true
WORKDIR /unamed-network

COPY . .
COPY env.js.docker env.js

RUN npm install

CMD ["npm", "start"]

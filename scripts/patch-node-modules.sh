#!/bin/bash

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

cd "$SCRIPT_DIR/.."
echo "pwd: $(pwd)"

[ -f "node_modules/ipfs-core/cjs/src/preload.js" ] && patch -p0 -Nb <<'EOF'
--- node_modules/ipfs-core/cjs/src/preload.js	2021-11-25 12:33:05.227371316 +0800
+++ node_modules/ipfs-core/cjs/src/preload.js	2021-11-25 12:33:05.227371316 +0800
@@ -21,7 +21,7 @@
   options.enabled = Boolean(options.enabled);
   options.addresses = options.addresses || [];
   options.cache = options.cache || 1000;
-  if (!options.enabled || !options.addresses.length) {
+  if (!options.enabled) {
     log('preload disabled');
     const api = () => {
     };
@@ -81,6 +81,13 @@
     requests.forEach(r => r.abort());
     requests = [];
   };
+
+  api.addApiUri = address => {
+    const newUri = toUri(address);
+    if (apiUris.indexOf(newUri) === -1) {
+      apiUris.push(toUri(address))
+    }
+  }
   return api;
 }
EOF

[ -f "node_modules/ipfs-core/esm/src/preload.js" ] && patch -p0 -Nb <<'EOF'
--- node_modules/ipfs-core/esm/src/preload.js	2021-11-25 12:33:05.227371316 +0800
+++ node_modules/ipfs-core/esm/src/preload.js	2021-11-25 12:33:05.227371316 +0800
@@ -9,7 +9,7 @@
   options.enabled = Boolean(options.enabled);
   options.addresses = options.addresses || [];
   options.cache = options.cache || 1000;
-  if (!options.enabled || !options.addresses.length) {
+  if (!options.enabled) {
     log('preload disabled');
     const api = () => {
     };
@@ -69,5 +69,12 @@
     requests.forEach(r => r.abort());
     requests = [];
   };
+
+  api.addApiUri = address => {
+    const newUri = toUri(address);
+    if (apiUris.indexOf(newUri) === -1) {
+      apiUris.push(toUri(address))
+    }
+  }
   return api;
-}
\ No newline at end of file
+}
EOF

exit 0

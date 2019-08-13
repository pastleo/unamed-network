#!/bin/sh

BASEDIR=$(dirname "$0")
TARGET=$1

if [ -z "$TARGET" ]; then
  echo "usage: $0 path/to/target"
  exit 1
fi
if [ -a "$TARGET" ]; then
  echo "$TARGET exists"
  exit 1
fi

cp -rL "$BASEDIR" "$TARGET"

version=$(date +%g%m%d%H%M)
mv "$TARGET/app" "$TARGET/app-$version"
rm "$TARGET/deploy-site.sh"
rm "$TARGET/prepare.sh"
sed 's/src=".\/app\/browser.js"/src=".\/app-'$version'\/browser.js"/' "$BASEDIR/index.html" > "$TARGET/index.html"

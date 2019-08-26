#!/bin/sh

BASEDIR=$(dirname "$0")
TARGET=$1

if [ -z "$TARGET" ]; then
  echo "usage: $0 path/to/target"
  exit 1
fi
if [ -a "$TARGET" ]; then
  ARCHIVED_PATH="$BASEDIR/archived/$(date +%g%m%d%H%M)"
  echo "$TARGET exists, move to $ARCHIVED_PATH"
  mv "$TARGET" "$ARCHIVED_PATH"
fi

cp -rL "$BASEDIR" "$TARGET"

version=$(date +%g%m%d%H%M)
mv "$TARGET/app" "$TARGET/app-$version"
rm "$TARGET/deploy-site.sh"
rm "$TARGET/prepare.sh"
rm -r "$TARGET/archived"
sed 's/.\/app\//.\/app-'$version'\//g' "$BASEDIR/index.html" > "$TARGET/index.html"

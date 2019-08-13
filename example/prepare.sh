#!/bin/sh

BASEDIR=$(dirname "$0")
cd $BASEDIR
rm -f app/lib
ln -s ../../lib app/lib

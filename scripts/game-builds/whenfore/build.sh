#!/usr/bin/env bash
# Rebuild Whenfore Art Thou's game.swf. Usage: build.sh <ld22-checkout-dir> <FLEX_HOME> <out.swf>
# <ld22-checkout-dir> is pdyxs/ld22 at commit 17faba2 (e.g. `git -C ld22 archive 17faba2 | tar -x -C dir`).
# See README.md. Never builds inside the source dir: it works on a copy.
set -euo pipefail
SRC=$(realpath "$1"); export FLEX_HOME=$(realpath "$2"); OUT=$(realpath -m "$3")
HERE=$(cd "$(dirname "$0")" && pwd)
export PLAYERGLOBAL_HOME=$FLEX_HOME/frameworks/libs/player
W=$(mktemp -d); cp -r "$SRC" "$W/p"; cd "$W/p"
git apply --unsafe-paths -p1 "$HERE/offline.patch"
# Flex resolves [Embed] relative to the embedding file, so place assets beside each user.
for d in worlds entities/lists utils; do cp -r whenfore/assets "whenfore/src/com/throwthelookingglass/$d/assets"; done
cd whenfore
"$FLEX_HOME/bin/mxmlc" -target-player=32.0 -locale=en_US \
  -source-path+=src -source-path+=../flashpunk -source-path+=../greensock-as3 \
  -static-link-runtime-shared-libraries=true -output "$OUT" src/whenfore.mxml
echo "built $OUT (work dir $W)"

#!/usr/bin/env bash
# Rebuild Tiny World the Musical's game.swf.
# Usage: build.sh <tiny-world-the-musical clone> <Libraries dir> <FLEX_HOME> <out.swf>
# See README.md. Never builds inside the source dir: it works on a copy.
set -euo pipefail
SRC=$(realpath "$1"); LIBS=$(realpath "$2"); export FLEX_HOME=$(realpath "$3"); OUT=$(realpath -m "$4")
HERE=$(cd "$(dirname "$0")" && pwd)
export PLAYERGLOBAL_HOME=$FLEX_HOME/frameworks/libs/player
W=$(mktemp -d); cp -r "$SRC" "$W/p"; cd "$W/p"
git apply --unsafe-paths -p1 "$HERE/credits-label.patch"
# Flex resolves [Embed] relative to the embedding file, so place assets beside each user.
mkdir -p src/com/seethroughstudios/musical/assets src/assets
cp -r assets/audio assets/data src/com/seethroughstudios/musical/assets/
cp -r assets/img src/assets/
"$FLEX_HOME/bin/mxmlc" -target-player=32.0 -locale=en_US \
  -source-path+=src -source-path+="$LIBS/box2d/Source" -source-path+="$LIBS/greensock-as3" \
  -source-path+="$LIBS/gameapi-as3" -source-path+="$HERE/../shared/ruffle-spark-label" \
  -library-path+=assets/swc/worlds.swc -static-link-runtime-shared-libraries=true \
  -output "$OUT" src/Main.mxml
echo "built $OUT (work dir $W)"

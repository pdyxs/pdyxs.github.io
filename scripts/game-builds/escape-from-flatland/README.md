# Escape from Flatland: reproducible build

`src/content/what/games/digital/escape-from-flatland/game.swf` is built from Paul's
2011-08-22 Flex Builder project (`Escape.zip`, 15 levels, Box2D + GreenSock), patched to
run offline. The zip is not in the repo; unzip it anywhere and pass that dir to `build.sh`.

## Toolchain
- Apache Flex SDK 4.16.1 binary (`apache-flex-sdk-4.16.1-bin.tar.gz` from
  archive.apache.org/dist/flex/4.16.1/binaries/; md5 and PGP .asc checked against the Apache KEYS file).
- Adobe `playerglobal32_0.swc` from `https://fpdownload.macromedia.com/get/flashplayer/updaters/32/playerglobal32_0.swc`
  (sha256 7d4d6168d27603cfb3b750302448e354e0bbc1bdd58f5d101c3dcf6891e9bb65), placed at
  `$FLEX_HOME/frameworks/libs/player/32.0/playerglobal.swc`. (adobe.com URLs now return an HTML page.)
- Java (OpenJDK 25 worked) and python3 with `fonttools`.

## Recipe
    scripts/game-builds/escape-from-flatland/build.sh <unzipped Escape dir> <FLEX_HOME> game.swf

which applies `offline.patch`, then runs mxmlc with
`-target-player=32.0 -source-path+=src,Source,greensock-as3,stubs -library-path+=greensock-as3/greensock.swc
-static-link-runtime-shared-libraries=true`.

## Ruffle text fix
The build also puts `../shared/ruffle-spark-label/` on the source path (see its README): Ruffle drew
every Spark `Label` one line too low, which broke the title screen, the button labels and the credits.

## Patches (all marked "OFFLINE")
- `offline.patch` (Escape.mxml): Play goes straight to the game (no Facebook login screen);
  "Sign in with Facebook" button hidden; as3corelib `JSON.decode` import replaced by native `JSON.parse`.
  The postLevel/getLevel/getFriendLevels calls are only reachable after a Facebook login, so they are dead code.
- `stubs/com/facebook/graph/*`: stand-ins for the missing GraphAPI SWC; every call reports failure.
- Levels need no change: the `.oel` files are `[Embed]`ded.
- `otf2ttf.py`: converts MesquiteStd.otf (CFF) to TrueType outlines so the SDK can embed it.

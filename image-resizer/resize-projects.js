var fs = require('fs');
var path = require('path');
var resize = require('./resize');

const getSubdirs = p => fs.readdirSync(p).filter(f => fs.statSync(path.join(p, f)).isDirectory())

const getImages = p => {
  return fs.readdirSync(p).filter(f => {
    return f.endsWith(".png") || f.endsWith(".jpg");
  });
}

function buildImages(file, subpath) {
  return (err) => {
    if (err) return;
    fs.access(path.join(subpath,"gallery",file), fs.constants.F_OK,
      (err) => {
        if (err) {
          resize(path.resolve(path.join(subpath, file)),
            path.resolve(path.join(subpath,"gallery",file)),
            1024);
        }
      }
    );
    fs.access(path.join(subpath,"thumb",file), fs.constants.F_OK,
      (err) => {
        if (err) {
          resize(path.resolve(path.join(subpath, file)),
            path.resolve(path.join(subpath,"thumb",file)),
            1024);
        }
      }
    );
  }
}

if (process.argv.length >= 3)
{
  var directory = process.argv[2];
  var dirs = getSubdirs(directory)
  for (var i = 0; i != dirs.length; ++i) {
    var subdir = dirs[i];
    var subpath = path.join(directory, subdir);

    var images = getImages(subpath);
    for (var j = 0; j != images.length; ++j) {
      fs.access(path.join(subpath, images[j]), fs.constants.F_OK,
        buildImages(images[j], subpath)
      );
    }
  }
}

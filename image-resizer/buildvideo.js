var videoshow = require('videoshow');
var _ = require('lodash');

var videoOptions = {
  fps: 25,
  loop: 10, // seconds
  transition: false,
  videoBitrate: 1024,
  size: '640x?',
  audioChannels: 0,
  format: 'mp4'
}

function buildVideo(images, output, config) {
  var allImages = _.reduce(images, (currentImages, image, image_index) => {
    var filename = _.last(image.split("/")).split(".")[0];
    var filename_chunks = filename.split("-");
    var repeatCount = 0;
    for (var chunk_index = 1; chunk_index < filename_chunks.length; ++chunk_index) {
      var chunk = filename_chunks[chunk_index];
      if (_.endsWith(chunk, "s")) {
        if (currentImages.length <= repeatCount) {
          currentImages.push([]);
        }
        currentImages[repeatCount].push({
          path: image,
          loop: Number(chunk.substring(0, chunk.length - 1))
        });
        repeatCount++;
      }
    }
    if (repeatCount == 0) {
      if (currentImages.length == 0) {
        currentImages.push([]);
      }
      currentImages[repeatCount].push({
        path: image,
        loop: 10
      });
    }
    return currentImages;
  }, []);

  allImages = _.flatten(allImages);
  config = _.assign(videoOptions, config);
  return new Promise((resolve, reject) => {
    videoshow(allImages, config)
      .save(output)
      .on('error', function (err, stdout, stderr) {
        console.error('Error:', err);
        console.error('ffmpeg stderr:', stderr);
        reject();
      })
      .on('end', resolve);
  });
}

module.exports = buildVideo;

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
  images = _.map(images, (image, i) => ({
    path: image,
    loop: i == 0 ? 2 : 10
  }));
  images.push({
    path: images[0].path,
    loop: 8
  });
  config = _.assign(videoOptions, config);
  return new Promise((resolve, reject) => {
    videoshow(images, config)
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

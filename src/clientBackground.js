const PROCESS_WIDTH = 640;
const PROCESS_HEIGHT = 360;
const FRAME_RATE = 24;

function averageCorner(data, width, height) {
  const samples = [];
  const points = [
    [6, 6], [width - 7, 6], [6, height - 7], [width - 7, height - 7],
  ];
  for (const [x, y] of points) {
    const index = (y * width + x) * 4;
    samples.push([data[index], data[index + 1], data[index + 2]]);
  }
  return samples.reduce((sum, value) => sum.map((channel, index) => channel + value[index]), [0, 0, 0]).map(channel => channel / samples.length);
}

function drawBackdrop(context, mode, image, width, height) {
  if (mode === 'custom' && image?.complete && image.naturalWidth) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const imageWidth = image.naturalWidth * scale;
    const imageHeight = image.naturalHeight * scale;
    context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    return;
  }
  const gradient = context.createLinearGradient(0, 0, width, height);
  if (mode === 'midnight') {
    gradient.addColorStop(0, '#071326');
    gradient.addColorStop(1, '#03060b');
  } else {
    gradient.addColorStop(0, '#163d74');
    gradient.addColorStop(1, '#06101e');
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = mode === 'midnight' ? 'rgba(83, 216, 255, .16)' : 'rgba(47, 123, 255, .3)';
  context.beginPath();
  context.arc(width * .74, height * .24, width * .2, 0, Math.PI * 2);
  context.fill();
}

function removeLikelyBackground(data, width, height) {
  const background = averageCorner(data, width, height);
  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const distance = Math.sqrt(
      ((red - background[0]) ** 2) +
      ((green - background[1]) ** 2) +
      ((blue - background[2]) ** 2),
    );
    // This intentionally stays model-free and local. It is most effective with
    // a plain, evenly lit background and falls back to the original frame when
    // the browser cannot capture a processed track.
    if (distance < 46) data[index + 3] = 0;
  }
  return data;
}

export function createClientBackgroundProcessor({ mode = 'none', customBackground = '' } = {}) {
  let sourceVideo;
  let sourceCanvas;
  let outputCanvas;
  let outputStream;
  let animationFrame;
  let stopped = false;
  let backgroundImage;

  const processor = {
    name: 'halo-client-background',
    processedTrack: undefined,
    async init({ track }) {
      if (mode === 'none' || typeof document === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return;
      sourceVideo = document.createElement('video');
      sourceVideo.muted = true;
      sourceVideo.playsInline = true;
      sourceVideo.srcObject = new MediaStream([track]);
      await sourceVideo.play();
      const width = Math.min(sourceVideo.videoWidth || PROCESS_WIDTH, PROCESS_WIDTH);
      const height = Math.min(sourceVideo.videoHeight || PROCESS_HEIGHT, PROCESS_HEIGHT);
      sourceCanvas = document.createElement('canvas');
      outputCanvas = document.createElement('canvas');
      sourceCanvas.width = outputCanvas.width = width;
      sourceCanvas.height = outputCanvas.height = height;
      outputStream = outputCanvas.captureStream(FRAME_RATE);
      processor.processedTrack = outputStream.getVideoTracks()[0];
      if (mode === 'custom' && customBackground) {
        backgroundImage = new Image();
        backgroundImage.src = customBackground;
        await new Promise(resolve => { backgroundImage.onload = resolve; backgroundImage.onerror = resolve; });
      }
      const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
      const outputContext = outputCanvas.getContext('2d');
      const render = () => {
        if (stopped) return;
        sourceContext.drawImage(sourceVideo, 0, 0, width, height);
        outputContext.clearRect(0, 0, width, height);
        if (mode === 'blur') {
          outputContext.filter = 'blur(14px)';
          outputContext.drawImage(sourceCanvas, -8, -8, width + 16, height + 16);
          outputContext.filter = 'none';
        } else {
          drawBackdrop(outputContext, mode, backgroundImage, width, height);
          const frame = sourceContext.getImageData(0, 0, width, height);
          outputContext.putImageData(new ImageData(removeLikelyBackground(frame.data, width, height), width, height), 0, 0);
        }
        animationFrame = requestAnimationFrame(render);
      };
      render();
    },
    async restart() {},
    async destroy() {
      stopped = true;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      outputStream?.getTracks().forEach(track => track.stop());
      sourceVideo?.pause();
      if (sourceVideo) sourceVideo.srcObject = null;
      this.processedTrack = undefined;
    },
  };
  return processor;
}

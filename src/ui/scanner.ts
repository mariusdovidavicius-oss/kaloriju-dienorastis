// Brūkšninio kodo skaitytuvas telefono kamera.
// Naudoja naršyklės BarcodeDetector (Android Chrome); kitur (iPhone Safari) – ZXing biblioteką.

interface Detector { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: new (o: { formats: string[] }) => Detector } }

export interface Scanner { stop: () => void }

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/** Paleidžia kamerą į `video`; radus kodą kviečia `onCode` (vieną kartą) ir sustoja. */
export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<Scanner> {
  let stopped = false, stream: MediaStream | null = null, zxStop: (() => void) | null = null;
  const stop = () => {
    stopped = true;
    zxStop?.();
    stream?.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
  const found = (code: string) => { if (stopped) return; stop(); onCode(code); };

  if (window.BarcodeDetector) {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const det = new window.BarcodeDetector({ formats: FORMATS });
    const loop = async () => {
      if (stopped) return;
      try { const r = await det.detect(video); if (r[0]?.rawValue) { found(r[0].rawValue); return; } } catch { /* kadras dar neparuoštas */ }
      setTimeout(loop, 200);
    };
    void loop();
  } else {
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => { if (res) found(res.getText()); });
    zxStop = () => controls.stop();
    if (stopped) controls.stop();
  }
  return { stop };
}

export const cameraAvailable = () => !!navigator.mediaDevices?.getUserMedia;

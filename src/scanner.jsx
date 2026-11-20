import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, ImageUp, ScanLine } from 'lucide-react';
import { codeFrom } from './domain.js';
import { Dialog, Notice } from './ui.jsx';

function decode(canvas, source, width, height) {
  const scale = Math.min(1, 720 / Math.max(width, height));
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(frame.data, frame.width, frame.height)?.data;
}

export function Scanner({ onClose, onScan }) {
  const video = useRef(null);
  const latestScan = useRef(onScan);
  latestScan.current = onScan;

  const [camera, setCamera] = useState(true);
  const [hasStream, setHasStream] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [cameraStatus, setCameraStatus] = useState('');

  function accept(value) {
    const found = codeFrom(value);
    if (!found) {
      setError('這個 QR Code 或代碼格式不正確。');
      return false;
    }
    const problem = latestScan.current(found);
    if (problem) setError(problem);
    return !problem;
  }

  useEffect(() => {
    if (!camera) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('此網址無法直接使用相機。你可用手機相機掃碼、上載相片或輸入連結。');
      setCamera(false);
      return;
    }

    const element = video.current;
    const canvas = document.createElement('canvas');
    let active = true;
    let stream;
    let frame;
    let lastRead = 0;
    let lastValue;

    function scan(time) {
      if (!active) return;
      if (element.videoWidth && time - lastRead > 160) {
        lastRead = time;
        const value = decode(canvas, element, element.videoWidth, element.videoHeight);
        if (value && value !== lastValue && accept(value)) return;
        lastValue = value;
      }
      frame = requestAnimationFrame(scan);
    }

    async function start() {
      try {
        setCameraStatus('正在開啟相機…');
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (!active) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        element.srcObject = stream;
        await element.play();
        if (!active) return;
        setHasStream(true);
        setCameraStatus('');
        frame = requestAnimationFrame(scan);
      } catch {
        if (!active) return;
        setCameraStatus('未能開啟相機。請檢查相機權限，或上載 QR Code 相片。');
        setCamera(false);
      }
    }

    start();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      element.srcObject = null;
    };
  }, [camera]);

  async function readFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const value = decode(document.createElement('canvas'), image, image.naturalWidth, image.naturalHeight);
      if (value) accept(value);
      else setError('未能讀取相片中的 QR Code，請試試較清晰的相片。');
    } catch {
      setError('未能開啟這張相片。');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  return <Dialog title="掃描學生 QR Code" description="將學生的 QR Code 放在取景框內。" onClose={onClose}>
    <div className="camera-preview">
      <video ref={video} playsInline muted className={hasStream ? 'camera-visible' : ''} />
      <div className="scan-target" aria-hidden="true">{!hasStream && <ScanLine size={45} />}</div>
    </div>
    {cameraStatus && <p className="helper camera-status" role="status">{cameraStatus}</p>}
    <div className="scan-options">
      {!camera && navigator.mediaDevices?.getUserMedia &&
        <button className="button button--secondary" onClick={() => setCamera(true)}><Camera size={18} /> 開啟相機</button>}
      <label className="button button--secondary file-button">
        <ImageUp size={18} /> 上載 QR Code 相片
        <input type="file" accept="image/*" onChange={readFile} aria-label="上載 QR Code 相片" />
      </label>
    </div>
    <form className="manual-scan" onSubmit={event => { event.preventDefault(); accept(code); }}>
      <label htmlFor="manual-code">或輸入 QR Code 連結／代碼</label>
      <div>
        <input id="manual-code" placeholder="貼上連結或代碼" value={code} onChange={event => setCode(event.target.value)} required />
        <button className="button button--primary" type="submit">開啟</button>
      </div>
    </form>
    {error && <Notice>{error}</Notice>}
  </Dialog>;
}

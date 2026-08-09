const GAS_URL = 'https://script.google.com/macros/s/AKfycbwCITZkY9ZzsXn4dhNq-ncghN3qWzL5cyQDkTzW_P3BPG7_KLQDvv2tJf-nc_qUPavwNg/exec';

const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const status = document.getElementById('status');

let model, mediaRecorder;
let isRecording = false;
let recordedChunks = [];
let partCount = 0;
let totalParts = 3; // 5分 = 2分 + 2分 + 1分 (合計3分割)
const segmentDuration = 120000; // 2分 (120,000ms)

startBtn.addEventListener('click', async () => {
  startBtn.style.display = 'none';
  status.innerText = 'モデル読み込み中...';
  
  model = await cocoSsd.load();
  
  status.innerText = 'カメラ起動中...';
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480, facingMode: 'environment' },
    audio: false 
  });
  video.srcObject = stream;
  
  video.onloadeddata = () => {
    status.innerText = '監視中...';
    detectFrame();
  };
});

async function detectFrame() {
  if (!isRecording) {
    const predictions = await model.detect(video);
    const petDetected = predictions.some(p => p.class === 'dog' || p.class === 'cat');
    
    if (petDetected) startRecordingSequence();
  }
  requestAnimationFrame(detectFrame);
}

function startRecordingSequence() {
  isRecording = true;
  partCount = 0;
  status.innerText = '検知！ 録画開始(計5分)...';
  recordNextSegment();
}

function recordNextSegment() {
  partCount++;
  recordedChunks = [];
  
  mediaRecorder = new MediaRecorder(video.srcObject, { mimeType: 'video/mp4' });
  
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  
  mediaRecorder.onstop = () => {
    uploadVideoSegment(partCount);
    
    // まだ規定回数に達していなければ次の分割録画へ
    if (partCount < totalParts) {
      status.innerText = `録画継続中 (${partCount + 1}/${totalParts})...`;
      recordNextSegment();
    } else {
      status.innerText = '全セグメント送信完了。監視再開...';
      setTimeout(() => { isRecording = false; }, 3000);
    }
  };
  
  mediaRecorder.start();

  // 最後のパートだけ1分(60秒)、それ以外は2分(120秒)
  const duration = (partCount === totalParts) ? 60000 : segmentDuration;
  setTimeout(() => mediaRecorder.stop(), duration);
}

function uploadVideoSegment(partNum) {
  const blob = new Blob(recordedChunks, { type: 'video/mp4' });
  const reader = new FileReader();
  
  reader.onloadend = async () => {
    const base64data = reader.result.split(',')[1]; 
    
    const payload = {
      filename: `pet_${Date.now()}_part${partNum}.mp4`,
      mimeType: 'video/mp4',
      fileData: base64data
    };

    try {
      await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error(`Part ${partNum} upload failed:`, err);
    }
  };
  
  reader.readAsDataURL(blob);
}

const GAS_URL = 'https://script.google.com/macros/s/AKfycbweRXEKK0dFqqVE9-VCs4fp9n7fS9mejCe-BABJgy6VbZcvRvRFcUVqQCWoROyheSRBew/exec';

const video = document.getElementById('video');
const startBtn = document.getElementById('startBtn');
const status = document.getElementById('status');

let model, mediaRecorder;
let isRecording = false;
let recordedChunks = [];
let partCount = 0;
let totalParts = 5;
const segmentDuration = 60000;
let currentFolderName = ''; // 追加: フォルダ名保持用

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
  // 変更前: requestAnimationFrame(detectFrame);
  // 変更後: 1秒（1000ミリ秒）間隔で次を実行する
  setTimeout(detectFrame, 1000);
}

function startRecordingSequence() {
  isRecording = true;
  partCount = 0;
  
  // 開始時刻からフォルダ名を生成 (例: 20260809_2033)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  currentFolderName = `${yyyy}${mm}${dd}_${hh}${min}`;
  
  status.innerText = `検知！ 録画開始(計5分) [${currentFolderName}]`;
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
    
    if (partCount < totalParts) {
      status.innerText = `録画継続中 (${partCount + 1}/${totalParts})...`;
      recordNextSegment();
    } else {
      status.innerText = '全セグメント送信完了。監視再開...';
      setTimeout(() => { isRecording = false; }, 3000);
    }
  };
  
  mediaRecorder.start();

  // 修正: 定義済みの segmentDuration (60000) を使用
  setTimeout(() => mediaRecorder.stop(), segmentDuration);
}

function uploadVideoSegment(partNum) {
  const blob = new Blob(recordedChunks, { type: 'video/mp4' });
  const reader = new FileReader();
  
  reader.onloadend = async () => {
    const base64data = reader.result.split(',')[1]; 
    
    const payload = {
      filename: `pet_${Date.now()}_part${partNum}.mp4`,
      mimeType: 'video/mp4',
      fileData: base64data,
      folderName: currentFolderName // 追加: フォルダ名を送信
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

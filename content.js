let latestStream = null;
let waitingQueueItem = null;
let batchQueue = [];
let isBatchRunning = false;

// Modern UI Stilleri
const style = document.createElement('style');
style.textContent = `
  .ok-dl-btn {
    background: rgba(255, 87, 34, 0.14);
    color: #ff7043 !important;
    border: 1px solid rgba(255, 87, 34, 0.4);
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    margin-left: 10px;
    margin-right: 6px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    z-index: 99;
    transition: all 0.2s ease;
    flex-shrink: 0;
    font-family: system-ui, -apple-system, sans-serif;
  }
  .ok-dl-btn:hover {
    background: #ff5722;
    color: #fff !important;
    border-color: #ff5722;
    transform: translateY(-1px);
    box-shadow: 0 3px 8px rgba(255, 87, 34, 0.35);
  }
  .ok-dl-btn.loading {
    background: #fb8c00;
    color: #fff !important;
    border-color: #fb8c00;
    cursor: wait;
  }
  .ok-dl-btn.done {
    background: #2e7d32;
    color: #fff !important;
    border-color: #2e7d32;
  }
  .ok-batch-bar {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: 14px;
  }
  .ok-batch-btn {
    background: linear-gradient(135deg, #ff5722, #ff8a50);
    color: #fff !important;
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 2px 6px rgba(255, 87, 34, 0.3);
    transition: opacity 0.2s, transform 0.1s;
  }
  .ok-batch-btn:hover {
    opacity: 0.92;
    transform: scale(1.02);
  }
  .ok-batch-btn.stop {
    background: #d32f2f;
  }
  .ok-toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #22222a;
    color: #fff;
    border-left: 4px solid #ff5722;
    padding: 12px 18px;
    border-radius: 8px;
    font-family: system-ui, sans-serif;
    font-size: 13px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.45);
    z-index: 999999;
    opacity: 0;
    transform: translateY(15px);
    transition: all 0.25s ease;
    pointer-events: none;
  }
  .ok-toast.show {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(style);

// Sağ alt bildirim (Toast) gösterici
let toastEl = null;
let toastTimer = null;
function showToast(message) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'ok-toast';
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

// Satırdan Sanatçı ve Şarkı Adını ayrıştır
function parseRowMetadata(row) {
  const clone = row.cloneNode(true);
  clone.querySelectorAll('.ok-dl-btn').forEach(b => b.remove());

  const lines = clone.innerText
    .split('\n')
    .map(s => s.trim())
    .filter(s => s && !/^\d{1,2}:\d{2}$/.test(s));

  if (lines.length >= 2) {
    return { songTitle: lines[0], artist: lines[1] };
  }
  return { songTitle: lines[0] || "Track", artist: "OK.ru" };
}

// Arka plandan yakalanan akışı dinle
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "STREAM_CAPTURED" && msg.track) {
    latestStream = msg.track;

    if (waitingQueueItem) {
      const currentWait = waitingQueueItem;
      waitingQueueItem = null;

      const artistToUse = currentWait.artist || msg.track.artist;
      const titleToUse = currentWait.songTitle || msg.track.songTitle;

      chrome.runtime.sendMessage({
        type: "DOWNLOAD_TRACK",
        url: msg.track.url,
        artist: artistToUse,
        songTitle: titleToUse,
        fid: msg.track.fid
      });

      showToast(`⬇ İndiriliyor: ${artistToUse} - ${titleToUse}`);

      if (currentWait.btn) {
        currentWait.btn.classList.remove('loading');
        currentWait.btn.classList.add('done');
        currentWait.btn.innerHTML = '✔ İndirildi';
        setTimeout(() => {
          currentWait.btn.classList.remove('done');
          currentWait.btn.innerHTML = '⬇ İndir';
        }, 3000);
      }

      // Toplu indirme aktifse sıradaki şarkıya geç
      if (isBatchRunning) {
        setTimeout(processNextBatchItem, 1600);
      }
    }
  }
});

// Tekil satır indirme tetikleyicisi
function triggerRowDownload(row, btn, isFromBatch = false) {
  const meta = parseRowMetadata(row);
  const isPlayingNow = row.classList.toString().includes('active') || row.classList.toString().includes('playing');

  if (isPlayingNow && latestStream && latestStream.url && !isFromBatch) {
    chrome.runtime.sendMessage({
      type: "DOWNLOAD_TRACK",
      url: latestStream.url,
      artist: meta.artist,
      songTitle: meta.songTitle,
      fid: latestStream.fid
    });
    showToast(`⬇ İndiriliyor: ${meta.artist} - ${meta.songTitle}`);
    btn.classList.add('done');
    btn.innerHTML = '✔ İndirildi';
    setTimeout(() => {
      btn.classList.remove('done');
      btn.innerHTML = '⬇ İndir';
    }, 2500);
    return;
  }

  btn.classList.add('loading');
  btn.innerHTML = '⏳...';
  waitingQueueItem = { artist: meta.artist, songTitle: meta.songTitle, btn: btn };

  const clickable = row.querySelector('[class*="play"], [class*="title"], [class*="cover"]') || row;
  clickable.click();

  // Önbellek (Cache) veya zaman aşımı koruması
  setTimeout(() => {
    if (waitingQueueItem && waitingQueueItem.btn === btn) {
      waitingQueueItem = null;
      btn.classList.remove('loading');
      btn.innerHTML = '⬇ İndir';

      if (latestStream && latestStream.url) {
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_TRACK",
          url: latestStream.url,
          artist: meta.artist,
          songTitle: meta.songTitle
        });
      }
      if (isBatchRunning) {
        setTimeout(processNextBatchItem, 1000);
      }
    }
  }, 3200);
}

// Toplu indirme (Batch) kuyruk yöneticisi
function processNextBatchItem() {
  const batchBtn = document.querySelector('.ok-batch-btn');
  if (!isBatchRunning || batchQueue.length === 0) {
    isBatchRunning = false;
    if (batchBtn) {
      batchBtn.classList.remove('stop');
      batchBtn.innerHTML = '📥 Tüm Listeyi İndir';
    }
    if (batchQueue.length === 0) showToast('🎉 Toplu indirme tamamlandı!');
    return;
  }

  const nextRow = batchQueue.shift();
  const btn = nextRow.querySelector('.ok-dl-btn');
  if (batchBtn) {
    batchBtn.innerHTML = `⏹ Durdur (Kalan: ${batchQueue.length + 1})`;
  }

  nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
  triggerRowDownload(nextRow, btn, true);
}

// Butonları sayfaya enjekte et
function injectUI() {
  // 1. Üst Oynatıcıya (Player) "Çalanı İndir" ve "Tüm Listeyi İndir" ekle
  const playerControls = document.querySelector('wm-player, [class*="wm-player"], [class*="music_player"]');
  if (playerControls && !playerControls.querySelector('.ok-player-dl-btn')) {
    const targetArea = playerControls.querySelector('[class*="controls"], [class*="actions"], [class*="track"]') || playerControls;

    const pBtn = document.createElement('button');
    pBtn.className = 'ok-dl-btn ok-player-dl-btn';
    pBtn.innerHTML = '⬇ Çalanı İndir';
    pBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (latestStream && latestStream.url) {
        let artist = latestStream.artist;
        let songTitle = latestStream.songTitle;
        if (navigator.mediaSession?.metadata) {
          artist = navigator.mediaSession.metadata.artist || artist;
          songTitle = navigator.mediaSession.metadata.title || songTitle;
        }
        chrome.runtime.sendMessage({
          type: "DOWNLOAD_TRACK",
          url: latestStream.url,
          artist: artist,
          songTitle: songTitle
        });
        showToast(`⬇ İndiriliyor: ${artist} - ${songTitle}`);
      } else {
        showToast('⚠ Önce bir şarkı başlatın.');
      }
    });

    const batchBtn = document.createElement('button');
    batchBtn.className = 'ok-batch-btn';
    batchBtn.innerHTML = '📥 Tüm Listeyi İndir';
    batchBtn.title = 'Ekrandaki tüm şarkıları sırayla indirir';
    batchBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      if (isBatchRunning) {
        isBatchRunning = false;
        batchQueue = [];
        waitingQueueItem = null;
        batchBtn.classList.remove('stop');
        batchBtn.innerHTML = '📥 Tüm Listeyi İndir';
        showToast('⏹ Toplu indirme durduruldu.');
        return;
      }

      const allRows = Array.from(document.querySelectorAll('wm-track, [class*="wm-track"], [data-tsid="track"]'))
        .filter(r => /\d{1,2}:\d{2}/.test(r.innerText));

      if (allRows.length === 0) {
        showToast('⚠ İndirilecek şarkı listesi bulunamadı.');
        return;
      }

      batchQueue = allRows;
      isBatchRunning = true;
      batchBtn.classList.add('stop');
      showToast(`🚀 ${batchQueue.length} şarkılık toplu indirme başlatıldı!`);
      processNextBatchItem();
    });

    const bar = document.createElement('div');
    bar.className = 'ok-batch-bar';
    bar.appendChild(pBtn);
    bar.appendChild(batchBtn);
    targetArea.appendChild(bar);
  }

  // 2. Şarkı satırlarına buton ekle
  const trackRows = document.querySelectorAll('wm-track, [class*="wm-track"], [data-tsid="track"]');
  trackRows.forEach(row => {
    if (row.querySelector('.ok-dl-btn')) return;
    if (!/\d{1,2}:\d{2}/.test(row.innerText)) return;

    const btn = document.createElement('button');
    btn.className = 'ok-dl-btn';
    btn.innerHTML = '⬇ İndir';

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      triggerRowDownload(row, btn, false);
    });

    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.appendChild(btn);
  });
}

const observer = new MutationObserver(() => injectUI());
observer.observe(document.body, { childList: true, subtree: true });
setTimeout(injectUI, 800);
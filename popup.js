let allTracks = [];

function renderList(filterText = "") {
  const listDiv = document.getElementById('list');
  const countSpan = document.getElementById('count');
  listDiv.innerHTML = '';
  countSpan.textContent = allTracks.length;

  const filtered = allTracks.filter(t =>
    (t.title || "").toLowerCase().includes(filterText.toLowerCase())
  );

  if (filtered.length === 0) {
    listDiv.innerHTML = '<div class="empty">Henüz eşleşen bir müzik yok.<br>OK.ru üzerinde şarkı çaldığınızda veya listedeki <b>⬇ İndir</b> butonuna bastığınızda burada görünür.</div>';
    return;
  }

  filtered.forEach((track) => {
    const item = document.createElement('div');
    item.className = 'track';

    const displayTitle = track.title || `ID: ${track.fid}`;

    const info = document.createElement('div');
    info.className = 'info';
    info.innerHTML = `
      <span class="title" title="${displayTitle}">${displayTitle}</span>
      <span class="meta">ID: ${track.fid} •${track.time}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'actions';

    // Link Kopyalama Butonu
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-icon';
    copyBtn.textContent = '🔗';
    copyBtn.title = 'Akış (Stream) Linkini Kopyala';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(track.url);
      copyBtn.textContent = '✔';
      setTimeout(() => copyBtn.textContent = '🔗', 1500);
    };

    // İndirme Butonu
    const dlBtn = document.createElement('button');
    dlBtn.className = 'btn-dl';
    dlBtn.textContent = 'İndir';
    dlBtn.onclick = () => {
      chrome.runtime.sendMessage({
        type: "DOWNLOAD_TRACK",
        url: track.url,
        artist: track.artist,
        songTitle: track.songTitle,
        fid: track.fid
      });
    };

    actions.appendChild(copyBtn);
    actions.appendChild(dlBtn);
    item.appendChild(info);
    item.appendChild(actions);
    listDiv.appendChild(item);
  });
}

function loadData() {
  chrome.storage.local.get({
    tracks: [],
    settings: { nameFormat: "artist_title", subFolder: "OK_Music" }
  }, (data) => {
    allTracks = data.tracks;
    renderList(document.getElementById('searchInput').value);

    document.getElementById('nameFormat').value = data.settings.nameFormat || "artist_title";
    document.getElementById('subFolder').value = data.settings.subFolder ?? "OK_Music";
  });
}

// Sekme geçişleri
document.getElementById('tabTracks').onclick = () => {
  document.getElementById('tabTracks').classList.add('active');
  document.getElementById('tabSettings').classList.remove('active');
  document.getElementById('viewTracks').style.display = 'block';
  document.getElementById('viewSettings').style.display = 'none';
};

document.getElementById('tabSettings').onclick = () => {
  document.getElementById('tabSettings').classList.add('active');
  document.getElementById('tabTracks').classList.remove('active');
  document.getElementById('viewSettings').style.display = 'block';
  document.getElementById('viewTracks').style.display = 'none';
};

// Arama ve Temizleme
document.getElementById('searchInput').addEventListener('input', (e) => {
  renderList(e.target.value);
});

document.getElementById('clearBtn').onclick = () => {
  chrome.storage.local.set({ tracks: [] }, () => {
    allTracks = [];
    chrome.action.setBadgeText({ text: "" });
    renderList();
  });
};

// Ayarları Kaydetme
function saveSettings() {
  const settings = {
    nameFormat: document.getElementById('nameFormat').value,
    subFolder: document.getElementById('subFolder').value.trim()
  };
  chrome.storage.local.set({ settings }, () => {
    const status = document.getElementById('saveStatus');
    status.style.display = 'block';
    setTimeout(() => status.style.display = 'none', 1800);
  });
}

document.getElementById('nameFormat').addEventListener('change', saveSettings);
document.getElementById('subFolder').addEventListener('input', saveSettings);

document.addEventListener('DOMContentLoaded', loadData);
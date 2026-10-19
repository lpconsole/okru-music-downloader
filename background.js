// Varsayılan ayarları yükle
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get({
    tracks: [],
    settings: {
      nameFormat: "artist_title", // artist_title | title_artist | title_only
      subFolder: "OK_Music",
      autoClearBadge: false
    }
  }, (data) => {
    chrome.storage.local.set(data);
  });
});

// Dosya adındaki geçersiz karakterleri temizle
function sanitizeFilename(name) {
  if (!name) return "OK_Track";
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ayarlara göre dosya adını oluştur
function formatTrackFilename(artist, title, fid, settings) {
  const cleanArtist = sanitizeFilename(artist || "Bilinmeyen Sanatçı");
  const cleanTitle = sanitizeFilename(title || `Track_${fid}`);

  let fileName = `${cleanArtist} - ${cleanTitle}`;
  if (settings?.nameFormat === "title_artist") {
    fileName = `${cleanTitle} - ${cleanArtist}`;
  } else if (settings?.nameFormat === "title_only") {
    fileName = cleanTitle;
  }

  const folder = sanitizeFilename(settings?.subFolder || "");
  return folder ? `${folder}/${fileName}.mp3` : `${fileName}.mp3`;
}

// Aktif sekmeden MediaSession veya DOM verisini çek
async function getTrackMetaFromPage(tabId, fid) {
  if (!tabId || tabId < 0) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      args: [fid],
      func: (trackFid) => {
        if (navigator.mediaSession && navigator.mediaSession.metadata) {
          const m = navigator.mediaSession.metadata;
          if (m.title || m.artist) {
            return {
              artist: m.artist || "Bilinmeyen Sanatçı",
              title: m.title || "Bilinmeyen Şarkı"
            };
          }
        }
        const playerArtist = document.querySelector('wm-player [class*="artist"], [class*="player"] [class*="artist"]');
        const playerTitle = document.querySelector('wm-player [class*="title"], [class*="player"] [class*="title"]');
        if (playerTitle && playerTitle.innerText.trim()) {
          return {
            artist: playerArtist ? playerArtist.innerText.trim() : "Bilinmeyen Sanatçı",
            title: playerTitle.innerText.trim()
          };
        }
        return null;
      }
    });
    return results?.[0]?.result || null;
  } catch (e) {
    return null;
  }
}

// Ağ trafiğindeki medya akışlarını yakala
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.url.includes("okcdn.ru") && details.url.includes("/stream?")) {
      const urlObj = new URL(details.url);
      const fid = urlObj.searchParams.get("fid") || urlObj.searchParams.get("id") || Date.now().toString();

      setTimeout(async () => {
        const meta = await getTrackMetaFromPage(details.tabId, fid);

        chrome.storage.local.get({ tracks: [], settings: {} }, function(data) {
          let tracks = data.tracks;
          const existingIndex = tracks.findIndex(t => t.fid === fid);

          const artist = meta?.artist || "OK.ru";
          const title = meta?.title || `Track_${fid}`;
          const displayTitle = `${artist} - ${title}`;

          const trackObj = {
            fid: fid,
            artist: artist,
            songTitle: title,
            title: displayTitle,
            url: details.url,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          };

          if (existingIndex === -1) {
            tracks.unshift(trackObj);
            if (tracks.length > 50) tracks.pop();
          } else {
            tracks[existingIndex].url = details.url;
            if (meta?.title) {
              tracks[existingIndex].artist = artist;
              tracks[existingIndex].songTitle = title;
              tracks[existingIndex].title = displayTitle;
            }
          }

          chrome.storage.local.set({ tracks: tracks });
          chrome.action.setBadgeText({ text: tracks.length.toString() });
          chrome.action.setBadgeBackgroundColor({ color: "#FF5722" });

          // İçerik betiğine (content.js) haber ver
          if (details.tabId && details.tabId >= 0) {
            chrome.tabs.sendMessage(details.tabId, {
              type: "STREAM_CAPTURED",
              track: trackObj
            }).catch(() => {});
          }
        });
      }, 350);
    }
  },
  { urls: ["*://*.okcdn.ru/*"] }
);

// İndirme isteklerini karşıla
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "DOWNLOAD_TRACK" && msg.url) {
    chrome.storage.local.get({ settings: { nameFormat: "artist_title", subFolder: "OK_Music" } }, (data) => {
      const finalPath = formatTrackFilename(msg.artist, msg.songTitle, msg.fid || Date.now(), data.settings);

      chrome.downloads.download({
        url: msg.url,
        filename: finalPath,
        conflictAction: "uniquify"
      }, (downloadId) => {
        sendResponse({ ok: true, downloadId: downloadId });
      });
    });
    return true; // Asenkron yanıt için
  }
});
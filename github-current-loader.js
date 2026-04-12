(function () {
  const DEFAULT_MANIFEST_PATH = './current.json';

  function getManifestPath() {
    const custom = typeof window.CURRENT_SCHEDULE_MANIFEST === 'string'
      ? window.CURRENT_SCHEDULE_MANIFEST.trim()
      : '';
    return custom || DEFAULT_MANIFEST_PATH;
  }

  function addNoStoreQuery(path) {
    const sep = String(path).includes('?') ? '&' : '?';
    return `${path}${sep}v=${Date.now()}`;
  }

  function resolveRelativePath(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    if (/^(https?:)?\/\//i.test(raw)) return raw;
    if (raw.startsWith('./') || raw.startsWith('../') || raw.startsWith('/')) return raw;
    return `./${raw}`;
  }

  function getFileNameFromPath(path) {
    try {
      const cleaned = String(path || '').split('?')[0];
      const parts = cleaned.split('/').filter(Boolean);
      return decodeURIComponent(parts[parts.length - 1] || 'schedule.xls');
    } catch (err) {
      return 'schedule.xls';
    }
  }

  function patchGuessPersonFromFileName() {
    const original = typeof window.guessPersonFromFileName === 'function'
      ? window.guessPersonFromFileName
      : null;

    window.guessPersonFromFileName = function patchedGuessPersonFromFileName(fileName, names = []) {
      const base = String(fileName || '').replace(/\.[^.]+$/, '').trim();
      if (!base || !Array.isArray(names) || !names.length) {
        return original ? original(fileName, names) : '';
      }

      const candidates = [...new Set(names)]
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

      const tokens = base
        .split(/[\s_\-]+/)
        .map(v => String(v || '').trim())
        .filter(Boolean);

      for (const token of tokens.slice().reverse()) {
        const matched = candidates.find(name => token === name);
        if (matched) return matched;
      }

      for (const name of candidates) {
        if (base.endsWith(` ${name}`) || base.includes(` ${name} `)) return name;
        if (base.endsWith(`_${name}`) || base.includes(`_${name}_`)) return name;
        if (base.endsWith(`-${name}`) || base.includes(`-${name}-`)) return name;
        if (base.includes(name)) return name;
      }

      return original ? original(fileName, names) : '';
    };
  }

  async function fetchManifest() {
    const manifestPath = getManifestPath();
    const res = await fetch(addNoStoreQuery(manifestPath), { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`current.json을 읽지 못했습니다. (${res.status})`);
    }
    const data = await res.json();
    const currentFile = String(data && data.currentFile ? data.currentFile : '').trim();
    if (!currentFile) {
      throw new Error('current.json 안의 currentFile 값이 비어 있습니다.');
    }
    return resolveRelativePath(currentFile);
  }

  async function fetchScheduleAsFile(filePath) {
    const requestUrl = addNoStoreQuery(encodeURI(filePath));
    const res = await fetch(requestUrl, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`근무표 파일을 읽지 못했습니다. (${res.status}) ${filePath}`);
    }

    const blob = await res.blob();
    const fileName = getFileNameFromPath(filePath);

    try {
      return new File([blob], fileName, {
        type: blob.type || 'application/octet-stream',
        lastModified: Date.now()
      });
    } catch (err) {
      blob.name = fileName;
      blob.lastModified = Date.now();
      return blob;
    }
  }

  async function autoLoadScheduleFromCurrentJson() {
    if (typeof window.loadScheduleFromFile !== 'function') {
      throw new Error('index.html에서 loadScheduleFromFile 함수를 찾지 못했습니다.');
    }

    if (typeof window.setStatus === 'function') {
      window.setStatus('current.json을 통해 근무표 파일을 자동으로 불러오는 중입니다...');
    }

    const filePath = await fetchManifest();
    const fileObject = await fetchScheduleAsFile(filePath);
    await window.loadScheduleFromFile(fileObject, {
      statusText: `current.json을 통해 근무표 파일을 읽는 중입니다.\n${getFileNameFromPath(filePath)}`
    });

    window.__currentScheduleFilePath = filePath;
    window.__currentScheduleFileName = getFileNameFromPath(filePath);
  }

  function start() {
    patchGuessPersonFromFileName();
    autoLoadScheduleFromCurrentJson().catch((err) => {
      console.error(err);
      if (typeof window.setStatus === 'function') {
        window.setStatus(
          '자동 불러오기에 실패했습니다.\n' +
          err.message +
          '\n\ncurrent.json 또는 근무표 파일 경로를 확인해 주세요.\n필요하면 수동 업로드도 가능합니다.'
        );
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

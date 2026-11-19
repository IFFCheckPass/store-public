/**
 * 支付截图 OCR：按需加载 Tesseract.js，识别支付单号候选。
 * 任何失败都只降级为“手动填写单号”，不影响提交截图。
 */

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@7/dist/tesseract.min.js';
const SCRIPT_TIMEOUT = 15000;
const RECOGNIZE_TIMEOUT = 60000;

let loader = null;

export function loadTesseract() {
  if (typeof window !== 'undefined' && window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TESSERACT_CDN;
    script.async = true;
    script.crossOrigin = 'anonymous';

    const timer = window.setTimeout(() => {
      cleanup();
      script.remove();
      reject(new Error('识别引擎加载超时'));
    }, SCRIPT_TIMEOUT);

    function cleanup() {
      window.clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    }

    script.onload = () => {
      cleanup();
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error('识别引擎不可用'));
    };
    script.onerror = () => {
      cleanup();
      script.remove();
      reject(new Error('识别引擎加载失败'));
    };

    document.head.appendChild(script);
  }).catch((err) => {
    loader = null;
    throw err;
  });

  return loader;
}

function longest(list) {
  let best = '';
  for (const item of list) {
    if (item.length > best.length) best = item;
  }
  return best;
}

/**
 * 从 OCR 文本中提取 16–40 位连续数字（去除空格、短横线）。
 */
export function extractPaymentNumber(rawText) {
  if (!rawText) return '';
  const text = String(rawText).normalize('NFKC');

  const compact = text.replace(/[\s\u00a0\u3000\-–—－_.]/g, '');
  const direct = compact.match(/\d{16,40}/g);
  if (direct && direct.length) return longest(direct);

  const normalized = text
    .replace(/[ＯOo]/g, '0')
    .replace(/[ｌI|]/g, '1')
    .replace(/[，,。.:：;；、]/g, ' ')
    .replace(/[^\d\s-]/g, ' ');

  const parts = normalized.match(/\d[\d\s-]{12,60}\d/g) || [];
  const candidates = parts
    .map((part) => part.replace(/[\s-]/g, ''))
    .filter((part) => part.length >= 16 && part.length <= 40);

  return longest(candidates);
}

/**
 * 识别截图。
 * @param {File|Blob} image
 * @param {{ onStatus?: (phase: string, message: string, progress?: number) => void,
 *           onProgress?: (percent: number) => void }} handlers
 * @returns {Promise<{text: string, number: string}>}
 */
export async function recognizePaymentNumber(image, handlers = {}) {
  const { onStatus, onProgress } = handlers;

  if (typeof onStatus === 'function') onStatus('loading', '正在加载本地识别引擎…', 0);

  let Tesseract;
  try {
    Tesseract = await loadTesseract();
  } catch (err) {
    if (typeof onStatus === 'function') onStatus('error', '自动识别失败，请手动填写支付单号');
    throw err;
  }

  if (typeof onStatus === 'function') onStatus('recognizing', '正在识别截图中的文字…', 0);

  let lastPercent = -1;
  let timer = null;

  const timeout = new Promise((resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error('识别超时')), RECOGNIZE_TIMEOUT);
  });

  try {
    const result = await Promise.race([
      Tesseract.recognize(image, 'eng', {
        logger: (message) => {
          if (!message || message.status !== 'recognizing text') return;
          const percent = Math.max(0, Math.min(100, Math.round((message.progress || 0) * 100)));
          if (percent !== lastPercent) {
            lastPercent = percent;
            if (typeof onProgress === 'function') onProgress(percent);
          }
        }
      }),
      timeout
    ]);

    window.clearTimeout(timer);
    const text = (result && result.data && result.data.text) || '';
    const number = extractPaymentNumber(text);
    if (typeof onStatus === 'function') {
      onStatus(
        'done',
        number ? '已自动识别，请核对支付单号' : '未识别到支付单号，请手动填写',
        100
      );
    }
    return { text, number };
  } catch (err) {
    window.clearTimeout(timer);
    if (typeof onStatus === 'function') {
      onStatus('error', err && err.message === '识别超时' ? '识别超时，请手动填写支付单号' : '自动识别失败，请手动填写支付单号');
    }
    throw err;
  }
}

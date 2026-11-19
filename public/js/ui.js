/**
 * 通用 UI 工具：转义、金额、时间、Toast、Modal、状态徽标、空状态插画
 */

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

export function safeImage(url) {
  const text = String(url || '').trim();
  if (!text || text === 'undefined' || text === 'null') return '/img/placeholder.svg';
  return text;
}

export function safeColor(hex) {
  const text = String(hex || '').trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text) ? text : '#D8E6E0';
}

export function formatMoney(amount) {
  const num = Number(amount);
  const safe = Number.isFinite(num) ? num : 0;
  return '¥' + (safe / 100).toFixed(2);
}

export function formatAmount(amount) {
  const num = Number(amount);
  const safe = Number.isFinite(num) ? num : 0;
  return (safe / 100).toFixed(2);
}

export function formatDate(value, withTime = true) {
  if (!value) return '—';
  let text = String(value);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(text)) {
    text = text.replace(' ', 'T');
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return ymd;
  return `${ymd} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function initials(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1) : '同';
}

const STATUS_LABELS = {
  pending_payment: '待付款',
  pending_review: '待核验',
  paid: '已付款',
  producing: '生产中',
  packing: '打包中',
  delivering: '配送中',
  completed: '已完成',
  cancelled: '已取消',
  deleted: '已删除'
};

export function statusLabel(status, label) {
  if (label) return label;
  return STATUS_LABELS[status] || '处理中';
}

export function statusBadge(status, label) {
  const safeStatus = escapeHtml(status || 'unknown');
  return `<span class="status-badge" data-status="${safeStatus}">${escapeHtml(statusLabel(status, label))}</span>`;
}

/* -------------------------------------------------------------------------- */
/* Toast                                                                      */
/* -------------------------------------------------------------------------- */

const TOAST_ICONS = { success: '✓', error: '!', info: 'i' };

export function toast(message, type = 'info', duration = 2800) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `<span class="toast__icon" aria-hidden="true">${TOAST_ICONS[type] || 'i'}</span><span>${escapeHtml(message)}</span>`;
  root.appendChild(el);

  while (root.children.length > 3) {
    root.removeChild(root.firstElementChild);
  }

  const remove = () => {
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    window.setTimeout(() => el.remove(), 220);
  };
  window.setTimeout(remove, Math.max(1200, duration));
  el.addEventListener('click', remove);
}

/* -------------------------------------------------------------------------- */
/* 图片失败降级                                                                */
/* -------------------------------------------------------------------------- */

const FALLBACK_IMAGE = '/img/placeholder.svg';

export function installImageFallback() {
  document.addEventListener(
    'error',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLImageElement)) return;
      if (target.dataset.fallbackApplied === '1') return;
      const current = target.getAttribute('src') || '';
      if (current.endsWith(FALLBACK_IMAGE)) return;
      target.dataset.fallbackApplied = '1';
      target.src = FALLBACK_IMAGE;
    },
    true
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

let activeModal = null;

export function openModal(options = {}) {
  const {
    title = '',
    eyebrow = '',
    sub = '',
    body = '',
    footer = '',
    wide = false,
    dismissible = true,
    onClose = null
  } = options;

  const root = document.getElementById('modal-root');
  if (!root) return null;

  closeModal(true);

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal${wide ? ' modal--wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <div class="modal-head__text">
          ${eyebrow ? `<div class="modal-eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
          <h2 class="modal-title">${escapeHtml(title)}</h2>
          ${sub ? `<p class="modal-sub">${escapeHtml(sub)}</p>` : ''}
        </div>
        ${dismissible
          ? `<button class="modal-close" type="button" aria-label="关闭">
               <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
             </button>`
          : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>
  `;

  root.appendChild(backdrop);
  document.body.classList.add('is-locked');

  const modalEl = backdrop.querySelector('.modal');
  const closeBtn = backdrop.querySelector('.modal-close');

  const close = () => closeModal();

  const onKeydown = (event) => {
    if (event.key === 'Escape' && dismissible) {
      event.preventDefault();
      close();
    }
    if (event.key === 'Tab' && modalEl) {
      const focusables = modalEl.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const onBackdrop = (event) => {
    if (event.target === backdrop && dismissible) close();
  };

  if (closeBtn) closeBtn.addEventListener('click', close);
  backdrop.addEventListener('mousedown', onBackdrop);
  document.addEventListener('keydown', onKeydown);

  activeModal = {
    backdrop,
    modalEl,
    close,
    cleanup() {
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      if (!document.querySelector('.modal-backdrop')) {
        document.body.classList.remove('is-locked');
      }
      if (typeof onClose === 'function') onClose();
    }
  };

  const autoFocus = modalEl.querySelector('input:not([type="hidden"]), select, textarea, .btn--primary');
  window.setTimeout(() => {
    if (autoFocus) {
      try {
        autoFocus.focus({ preventScroll: true });
      } catch (err) {
        autoFocus.focus();
      }
    }
  }, 60);

  return {
    root: backdrop,
    modal: modalEl,
    body: modalEl.querySelector('.modal-body'),
    foot: modalEl.querySelector('.modal-foot'),
    close
  };
}

export function closeModal(immediate = false) {
  if (!activeModal) return;
  const modal = activeModal;
  activeModal = null;
  if (immediate) {
    modal.cleanup();
    return;
  }
  modal.backdrop.style.opacity = '0';
  window.setTimeout(() => modal.cleanup(), 140);
}

export function confirmModal({
  title = '确认操作',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  danger = false
} = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      closeModal();
      resolve(value);
    };
    const handle = openModal({
      title,
      body: `<p style="margin:0;font-size:13.5px;line-height:1.8;color:var(--ink-2)">${message}</p>`,
      footer: `
        <button class="btn btn--ghost" type="button" data-confirm-cancel>${escapeHtml(cancelText)}</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" type="button" data-confirm-ok">${escapeHtml(
          confirmText
        )}</button>
      `,
      onClose: () => {
        if (!done) {
          done = true;
          resolve(false);
        }
      }
    });
    if (!handle) {
      done = true;
      resolve(false);
      return;
    }
    handle.foot.querySelector('[data-confirm-cancel]').addEventListener('click', () => finish(false));
    handle.foot.querySelector('[data-confirm-ok]').addEventListener('click', () => finish(true));
  });
}

/* -------------------------------------------------------------------------- */
/* 空状态插画                                                                  */
/* -------------------------------------------------------------------------- */

export function emptyIllustration() {
  return `
    <svg class="empty-art" viewBox="0 0 178 150" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
      <path d="M52 58h74l-7 68a10 10 0 0 1-10 9H69a10 10 0 0 1-10-9l-7-68Z" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
      <path d="M72 58V48a17 17 0 0 1 34 0v10" stroke="#BFE9D8" stroke-width="2.5"/>
      <circle cx="78" cy="94" r="3" fill="#12A67A"/>
      <circle cx="100" cy="94" r="3" fill="#12A67A"/>
      <path d="M82 105c4 4 10 4 14 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M118 40c4-13 14-19 27-18-1 13-11 21-27 18Z" fill="#D8F5E9"/>
      <path d="M118 40c-2-9-8-13-17-13 0 9 7 15 17 13Z" fill="#FFD9BE"/>
      <path d="m88 20 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#FFC79B"/>
      <circle cx="131" cy="82" r="4" fill="#FFD9BE"/>
      <circle cx="45" cy="92" r="3" fill="#BFE9D8"/>
    </svg>
  `;
}

export function emptyState({ title = '这里还是空的', text = '', action = '' } = {}) {
  return `
    <div class="empty-state">
      ${emptyIllustration()}
      <h3>${escapeHtml(title)}</h3>
      ${text ? `<p>${escapeHtml(text)}</p>` : ''}
      ${action}
    </div>
  `;
}

/* -------------------------------------------------------------------------- */
/* 其他                                                                        */
/* -------------------------------------------------------------------------- */

export function setBusy(button, busy, busyText = '处理中…') {
  if (!button) return;
  if (busy) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner spinner--sm" aria-hidden="true"></span><span>${escapeHtml(busyText)}</span>`;
  } else {
    button.disabled = false;
    if (button.dataset.idleLabel) {
      button.innerHTML = button.dataset.idleLabel;
      delete button.dataset.idleLabel;
    }
  }
}

export function isPhoneNumber(value) {
  return /^1[3-9]\d{9}$/.test(String(value || '').replace(/\s|-/g, ''));
}

export function scrollToElement(element) {
  if (!element) return;
  const top = element.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  const input = element.querySelector('input, select, textarea');
  if (input) {
    try {
      input.focus({ preventScroll: true });
    } catch (err) {
      input.focus();
    }
  }
}

export function debounce(fn, wait = 200) {
  let timer = null;
  return function debounced(...args) {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(this, args), wait);
  };
}

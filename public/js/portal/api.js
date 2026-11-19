/**
 * 生产工作台 API 封装
 * - 同源请求，Cookie 自动携带
 * - 非 2xx 统一抛出 ApiError
 * - 401：除非调用方显式 silent401，否则广播 staff:unauthorized，由应用切回登录视图
 */

const STATUS_MESSAGES = {
  400: '请求信息有误，请检查后重试',
  401: '请先登录后再操作',
  403: '没有权限执行该操作',
  404: '内容不存在或已被移除',
  409: '当前状态不允许该操作',
  429: '操作太频繁，请稍后再试',
  500: '服务器开小差了，请稍后重试',
  502: '服务暂时不可用，请稍后重试',
  503: '服务暂时不可用，请稍后重试'
};

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message || '请求失败');
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

function fallbackMessage(status) {
  return STATUS_MESSAGES[status] || '请求失败，请稍后重试';
}

async function request(path, options = {}) {
  const { method = 'GET', body, silent401 = false } = options;
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    throw new ApiError('网络连接失败，请检查网络后重试', 0, null);
  }

  let raw = '';
  try {
    raw = await response.text();
  } catch (err) {
    raw = '';
  }

  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (err) {
      data = { raw };
    }
  }

  if (!response.ok) {
    if (response.status === 401 && !silent401) {
      window.dispatchEvent(new CustomEvent('staff:unauthorized'));
    }
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      fallbackMessage(response.status);
    throw new ApiError(message, response.status, data);
  }

  return data;
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export const api = {
  staffLogin(payload) {
    return request('/api/auth/staff/login', { method: 'POST', body: payload, silent401: true });
  },

  staffMe() {
    return request('/api/auth/staff/me', { silent401: true });
  },

  staffLogout() {
    return request('/api/auth/staff/logout', { method: 'POST' });
  },

  updateOwnProfile(payload) {
    return request('/api/auth/staff/profile', { method: 'PATCH', body: payload });
  },

  changeOwnPassword(payload) {
    return request('/api/auth/staff/change-password', { method: 'POST', body: payload });
  },

  getTasks(params = {}) {
    return request('/api/production/tasks' + buildQuery(params));
  },

  getStats() {
    return request('/api/production/stats');
  },

  updateTaskStatus(id, status, note) {
    return request(`/api/production/tasks/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: { status, note: note || '' }
    });
  }
};

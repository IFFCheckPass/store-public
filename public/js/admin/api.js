/**
 * 管理端 API 封装
 * - 同源请求，Cookie 自动携带
 * - 非 2xx 统一抛出 ApiError
 * - 401 默认广播 admin:unauthorized，由应用切回登录视图
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
      window.dispatchEvent(new CustomEvent('admin:unauthorized'));
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

  overview() {
    return request('/api/admin/overview');
  },

  orders(params = {}) {
    return request('/api/admin/orders' + buildQuery(params));
  },

  order(orderNo) {
    return request('/api/admin/orders/' + encodeURIComponent(orderNo));
  },

  payments(status = 'submitted') {
    return request('/api/admin/payments' + buildQuery({ status }));
  },

  reviewPayment(id, action, note) {
    return request(`/api/admin/payments/${encodeURIComponent(id)}/review`, {
      method: 'POST',
      body: { action, note: note || '' }
    });
  },

  staffList() {
    return request('/api/admin/staff');
  },

  createStaff(payload) {
    return request('/api/admin/staff', { method: 'POST', body: payload });
  },

  updateStaff(id, payload) {
    return request(`/api/admin/staff/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
  },

  resetStaffPassword(id, password) {
    return request(`/api/admin/staff/${encodeURIComponent(id)}/reset-password`, {
      method: 'POST',
      body: { password }
    });
  },

  async exportBackup() {
    let response;
    try {
      response = await fetch('/api/admin/backup/export', { credentials: 'same-origin' });
    } catch (err) {
      throw new ApiError('网络连接失败，请检查网络后重试', 0, null);
    }
    if (!response.ok) {
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('admin:unauthorized'));
      }
      let data = null;
      try {
        data = await response.json();
      } catch (err) {
        data = null;
      }
      throw new ApiError(
        (data && data.error) || fallbackMessage(response.status),
        response.status,
        data
      );
    }
    return response.blob();
  },

  importBackup(payload) {
    return request('/api/admin/backup/import', { method: 'POST', body: payload });
  },

  giftCodes() {
    return request('/api/admin/gift-codes');
  },

  createGiftCode(payload) {
    return request('/api/admin/gift-codes', { method: 'POST', body: payload });
  },

  updateGiftCode(id, active) {
    return request(`/api/admin/gift-codes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { active: active ? 1 : 0 }
    });
  },

  deletionRequests() {
    return request('/api/admin/deletion-requests');
  },

  createDeletionRequest(orderNo, reason) {
    return request(`/api/admin/orders/${encodeURIComponent(orderNo)}/deletion-request`, {
      method: 'POST',
      body: { reason }
    });
  },

  approveDeletion(id) {
    return request(`/api/admin/deletion-requests/${encodeURIComponent(id)}/approve`, {
      method: 'POST'
    });
  },

  rejectDeletion(id) {
    return request(`/api/admin/deletion-requests/${encodeURIComponent(id)}/reject`, {
      method: 'POST'
    });
  },

  auditLogs(limit = 200) {
    return request('/api/admin/audit-logs' + buildQuery({ limit }));
  },

  products() {
    return request('/api/admin/products');
  },

  createProduct(payload) {
    return request('/api/admin/products', { method: 'POST', body: payload });
  },

  updateProduct(id, payload) {
    return request(`/api/admin/products/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: payload
    });
  },

  uploadImage(imageDataUrl, kind = 'asset') {
    return request('/api/admin/uploads/image', {
      method: 'POST',
      body: { imageDataUrl, kind }
    });
  },

  settings() {
    return request('/api/admin/settings');
  },

  saveSettings(settings) {
    return request('/api/admin/settings', { method: 'PUT', body: { settings } });
  }
};

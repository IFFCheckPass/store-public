/**
 * 统一 API 封装（同源请求，Cookie 自动携带）
 * 所有失败统一抛出 ApiError，视图层只负责展示。
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

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

let cachedUser = null;

export function getCachedUser() {
  return cachedUser;
}

export function setCachedUser(user) {
  cachedUser = user || null;
}

function fallbackMessage(status) {
  return STATUS_MESSAGES[status] || '请求失败，请稍后重试';
}

async function request(path, options = {}) {
  const { method = 'GET', body, silent401 = false } = options;
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = {};
  if (body !== undefined && !isForm) headers['Content-Type'] = JSON_HEADERS['Content-Type'];

  let response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : (isForm ? body : JSON.stringify(body))
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
    if (response.status === 401) {
      cachedUser = null;
      if (!silent401) {
        window.dispatchEvent(new CustomEvent('api:unauthorized'));
      }
    }
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      fallbackMessage(response.status);
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export const api = {
  getProducts() {
    return request('/api/products');
  },

  getProduct(id) {
    return request('/api/products/' + encodeURIComponent(id));
  },

  loginUser(payload) {
    return request('/api/auth/user/login', { method: 'POST', body: payload });
  },

  getMe() {
    return request('/api/auth/user/me', { silent401: true });
  },

  logoutUser() {
    return request('/api/auth/user/logout', { method: 'POST' });
  },

  validateGiftCode(code, items) {
    return request('/api/gift-codes/validate', {
      method: 'POST',
      body: items ? { code, items } : { code }
    });
  },

  createOrder(payload) {
    return request('/api/orders', { method: 'POST', body: payload });
  },

  getMyOrders() {
    return request('/api/orders/mine');
  },

  getOrder(orderNo) {
    return request('/api/orders/' + encodeURIComponent(orderNo));
  },

  submitPayment(orderNo, payload) {
    return request('/api/orders/' + encodeURIComponent(orderNo) + '/payment', {
      method: 'POST',
      body: payload
    });
  },

  cancelOrder(orderNo) {
    return request('/api/orders/' + encodeURIComponent(orderNo) + '/cancel', {
      method: 'POST'
    });
  }
};

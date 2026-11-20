import { api, getCachedUser, setCachedUser } from '../api.js';
import { getItems, getTotals, clearCart } from '../cart.js';
import {
  escapeHtml,
  safeImage,
  formatMoney,
  toast,
  setBusy,
  scrollToElement
} from '../ui.js';
import { openLoginModal } from './login.js';
import {
  GRADES,
  CLASS_NO_MIN,
  CLASS_NO_MAX,
  buildClassName,
  parseClassName
} from '../class-name.js';

const TIME_SLOTS = [
  { value: 'day_break', label: '白天场' },
  { value: 'noon', label: '午间' },
  { value: 'evening', label: '傍晚' },
  { value: 'evening_study', label: '晚自习间' }
];

const CONTACT_META = {
  qq: { label: 'QQ', placeholder: '请输入 5–12 位 QQ 号' },
  wechat: { label: '微信', placeholder: '请输入微信号（字母/数字/下划线）' },
  phone: { label: '电话·短信', placeholder: '请输入 11 位手机号' }
};

const CONTACT_PATTERNS = {
  qq: { re: /^\d{5,12}$/, message: 'QQ 号格式不正确，请填写 5–12 位数字' },
  wechat: { re: /^[A-Za-z0-9_-]{5,30}$/, message: '微信号格式不正确，请填写 5–30 位字母、数字或下划线' },
  phone: { re: /^1[3-9]\d{9}$/, message: '手机号格式不正确，请填写 11 位手机号' }
};

let promptOpen = false;

function summaryItemsHtml(items) {
  return items
    .map(
      (item) => `
        <div class="mini-item">
          <div class="mini-thumb"><img src="${escapeHtml(safeImage(item.imageUrl))}" alt="${escapeHtml(item.name)}"></div>
          <div class="mini-info">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml([item.specName, item.colorName].filter(Boolean).join(' · ') || '默认规格')} × ${item.quantity}</small>
          </div>
          <span class="mini-price">${formatMoney(item.unitPrice * item.quantity)}</span>
        </div>
      `
    )
    .join('');
}

function formHtml(user) {
  const parsedClass = parseClassName(user.className);
  return `
    <div class="checkout-layout">
      <div class="checkout-main">
        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title"><span class="step-dot">1</span>收货信息</h2>
            <span class="badge badge--soft">校内配送</span>
          </div>

          <div class="form-grid">
            <div class="field">
              <label class="field-label" for="checkout-grade">收货年段 <span class="req">*</span></label>
              <select class="select" id="checkout-grade" name="grade">
                <option value="">请选择</option>
                ${GRADES.map(
                  (grade) =>
                    `<option value="${grade}"${parsedClass.grade === grade ? ' selected' : ''}>${grade}</option>`
                ).join('')}
              </select>
              <span class="field-hint">默认使用登录班级，可改为其他班级</span>
            </div>
            <div class="field">
              <label class="field-label" for="checkout-class-no">收货班级 <span class="req">*</span></label>
              <input class="input" id="checkout-class-no" name="classNo" type="number" min="${CLASS_NO_MIN}" max="${CLASS_NO_MAX}" step="1" inputmode="numeric" value="${escapeHtml(parsedClass.classNo)}" placeholder="1-17">
            </div>
            <div class="field">
              <label class="field-label">下单人</label>
              <input class="input" type="text" value="${escapeHtml(user.name || '')} · ${escapeHtml(user.seatNo || '—')} 座" disabled>
              <span class="field-hint">用当前登录身份下单</span>
            </div>

            <div class="field field--full">
              <span class="field-label">配送方式</span>
              <div class="option-cards" data-delivery-cards style="grid-template-columns:1fr">
                <label class="option-card is-active">
                  <input type="radio" name="deliveryMethod" value="class" checked>
                  <span class="option-card__icon">🏫</span>
                  <span class="option-card__body"><strong>送货到班</strong><small>由小铺统一送到你的班级</small></span>
                </label>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="checkout-time">建议时间段 <span class="req">*</span></label>
              <select class="select" id="checkout-time" name="timeSlot">
                <option value="">请选择时间段</option>
                ${TIME_SLOTS.map((slot) => `<option value="${slot.value}">${slot.label}</option>`).join('')}
              </select>
            </div>

            <div class="field">
              <span class="field-label">联系方式 <span class="req">*</span></span>
              <div class="segmented" data-contact-seg>
                <label class="is-active"><input type="radio" name="contactType" value="qq" checked>QQ</label>
                <label><input type="radio" name="contactType" value="wechat">微信</label>
                <label><input type="radio" name="contactType" value="phone">电话·短信</label>
              </div>
            </div>

            <div class="field field--full">
              <label class="field-label" for="checkout-contact">联系号码 <span class="req">*</span></label>
              <input class="input" id="checkout-contact" name="contactValue" type="text" placeholder="请输入 5–12 位 QQ 号" maxlength="40">
              <span class="field-hint" data-contact-hint>方便配送时联系你，请确认号码正确</span>
            </div>

            <div class="field field--full">
              <label class="field-label" for="checkout-remark">备注 <span class="opt">选填</span></label>
              <textarea class="textarea" id="checkout-remark" name="remark" maxlength="200" placeholder="如：放在窗台就好 / 需要保密包装 / 改送隔壁班"></textarea>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2 class="panel-title"><span class="step-dot">2</span>赠货码</h2>
            <span class="badge badge--accent">可选 · 按适用范围抵扣</span>
          </div>
          <div class="gift-row">
            <input class="input" id="checkout-gift" name="giftCode" type="text" placeholder="有赠货码就填在这里" maxlength="40" autocomplete="off">
            <button class="btn btn--soft" type="button" data-validate-gift>验证</button>
          </div>
          <div class="gift-result" data-gift-result>
            <span class="field-hint">验证后按赠货码适用范围抵扣，未覆盖的部分仍需支付。</span>
          </div>
        </section>

        <section class="panel" data-pay-panel>
          <div class="panel-head">
            <h2 class="panel-title"><span class="step-dot">3</span>支付方式</h2>
            <span class="field-hint">下单后上传支付截图</span>
          </div>
          <div class="pay-cards" data-pay-cards>
            <label class="pay-card is-active">
              <input type="radio" name="paymentMethod" value="wechat" checked>
              <span class="pay-card__logo pay-card__logo--wechat">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.4 3C5.6 3 2.5 5.6 2.5 8.8c0 1.8 1 3.4 2.6 4.5l-.7 2.1 2.4-1.2c.8.2 1.7.4 2.6.4h.5a5 5 0 0 1-.2-1.4c0-3 2.9-5.4 6.6-5.4h.5C16 5.1 13 3 9.4 3Zm-2.3 3.1a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Zm4.6 0a.9.9 0 1 1 0 1.8.9.9 0 0 1 0-1.8Z"/><path d="M21.5 13.3c0-2.7-2.6-4.9-5.8-4.9s-5.8 2.2-5.8 4.9 2.6 4.9 5.8 4.9c.7 0 1.4-.1 2-.3l1.9 1-.5-1.7c1.5-.9 2.4-2.3 2.4-3.9Zm-7.7-1.1a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Zm3.8 0a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5Z"/></svg>
              </span>
              <span class="pay-card__body"><strong>微信支付</strong><small>扫码后上传截图</small></span>
            </label>
            <label class="pay-card">
              <input type="radio" name="paymentMethod" value="alipay">
              <span class="pay-card__logo pay-card__logo--alipay">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v9.2c-4-1.2-8.4-2.4-11.7-2.4-2.1 0-3.8.5-5.1 1.3V6a2 2 0 0 1 2-2Zm6 4H9v1.5h2v1.4H8.3v1.5H11c-.3.9-1.1 1.8-2.2 2.5-.8-.4-1.4-.9-1.8-1.6H5.4c.6 1.1 1.4 2 2.5 2.7-1 .6-2.2 1-3.6 1.3l.5 1.6c2-.4 3.8-1.2 5.2-2.1 1.6 1 3.7 1.7 6 1.7 2.7 0 4.6-1.5 4.6-3.5 0-1.6-1.2-2.8-3.2-3.4-1.1-.3-2.4-.5-3.8-.6V12h4.3v-1.5h-4.3v-1H16V8h-2.2V6.4h-1.6V8H11V4.9Z"/></svg>
              </span>
              <span class="pay-card__body"><strong>支付宝</strong><small>扫码后上传截图</small></span>
            </label>
          </div>
          <div class="alert alert--info" style="margin-top:14px">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/></svg>
            <span>提交订单后会弹出收款码与截图上传入口，识别支付单号后等待管理员核验即可。</span>
          </div>
        </section>

        <section class="panel" data-free-panel hidden>
          <div class="free-pay-box">
            <span>🎁</span>
            <strong>本单免支付</strong>
            <small>赠货码验证成功，提交后将直接生成已付款订单</small>
          </div>
        </section>
      </div>

      <aside class="checkout-side">
        <div class="summary-card">
          <h3>确认订单</h3>
          <div class="mini-items">${summaryItemsHtml(getItems())}</div>
          <div style="margin-top:16px">
            <div class="summary-row"><span>商品件数</span><strong>${getTotals().quantity} 件</strong></div>
            <div class="summary-row"><span>商品金额</span><strong>${formatMoney(getTotals().amount)}</strong></div>
            <div class="summary-row" data-sum-discount hidden><span>赠货码抵扣</span><strong data-sum-discount-value>-¥0.00</strong></div>
            <div class="summary-row"><span>配送费</span><strong>免配送费</strong></div>
            <div class="summary-row"><span>支付方式</span><strong data-sum-pay>微信支付</strong></div>
            <div class="summary-row summary-row--total">
              <span>应付</span>
              <span class="price" data-sum-total><span class="price__unit">¥</span>${formatMoney(getTotals().amount).slice(1)}</span>
            </div>
          </div>
          <div class="summary-actions">
            <button class="btn btn--primary btn--lg btn--block" type="button" data-submit>提交订单</button>
            <a class="btn btn--ghost btn--block" href="#/cart">返回购物车</a>
          </div>
          <p class="summary-note" data-sum-note>提交后请在支付弹窗中完成扫码并上传截图，管理员核验后开始备货。</p>
        </div>
      </aside>
    </div>
  `;
}

function setActiveCards(form) {
  form.querySelectorAll('[data-delivery-cards] .option-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('is-active', !!(input && input.checked));
  });
  form.querySelectorAll('[data-pay-cards] .pay-card').forEach((card) => {
    const input = card.querySelector('input');
    card.classList.toggle('is-active', !!(input && input.checked));
  });
  form.querySelectorAll('[data-contact-seg] label').forEach((label) => {
    const input = label.querySelector('input');
    label.classList.toggle('is-active', !!(input && input.checked));
  });
}

function markInvalid(input, message) {
  if (!input) return;
  input.classList.add('is-invalid');
  const field = input.closest('.field');
  if (!field) return;
  let error = field.querySelector('.field-error');
  if (!error) {
    error = document.createElement('div');
    error.className = 'field-error';
    error.dataset.dyn = '1';
    field.appendChild(error);
  }
  error.textContent = message;
}

function clearErrors(form) {
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  form.querySelectorAll('.field-error[data-dyn="1"]').forEach((el) => el.remove());
}

function loginRequiredHtml() {
  return `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Checkout</span>
        <h1 class="page-title">确认订单</h1>
        <p class="page-sub">结算前需要先登录，方便把你的订单和班级对应起来。</p>
      </div>
      <div class="login-prompt">
        <div class="prompt-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.6-3.4 3.4-5.5 7-5.5s6.4 2.1 7 5.5"/></svg>
        </div>
        <h2>登录后即可结算</h2>
        <p>使用姓名、班级、座号登录，收货班级会自动填好，也能随时查看订单状态。</p>
        <button class="btn btn--primary" type="button" data-login>立即登录</button>
      </div>
    </div>
  `;
}

function emptyCartHtml() {
  return `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Checkout</span>
        <h1 class="page-title">确认订单</h1>
      </div>
      <div class="empty-state">
        <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
          <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
          <path d="M52 58h74l-7 68a10 10 0 0 1-10 9H69a10 10 0 0 1-10-9l-7-68Z" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
          <path d="M72 58V48a17 17 0 0 1 34 0v10" stroke="#BFE9D8" stroke-width="2.5"/>
          <circle cx="78" cy="94" r="3" fill="#12A67A"/>
          <circle cx="100" cy="94" r="3" fill="#12A67A"/>
          <path d="M82 105c4 4 10 4 14 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
        <h3>购物车是空的，先挑点好物吧</h3>
        <p>没有商品可结算，回小铺看看今天上新的商品。</p>
        <a class="btn btn--primary" href="#/">去逛逛小铺</a>
      </div>
    </div>
  `;
}

export async function render(root, params = {}, query = {}) {
  const items = getItems();
  const user = getCachedUser();

  if (!items.length) {
    root.innerHTML = emptyCartHtml();
    return;
  }

  if (!user) {
    root.innerHTML = loginRequiredHtml();
    const loginBtn = root.querySelector('[data-login]');
    const openPrompt = () => {
      if (promptOpen) return;
      promptOpen = true;
      openLoginModal({
        reason: '结算前需要先登录，登录后会回到结算页',
        onSuccess() {
          promptOpen = false;
          render(root, params, query);
        },
        onCancel() {
          promptOpen = false;
        }
      });
    };
    if (loginBtn) loginBtn.addEventListener('click', openPrompt);
    window.setTimeout(openPrompt, 160);
    return;
  }

  root.innerHTML = `
    <div class="container">
      <div class="page-head">
        <span class="page-eyebrow">Checkout</span>
        <h1 class="page-title">确认订单</h1>
        <p class="page-sub">下单人：${escapeHtml(user.name || '同学')} · ${escapeHtml(user.className || '—')} · ${escapeHtml(user.seatNo || '—')} 座</p>
      </div>
      ${formHtml(user)}
    </div>
  `;

  const form = root;
  const gradeSelect = root.querySelector('[name="grade"]');
  const classNoInput = root.querySelector('[name="classNo"]');
  const timeSelect = root.querySelector('[name="timeSlot"]');
  const contactInput = root.querySelector('[name="contactValue"]');
  const contactHint = root.querySelector('[data-contact-hint]');
  const remarkInput = root.querySelector('[name="remark"]');
  const giftInput = root.querySelector('[name="giftCode"]');
  const giftResult = root.querySelector('[data-gift-result]');
  const payPanel = root.querySelector('[data-pay-panel]');
  const freePanel = root.querySelector('[data-free-panel]');
  const submitBtn = root.querySelector('[data-submit]');
  const sumPay = root.querySelector('[data-sum-pay]');
  const sumTotal = root.querySelector('[data-sum-total]');
  const sumNote = root.querySelector('[data-sum-note]');
  const sumDiscount = root.querySelector('[data-sum-discount]');
  const sumDiscountValue = root.querySelector('[data-sum-discount-value]');
  const amount = getTotals().amount;

  let gift = null;
  const clearGift = () => {
    gift = null;
    if (payPanel) payPanel.hidden = false;
    if (freePanel) freePanel.hidden = true;
    if (sumDiscount) sumDiscount.hidden = true;
    if (sumTotal) sumTotal.innerHTML = `<span class="price__unit">¥</span>${formatMoney(amount).slice(1)}`;
    if (sumNote) sumNote.textContent = '提交后请在支付弹窗中完成扫码并上传截图，管理员核验后开始备货。';
    const selected = root.querySelector('[name="paymentMethod"]:checked');
    if (sumPay) sumPay.textContent = selected && selected.value === 'alipay' ? '支付宝' : '微信支付';
  };

  const updateGiftUi = () => {
    if (!giftResult) return;
    if (!gift) {
      giftResult.innerHTML = '<span class="field-hint">验证后按赠货码适用范围抵扣，未覆盖的部分仍需支付。</span>';
      return;
    }
    const scopeText = gift.scopeLabel ? ` · ${escapeHtml(gift.scopeLabel)}` : '';
    const covered = !!gift.coveredAll;
    giftResult.innerHTML = `
      <div class="gift-valid">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.5"/></svg>
        <div>
          赠货码有效${scopeText}
          <small>抵扣 ${formatMoney(gift.discount || 0)}${covered ? ' · 本单免支付' : ` · 还需支付 ${formatMoney(gift.payable || 0)}`}${gift.note ? ` · ${escapeHtml(gift.note)}` : ''}${gift.remaining !== undefined && gift.remaining !== null ? ` · 剩余 ${escapeHtml(gift.remaining)} 次` : ''}</small>
        </div>
      </div>
    `;
    if (sumDiscount) {
      sumDiscount.hidden = !(gift.discount > 0);
      if (sumDiscountValue) sumDiscountValue.textContent = `-${formatMoney(gift.discount || 0)}`;
    }
    if (covered) {
      if (payPanel) payPanel.hidden = true;
      if (freePanel) freePanel.hidden = false;
      if (sumTotal) sumTotal.innerHTML = `<span class="price__unit">¥</span>0.00`;
      if (sumPay) sumPay.textContent = '赠货码免支付';
      if (sumNote) sumNote.textContent = `已使用赠货码 ${gift.code}，提交后将直接生成已付款订单。`;
    } else {
      if (payPanel) payPanel.hidden = false;
      if (freePanel) freePanel.hidden = true;
      if (sumTotal) {
        sumTotal.innerHTML = `<span class="price__unit">¥</span>${formatMoney(gift.payable || 0).slice(1)}`;
      }
      const selected = root.querySelector('[name="paymentMethod"]:checked');
      if (sumPay) sumPay.textContent = selected && selected.value === 'alipay' ? '支付宝' : '微信支付';
      if (sumNote) {
        sumNote.textContent = `赠货码抵扣 ${formatMoney(gift.discount || 0)}，还需支付 ${formatMoney(
          gift.payable || 0
        )}，请提交后上传支付截图。`;
      }
    }
  };

  const payRadios = root.querySelectorAll('[name="paymentMethod"]');
  const syncPaymentLabel = () => {
    setActiveCards(form);
    const value = root.querySelector('[name="paymentMethod"]:checked').value;
    if (sumPay && (!gift || !gift.coveredAll)) {
      sumPay.textContent = value === 'alipay' ? '支付宝' : '微信支付';
    }
  };
  payRadios.forEach((radio) => radio.addEventListener('change', syncPaymentLabel));

  const contactRadios = root.querySelectorAll('[name="contactType"]');
  contactRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      setActiveCards(form);
      const value = root.querySelector('[name="contactType"]:checked').value;
      const meta = CONTACT_META[value] || CONTACT_META.qq;
      if (contactInput) {
        contactInput.placeholder = meta.placeholder;
        contactInput.inputMode = value === 'phone' ? 'numeric' : 'text';
      }
      if (contactHint) {
        contactHint.textContent =
          value === 'phone'
            ? '用于配送时电话或短信联系，请填写 11 位手机号'
            : value === 'qq'
              ? '用于配送时联系你，请填写 5–12 位 QQ 号'
              : '用于配送时联系你，请填写 5–30 位微信号';
      }
    });
  });

  if (giftInput) {
    giftInput.addEventListener('input', () => {
      if (gift && giftInput.value.trim() !== gift.code) {
        clearGift();
        updateGiftUi();
      }
    });
  }

  const giftBtn = root.querySelector('[data-validate-gift]');
  if (giftBtn) {
    giftBtn.addEventListener('click', async () => {
      const code = giftInput ? giftInput.value.trim() : '';
      if (!code) {
        toast('请先填写赠货码', 'info');
        if (giftInput) giftInput.focus();
        return;
      }
      setBusy(giftBtn, true, '验证中…');
      try {
        const cartItems = getItems().map((item) => ({
          productId: item.productId,
          specName: item.specName,
          colorName: item.colorName,
          quantity: item.quantity
        }));
        const data = await api.validateGiftCode(code, cartItems);
        if (data && data.valid) {
          gift = {
            code: data.code || code,
            note: data.note || '',
            remaining: data.remaining,
            discount: data.discount || 0,
            payable: data.payable || 0,
            coveredAll: !!data.coveredAll,
            scopeLabel: data.scopeLabel || ''
          };
          updateGiftUi();
          toast(
            gift.coveredAll
              ? '赠货码有效，本单免支付'
              : `赠货码有效，可抵扣 ${formatMoney(gift.discount)}`,
            'success'
          );
        } else {
          clearGift();
          updateGiftUi();
          giftResult.innerHTML = `
            <div class="alert alert--error">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
              <span>${escapeHtml((data && data.error) || '赠货码无效')}</span>
            </div>
          `;
        }
      } catch (err) {
        clearGift();
        updateGiftUi();
        giftResult.innerHTML = `
          <div class="alert alert--error">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>
            <span>${escapeHtml((err && err.message) || '赠货码验证失败，请稍后再试')}</span>
          </div>
        `;
      } finally {
        setBusy(giftBtn, false);
      }
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      clearErrors(form);

      const grade = gradeSelect ? gradeSelect.value : '';
      const classNo = classNoInput ? classNoInput.value.trim() : '';
      const className = buildClassName(grade, classNo);
      const deliveryMethod = 'class';
      const timeSlot = timeSelect ? timeSelect.value : '';
      const contactType = root.querySelector('[name="contactType"]:checked').value;
      const contactValue = contactInput ? contactInput.value.trim() : '';
      const paymentMethod = root.querySelector('[name="paymentMethod"]:checked').value;
      const remark = remarkInput ? remarkInput.value.trim() : '';

      let firstInvalid = null;
      if (!grade) {
        markInvalid(gradeSelect, '请选择收货年段');
        firstInvalid = firstInvalid || gradeSelect;
      } else if (!className) {
        markInvalid(classNoInput, '班级号需在 1-17 之间');
        firstInvalid = firstInvalid || classNoInput;
      }
      if (!timeSlot) {
        markInvalid(timeSelect, '请选择建议时间段');
        firstInvalid = firstInvalid || timeSelect;
      }
      if (!contactValue) {
        markInvalid(contactInput, '请填写联系号码');
        firstInvalid = firstInvalid || contactInput;
      } else {
        const pattern = CONTACT_PATTERNS[contactType] || CONTACT_PATTERNS.qq;
        if (!pattern.re.test(contactValue)) {
          markInvalid(contactInput, pattern.message);
          firstInvalid = firstInvalid || contactInput;
        }
      }
      if (firstInvalid) {
        scrollToElement(firstInvalid.closest('.field'));
        toast('请先补全必填信息', 'error');
        return;
      }

      const payload = {
        items: getItems().map((item) => ({
          productId: item.productId,
          specName: item.specName,
          colorName: item.colorName,
          quantity: item.quantity
        })),
        deliveryMethod,
        deliveryDetail: `${className}${user.seatNo ? ' · ' + user.seatNo + ' 座' : ''}`,
        className,
        seatNo: user.seatNo || '',
        timeSlot,
        contactType,
        contactValue,
        remark,
        paymentMethod: gift && gift.coveredAll ? 'gift' : paymentMethod
      };
      if (gift) payload.giftCode = gift.code;

      setBusy(submitBtn, true, '正在提交…');
      try {
        const data = await api.createOrder(payload);
        const order = data && data.order;
        const orderNo = order && order.orderNo;
        const needsPayment = order && order.status === 'pending_payment';
        clearCart();
        toast(
          needsPayment
            ? order && order.discountAmount
              ? '下单成功，赠货码已抵扣，请支付剩余金额'
              : '下单成功，请完成支付'
            : '下单成功，赠货码已使用',
          'success'
        );

        if (orderNo) {
          const target = '#/order/' + encodeURIComponent(orderNo) + (needsPayment ? '?pay=1' : '');
          window.location.hash = target;
        } else {
          window.location.hash = '#/orders';
        }
      } catch (err) {
        if (err && err.status === 401) {
          setCachedUser(null);
          window.dispatchEvent(new CustomEvent('auth:change'));
          toast('登录状态已失效，请重新登录', 'error');
          render(root, params, query);
          return;
        }
        toast((err && err.message) || '下单失败，请稍后重试', 'error');
      } finally {
        setBusy(submitBtn, false);
      }
    });
  }

  syncPaymentLabel();
  setActiveCards(form);
}

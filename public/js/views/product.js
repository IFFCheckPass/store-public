import { api } from '../api.js';
import { addItem } from '../cart.js';
import { escapeHtml, safeImage, safeColor, formatMoney, toast } from '../ui.js';

function deltaText(delta) {
  const num = Number(delta);
  const safe = Number.isFinite(num) ? num : 0;
  if (safe === 0) return '标准';
  return (safe > 0 ? '+' : '−') + formatMoney(Math.abs(safe));
}

function normalizeSpecs(product) {
  const specs = Array.isArray(product.specs) ? product.specs : [];
  return specs.map((spec) => ({
    name: String(spec.name || '默认'),
    delta: Number(spec.delta) || 0
  }));
}

function normalizeColors(product) {
  const colors = Array.isArray(product.colors) ? product.colors : [];
  return colors.map((color, index) => ({
    name: String(color.name || `配色 ${index + 1}`),
    hex: safeColor(color.hex),
    image: safeImage(color.image || product.coverUrl),
    custom: Boolean(color.custom)
  }));
}

/** 定制图案：叠加在颜色底图上的透明图层，可单独加价、可标记为「定制」项 */
function normalizePatterns(product) {
  const patterns = Array.isArray(product.patterns) ? product.patterns : [];
  return patterns.map((pattern, index) => ({
    name: String(pattern.name || `图案 ${index + 1}`),
    image: pattern.image ? safeImage(pattern.image) : '',
    delta: Number(pattern.delta) || 0,
    custom: Boolean(pattern.custom)
  }));
}

function loadingHtml() {
  return `
    <div class="container">
      <div class="page-loading"><span class="spinner"></span><p>正在打开商品…</p></div>
    </div>
  `;
}

function errorHtml(message, retry = true) {
  return `
    <div class="container">
      <div class="empty-state">
        <svg class="empty-art" viewBox="0 0 178 150" fill="none" aria-hidden="true">
          <ellipse cx="89" cy="132" rx="58" ry="9" fill="#E9F6F0"/>
          <path d="M52 58h74l-7 68a10 10 0 0 1-10 9H69a10 10 0 0 1-10-9l-7-68Z" fill="#EAF8F2" stroke="#BFE9D8" stroke-width="2.5"/>
          <path d="M72 58V48a17 17 0 0 1 34 0v10" stroke="#BFE9D8" stroke-width="2.5"/>
          <circle cx="78" cy="94" r="3" fill="#12A67A"/>
          <circle cx="100" cy="94" r="3" fill="#12A67A"/>
          <path d="M82 108c4-4 10-4 14 0" stroke="#12A67A" stroke-width="2.5" stroke-linecap="round"/>
          <path d="m124 40 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#FFC79B"/>
        </svg>
        <h3>${escapeHtml(message)}</h3>
        <p>商品可能已经下架，或者链接不太完整。回到首页看看其他好物吧。</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          ${retry ? '<button class="btn btn--soft" type="button" data-retry>再试一次</button>' : ''}
          <a class="btn btn--primary" href="#/">回到首页</a>
        </div>
      </div>
    </div>
  `;
}

export async function render(root, params = {}) {
  const id = params.id ? decodeURIComponent(params.id) : '';
  if (!id) {
    root.innerHTML = errorHtml('没有找到这个商品', false);
    return;
  }

  root.innerHTML = loadingHtml();

  let product;
  try {
    const data = await api.getProduct(id);
    product = data && data.product;
  } catch (err) {
    root.innerHTML = errorHtml(
      err && err.status === 404 ? '这个商品已经下架了' : '商品加载失败',
      !(err && err.status === 404)
    );
    const retry = root.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', () => render(root, params));
    return;
  }

  if (!product) {
    root.innerHTML = errorHtml('商品不存在', false);
    return;
  }

  const specs = normalizeSpecs(product);
  const colors = normalizeColors(product);
  const patterns = normalizePatterns(product);
  const isCustom = Boolean(product.isCustom) && patterns.length > 0;
  const isPresale = !!product.isPresale;
  const presaleEta = String(product.presaleEta || '').trim();
  const stockRaw = Number(product.stock);
  const stock = Number.isFinite(stockRaw) ? Math.max(0, Math.trunc(stockRaw)) : 0;
  const soldOut = !isPresale && stock <= 0;
  const maxQty = isPresale ? 99 : Math.min(stock, 99);
  const basePrice = Number(product.basePrice) || 0;

  let specIndex = 0;
  let colorIndex = 0;
  let patternIndex = 0;
  let quantity = 1;

  const currentSpec = () => specs[specIndex] || { name: '', delta: 0 };
  const currentColor = () =>
    colors[colorIndex] || { name: '', hex: '', image: safeImage(product.coverUrl), custom: false };
  const currentPattern = () => patterns[patternIndex] || { name: '', image: '', delta: 0, custom: false };
  const unitPrice = () =>
    Math.max(
      0,
      basePrice +
        (currentSpec().delta || 0) +
        (isCustom ? currentPattern().delta || 0 : 0)
    );

  const mainImage = colors.length ? colors[0].image : safeImage(product.coverUrl);

  const stockLine = isPresale
    ? `<span class="stock-dot is-presale">预售</span><span>${
        presaleEta ? `预计 ${escapeHtml(presaleEta)} 配货` : '下单后按预售时间配货'
      }</span>`
    : stock <= 0
      ? '<span class="stock-dot is-out">暂时售罄</span><span>可以关注下次上架</span>'
      : stock <= 5
        ? `<span class="stock-dot is-low">仅剩 ${stock} 件</span><span>手慢无，喜欢就带走吧</span>`
        : `<span class="stock-dot">现货 ${stock} 件</span><span>支持班级配送</span>`;

  root.innerHTML = `
    <div class="container">
      <nav class="breadcrumb" aria-label="面包屑">
        <a href="#/">首页</a>
        <span class="sep">/</span>
        <span>${escapeHtml(product.category || '精选好物')}</span>
        <span class="sep">/</span>
        <span class="current">${escapeHtml(product.name || '商品详情')}</span>
      </nav>

      <div class="detail-layout">
        <div class="gallery">
          <div class="gallery-main${isCustom ? ' is-custom' : ''}">
            ${
              isCustom
                ? `<div class="custom-preview">
                     <img id="main-image" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name || '商品图片')}">
                     <img id="pattern-layer" class="custom-layer" src="${escapeHtml(
                       patterns[0].image
                     )}" alt="" aria-hidden="true"${patterns[0].image ? '' : ' hidden'}>
                   </div>`
                : `<img id="main-image" src="${escapeHtml(mainImage)}" alt="${escapeHtml(product.name || '商品图片')}">`
            }
            ${product.needProduction ? '<span class="badge badge--make">定制 · 下单后制作</span>' : ''}
            ${isPresale ? '<span class="badge badge--presale">预售</span>' : ''}
          </div>
          <div class="gallery-thumbs" data-thumbs aria-label="颜色浏览图">
            ${(colors.length ? colors : [{ name: '默认', hex: '#D8E6E0', image: safeImage(product.coverUrl) }])
              .map(
                (color, index) => `
                  <button class="thumb${index === 0 ? ' is-active' : ''}" type="button" data-color-index="${index}" aria-label="查看 ${escapeHtml(color.name)} 配色">
                    <img src="${escapeHtml(color.image)}" alt="${escapeHtml(color.name)}">
                  </button>`
              )
              .join('')}
          </div>
        </div>

        <div class="detail-info">
          <span class="detail-cat">🌿 ${escapeHtml(product.category || '校园精选')}</span>
          <h1 class="detail-title">${escapeHtml(product.name || '未命名商品')}</h1>
          <p class="detail-desc">${escapeHtml(product.description || '店主精选的校园好物，数量有限，先到先得。')}</p>

          <div class="detail-price-row">
            <span class="price" id="detail-price"><span class="price__unit">¥</span>${formatMoney(unitPrice()).slice(1)}</span>
            <span class="price-tip">${
              isPresale
                ? `预售商品 · ${presaleEta ? `预计 ${escapeHtml(presaleEta)} 配货` : '下单后按预售时间配货'}`
                : product.needProduction
                  ? '定制商品，下单后开始制作'
                  : '现货商品，售完即止'
            }</span>
          </div>

          <div class="stock-line">
            ${stockLine}
          </div>

          ${specs.length
            ? `<div class="option-group">
                 <div class="option-head">
                   <span class="option-label">选择规格</span>
                   <span class="option-value" data-spec-value>${escapeHtml(specs[0].name)} · ${deltaText(specs[0].delta)}</span>
                 </div>
                 <div class="option-pills" data-specs>
                   ${specs
                     .map(
                       (spec, index) => `
                         <button class="pill${index === 0 ? ' is-active' : ''}" type="button" data-spec-index="${index}">
                           ${escapeHtml(spec.name)}
                           <small>${deltaText(spec.delta)}</small>
                         </button>`
                     )
                     .join('')}
                 </div>
               </div>`
            : ''}

          ${colors.length
            ? `<div class="option-group">
                 <div class="option-head">
                   <span class="option-label">选择颜色</span>
                   <span class="option-value" data-color-value>${escapeHtml(colors[0].name)}</span>
                 </div>
                 <div class="swatches" data-colors>
                   ${colors
                     .map(
                       (color, index) => `
                         <button class="swatch${index === 0 ? ' is-active' : ''}" type="button" data-swatch-index="${index}">
                           <i class="swatch__dot" style="background:${escapeHtml(color.hex)}"></i>
                           ${escapeHtml(color.name)}
                         </button>`
                     )
                     .join('')}
                 </div>
               </div>`
            : ''}

          ${
            isCustom
              ? `<div class="option-group">
                   <div class="option-head">
                     <span class="option-label">选择图案</span>
                     <span class="option-value" data-pattern-value>${escapeHtml(patterns[0].name)} · ${deltaText(patterns[0].delta)}</span>
                   </div>
                   <div class="pattern-options" data-patterns>
                     ${patterns
                       .map(
                         (pattern, index) => `
                           <button class="pattern-option${index === 0 ? ' is-active' : ''}" type="button" data-pattern-index="${index}" aria-label="选择图案 ${escapeHtml(pattern.name)}">
                             ${
                               pattern.image
                                 ? `<img src="${escapeHtml(pattern.image)}" alt="">`
                                 : '<span class="pattern-option__empty">未上传</span>'
                             }
                             <span class="pattern-option__name">${escapeHtml(pattern.name)}${pattern.custom ? ' · 定制' : ''}</span>
                             <small>${deltaText(pattern.delta)}</small>
                           </button>`
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }

          <div class="custom-hint" data-custom-hint hidden>
            <strong>定制项</strong>
            <span>你选择了「定制」选项。下单后我们会与你确认定制内容，制作周期可能比现货更长。</span>
          </div>

          <div class="buy-panel">
            <div class="buy-row">
              <div class="qty" role="group" aria-label="购买数量">
                <button class="qty-btn" type="button" data-qty="dec" aria-label="减少数量" ${quantity <= 1 || soldOut ? 'disabled' : ''}>−</button>
                <span class="qty-value" data-qty-value>${quantity}</span>
                <button class="qty-btn" type="button" data-qty="inc" aria-label="增加数量" ${soldOut ? 'disabled' : ''}>+</button>
              </div>
              <div class="buy-total">
                合计
                <span class="price" id="buy-total"><span class="price__unit">¥</span>${formatMoney(unitPrice() * quantity).slice(1)}</span>
              </div>
            </div>
            <div class="buy-actions">
              <button class="btn btn--primary btn--lg" type="button" data-add ${soldOut ? 'disabled' : ''}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h2.2l2.1 10.4a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.6L20 7H6"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17.5" cy="19.5" r="1.3"/></svg>
                ${soldOut ? '暂时售罄' : isPresale ? '预售下单' : '加入购物车'}
              </button>
              <a class="btn btn--soft btn--lg" href="#/cart">去购物车</a>
            </div>
            <div class="service-list">
              <div class="service-item"><strong>班级配送</strong>送至你的班级</div>
              <div class="service-item"><strong>支付灵活</strong>微信 / 支付宝 / 赠货码</div>
              <div class="service-item"><strong>下单可查</strong>订单状态实时更新</div>
            </div>
          </div>

          <div class="detail-extra">
            <h3>购买须知</h3>
            <p>下单前请确认规格与颜色，付款后请上传支付截图并核对支付单号。定制商品会在下单后开始制作，预售商品按页面标注的预计时间配货，完成后由小铺统一配送到班级。如信息填写有误，请在订单备注中说明。</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const mainEl = root.querySelector('#main-image');
  const priceEl = root.querySelector('#detail-price');
  const totalEl = root.querySelector('#buy-total');
  const qtyEl = root.querySelector('[data-qty-value]');
  const decBtn = root.querySelector('[data-qty="dec"]');
  const incBtn = root.querySelector('[data-qty="inc"]');
  const addBtn = root.querySelector('[data-add]');
  const specValueEl = root.querySelector('[data-spec-value]');
  const colorValueEl = root.querySelector('[data-color-value]');
  const patternWrap = root.querySelector('[data-patterns]');
  const patternValueEl = root.querySelector('[data-pattern-value]');
  const patternLayer = root.querySelector('#pattern-layer');
  const customHint = root.querySelector('[data-custom-hint]');

  const paintCustomHint = () => {
    if (!customHint) return;
    const hit = Boolean(currentColor().custom || (isCustom && currentPattern().custom));
    customHint.hidden = !hit;
  };

  const paint = () => {
    if (priceEl) priceEl.innerHTML = `<span class="price__unit">¥</span>${formatMoney(unitPrice()).slice(1)}`;
    if (totalEl) totalEl.innerHTML = `<span class="price__unit">¥</span>${formatMoney(unitPrice() * quantity).slice(1)}`;
    if (qtyEl) qtyEl.textContent = String(quantity);
    if (decBtn) decBtn.disabled = quantity <= 1 || soldOut;
    if (incBtn) incBtn.disabled = soldOut || quantity >= maxQty;
  };

  const specWrap = root.querySelector('[data-specs]');
  if (specWrap) {
    specWrap.addEventListener('click', (event) => {
      const button = event.target.closest('[data-spec-index]');
      if (!button) return;
      specIndex = Number(button.dataset.specIndex) || 0;
      specWrap.querySelectorAll('.pill').forEach((pill, index) => {
        pill.classList.toggle('is-active', index === specIndex);
      });
      if (specValueEl) {
        specValueEl.textContent = `${currentSpec().name} · ${deltaText(currentSpec().delta)}`;
      }
      paint();
    });
  }

  const colorWrap = root.querySelector('[data-colors]');
  const thumbs = root.querySelector('[data-thumbs]');
  let colorTimer = null;

  const applyColor = (index) => {
    if (!colors.length) return;
    colorIndex = Math.max(0, Math.min(colors.length - 1, index));
    const color = currentColor();
    if (mainEl) {
      window.clearTimeout(colorTimer);
      mainEl.style.opacity = '0';
      colorTimer = window.setTimeout(() => {
        mainEl.src = color.image;
        mainEl.style.opacity = '1';
      }, 120);
    }
    if (colorValueEl) colorValueEl.textContent = color.name;
    if (colorWrap) {
      colorWrap.querySelectorAll('.swatch').forEach((swatch, i) => {
        swatch.classList.toggle('is-active', i === colorIndex);
      });
    }
    if (thumbs) {
      thumbs.querySelectorAll('.thumb').forEach((thumb, i) => {
        thumb.classList.toggle('is-active', i === colorIndex);
      });
    }
    paintCustomHint();
  };

  if (colorWrap) {
    colorWrap.addEventListener('click', (event) => {
      const button = event.target.closest('[data-swatch-index]');
      if (!button) return;
      applyColor(Number(button.dataset.swatchIndex) || 0);
    });
  }

  if (thumbs) {
    thumbs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-color-index]');
      if (!button) return;
      applyColor(Number(button.dataset.colorIndex) || 0);
    });
  }

  if (patternWrap) {
    const applyPattern = (index) => {
      patternIndex = Math.max(0, Math.min(patterns.length - 1, index));
      const pattern = currentPattern();
      if (patternLayer) {
        if (pattern.image) {
          patternLayer.src = pattern.image;
          patternLayer.hidden = false;
        } else {
          patternLayer.hidden = true;
        }
      }
      if (patternValueEl) {
        patternValueEl.textContent = `${pattern.name} · ${deltaText(pattern.delta)}`;
      }
      patternWrap.querySelectorAll('.pattern-option').forEach((el, i) => {
        el.classList.toggle('is-active', i === patternIndex);
      });
      paint();
      paintCustomHint();
    };
    patternWrap.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pattern-index]');
      if (!button) return;
      applyPattern(Number(button.dataset.patternIndex) || 0);
    });
  }

  if (decBtn) {
    decBtn.addEventListener('click', () => {
      quantity = Math.max(1, quantity - 1);
      paint();
    });
  }

  if (incBtn) {
    incBtn.addEventListener('click', () => {
      if (quantity >= maxQty) return;
      quantity = Math.min(maxQty, quantity + 1);
      paint();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (soldOut) return;
      const color = currentColor();
      const result = addItem({
        productId: product.id,
        name: product.name || '未命名商品',
        imageUrl: colors.length ? color.image : safeImage(product.coverUrl),
        specName: currentSpec().name,
        colorName: colors.length ? color.name : '',
        colorHex: colors.length ? color.hex : '',
        patternName: isCustom ? currentPattern().name : '',
        patternImage: isCustom ? currentPattern().image : '',
        isCustom: Boolean(color.custom || (isCustom && currentPattern().custom)),
        unitPrice: unitPrice(),
        quantity,
        stock: isPresale ? 0 : stock
      });

      if (!result.ok) {
        toast(result.message || '加入购物车失败', 'error');
        return;
      }
      if (result.limited) {
        toast(`库存有限，购物车中该商品已为 ${result.quantity} 件`, 'info');
      } else {
        toast('已加入购物车', 'success');
      }
    });
  }

  paint();
  paintCustomHint();
}

export const SETTINGS_KEY = 'site';

export const DEFAULT_SETTINGS = {
  brandName: '测试',
  brandSubtitle: 'Test',
  brandTagline: '',
  logoUrl: '',
  faviconUrl: '/img/favicon.svg',

  primaryColor: '#2ed5ff',
  accentColor: '#ff8a3d',
  backgroundColor: '#f7faf8',

  noticeText: '',
  heroEyebrow: '',
  heroTitle: '',
  heroHighlight: '',
  heroSubtitle: '',
  heroButtonText: 'Go',
  heroTrust: [],

  shopTitle: '',
  shopSubtitle: '',

  footerDescription: '',
  footerHours: '',
  footerNotice: '如遇问题，请在订单备注中说明，我们会尽快处理。',
  footerCopyright: '',
  footerPaymentNote: '演示收款码不可真实支付，支付截图仅用于本地 OCR 识别演示。',
  footerShoppingTips: ['支持微信、支付宝扫码', '赠货码可直接免支付'],

  paymentTitle: '扫码支付并上传截图',
  paymentSubtitle: '提交后会进入待核验，管理员确认后订单开始备货',
  paymentNote: '演示示例码 · 不可真实支付',
  paymentTip: '这是演示用收款码，请勿真实转账。上传任意支付截图即可体验识别流程。',
  paymentTutorial: [
    { title: '打开微信/支付宝', desc: '在手机上打开付款码' },
    { title: '扫描收款码', desc: '长按识别或扫一扫' },
    { title: '支付成功截图', desc: '截下支付结果页面' },
    { title: '上传截图', desc: '自动识别支付单号' },
  ],
  qrWechatUrl: '/img/qr-wechat.svg',
  qrAlipayUrl: '/img/qr-alipay.svg',
};

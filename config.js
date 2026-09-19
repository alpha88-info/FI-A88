// config.js — ค่าตั้งค่ากลาง + ตัวเรียก API ที่ใช้ร่วมกัน
// ต้องโหลดก่อน login.js / script.js เสมอ
//
// เมื่อ deployment URL เปลี่ยน แก้ที่ไฟล์นี้ "ที่เดียว" (ไม่ต้องไล่แก้หลายไฟล์อีก)
// แนะนำให้ใช้ Manage deployments → Edit → New version เพื่อให้ URL คงเดิม

window.APP_CONFIG = Object.freeze({
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbzt79HkmSmFkd7e6W8IVAjTPBZH0QDQ8kU_7eTdLijzL5NUtmxewIGV_oU_Kn6VVPoabw/exec',

  // ค่าจาก setupSecrets() ใน Code.js (ดู Execution log)
  // หมายเหตุ: ค่านี้ยังมองเห็นได้ในเบราว์เซอร์ จึงเป็นแค่ตัวกรองคำขอขยะ
  // ความปลอดภัยจริงมาจาก token หลัง login
  API_SECRET: 'da3a77d843ac465a80f893e714b0ec90cec62ea4d3bb463ca7cf830e0539239f',

  CHECK_INTERVAL: 60000,    // ตรวจอัพเดทข้อมูลทุก 60 วินาที
  REQUEST_TIMEOUT: 20000,   // timeout ของแต่ละคำขอ (ms)

  // ข้อความที่คัดลอกให้ลูกค้า
  MIN_DEPOSIT: 50,
  MIN_WITHDRAW: 250
});

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}
window.ApiError = ApiError;

// เรียก backend ด้วย POST (Content-Type: text/plain เพื่อเลี่ยง CORS preflight ที่ Apps Script ไม่รองรับ)
// คืนค่า JSON ที่ server ตอบ (ตรวจ data.success / data.code เอง)
// throw ApiError เฉพาะปัญหาระดับการเชื่อมต่อ/รูปแบบ response
window.apiCall = async function apiCall(action, payload) {
  const cfg = window.APP_CONFIG;
  if (!cfg.API_SECRET || cfg.API_SECRET === 'REPLACE_WITH_API_SECRET') {
    throw new ApiError('CONFIG', 'ยังไม่ได้ตั้งค่า API_SECRET ใน config.js');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.REQUEST_TIMEOUT);

  try {
    let res;
    try {
      res = await fetch(cfg.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({}, payload, { action: action, secret: cfg.API_SECRET })),
        cache: 'no-store',
        signal: controller.signal
      });
    } catch (err) {
      if (err && err.name === 'AbortError') {
        throw new ApiError('TIMEOUT', 'เซิร์ฟเวอร์ตอบช้าเกินไป กรุณาลองใหม่');
      }
      throw new ApiError('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต');
    }

    const text = await res.text();

    // ได้ HTML กลับมา (เช่นหน้า Google Drive "Page Not Found") = deployment URL ผิด/ถูกปิด
    if (/^\s*</.test(text)) {
      throw new ApiError('DEPLOYMENT_URL',
        'เซิร์ฟเวอร์ตอบกลับเป็น HTML — deployment URL ใน config.js อาจไม่ถูกต้องหรือถูกปิดใช้งาน');
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new ApiError('BAD_RESPONSE', 'เซิร์ฟเวอร์ตอบกลับในรูปแบบที่ไม่ถูกต้อง');
    }
    if (!res.ok && !(data && data.message)) {
      throw new ApiError('HTTP', 'HTTP ' + res.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
};

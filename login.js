// login.js — ต้องโหลด config.js ก่อน

document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorEl = document.getElementById('error');

  let redirecting = false;

  const reason = new URLSearchParams(window.location.search).get('reason');
  if (reason) {
    errorEl.textContent = `เข้าสู่ระบบไม่สำเร็จ: ${reason}`;
  }

  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (redirecting) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    errorEl.style.color = ''; // กลับไปใช้สี error จาก CSS

    if (!username || !password) {
      errorEl.textContent = 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน';
      return;
    }

    errorEl.textContent = 'กำลังตรวจสอบ...';
    loginBtn.disabled = true;

    try {
      const data = await apiCall('login', { username, password });

      if (data.success && data.token) {
        try {
          localStorage.setItem('token', data.token);
        } catch (storageErr) {
          errorEl.textContent = 'เบราว์เซอร์ไม่อนุญาตให้บันทึกการเข้าสู่ระบบ (ปิดโหมดส่วนตัวหรือเปิดสิทธิ์ storage)';
          return;
        }

        redirecting = true; // ค้างปุ่มไว้จนกว่าจะเปลี่ยนหน้า
        errorEl.style.color = '#10b981';
        errorEl.textContent = 'เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนหน้า...';
        // localStorage.setItem เป็น synchronous จึงไม่ต้องหน่วงเวลาก่อน redirect
        window.location.replace('index.html');
        return;
      }

      errorEl.textContent = data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
    } catch (err) {
      console.error('Login error:', err && err.code, err && err.message);
      errorEl.textContent = err.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่';
    } finally {
      if (!redirecting) loginBtn.disabled = false;
    }
  });
});

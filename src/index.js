// ورکر کلادفلر برای ایجاد کانفیگ‌های پروکسی - نسخه فارسی سازی شده
// اصلاح شده برای پشتیبانی از مدیریت چندین کاربر و تاریخ انقضا

// تنظیمات اصلی
const config = {
  // UUID پیش‌فرض - باید تغییر داده شود
  userID: '71dfe287-564f-4cbc-9ca0-99c7417341d2',
  
  // تنظیمات پروکسی
  proxyIP: '', // IP پروکسی اختیاری
  port: 443,
  
  // تنظیمات DNS
  addressesAPI: 'https://www.cloudflare.com/ips-v4/',
  addressesIPv6API: 'https://www.cloudflare.com/ips-v6/',
  
  // تنظیمات پیش‌فرض
  defaultPath: '/?ed=2560',
  defaultHost: 'www.visa.com.sg',
  
  // اطلاعات برنامه
  appName: 'CaspianProxy',
  appVersion: '1.2.0',
  
  // پیام‌های فارسی
  messages: {
    welcome: 'به سیستم مدیریت پروکسی خوش آمدید',
    configGenerated: 'کانفیگ با موفقیت ایجاد شد',
    invalidUUID: 'UUID نامعتبر است',
    userNotFound: 'کاربر یافت نشد',
    expired: 'کانفیگ منقضی شده است',
    statsTitle: 'آمار استفاده',
    usersTitle: 'مدیریت کاربران',
    addUser: 'افزودن کاربر جدید',
    deleteUser: 'حذف کاربر',
    editUser: 'ویرایش کاربر',
    resetStats: 'بازنشانی آمار',
    days: 'روز',
    hours: 'ساعت',
    minutes: 'دقیقه',
    seconds: 'ثانیه',
    remaining: 'باقیمانده',
    expired_status: 'منقضی شده',
    active_status: 'فعال',
    connections: 'اتصالات',
    usage: 'مصرف',
    lastUsed: 'آخرین استفاده'
  }
};

// کلاس مدیریت کاربران
class UserManager {
  constructor(env) {
    this.kv = env.KV_STORE;
  }
  
  // ایجاد کاربر جدید
  async createUser(userID, config = {}) {
    const defaultConfig = {
      id: userID,
      createdAt: Date.now(),
      expiresAt: Date.now() + (config.days || 30) * 24 * 60 * 60 * 1000,
      maxConnections: config.maxConnections || 5,
      currentConnections: 0,
      totalUsage: 0,
      lastUsedAt: null,
      isActive: true,
      name: config.name || `User_${userID.substring(0, 8)}`,
      ...config
    };
    
    await this.kv.put(`user:${userID}`, JSON.stringify(defaultConfig));
    await this.updateStats('totalUsers', 1);
    return defaultConfig;
  }
  
  // دریافت اطلاعات کاربر
  async getUser(userID) {
    const userData = await this.kv.get(`user:${userID}`);
    return userData ? JSON.parse(userData) : null;
  }
  
  // به‌روزرسانی کاربر
  async updateUser(userID, updates) {
    const user = await this.getUser(userID);
    if (!user) return null;
    
    const updatedUser = { ...user, ...updates, updatedAt: Date.now() };
    await this.kv.put(`user:${userID}`, JSON.stringify(updatedUser));
    return updatedUser;
  }
  
  // حذف کاربر
  async deleteUser(userID) {
    const user = await this.getUser(userID);
    if (!user) return false;
    
    await this.kv.delete(`user:${userID}`);
    await this.updateStats('totalUsers', -1);
    return true;
  }
  
  // لیست کاربران
  async listUsers() {
    const list = await this.kv.list({ prefix: 'user:' });
    const users = [];
    
    for (const key of list.keys) {
      const userData = await this.kv.get(key.name);
      if (userData) {
        users.push(JSON.parse(userData));
      }
    }
    
    return users.sort((a, b) => b.createdAt - a.createdAt);
  }
  
  // به‌روزرسانی آمار
  async updateStats(key, increment = 1) {
    const currentValue = await this.kv.get(`stats:${key}`) || '0';
    const newValue = parseInt(currentValue) + increment;
    await this.kv.put(`stats:${key}`, newValue.toString());
  }
  
  // دریافت آمار
  async getStats() {
    const keys = ['totalUsers', 'totalConnections', 'totalUsage'];
    const stats = {};
    
    for (const key of keys) {
      const value = await this.kv.get(`stats:${key}`) || '0';
      stats[key] = parseInt(value);
    }
    
    return stats;
  }
  
  // تولید UUID خودکار
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

// کلاس تولید کانفیگ
class ConfigGenerator {
  constructor(userConfig, hostname, userAgent) {
    this.userConfig = userConfig;
    this.hostname = hostname;
    this.userAgent = userAgent;
  }
  
  // تولید کانفیگ VLESS
  generateVLESSConfig() {
    const vlessLink = `vless://${this.userConfig.id}@${this.hostname}:443?encryption=none&security=tls&sni=${this.hostname}&fp=randomized&type=ws&host=${this.hostname}&path=%2F%3Fed%3D2560#${encodeURIComponent(config.appName)}`;
    
    return {
      protocol: 'vless',
      link: vlessLink,
      qr: this.generateQRCode(vlessLink),
      config: {
        outbounds: [{
          tag: config.appName,
          protocol: 'vless',
          settings: {
            vnext: [{
              address: this.hostname,
              port: 443,
              users: [{
                id: this.userConfig.id,
                encryption: 'none'
              }]
            }]
          },
          streamSettings: {
            network: 'ws',
            security: 'tls',
            wsSettings: {
              path: '/?ed=2560',
              headers: {
                Host: this.hostname
              }
            },
            tlsSettings: {
              serverName: this.hostname,
              fingerprint: 'randomized'
            }
          }
        }]
      }
    };
  }
  
  // تولید کانفیگ VMess
  generateVMessConfig() {
    const vmessConfig = {
      v: '2',
      ps: config.appName,
      add: this.hostname,
      port: '443',
      id: this.userConfig.id,
      aid: '0',
      scy: 'auto',
      net: 'ws',
      type: 'none',
      host: this.hostname,
      path: '/?ed=2560',
      tls: 'tls',
      sni: this.hostname,
      alpn: '',
      fp: 'randomized'
    };
    
    const vmessLink = 'vmess://' + btoa(JSON.stringify(vmessConfig));
    
    return {
      protocol: 'vmess',
      link: vmessLink,
      qr: this.generateQRCode(vmessLink),
      config: vmessConfig
    };
  }
  
  // تولید QR Code (شبیه‌سازی)
  generateQRCode(text) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(text)}`;
  }
  
  // تولید کانفیگ Clash
  generateClashConfig() {
    return {
      'mixed-port': 7890,
      'allow-lan': true,
      'bind-address': '*',
      mode: 'rule',
      'log-level': 'info',
      'external-controller': '127.0.0.1:9090',
      proxies: [{
        name: config.appName,
        type: 'vless',
        server: this.hostname,
        port: 443,
        uuid: this.userConfig.id,
        network: 'ws',
        tls: true,
        'udp': true,
        'ws-opts': {
          path: '/?ed=2560',
          headers: {
            Host: this.hostname
          }
        }
      }],
      'proxy-groups': [{
        name: 'PROXY',
        type: 'select',
        proxies: [config.appName, 'DIRECT']
      }],
      rules: [
        'DOMAIN-SUFFIX,local,DIRECT',
        'IP-CIDR,127.0.0.0/8,DIRECT',
        'IP-CIDR,172.16.0.0/12,DIRECT',
        'IP-CIDR,192.168.0.0/16,DIRECT',
        'IP-CIDR,10.0.0.0/8,DIRECT',
        'GEOIP,IR,DIRECT',
        'MATCH,PROXY'
      ]
    };
  }
}

// تابع اصلی مدیریت درخواست‌ها
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const userManager = new UserManager(env);
  const path = url.pathname;
  const method = request.method;
  
  // مسیرهای مختلف
  if (path === '/' || path === '') {
    return handleHomePage(request, env);
  }
  
  if (path.startsWith('/api/')) {
    return handleAPI(request, env, userManager);
  }
  
  if (path.match(/^\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
    const userID = path.substring(1);
    return handleUserConfig(userID, request, env, userManager);
  }
  
  return new Response('صفحه یافت نشد', { status: 404 });
}

// مدیریت صفحه اصلی
async function handleHomePage(request, env) {
  const userManager = new UserManager(env);
  const stats = await userManager.getStats();
  const users = await userManager.listUsers();
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${config.appName} - مدیریت پروکسی</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
        }
        .header {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .header h1 {
            color: #667eea;
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        .header p {
            color: #666;
            font-size: 1.1em;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            transition: transform 0.3s ease;
        }
        .stat-card:hover {
            transform: translateY(-5px);
        }
        .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 10px;
        }
        .stat-label {
            color: #666;
            font-size: 1.1em;
        }
        .users-section {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .section-title {
            font-size: 1.8em;
            color: #667eea;
            margin-bottom: 20px;
            text-align: center;
        }
        .add-user-form {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
        }
        .form-row {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-bottom: 15px;
        }
        .form-group {
            display: flex;
            flex-direction: column;
        }
        .form-group label {
            margin-bottom: 5px;
            font-weight: bold;
            color: #555;
        }
        .form-group input, .form-group select {
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.3s ease;
        }
        .form-group input:focus, .form-group select:focus {
            outline: none;
            border-color: #667eea;
        }
        .btn {
            padding: 12px 25px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            text-align: center;
        }
        .btn-primary {
            background: #667eea;
            color: white;
        }
        .btn-primary:hover {
            background: #5a67d8;
            transform: translateY(-2px);
        }
        .btn-danger {
            background: #e53e3e;
            color: white;
        }
        .btn-danger:hover {
            background: #c53030;
        }
        .btn-success {
            background: #38a169;
            color: white;
        }
        .btn-success:hover {
            background: #2f855a;
        }
        .users-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }
        .users-table th,
        .users-table td {
            padding: 15px;
            text-align: right;
            border-bottom: 1px solid #e0e0e0;
        }
        .users-table th {
            background: #f8f9fa;
            font-weight: bold;
            color: #555;
        }
        .users-table tr:hover {
            background: #f8f9fa;
        }
        .status-active {
            color: #38a169;
            font-weight: bold;
        }
        .status-expired {
            color: #e53e3e;
            font-weight: bold;
        }
        .actions {
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        .uuid-display {
            font-family: monospace;
            background: #f1f1f1;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
        }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .header h1 { font-size: 2em; }
            .form-row { grid-template-columns: 1fr; }
            .actions { flex-direction: column; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${config.appName}</h1>
            <p>سیستم مدیریت پروکسی پیشرفته - نسخه ${config.appVersion}</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${stats.totalUsers || 0}</div>
                <div class="stat-label">کل کاربران</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${stats.totalConnections || 0}</div>
                <div class="stat-label">کل اتصالات</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${formatBytes(stats.totalUsage || 0)}</div>
                <div class="stat-label">کل مصرف</div>
            </div>
        </div>
        
        <div class="users-section">
            <h2 class="section-title">مدیریت کاربران</h2>
            
            <div class="add-user-form">
                <h3 style="margin-bottom: 15px; color: #555;">افزودن کاربر جدید</h3>
                <form id="addUserForm">
                    <div class="form-row">
                        <div class="form-group">
                            <label>نام کاربر</label>
                            <input type="text" name="name" placeholder="نام کاربر" required>
                        </div>
                        <div class="form-group">
                            <label>تعداد روز اعتبار</label>
                            <input type="number" name="days" value="30" min="1" max="365" required>
                        </div>
                        <div class="form-group">
                            <label>حداکثر اتصالات همزمان</label>
                            <input type="number" name="maxConnections" value="5" min="1" max="10" required>
                        </div>
                        <div class="form-group">
                            <label>UUID (اختیاری)</label>
                            <input type="text" name="uuid" placeholder="UUID تولید خودکار می‌شود">
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary">افزودن کاربر</button>
                    <button type="button" class="btn btn-success" onclick="generateUUID()">تولید UUID جدید</button>
                </form>
            </div>
            
            ${users.length > 0 ? `
            <table class="users-table">
                <thead>
                    <tr>
                        <th>نام</th>
                        <th>UUID</th>
                        <th>وضعیت</th>
                        <th>باقیمانده</th>
                        <th>اتصالات</th>
                        <th>عملیات</th>
                    </tr>
                </thead>
                <tbody>
                    ${users.map(user => {
                        const timeLeft = getTimeLeft(user.expiresAt);
                        const isExpired = user.expiresAt < Date.now();
                        return `
                        <tr>
                            <td>${user.name}</td>
                            <td><span class="uuid-display">${user.id.substring(0, 8)}...</span></td>
                            <td class="${isExpired ? 'status-expired' : 'status-active'}">
                                ${isExpired ? 'منقضی شده' : 'فعال'}
                            </td>
                            <td>${timeLeft}</td>
                            <td>${user.currentConnections}/${user.maxConnections}</td>
                            <td class="actions">
                                <a href="/${user.id}" class="btn btn-primary" target="_blank">کانفیگ</a>
                                <button class="btn btn-danger" onclick="deleteUser('${user.id}')">حذف</button>
                            </td>
                        </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
            ` : '<p style="text-align: center; color: #666; margin-top: 20px;">هیچ کاربری یافت نشد</p>'}
        </div>
    </div>
    
    <script>
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function getTimeLeft(expiresAt) {
            const now = Date.now();
            const diff = expiresAt - now;
            
            if (diff <= 0) return 'منقضی شده';
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            
            if (days > 0) return days + ' روز';
            return hours + ' ساعت';
        }
        
        function generateUUID() {
            const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            document.querySelector('input[name="uuid"]').value = uuid;
        }
        
        document.getElementById('addUserForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData);
            
            if (!data.uuid) {
                data.uuid = generateUUID();
            }
            
            try {
                const response = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                if (response.ok) {
                    location.reload();
                } else {
                    alert('خطا در ایجاد کاربر');
                }
            } catch (error) {
                alert('خطا در ارتباط با سرور');
            }
        });
        
        async function deleteUser(userId) {
            if (confirm('آیا از حذف این کاربر مطمئن هستید؟')) {
                try {
                    const response = await fetch('/api/users/' + userId, { method: 'DELETE' });
                    if (response.ok) {
                        location.reload();
                    } else {
                        alert('خطا در حذف کاربر');
                    }
                } catch (error) {
                    alert('خطا در ارتباط با سرور');
                }
            }
        }
    </script>
</body>
</html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// مدیریت درخواست‌های API
async function handleAPI(request, env, userManager) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  if (path === '/api/users' && method === 'POST') {
    try {
      const data = await request.json();
      const uuid = data.uuid || userManager.generateUUID();
      
      const user = await userManager.createUser(uuid, {
        name: data.name,
        days: parseInt(data.days) || 30,
        maxConnections: parseInt(data.maxConnections) || 5
      });
      
      return new Response(JSON.stringify({ success: true, user }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (path.startsWith('/api/users/') && method === 'DELETE') {
    const userId = path.split('/')[3];
    const deleted = await userManager.deleteUser(userId);
    
    return new Response(JSON.stringify({ success: deleted }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  return new Response('API endpoint not found', { status: 404 });
}

// مدیریت کانفیگ کاربر
async function handleUserConfig(userID, request, env, userManager) {
  const user = await userManager.getUser(userID);
  const url = new URL(request.url);
  const userAgent = request.headers.get('User-Agent') || 'Unknown';
  const hostname = url.hostname;
  
  if (!user) {
    return new Response('کاربر یافت نشد', { status: 404 });
  }
  
  // بررسی انقضا
  if (user.expiresAt < Date.now()) {
    return new Response('کانفیگ منقضی شده است', { status: 403 });
  }
  
  // به‌روزرسانی آخرین استفاده
  await userManager.updateUser(userID, { lastUsedAt: Date.now() });
  
  const configGen = new ConfigGenerator(user, hostname, userAgent);
  const format = url.searchParams.get('format') || 'web';
  
  if (format === 'json') {
    const configs = {
      vless: configGen.generateVLESSConfig(),
      vmess: configGen.generateVMessConfig(),
      clash: configGen.generateClashConfig()
    };
    
    return new Response(JSON.stringify(configs, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (format === 'clash') {
    const clashConfig = configGen.generateClashConfig();
    return new Response(JSON.stringify(clashConfig, null, 2), {
      headers: {
        'Content-Type': 'application/yaml',
        'Content-Disposition': 'attachment; filename="clash-config.yaml"'
      }
    });
  }
  
  // صفحه وب کانفیگ
  const vlessConfig = configGen.generateVLESSConfig();
  const vmessConfig = configGen.generateVMessConfig();
  const clashConfig = configGen.generateClashConfig();
  
  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>کانفیگ ${user.name} - ${config.appName}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: 'Segoe UI', Tahoma, Arial, sans-serif; 
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
            color: #333;
        }
        .container { 
            max-width: 800px; 
            margin: 0 auto; 
        }
        .header {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 30px;
            margin-bottom: 30px;
            text-align: center;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .user-info {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
        }
        .info-item {
            text-align: center;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
        }
        .info-label {
            color: #666;
            font-size: 0.9em;
            margin-bottom: 5px;
        }
        .info-value {
            color: #333;
            font-weight: bold;
            font-size: 1.1em;
        }
        .config-section {
            background: rgba(255,255,255,0.95);
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 20px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .config-title {
            font-size: 1.5em;
            color: #667eea;
            margin-bottom: 20px;
            text-align: center;
        }
        .config-item {
            margin-bottom: 20px;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 10px;
        }
        .config-label {
            font-weight: bold;
            color: #555;
            margin-bottom: 10px;
        }
        .config-text {
            font-family: monospace;
            background: #fff;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            padding: 15px;
            word-break: break-all;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin-left: 10px;
            transition: all 0.3s ease;
        }
        .btn:hover {
            background: #5a67d8;
            transform: translateY(-2px);
        }
        .qr-code {
            text-align: center;
            margin: 20px 0;
        }
        .qr-code img {
            max-width: 200px;
            border-radius: 10px;
        }
        .status-active { color: #38a169; font-weight: bold; }
        .status-expired { color: #e53e3e; font-weight: bold; }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            .info-grid { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>کانفیگ ${user.name}</h1>
            <p>${config.appName} - نسخه ${config.appVersion}</p>
        </div>
        
        <div class="user-info">
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">وضعیت</div>
                    <div class="info-value ${user.expiresAt > Date.now() ? 'status-active' : 'status-expired'}">
                        ${user.expiresAt > Date.now() ? 'فعال' : 'منقضی شده'}
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-label">زمان باقیمانده</div>
                    <div class="info-value">${getTimeLeft(user.expiresAt)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">اتصالات</div>
                    <div class="info-value">${user.currentConnections}/${user.maxConnections}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">مصرف</div>
                    <div class="info-value">${formatBytes(user.totalUsage || 0)}</div>
                </div>
            </div>
        </div>
        
        <div class="config-section">
            <h2 class="config-title">کانفیگ VLESS</h2>
            <div class="config-item">
                <div class="config-label">لینک VLESS:</div>
                <textarea class="config-text" readonly>${vlessConfig.link}</textarea>
                <button class="btn" onclick="copyToClipboard('${vlessConfig.link}')">کپی</button>
                <button class="btn" onclick="showQR('${vlessConfig.qr}')">QR Code</button>
            </div>
        </div>
        
        <div class="config-section">
            <h2 class="config-title">کانفیگ VMess</h2>
            <div class="config-item">
                <div class="config-label">لینک VMess:</div>
                <textarea class="config-text" readonly>${vmessConfig.link}</textarea>
                <button class="btn" onclick="copyToClipboard('${vmessConfig.link}')">کپی</button>
                <button class="btn" onclick="showQR('${vmessConfig.qr}')">QR Code</button>
            </div>
        </div>
        
        <div class="config-section">
            <h2 class="config-title">کانفیگ Clash</h2>
            <div class="config-item">
                <div class="config-label">فایل Clash YAML:</div>
                <textarea class="config-text" readonly style="height: 200px;">${JSON.stringify(clashConfig, null, 2)}</textarea>
                <button class="btn" onclick="downloadClash()">دانلود YAML</button>
                <button class="btn" onclick="copyToClipboard('${JSON.stringify(clashConfig, null, 2)}')">کپی</button>
            </div>
        </div>
        
        <div id="qrModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center;">
            <div style="background: white; padding: 30px; border-radius: 15px; text-align: center;">
                <img id="qrImage" src="" alt="QR Code" style="max-width: 300px;">
                <br><br>
                <button class="btn" onclick="closeQR()">بستن</button>
            </div>
        </div>
    </div>
    
    <script>
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }
        
        function getTimeLeft(expiresAt) {
            const now = Date.now();
            const diff = expiresAt - now;
            
            if (diff <= 0) return 'منقضی شده';
            
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            
            if (days > 0) return days + ' روز و ' + hours + ' ساعت';
            if (hours > 0) return hours + ' ساعت و ' + minutes + ' دقیقه';
            return minutes + ' دقیقه';
        }
        
        function copyToClipboard(text) {
            navigator.clipboard.writeText(text).then(function() {
                alert('کپی شد!');
            });
        }
        
        function showQR(qrUrl) {
            document.getElementById('qrImage').src = qrUrl;
            document.getElementById('qrModal').style.display = 'flex';
        }
        
        function closeQR() {
            document.getElementById('qrModal').style.display = 'none';
        }
        
        function downloadClash() {
            const clashConfig = ${JSON.stringify(clashConfig)};
            const yamlContent = JSON.stringify(clashConfig, null, 2);
            const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'clash-config.yaml';
            a.click();
            URL.revokeObjectURL(url);
        }
    </script>
</body>
</html>
  `;
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

// تابع کمکی فرمت کردن بایت
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// تابع کمکی محاسبه زمان باقیمانده
function getTimeLeft(expiresAt) {
  const now = Date.now();
  const diff = expiresAt - now;
  
  if (diff <= 0) return 'منقضی شده';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  
  if (days > 0) return `${days} روز`;
  return `${hours} ساعت`;
}

// Event Listener اصلی
export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      console.error('Error:', error);
      return new Response('خطای داخلی سرور', { status: 500 });
    }
  }
};
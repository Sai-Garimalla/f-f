// Shared API utility & auth helpers for all pages
const API = '/api';

function getToken() { return localStorage.getItem('ff_token'); }
function getUser() { try { return JSON.parse(localStorage.getItem('ff_user')); } catch { return null; } }

function logout() {
  localStorage.removeItem('ff_token');
  localStorage.removeItem('ff_user');
  window.location.href = '/index.html';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) };
  const res = await fetch(API + path, { ...options, headers });
  if (res.status === 401 || res.status === 403) { logout(); return; }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function authGuard(allowedRoles) {
  const token = getToken();
  if (!token) { window.location.href = '/index.html'; return false; }
  const user = getUser();
  const currentPage = window.location.pathname;
  if (allowedRoles) {
    if (!user || !allowedRoles.includes(user.role)) {
      if (user && user.role === 'delivery_boy') window.location.href = '/delivery.html';
      else if (user && user.role === 'kitchen') window.location.href = '/kitchen.html';
      else window.location.href = '/index.html';
      return false;
    }
  } else {
    // Default guard: redirect restricted roles to their portal
    if (user && user.role === 'delivery_boy' && currentPage !== '/delivery.html') {
      window.location.href = '/delivery.html'; return false;
    }
    if (user && user.role === 'kitchen' && currentPage !== '/kitchen.html') {
      window.location.href = '/kitchen.html'; return false;
    }
  }
  return true;
}

// Toast notifications
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️' };
  toast.innerHTML = `<span>${icons[type] || '💬'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = '.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

// Sidebar setup
function initSidebar(activePage) {
  const user = getUser();
  const isAdmin = user && user.role === 'admin';
  const isDeliveryBoy = user && user.role === 'delivery_boy';
  const isKitchen = user && user.role === 'kitchen';

  let sidebarHTML;

  if (isDeliveryBoy) {
    sidebarHTML = `
  <div class="sidebar-logo" style="text-align:center">
    <img src="/assets/logo.png" alt="F&F" style="width:80px;height:80px;object-fit:contain;border-radius:8px;margin-bottom:8px">
    <h1>Fire & Flavour</h1><p>Delivery Portal</p>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-label">Delivery</div>
    <a href="/delivery.html" class="nav-link ${activePage==='delivery'?'active':''}"><span class="nav-icon">🛵</span> My Deliveries</a>
  </nav>
  <div class="sidebar-footer">
    <div class="user-info"><div class="user-avatar">${user.full_name[0].toUpperCase()}</div><div><div class="user-name">${user.full_name}</div><div class="user-role">🛵 Delivery Boy</div></div></div>
    <button class="btn-logout" onclick="logout()">🚪 Logout</button>
  </div>`;
  } else if (isKitchen) {
    sidebarHTML = `
  <div class="sidebar-logo" style="text-align:center">
    <img src="/assets/logo.png" alt="F&F" style="width:80px;height:80px;object-fit:contain;border-radius:8px;margin-bottom:8px">
    <h1>Fire & Flavour</h1><p>Kitchen Station</p>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-label">Kitchen</div>
    <a href="/kitchen.html" class="nav-link ${activePage==='kitchen'?'active':''}"><span class="nav-icon">🍳</span> KOT / Packing</a>
  </nav>
  <div class="sidebar-footer">
    <div class="user-info"><div class="user-avatar">${user.full_name[0].toUpperCase()}</div><div><div class="user-name">${user.full_name}</div><div class="user-role">🍳 Kitchen</div></div></div>
    <button class="btn-logout" onclick="logout()">🚪 Logout</button>
  </div>`;
  } else {
    sidebarHTML = `
  <div class="sidebar-logo" style="text-align:center">
    <img src="/assets/logo.png" alt="F&F" style="width:80px;height:80px;object-fit:contain;border-radius:8px;margin-bottom:8px">
    <h1>Fire & Flavour</h1><p>POS & Billing System</p>
  </div>
  <nav class="sidebar-nav">
    <div class="nav-label">Main</div>
    ${isAdmin ? `<a href="/dashboard.html" class="nav-link ${activePage==='dashboard'?'active':''}"><span class="nav-icon">📊</span> Dashboard</a>` : ''}
    <a href="/billing.html" class="nav-link ${activePage==='billing'?'active':''}"><span class="nav-icon">🧾</span> New Bill</a>
    <a href="/recent-bills.html" class="nav-link ${activePage==='bills'?'active':''}"><span class="nav-icon">📋</span> Recent Bills</a>
    <a href="/customer-search.html" class="nav-link ${activePage==='customer-search'?'active':''}"><span class="nav-icon">🔍</span> Customer Search</a>
    <div class="nav-label">Management</div>
    <a href="/menu.html" class="nav-link ${activePage==='menu'?'active':''}"><span class="nav-icon">🍽️</span> Menu</a>
    ${isAdmin ? `<a href="/users.html" class="nav-link ${activePage==='users'?'active':''}"><span class="nav-icon">👥</span> Staff Users</a>` : ''}
    ${isAdmin ? `<a href="/settings.html" class="nav-link ${activePage==='settings'?'active':''}"><span class="nav-icon">⚙️</span> Settings</a>` : ''}
  </nav>
  <div class="sidebar-footer">
    <div class="user-info"><div class="user-avatar">${user ? user.full_name[0].toUpperCase() : 'A'}</div><div><div class="user-name">${user ? user.full_name : 'Admin'}</div><div class="user-role">${user ? (user.role==='admin'?'🔑 Admin':'👨‍🍳 Staff') : ''}</div></div></div>
    <button class="btn-logout" onclick="logout()">🚪 Logout</button>
  </div>`;
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.innerHTML = sidebarHTML;

  // ── Mobile: inject header, overlay, bottom-nav ──
  if (!document.getElementById('mobile-header')) {
    const mh = document.createElement('div');
    mh.id = 'mobile-header';
    mh.className = 'mobile-header';
    mh.innerHTML = `
      <button class="hamburger" id="hamburger-btn" aria-label="Menu">☰</button>
      <div class="m-logo">🔥 <span>Fire &amp; Flavour</span></div>
      <div style="width:34px"></div>`;
    document.body.prepend(mh);
  }
  if (!document.getElementById('sidebar-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'sidebar-overlay';
    ov.className = 'sidebar-overlay';
    document.body.appendChild(ov);
  }
  if (!document.getElementById('bottom-nav')) {
    const bn = document.createElement('div');
    bn.id = 'bottom-nav'; bn.className = 'bottom-nav';
    if (isDeliveryBoy) {
      bn.innerHTML = `<nav><a href="/delivery.html" class="bn-item ${activePage==='delivery'?'active':''}"><span class="bn-icon">🛵</span>Deliveries</a></nav>`;
    } else if (isKitchen) {
      bn.innerHTML = `<nav><a href="/kitchen.html" class="bn-item ${activePage==='kitchen'?'active':''}"><span class="bn-icon">🍳</span>KOT</a></nav>`;
    } else {
      bn.innerHTML = `<nav>
        ${isAdmin ? `<a href="/dashboard.html" class="bn-item ${activePage==='dashboard'?'active':''}"><span class="bn-icon">📊</span>Dash</a>` : ''}
        <a href="/billing.html"   class="bn-item ${activePage==='billing'?'active':''}"><span class="bn-icon">🧾</span>Bill</a>
        <a href="/recent-bills.html" class="bn-item ${activePage==='bills'?'active':''}"><span class="bn-icon">📋</span>Bills</a>
        <a href="/customer-search.html" class="bn-item ${activePage==='customer-search'?'active':''}"><span class="bn-icon">🔍</span>Search</a>
        <a href="/menu.html"      class="bn-item ${activePage==='menu'?'active':''}"><span class="bn-icon">🍽️</span>Menu</a>
      </nav>`;
    }
    document.body.appendChild(bn);
  }

  // Hamburger open/close
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
  }
  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }
  document.getElementById('hamburger-btn').addEventListener('click', openSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
  // Close on nav link tap (mobile)
  document.querySelectorAll('#sidebar .nav-link').forEach(l => l.addEventListener('click', closeSidebar));
}

function formatCurrency(val) {
  return '₹' + parseFloat(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

function formatDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(str) {
  if (!str) return '—';
  const d = new Date(str);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

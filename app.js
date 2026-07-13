/* 
Buku KAS RT dan RMD
Frontend statis untuk GitHub Pages.
Ganti API_URL dengan URL Web App dari Google Apps Script.
Created By ANDANG CHRISNANDI
Updated Date 2026-07-08
*/

const API_URL = "https://script.google.com/macros/s/AKfycbxAngJqqSRn4IPQaMNF8IHCxYKfMDxzyI0w7CIUN8UU6X3ATT7xx3_pu45kxOSP3Adc/exec";
const SESSION_KEY = "kas_rt_session_v2";

// Permission default untuk pengunjung tanpa login (warga): hanya boleh melihat laporan.
const GUEST_PERMISSIONS = { view: true, input: false, deleteTransaction: false, manageUsers: false };

const State = {
  session: JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"),
  settings: {},
  categories: { MASUK: [], KELUAR: [] },
  dashboard: null,
  kasReport: null,
  rmdReport: null,
  users: [],
  activePage: "kasPage"
};

document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  initDefaults();
  showApp();
  loadInitialData();
});

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    doLogin();
  });

  document.getElementById("btnOpenLogin").addEventListener("click", function () {
    openLoginModal();
  });
  document.getElementById("btnCloseLogin").addEventListener("click", closeLoginModal);
  document.getElementById("loginModal").addEventListener("click", function (event) {
    if (event.target.id === "loginModal") {
      closeLoginModal();
    }
  });
  document.querySelectorAll("[data-open-login]").forEach(function (button) {
    button.addEventListener("click", function () {
      openLoginModal();
    });
  });

  document.querySelectorAll("[data-page]").forEach(function (button) {
    button.addEventListener("click", function () {
      goPage(button.dataset.page);
    });
  });

  document.getElementById("btnLogout").addEventListener("click", doLogout);

  document.getElementById("kasForm").addEventListener("submit", function (event) {
    event.preventDefault();
    saveKasTransaction();
  });
  document.getElementById("kasJenis").addEventListener("change", renderKasCategoryOptions);
  document.getElementById("btnLoadKasReport").addEventListener("click", loadKasReport);
  document.getElementById("btnExportKasExcel").addEventListener("click", function () {
    exportReportExcel("KAS");
  });
  document.getElementById("btnExportKasPdf").addEventListener("click", function () {
    exportReportPdf("KAS");
  });

  document.getElementById("rmdForm").addEventListener("submit", function (event) {
    event.preventDefault();
    saveRmdTransaction();
  });
  document.getElementById("btnLoadRmdReport").addEventListener("click", loadRmdReport);
  document.getElementById("btnExportRmdExcel").addEventListener("click", function () {
    exportReportExcel("RMD");
  });
  document.getElementById("btnExportRmdPdf").addEventListener("click", function () {
    exportReportPdf("RMD");
  });

  document.getElementById("userForm").addEventListener("submit", function (event) {
    event.preventDefault();
    saveUser();
  });
  document.getElementById("btnResetUser").addEventListener("click", resetUserForm);
  document.getElementById("btnLoadUsers").addEventListener("click", loadUsers);

  ["kasForm", "rmdForm"].forEach(function (id) {
    document.getElementById(id).addEventListener("reset", function () {
      setTimeout(function () {
        initDefaults();
        fillPetugas();
        renderKasCategoryOptions();
      }, 0);
    });
  });
}

function initDefaults() {
  const today = currentDateKey();
  const month = currentMonthKey();

  setValue("kasTanggal", today);
  setValue("rmdTanggal", today);
  setValue("kasReportStartMonth", month);
  setValue("kasReportEndMonth", month);
  setValue("rmdReportStartMonth", month);
  setValue("rmdReportEndMonth", month);
}

function api(body) {
  return new Promise(function (resolve, reject) {
    if (!API_URL || API_URL.indexOf("PASTE_URL") >= 0) {
      reject(new Error("API_URL belum diisi di app.js"));
      return;
    }

    const callbackName = "kasrt_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const url = API_URL + "?data=" + encodeURIComponent(JSON.stringify(body)) + "&callback=" + callbackName;
    const script = document.createElement("script");
    const timer = setTimeout(function () {
      cleanup();
      reject(new Error("timeout"));
    }, 45000);

    function cleanup() {
      clearTimeout(timer);
      delete window[callbackName];
      const el = document.getElementById("jsonp-" + callbackName);
      if (el) {
        el.remove();
      }
    }

    window[callbackName] = function (response) {
      cleanup();
      if (response && response.status === "error" && response.code === "SESSION_EXPIRED") {
        handleAuthFailure_(response.message || "Sesi berakhir. Silakan login ulang.", true);
        return;
      }
      if (response && response.status === "error" && response.code === "AUTH_REQUIRED") {
        handleAuthFailure_(response.message || "Silakan login untuk melanjutkan.", false);
        return;
      }
      resolve(response);
    };

    script.id = "jsonp-" + callbackName;
    script.src = url;
    script.onerror = function () {
      cleanup();
      reject(new Error("network"));
    };

    document.body.appendChild(script);
  });
}

// Guard supaya kegagalan auth beruntun (mis. jaringan tidak stabil) tidak membuka
// modal login berkali-kali atau memicu pemanggilan ulang bertumpuk.
let authFailureHandling = false;

function handleAuthFailure_(message, wasLoggedIn) {
  if (authFailureHandling) {
    return;
  }
  authFailureHandling = true;

  showToast(message, "error");

  if (wasLoggedIn) {
    clearSession();
    showApp();
    // Aman dipanggil ulang: getInitialData adalah action publik, jadi ini akan
    // sukses sebagai warga tanpa memicu SESSION_EXPIRED lagi.
    loadInitialData().finally(function () {
      authFailureHandling = false;
    });
  } else {
    authFailureHandling = false;
  }

  openLoginModal();
}

async function doLogin() {
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  const btn = document.getElementById("btnLogin");

  if (!username || !password) {
    showLoginError("Username dan password wajib diisi.");
    return;
  }

  setButtonLoading(btn, true, "Memverifikasi...");

  try {
    const res = await api({ action: "login", username: username, password: password });
    if (!res || res.status !== "ok") {
      showLoginError(res && res.message ? res.message : "Login gagal.");
      return;
    }

    State.session = {
      token: res.token,
      user: res.user,
      permissions: res.permissions
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(State.session));
    document.getElementById("loginForm").reset();
    document.getElementById("loginError").style.display = "none";
    closeLoginModal();
    showToast("Berhasil login sebagai " + (res.user ? res.user.nama : username) + ".", "success");
    showApp();
    // reset laporan yang sudah dimuat sebagai guest supaya ikut refresh dengan hak akses petugas
    State.kasReport = null;
    State.rmdReport = null;
    await loadInitialData();
    if (State.activePage === "kasPage") {
      await loadKasReport();
    }
    if (State.activePage === "rmdPage") {
      await loadRmdReport();
    }
  } catch (err) {
    showLoginError("Gagal terhubung: " + err.message);
  } finally {
    setButtonLoading(btn, false, "Masuk");
  }
}

function doLogout() {
  const token = State.session ? State.session.token : "";
  clearSession();
  showToast("Anda sudah logout. Kembali ke mode warga.", "success");
  showApp();
  State.kasReport = null;
  State.rmdReport = null;
  loadInitialData().then(function () {
    if (State.activePage === "kasPage") {
      loadKasReport();
    }
    if (State.activePage === "rmdPage") {
      loadRmdReport();
    }
  });

  if (token) {
    api({ action: "logout", token: token }).catch(function () {});
  }
}

function clearSession() {
  State.session = null;
  sessionStorage.removeItem(SESSION_KEY);
}

function showLoginError(message) {
  const el = document.getElementById("loginError");
  el.textContent = message;
  el.style.display = "block";
}

function openLoginModal() {
  document.getElementById("loginError").style.display = "none";
  document.getElementById("loginModal").classList.add("active");
  const first = document.getElementById("loginUsername");
  if (first) {
    setTimeout(function () { first.focus(); }, 50);
  }
}

function closeLoginModal() {
  document.getElementById("loginModal").classList.remove("active");
}

function showApp() {
  document.getElementById("appPage").classList.add("active");

  const isGuest = !(State.session && State.session.token);
  const user = !isGuest ? State.session.user : null;

  document.getElementById("guestPill").style.display = isGuest ? "flex" : "none";
  document.getElementById("userPill").style.display = isGuest ? "none" : "flex";

  setText("activeUserName", user ? user.nama : "-");
  setText("activeUserRole", user ? roleLabel(user.role) : "-");
  fillPetugas();
  applyPermissions();
  goPage(State.activePage || "kasPage", true);
}

function fillPetugas() {
  const user = State.session && State.session.user ? State.session.user : null;
  const nama = user ? (user.nama || user.username) : "";
  setValue("kasPetugas", nama);
  setValue("rmdPetugas", nama);
}

function applyPermissions() {
  const isGuest = !(State.session && State.session.token);
  const permissions = isGuest ? GUEST_PERMISSIONS : (State.session.permissions || {});

  document.querySelectorAll("[data-permission]").forEach(function (el) {
    const key = el.dataset.permission;
    el.style.display = permissions[key] ? "" : "none";
  });

  // Banner ajakan login: hanya tampil untuk warga (belum login) pada fitur yang butuh permission tersebut.
  document.querySelectorAll("[data-permission-guest]").forEach(function (el) {
    el.style.display = isGuest ? "flex" : "none";
  });
}

function goPage(pageId, skipLoad) {
  State.activePage = pageId;
  document.querySelectorAll(".page-section").forEach(function (section) {
    section.classList.toggle("active", section.id === pageId);
  });
  document.querySelectorAll(".nav-item").forEach(function (button) {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  if (!skipLoad) {
    if (pageId === "kasPage") {
      // Kalau data laporan bulan berjalan sudah ada dari getInitialData tapi belum
      // pernah dirender (karena saat itu halaman aktifnya bukan kasPage), render
      // sekarang. Kalau belum ada sama sekali, baru fetch ke server.
      if (State.kasReport) {
        renderKasReport();
      } else {
        loadKasReport();
      }
    }
    if (pageId === "rmdPage") {
      if (State.rmdReport) {
        renderRmdReport();
      } else {
        loadRmdReport();
      }
    }
    if (pageId === "userPage" && !State.users.length) {
      loadUsers();
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function sessionToken() {
  return State.session && State.session.token ? State.session.token : "";
}

async function loadInitialData() {
  const isGuest = !(State.session && State.session.token);

  try {
    // Tanpa token, backend harus memperlakukan ini sebagai warga (read-only) dan
    // mengembalikan permissions: {view:true} saja. Lihat catatan kontrak API di app.js.
    const res = await api({
      action: "getInitialData",
      token: sessionToken(),
      monthKey: currentMonthKey()
    });

    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal memuat data.", "error");
      return;
    }

    State.settings = res.settings || {};
    State.categories = res.categories || { MASUK: [], KELUAR: [] };
    State.dashboard = res.dashboard || {};

    if (!isGuest) {
      State.session.user = res.user || State.session.user;
      State.session.permissions = res.permissions || State.session.permissions;
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(State.session));
    }

    setText("rtName", State.settings.nama_rt || "RT");
    setText("appTitle", State.settings.app_name || "Buku KAS RT dan RMD");
    if (!isGuest) {
      setText("activeUserName", State.session.user.nama || State.session.user.username);
      setText("activeUserRole", roleLabel(State.session.user.role));
    }
    fillPetugas();
    renderKasCategoryOptions();
    renderDashboard();
    applyPermissions();

    // Backend sudah menyertakan laporan bulan berjalan di respons ini (lihat getInitialData_
    // di Code.gs), jadi kalau filter laporan masih di posisi default (bulan ini), langsung
    // pakai data ini tanpa request tambahan saat pengguna membuka halaman KAS/RMD.
    if (res.kasReport && isDefaultMonthFilter_("kas")) {
      State.kasReport = res.kasReport;
      if (State.activePage === "kasPage") {
        renderKasReport();
      }
    }
    if (res.rmdReport && isDefaultMonthFilter_("rmd")) {
      State.rmdReport = res.rmdReport;
      if (State.activePage === "rmdPage") {
        renderRmdReport();
      }
    }
  } catch (err) {
    showToast("Gagal memuat data: " + err.message, "error");
  }
}

function isDefaultMonthFilter_(prefix) {
  const start = document.getElementById(prefix + "ReportStartMonth").value;
  const end = document.getElementById(prefix + "ReportEndMonth").value;
  const month = currentMonthKey();
  return (!start || start === month) && (!end || end === month);
}

function renderKasCategoryOptions() {
  const jenis = document.getElementById("kasJenis").value || "MASUK";
  const select = document.getElementById("kasKategori");
  const list = (State.categories && State.categories[jenis]) ? State.categories[jenis] : [];

  if (!list.length) {
    select.innerHTML = '<option value="">Kategori belum tersedia</option>';
    return;
  }

  select.innerHTML = list.map(function (item) {
    return '<option value="' + escapeHtml(item.kategori) + '">' + escapeHtml(item.kategori) + '</option>';
  }).join("");
}

function renderDashboard() {
  // Mengisi strip saldo saat ini yang selalu tampil di atas nav (lihat index.html),
  // supaya warga langsung melihat sisa saldo KAS RT & RMD tanpa perlu filter apa pun.
  const d = State.dashboard || {};
  const kas = d.kas || {};
  const rmd = d.rmd || {};

  setText("balanceKasNow", rupiah(kas.saldo_sekarang || 0));
  setText("balanceRmdNow", rupiah(rmd.saldo_sekarang || 0));
  setText("balanceTotalNow", rupiah(d.total_saldo || 0));
}

async function saveKasTransaction() {
  if (!canInput()) {
    showToast("Role Anda tidak boleh input transaksi.", "error");
    return;
  }

  const btn = document.getElementById("btnSaveKas");
  const payload = {
    tanggal: document.getElementById("kasTanggal").value,
    jenis: document.getElementById("kasJenis").value,
    kategori: document.getElementById("kasKategori").value,
    jumlah: document.getElementById("kasJumlah").value,
    uraian: document.getElementById("kasUraian").value
  };

  setButtonLoading(btn, true, "Menyimpan...");

  try {
    const res = await api({ action: "saveKasTransaction", token: sessionToken(), data: payload });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal menyimpan KAS.", "error");
      return;
    }

    document.getElementById("kasForm").reset();
    initDefaults();
    fillPetugas();
    renderKasCategoryOptions();
    State.kasReport = null;
    showToast(res.message || "Transaksi KAS berhasil disimpan.", "success");
    await loadKasReport();
    await loadDashboardOnly();
  } catch (err) {
    showToast("Gagal menyimpan KAS: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Simpan KAS");
  }
}

async function saveRmdTransaction() {
  if (!canInput()) {
    showToast("Role Anda tidak boleh input transaksi.", "error");
    return;
  }

  const btn = document.getElementById("btnSaveRmd");
  const payload = {
    tanggal: document.getElementById("rmdTanggal").value,
    jenis: document.getElementById("rmdJenis").value,
    jumlah: document.getElementById("rmdJumlah").value,
    uraian: document.getElementById("rmdUraian").value
  };

  setButtonLoading(btn, true, "Menyimpan...");

  try {
    const res = await api({ action: "saveRmdTransaction", token: sessionToken(), data: payload });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal menyimpan RMD.", "error");
      return;
    }

    document.getElementById("rmdForm").reset();
    initDefaults();
    fillPetugas();
    State.rmdReport = null;
    showToast(res.message || "Transaksi RMD berhasil disimpan.", "success");
    await loadRmdReport();
    await loadDashboardOnly();
  } catch (err) {
    showToast("Gagal menyimpan RMD: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Simpan RMD");
  }
}

async function loadDashboardOnly() {
  try {
    const res = await api({ action: "getDashboard", token: sessionToken(), monthKey: currentMonthKey() });
    if (res && res.status === "ok") {
      State.dashboard = res.dashboard || {};
      renderDashboard();
    }
  } catch (err) {}
}

function getReportRange(moduleName) {
  const prefix = moduleName === "RMD" ? "rmd" : "kas";
  const startId = prefix + "ReportStartMonth";
  const endId = prefix + "ReportEndMonth";
  let startMonthKey = document.getElementById(startId).value || currentMonthKey();
  let endMonthKey = document.getElementById(endId).value || startMonthKey;

  if (startMonthKey > endMonthKey) {
    const temp = startMonthKey;
    startMonthKey = endMonthKey;
    endMonthKey = temp;
  }

  setValue(startId, startMonthKey);
  setValue(endId, endMonthKey);
  return { startMonthKey: startMonthKey, endMonthKey: endMonthKey };
}

async function loadKasReport() {
  const range = getReportRange("KAS");
  const btn = document.getElementById("btnLoadKasReport");
  setButtonLoading(btn, true, "Memuat...");

  try {
    const res = await api({
      action: "getKasReport",
      token: sessionToken(),
      startMonthKey: range.startMonthKey,
      endMonthKey: range.endMonthKey
    });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal memuat laporan KAS.", "error");
      return;
    }
    State.kasReport = res.report || {};
    renderKasReport();
  } catch (err) {
    showToast("Gagal memuat laporan KAS: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Tampilkan");
  }
}

async function loadRmdReport() {
  const range = getReportRange("RMD");
  const btn = document.getElementById("btnLoadRmdReport");
  setButtonLoading(btn, true, "Memuat...");

  try {
    const res = await api({
      action: "getRmdReport",
      token: sessionToken(),
      startMonthKey: range.startMonthKey,
      endMonthKey: range.endMonthKey
    });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal memuat laporan RMD.", "error");
      return;
    }
    State.rmdReport = res.report || {};
    renderRmdReport();
  } catch (err) {
    showToast("Gagal memuat laporan RMD: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Tampilkan");
  }
}

function renderKasReport() {
  const r = State.kasReport || {};
  setText("kasReportTitle", "Laporan KAS RT " + reportPeriodLabel(r));
  setText("kasSaldoAwal", rupiah(r.saldo_awal_bulan || 0));
  setText("kasTotalMasuk", rupiah(r.total_masuk || 0));
  setText("kasTotalKeluar", rupiah(r.total_keluar || 0));
  setText("kasSaldoAkhir", rupiah(r.saldo_akhir || 0));

  const body = document.getElementById("kasTransactionBody");
  const rows = r.transactions || [];
  const showDelete = canDelete();

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="' + (showDelete ? 7 : 6) + '" class="empty-cell">Tidak ada detail transaksi pada periode ini.</td></tr>';
  } else {
    body.innerHTML = rows.map(function (item) {
      const actionCell = showDelete
        ? '<td><button class="link-danger" type="button" data-delete-transaction="KAS" data-id="' + escapeAttr(item.id_transaksi) + '">🗑️ Hapus</button></td>'
        : '';
      return '<tr>' +
        '<td>' + escapeHtml(item.tanggal_display) + '</td>' +
        '<td>' + badgeJenis(item.jenis) + '</td>' +
        '<td>' + escapeHtml(item.kategori || '-') + '</td>' +
        '<td>' + escapeHtml(item.uraian || '-') + '</td>' +
        '<td>' + escapeHtml(item.petugas || '-') + '</td>' +
        '<td class="text-right">' + rupiah(item.jumlah || 0) + '</td>' +
        actionCell +
      '</tr>';
    }).join("");
  }

  bindTransactionDeleteButtons(body);
  applyPermissions();
}

function renderRmdReport() {
  const r = State.rmdReport || {};
  setText("rmdReportTitle", "Laporan RMD " + reportPeriodLabel(r));
  setText("rmdSaldoAwal", rupiah(r.saldo_awal_bulan || 0));
  setText("rmdTotalMasuk", rupiah(r.total_masuk || 0));
  setText("rmdTotalKeluar", rupiah(r.total_keluar || 0));
  setText("rmdSaldoAkhir", rupiah(r.saldo_akhir || 0));

  const body = document.getElementById("rmdTransactionBody");
  const rows = r.transactions || [];
  const showDelete = canDelete();

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="' + (showDelete ? 6 : 5) + '" class="empty-cell">Tidak ada detail transaksi pada periode ini.</td></tr>';
  } else {
    body.innerHTML = rows.map(function (item) {
      const actionCell = showDelete
        ? '<td><button class="link-danger" type="button" data-delete-transaction="RMD" data-id="' + escapeAttr(item.id_transaksi) + '">🗑️ Hapus</button></td>'
        : '';
      return '<tr>' +
        '<td>' + escapeHtml(item.tanggal_display) + '</td>' +
        '<td>' + badgeJenis(item.jenis) + '</td>' +
        '<td>' + escapeHtml(item.uraian || '-') + '</td>' +
        '<td>' + escapeHtml(item.petugas || '-') + '</td>' +
        '<td class="text-right">' + rupiah(item.jumlah || 0) + '</td>' +
        actionCell +
      '</tr>';
    }).join("");
  }

  bindTransactionDeleteButtons(body);
  applyPermissions();
}


function bindTransactionDeleteButtons(root) {
  if (!root) {
    return;
  }
  root.querySelectorAll("[data-delete-transaction]").forEach(function (button) {
    button.addEventListener("click", function () {
      deleteTransaction(button.dataset.deleteTransaction, button.dataset.id);
    });
  });
}

async function deleteTransaction(moduleName, idTransaksi) {
  if (!canDelete()) {
    showToast("Role Anda tidak boleh hapus transaksi.", "error");
    return;
  }

  const okDelete = window.confirm("Hapus transaksi ini?");
  if (!okDelete) {
    return;
  }

  try {
    const action = moduleName === "RMD" ? "deleteRmdTransaction" : "deleteKasTransaction";
    const res = await api({ action: action, token: sessionToken(), id_transaksi: idTransaksi });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal menghapus transaksi.", "error");
      return;
    }

    showToast(res.message || "Transaksi berhasil dihapus.", "success");
    if (moduleName === "RMD") {
      await loadRmdReport();
    } else {
      await loadKasReport();
    }
    await loadDashboardOnly();
  } catch (err) {
    showToast("Gagal menghapus: " + err.message, "error");
  }
}

async function loadUsers() {
  if (!canManageUsers()) {
    return;
  }

  try {
    const res = await api({ action: "getUsers", token: sessionToken() });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal memuat user.", "error");
      return;
    }
    State.users = res.data || [];
    renderUsers();
  } catch (err) {
    showToast("Gagal memuat user: " + err.message, "error");
  }
}

async function saveUser() {
  if (!canManageUsers()) {
    showToast("Hanya admin yang bisa mengelola user.", "error");
    return;
  }

  const btn = document.getElementById("btnSaveUser");
  const payload = {
    id_user: document.getElementById("userId").value,
    username: document.getElementById("userUsername").value,
    nama: document.getElementById("userNama").value,
    role: document.getElementById("userRole").value,
    aktif: document.getElementById("userAktif").value,
    password: document.getElementById("userPassword").value
  };

  setButtonLoading(btn, true, "Menyimpan...");

  try {
    const res = await api({ action: "saveUser", token: sessionToken(), data: payload });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal menyimpan user.", "error");
      return;
    }

    showToast(res.message || "User berhasil disimpan.", "success");
    resetUserForm();
    await loadUsers();
  } catch (err) {
    showToast("Gagal menyimpan user: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Simpan User");
  }
}

function renderUsers() {
  const el = document.getElementById("userList");
  if (!State.users.length) {
    el.innerHTML = '<div class="empty">Belum ada user.</div>';
    return;
  }

  el.innerHTML = State.users.map(function (u) {
    const status = Number(u.aktif) === 1 ? "Aktif" : "Nonaktif";
    const toggleLabel = Number(u.aktif) === 1 ? "Nonaktifkan" : "Aktifkan";
    const toggleValue = Number(u.aktif) === 1 ? 0 : 1;

    return '<div class="user-row">' +
      '<div>' +
        '<strong>' + escapeHtml(u.nama) + '</strong>' +
        '<span>' + escapeHtml(u.username) + ' · ' + roleLabel(u.role) + ' · ' + status + '</span>' +
      '</div>' +
      '<div class="row-actions">' +
        '<button class="btn btn-light btn-mini" type="button" data-user-action="edit" data-id="' + escapeAttr(u.id_user) + '">✏️ Edit</button>' +
        '<button class="btn btn-light btn-mini" type="button" data-user-action="toggle" data-id="' + escapeAttr(u.id_user) + '" data-aktif="' + toggleValue + '">' + toggleLabel + '</button>' +
        '<button class="btn btn-danger btn-mini" type="button" data-user-action="delete" data-id="' + escapeAttr(u.id_user) + '">🗑️ Hapus</button>' +
      '</div>' +
    '</div>';
  }).join("");

  bindUserActionButtons(el);
}


function bindUserActionButtons(root) {
  if (!root) {
    return;
  }
  root.querySelectorAll("[data-user-action]").forEach(function (button) {
    button.addEventListener("click", function () {
      const action = button.dataset.userAction;
      const id = button.dataset.id;
      if (action === "edit") {
        editUser(id);
      }
      if (action === "toggle") {
        toggleUser(id, Number(button.dataset.aktif || 0));
      }
      if (action === "delete") {
        deleteUser(id);
      }
    });
  });
}

function editUser(idUser) {
  const u = State.users.find(function (item) { return item.id_user === idUser; });
  if (!u) {
    return;
  }
  setValue("userId", u.id_user);
  setValue("userUsername", u.username);
  setValue("userNama", u.nama);
  setValue("userRole", u.role);
  setValue("userAktif", String(Number(u.aktif) === 1 ? 1 : 0));
  setValue("userPassword", "");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function toggleUser(idUser, aktif) {
  try {
    const res = await api({ action: "toggleUser", token: sessionToken(), id_user: idUser, aktif: aktif });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal mengubah status user.", "error");
      return;
    }
    showToast(res.message || "Status user diperbarui.", "success");
    await loadUsers();
  } catch (err) {
    showToast("Gagal mengubah user: " + err.message, "error");
  }
}


async function deleteUser(idUser) {
  if (!canManageUsers()) {
    showToast("Hanya admin yang bisa menghapus user.", "error");
    return;
  }

  const target = (State.users || []).find(function (item) { return item.id_user === idUser; });
  const name = target ? (target.nama || target.username) : "user ini";
  const okDelete = window.confirm("Hapus " + name + "?");
  if (!okDelete) {
    return;
  }

  try {
    const res = await api({ action: "deleteUser", token: sessionToken(), id_user: idUser });
    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal menghapus user.", "error");
      return;
    }
    showToast(res.message || "User berhasil dihapus.", "success");
    resetUserForm();
    await loadUsers();
  } catch (err) {
    showToast("Gagal menghapus user: " + err.message, "error");
  }
}

function resetUserForm() {
  document.getElementById("userForm").reset();
  setValue("userId", "");
  setValue("userAktif", "1");
}

function exportReportExcel(moduleName) {
  const report = moduleName === "RMD" ? State.rmdReport : State.kasReport;
  const btnId = moduleName === "RMD" ? "btnExportRmdExcel" : "btnExportKasExcel";
  const btn = document.getElementById(btnId);

  if (!isReportReady(report)) {
    showToast("Tampilkan laporan dulu sebelum export Excel.", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Library Excel belum dimuat.", "error");
    return;
  }

  setButtonLoading(btn, true, "Menyiapkan...");

  try {
    const wb = XLSX.utils.book_new();
    const title = getReportTitle(moduleName);

    const summaryRows = [
      [title],
      ["Periode", reportPeriodLabel(report)],
      ["Saldo Awal Periode", Number(report.saldo_awal_bulan || 0)],
      ["Total Masuk", Number(report.total_masuk || 0)],
      ["Total Keluar", Number(report.total_keluar || 0)],
      ["Saldo Akhir", Number(report.saldo_akhir || 0)],
      ["Total Transaksi", Number(report.total_transaksi || 0)],
      ["Tanggal Export", new Date().toLocaleString("id-ID")]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
    autosizeSheet(wsSummary, summaryRows);
    applyExcelNumberFormat(wsSummary, "B3:B6", '"Rp" #,##0');
    applyExcelNumberFormat(wsSummary, "B7:B7", '#,##0');
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan");

    const detailHeader = moduleName === "RMD"
      ? ["Tanggal", "Jenis", "Uraian", "Petugas", "Jumlah"]
      : ["Tanggal", "Jenis", "Kategori", "Uraian", "Petugas", "Jumlah"];

    const detailRows = [detailHeader].concat((report.transactions || []).map(function (t) {
      if (moduleName === "RMD") {
        return [t.tanggal_display, t.jenis, t.uraian, t.petugas, Number(t.jumlah || 0)];
      }
      return [t.tanggal_display, t.jenis, t.kategori, t.uraian, t.petugas, Number(t.jumlah || 0)];
    }));
    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    autosizeSheet(wsDetail, detailRows);
    const amountColumn = moduleName === "RMD" ? "E" : "F";
    applyExcelNumberFormat(wsDetail, amountColumn + "2:" + amountColumn + Math.max(detailRows.length, 2), '"Rp" #,##0');
    XLSX.utils.book_append_sheet(wb, wsDetail, "Detail Transaksi");

    const fileName = makeSafeFileName(getReportTitle(moduleName) + " " + reportPeriodFilePart(report)) + ".xlsx";
    XLSX.writeFile(wb, fileName);
    showToast("Export Excel berhasil dibuat.", "success");
  } catch (err) {
    showToast("Gagal export Excel: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Export Excel");
  }
}

function exportReportPdf(moduleName) {
  const report = moduleName === "RMD" ? State.rmdReport : State.kasReport;
  const btnId = moduleName === "RMD" ? "btnExportRmdPdf" : "btnExportKasPdf";
  const btn = document.getElementById(btnId);

  if (!isReportReady(report)) {
    showToast("Tampilkan laporan dulu sebelum export PDF.", "error");
    return;
  }

  const jsPdfReady = window.jspdf && window.jspdf.jsPDF;
  if (!jsPdfReady) {
    showToast("Library PDF belum dimuat.", "error");
    return;
  }

  setButtonLoading(btn, true, "Menyiapkan...");

  try {
    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const title = getReportTitle(moduleName);
    const wilayah = cleanPdfText(State.settings.wilayah || "CIPADU - LARANGAN");
    const periodLabel = reportPeriodLabel(report);
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(title, pageWidth / 2, 14, { align: "center" });
    doc.setFontSize(13);
    doc.text(wilayah, pageWidth / 2, 24, { align: "center" });
    doc.setFontSize(12);
    doc.text("PERIODE " + periodLabel.toUpperCase(), pageWidth / 2, 34, { align: "center" });

    const detailHead = moduleName === "RMD"
      ? [["Tanggal", "Jenis", "Uraian", "Petugas", "Jumlah"]]
      : [["Tanggal", "Jenis", "Kategori", "Uraian", "Petugas", "Jumlah"]];

    let detailBody = (report.transactions || []).map(function (t) {
      if (moduleName === "RMD") {
        return [t.tanggal_display, t.jenis, t.uraian || "-", t.petugas || "-", formatPdfNumber(t.jumlah || 0)];
      }
      return [t.tanggal_display, t.jenis, t.kategori || "-", t.uraian || "-", t.petugas || "-", formatPdfNumber(t.jumlah || 0)];
    });
    if (!detailBody.length) {
      detailBody = moduleName === "RMD"
        ? [["-", "-", "Tidak ada transaksi", "-", "-"]]
        : [["-", "-", "-", "Tidak ada transaksi", "-", "-"]];
    }

    doc.autoTable({
      startY: 48,
      head: detailHead,
      body: detailBody,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      headStyles: { fillColor: [214, 231, 247], textColor: [0, 0, 0], fontStyle: "bold", lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles: moduleName === "RMD" ? { 4: { halign: "right" } } : { 5: { halign: "right" } },
      margin: { left: 10, right: 10 }
    });

    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 55;
    const summaryRows = [
      ["Periode", periodLabel],
      ["Saldo Awal Periode", formatPdfNumber(report.saldo_awal_bulan || 0)],
      ["Total Masuk", formatPdfNumber(report.total_masuk || 0)],
      ["Total Keluar", formatPdfNumber(report.total_keluar || 0)],
      ["Saldo Akhir", formatPdfNumber(report.saldo_akhir || 0)]
    ];

    if (finalY > 140) {
      doc.addPage("landscape");
    }

    const summaryStartY = finalY > 140 ? 20 : finalY + 20;
    doc.autoTable({
      startY: summaryStartY,
      body: summaryRows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 10, cellPadding: 3, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2 },
      columnStyles: { 0: { fillColor: [214, 231, 247], fontStyle: "bold", cellWidth: 58 }, 1: { halign: "right", fontStyle: "bold", cellWidth: 68 } },
      margin: { left: (pageWidth - 126) / 2, right: (pageWidth - 126) / 2 }
    });

    doc.save(getReportPdfFileName(moduleName, report));
    showToast("Export PDF berhasil dibuat.", "success");
  } catch (err) {
    showToast("Gagal export PDF: " + err.message, "error");
  } finally {
    setButtonLoading(btn, false, "Export PDF");
  }
}

function autosizeSheet(ws, rows) {
  const widths = [];
  rows.forEach(function (row) {
    row.forEach(function (cell, idx) {
      const len = String(cell === null || cell === undefined ? "" : cell).length;
      widths[idx] = Math.max(widths[idx] || 10, Math.min(len + 4, 48));
    });
  });
  ws["!cols"] = widths.map(function (wch) { return { wch: wch }; });
}

function applyExcelNumberFormat(ws, rangeText, format) {
  const range = XLSX.utils.decode_range(rangeText);
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const addr = XLSX.utils.encode_cell({ r: row, c: col });
      if (ws[addr] && typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = format;
      }
    }
  }
}

function getReportTitle(moduleName) {
  const rtName = cleanPdfText(State.settings.nama_rt || "RT 005 RW 01").replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
  return moduleName === "RMD" ? "LAPORAN RMD " + rtName : "LAPORAN KAS " + rtName;
}

function getReportPdfFileName(moduleName, report) {
  if (!report || reportStartMonthKey(report) === reportEndMonthKey(report)) {
    return makeSafeFileName(getReportTitle(moduleName)) + ".pdf";
  }
  return makeSafeFileName(getReportTitle(moduleName) + " " + reportPeriodFilePart(report)) + ".pdf";
}

function makeSafeFileName(value) {
  return String(value || "laporan")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanPdfText(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function formatPdfNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function transactionCard(item, moduleName) {
  const cls = item.jenis === "MASUK" ? "in" : "out";
  const label = moduleName === "RMD" ? "RMD" : "KAS";
  const title = moduleName === "RMD" ? "RMD" : (item.kategori || "KAS");
  return '<div class="trx-card">' +
    '<div class="trx-icon ' + cls + '">' + label + '</div>' +
    '<div class="trx-info">' +
      '<div class="trx-title">' + escapeHtml(title) + '</div>' +
      '<div class="trx-sub">' + escapeHtml(item.tanggal_display || item.tanggal) + ' · ' + escapeHtml(item.uraian || '-') + '</div>' +
    '</div>' +
    '<div class="trx-amount ' + cls + '">' + rupiah(item.jumlah || 0) + '</div>' +
  '</div>';
}

function badgeJenis(jenis) {
  const cls = jenis === "MASUK" ? "badge-in" : "badge-out";
  const label = jenis === "MASUK" ? "Masuk" : "Keluar";
  return '<span class="badge ' + cls + '">' + label + '</span>';
}

function canInput() {
  return !!(State.session && State.session.permissions && State.session.permissions.input);
}

function canDelete() {
  return !!(State.session && State.session.permissions && State.session.permissions.deleteTransaction);
}

function canManageUsers() {
  return !!(State.session && State.session.permissions && State.session.permissions.manageUsers);
}

function currentDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function currentMonthKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return y + "-" + m;
}


function isReportReady(report) {
  return !!(report && (report.startMonthKey || report.monthKey));
}

function reportStartMonthKey(report) {
  return report && (report.startMonthKey || report.monthKey) ? (report.startMonthKey || report.monthKey) : currentMonthKey();
}

function reportEndMonthKey(report) {
  return report && (report.endMonthKey || report.monthKey) ? (report.endMonthKey || report.monthKey) : reportStartMonthKey(report);
}

function reportPeriodLabel(report) {
  const start = reportStartMonthKey(report);
  const end = reportEndMonthKey(report);
  return start === end ? monthName(start) : monthName(start) + " s/d " + monthName(end);
}

function reportPeriodFilePart(report) {
  const start = reportStartMonthKey(report);
  const end = reportEndMonthKey(report);
  return start === end ? start : start + " sd " + end;
}

function monthName(monthKey) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) {
    return "-";
  }
  const names = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const parts = monthKey.split("-");
  return names[Number(parts[1]) - 1] + " " + parts[0];
}

function rupiah(value) {
  return "Rp " + Number(value || 0).toLocaleString("id-ID");
}

function numberFormat(value) {
  return Number(value || 0).toLocaleString("id-ID");
}

function roleLabel(role) {
  const map = {
    admin: "Admin",
    bendahara: "Bendahara",
    ketua: "Ketua RT",
    viewer: "Viewer"
  };
  return map[role] || role || "-";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.value = value;
  }
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setButtonLoading(button, loading, text) {
  if (!button) {
    return;
  }
  button.disabled = !!loading;
  if (text) {
    button.textContent = text;
  }
}

let toastTimer;
function showToast(message, type) {
  const el = document.getElementById("toast");
  if (!el) {
    return;
  }
  el.textContent = message;
  el.className = "toast show" + (type ? " " + type : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    el.className = "toast";
  }, 2800);
}

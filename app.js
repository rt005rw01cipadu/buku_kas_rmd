/* 
Buku KAS RT dan RMD
Frontend statis untuk GitHub Pages.
Ganti API_URL dengan URL Web App dari Google Apps Script.
Created By ANDANG CHRISNANDI
Updated Date 2026-06-23
*/

const API_URL = "https://script.google.com/macros/s/AKfycbxAngJqqSRn4IPQaMNF8IHCxYKfMDxzyI0w7CIUN8UU6X3ATT7xx3_pu45kxOSP3Adc/exec";
const SESSION_KEY = "kas_rt_session_v2";

const State = {
  session: JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"),
  settings: {},
  categories: { MASUK: [], KELUAR: [] },
  dashboard: null,
  kasReport: null,
  rmdReport: null,
  users: [],
  activePage: "dashboardPage"
};

document.addEventListener("DOMContentLoaded", function () {
  bindEvents();
  initDefaults();

  if (State.session && State.session.token) {
    showApp();
    loadInitialData();
  } else {
    showLogin();
  }
});

function bindEvents() {
  document.getElementById("loginForm").addEventListener("submit", function (event) {
    event.preventDefault();
    doLogin();
  });

  document.querySelectorAll("[data-page]").forEach(function (button) {
    button.addEventListener("click", function () {
      goPage(button.dataset.page);
    });
  });

  document.getElementById("btnRefresh").addEventListener("click", loadInitialData);
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
  setValue("kasReportMonth", month);
  setValue("rmdReportMonth", month);
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
    }, 35000);

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
        showToast(response.message || "Sesi berakhir. Silakan login ulang.", "error");
        clearSession();
        showLogin();
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
    document.getElementById("loginError").style.display = "none";
    showApp();
    await loadInitialData();
  } catch (err) {
    showLoginError("Gagal terhubung: " + err.message);
  } finally {
    setButtonLoading(btn, false, "Masuk");
  }
}

function doLogout() {
  const token = State.session ? State.session.token : "";
  clearSession();
  showLogin();
  showToast("Anda sudah logout.", "success");

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

function showLogin() {
  document.getElementById("loginPage").classList.add("active");
  document.getElementById("appPage").classList.remove("active");
}

function showApp() {
  document.getElementById("loginPage").classList.remove("active");
  document.getElementById("appPage").classList.add("active");

  const user = State.session ? State.session.user : null;
  setText("activeUserName", user ? user.nama : "-");
  setText("activeUserRole", user ? roleLabel(user.role) : "-");
  fillPetugas();
  applyPermissions();
  goPage(State.activePage || "dashboardPage", true);
}

function fillPetugas() {
  const user = State.session && State.session.user ? State.session.user : null;
  const nama = user ? (user.nama || user.username) : "";
  setValue("kasPetugas", nama);
  setValue("rmdPetugas", nama);
}

function applyPermissions() {
  const permissions = State.session && State.session.permissions ? State.session.permissions : {};

  document.querySelectorAll("[data-permission]").forEach(function (el) {
    const key = el.dataset.permission;
    el.style.display = permissions[key] ? "" : "none";
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
    if (pageId === "kasPage" && !State.kasReport) {
      loadKasReport();
    }
    if (pageId === "rmdPage" && !State.rmdReport) {
      loadRmdReport();
    }
    if (pageId === "userPage" && !State.users.length) {
      loadUsers();
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadInitialData() {
  if (!State.session || !State.session.token) {
    showLogin();
    return;
  }

  try {
    const res = await api({
      action: "getInitialData",
      token: State.session.token,
      monthKey: currentMonthKey()
    });

    if (!res || res.status !== "ok") {
      showToast(res && res.message ? res.message : "Gagal memuat data.", "error");
      return;
    }

    State.settings = res.settings || {};
    State.categories = res.categories || { MASUK: [], KELUAR: [] };
    State.dashboard = res.dashboard || {};
    State.session.user = res.user || State.session.user;
    State.session.permissions = res.permissions || State.session.permissions;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(State.session));

    setText("rtName", State.settings.nama_rt || "RT");
    setText("appTitle", State.settings.app_name || "Buku KAS RT dan RMD");
    setText("activeUserName", State.session.user.nama || State.session.user.username);
    setText("activeUserRole", roleLabel(State.session.user.role));
    fillPetugas();
    renderKasCategoryOptions();
    renderDashboard();
    applyPermissions();
  } catch (err) {
    showToast("Gagal memuat data: " + err.message, "error");
  }
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
  const d = State.dashboard || {};
  const kas = d.kas || {};
  const rmd = d.rmd || {};

  setText("dashTotalSaldo", rupiah(d.total_saldo || 0));
  setText("dashSaldoKas", rupiah(kas.saldo_sekarang || 0));
  setText("dashSaldoRmd", rupiah(rmd.saldo_sekarang || 0));
  setText("dashTotalTransaksi", numberFormat(d.total_transaksi || 0));
  setText("dashKasMasuk", rupiah(kas.total_masuk_bulan || 0));
  setText("dashKasKeluar", rupiah(kas.total_keluar_bulan || 0));
  setText("dashRmdMasuk", rupiah(rmd.total_masuk_bulan || 0));
  setText("dashRmdKeluar", rupiah(rmd.total_keluar_bulan || 0));

  const list = document.getElementById("recentTransactions");
  const recent = d.recent || [];
  if (!recent.length) {
    list.innerHTML = '<div class="empty">Belum ada transaksi.</div>';
    return;
  }

  list.innerHTML = recent.map(function (item) {
    return transactionCard(item, item.module || "KAS");
  }).join("");
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
    const res = await api({ action: "saveKasTransaction", token: State.session.token, data: payload });
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
    const res = await api({ action: "saveRmdTransaction", token: State.session.token, data: payload });
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
    const res = await api({ action: "getDashboard", token: State.session.token, monthKey: currentMonthKey() });
    if (res && res.status === "ok") {
      State.dashboard = res.dashboard || {};
      renderDashboard();
    }
  } catch (err) {}
}

async function loadKasReport() {
  const monthKey = document.getElementById("kasReportMonth").value || currentMonthKey();
  const btn = document.getElementById("btnLoadKasReport");
  setButtonLoading(btn, true, "Memuat...");

  try {
    const res = await api({ action: "getKasReport", token: State.session.token, monthKey: monthKey });
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
  const monthKey = document.getElementById("rmdReportMonth").value || currentMonthKey();
  const btn = document.getElementById("btnLoadRmdReport");
  setButtonLoading(btn, true, "Memuat...");

  try {
    const res = await api({ action: "getRmdReport", token: State.session.token, monthKey: monthKey });
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
  setText("kasReportTitle", "Laporan KAS RT " + monthName(r.monthKey));
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
  setText("rmdReportTitle", "Laporan RMD " + monthName(r.monthKey));
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
    const res = await api({ action: action, token: State.session.token, id_transaksi: idTransaksi });
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
    const res = await api({ action: "getUsers", token: State.session.token });
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
    const res = await api({ action: "saveUser", token: State.session.token, data: payload });
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
    const res = await api({ action: "toggleUser", token: State.session.token, id_user: idUser, aktif: aktif });
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
    const res = await api({ action: "deleteUser", token: State.session.token, id_user: idUser });
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

  if (!report || !report.monthKey) {
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
      ["Periode", monthName(report.monthKey)],
      ["Saldo Awal Bulan", Number(report.saldo_awal_bulan || 0)],
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

    const fileName = makeSafeFileName(getReportTitle(moduleName) + " " + report.monthKey) + ".xlsx";
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

  if (!report || !report.monthKey) {
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
    const periodLabel = monthName(report.monthKey);
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
      ["Saldo Awal Bulan", formatPdfNumber(report.saldo_awal_bulan || 0)],
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

    doc.save(getReportPdfFileName(moduleName));
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

function getReportPdfFileName(moduleName) {
  return makeSafeFileName(getReportTitle(moduleName)) + ".pdf";
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

/*
   ★ مساعد REST API مع Timeout وRetry
*/
async function gsRun(fnName, args, onSuccess, onFailure, opts) {
    try {
        const result = await SalaryApi.call(fnName, args || [], opts || {});
        if (typeof onSuccess === 'function') onSuccess(result);
    } catch (error) {
        if (typeof onFailure === 'function') onFailure(error);
        else showToast(error.message || 'فشل الاتصال بالخادم', 'error');
    }
}

/* ==========================================
   المتغيرات العامة
   ========================================== */
var adminPass        = '';
var mainChart        = null;
var currentChartType = 'daily';
var logPage          = 1;
var logTotalPages    = 1;
var logSearchTimer   = null;
var usersSearchTimer = null;
var logIsLoading     = false;
var nameSearchTimer  = null;

/* Init */
window.dataLayer = window.dataLayer || [];
window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
window.gtag('js', new Date());
window.gtag('config', 'G-M7V4JDQ2B9');
lucide.createIcons();

async function loadMonthOptions() {
    const select = document.getElementById('monthSelect');
    const adminSelect = document.getElementById('adminNameSearchMonth');
    if (!select) return;
    try {
        const months = await SalaryApi.getMonths();
        if (!months.length) {
            select.innerHTML = '<option value="">لا توجد أشهر متاحة</option>';
            if (adminSelect) adminSelect.innerHTML = '<option value="all">كل الأشهر</option>';
            return;
        }
        select.innerHTML = months.map(function(name){ return '<option value="' + esc(name) + '">' + esc(name) + '</option>'; }).join('');
        if (adminSelect) adminSelect.innerHTML = '<option value="all">كل الأشهر</option>' + months.map(function(name){ return '<option value="' + esc(name) + '">' + esc(name) + '</option>'; }).join('');
    } catch (error) {
        select.innerHTML = '<option value="">تعذر تحميل الأشهر</option>';
        if (adminSelect) adminSelect.innerHTML = '<option value="all">كل الأشهر</option>';
    }
}
loadMonthOptions();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});

/* ==========================================
   التوست
   ========================================== */
function showToast(msg, type) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'show ' + (type || 'info');
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function(){ t.classList.remove('show'); }, 3400);
}

/* ==========================================
   مودال التأكيد
   ========================================== */
function openConfirm(title, msg, onOk) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMsg').textContent   = msg;
    document.getElementById('confirmModal').classList.add('open');
    document.getElementById('confirmOkBtn').onclick = function() { closeConfirm(); onOk(); };
}
function closeConfirm() { document.getElementById('confirmModal').classList.remove('open'); }

/* ==========================================
   كلمة المرور
   ========================================== */
function askPassword() {
    document.getElementById('passwordModal').classList.remove('hidden');
    document.getElementById('adminPassInput').value = '';
    document.getElementById('passError').classList.add('hidden');
    setTimeout(function(){ document.getElementById('adminPassInput').focus(); }, 60);
}
function closePasswordModal() {
    document.getElementById('passwordModal').classList.add('hidden');
    document.getElementById('adminPassInput').value = '';
    document.getElementById('passError').classList.add('hidden');
}
function submitPassword() {
    var p = document.getElementById('adminPassInput').value;
    if (!p) return;
    gsRun('checkAdminAuth', [p], function(isValid) {
        if (isValid) {
            adminPass = p;
            closePasswordModal();
            showAdminSmartSearch();
            openAdmin();
        } else {
            document.getElementById('passError').classList.remove('hidden');
            document.getElementById('adminPassInput').value = '';
            document.getElementById('adminPassInput').focus();
        }
    }, function() {
        showToast('فشل الاتصال بالخادم', 'error');
    });
}
document.getElementById('adminPassInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') submitPassword(); });

/* ==========================================
   ★ إدارة خانة البحث الذكي
   ========================================== */
function showAdminSmartSearch() {
    var section = document.getElementById('adminSmartSearchSection');
    section.classList.add('visible');
    section.setAttribute('aria-hidden', 'false');
    lucide.createIcons();
}

function hideAdminSmartSearch() {
    var section = document.getElementById('adminSmartSearchSection');
    section.classList.remove('visible');
    section.setAttribute('aria-hidden', 'true');
    clearNameSearchResults();
    document.getElementById('adminNameSearchInput').value = '';
    document.getElementById('adminNameSearchMonth').value = 'all';
}

/* ==========================================
   فتح / إغلاق لوحة الإدارة
   ========================================== */
function closeAdmin() {
    document.getElementById('adminOverlay').classList.remove('active');
    document.getElementById('mainPage').style.display = '';
    document.getElementById('scrollDownBtn').style.display = '';
    if (mainChart) { mainChart.destroy(); mainChart = null; }
}

function openAdmin() {
    document.getElementById('adminOverlay').classList.add('active');
    document.getElementById('mainPage').style.display = 'none';
    document.getElementById('scrollDownBtn').style.display = 'none';
    lucide.createIcons();
    loadDashboard();
}

function logoutAdmin() {
    openConfirm('تسجيل الخروج', 'هل تريد تسجيل الخروج من وضع الإدارة؟', function() {
        adminPass = '';
        if (mainChart) { mainChart.destroy(); mainChart = null; }
        document.getElementById('adminOverlay').classList.remove('active');
        document.getElementById('mainPage').style.display = '';
        document.getElementById('scrollDownBtn').style.display = '';
        hideAdminSmartSearch();
        showToast('تم تسجيل الخروج الإداري', 'info');
    });
}

/* ==========================================
   تبديل التبويبات
   ========================================== */
function switchTab(name, btn) {
    document.querySelectorAll('.admin-tab').forEach(function(t){ t.classList.remove('active'); });
    document.querySelectorAll('.admin-nav-btn').forEach(function(b){ b.classList.remove('active'); });
    document.getElementById('tab-' + name).classList.add('active');
    if (btn) btn.classList.add('active');
    if (name === 'querylog') { logPage = 1; reloadLogEntries(); loadLogStats(); }
    if (name === 'topusers') loadTopUsers();
    if (name === 'sheets')   loadSheets();
    if (name === 'system')   loadSystemInfo();
}

/* ==========================================
   لوحة التحكم
   ========================================== */
function loadDashboard() {
    loadStats();
    loadChart(currentChartType, document.querySelector('.tab-pill.active'));
}

function loadStats() {
    gsRun('getAdminStats', [adminPass], function(data) {
        if (!data || data.error) { showToast('خطأ في تحميل الإحصائيات: ' + (data && data.error || ''), 'error'); return; }
        renderStats(data);
        if (data.serverTime) document.getElementById('adminServerTime').textContent = data.serverTime;
        loadRecentEntries();
    }, function(err) {
        showToast('فشل تحميل الإحصائيات: ' + (err && err.message || ''), 'error');
        document.getElementById('statsGrid').innerHTML = '<div class="stat-card col-span-2 md:col-span-4 text-center py-8 text-red-400 font-bold">فشل تحميل الإحصائيات — <button onclick="loadStats()" style="color:#1e3a8a;text-decoration:underline;">إعادة المحاولة</button></div>';
    }, { timeout: 40000, retries: 1 });
}

function renderStats(d) {
    var gIcon = d.growthRate >= 0 ? '↑' : '↓';
    var gColor = d.growthRate >= 0 ? 'text-emerald-500' : 'text-red-500';
    document.getElementById('statsGrid').innerHTML = [
        mkStat('bg-blue-50','text-blue-600','<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>','إجمالي الاستعلامات', (d.totalQueriesAllTime || d.totalQueries).toLocaleString(), 'محفوظ دائماً · لا يُمسح'),
        mkStat('bg-emerald-50','text-emerald-600','<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>','استعلامات اليوم', d.todayQueries.toLocaleString(), 'خلال اليوم الحالي'),
        mkStat('bg-violet-50','text-violet-600','<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>','هذا الأسبوع', d.weekQueries.toLocaleString(), 'آخر 7 أيام'),
        mkStat('bg-amber-50','text-amber-600','<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>','هذا الشهر', d.monthQueries.toLocaleString(), '<span class="'+gColor+'">'+gIcon+' '+Math.abs(d.growthRate)+'% مقارنة بالشهر السابق</span>'),
        mkStat('bg-teal-50','text-teal-600','<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>','متوسط يومي', d.avgDaily.toLocaleString(), 'استعلام / يوم'),
        mkStat('bg-green-50','text-green-600','<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>','نسبة النجاح', d.successRate + '%', d.errorCount + ' خطأ مسجل'),
        mkStat('bg-slate-50','text-slate-600','<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>','الشيتات النشطة', d.dataSheets, d.disabledSheets + ' شيت معطل'),
        mkStat('bg-rose-50','text-rose-600','<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>','متوسط الأسبوع', d.weekQueries > 0 ? Math.round(d.weekQueries/7) : 0, 'استعلام / يوم (أسبوعي)')
    ].join('');
}

function mkStat(bgIcon, textIcon, svgPath, label, value, sub) {
    return '<div class="stat-card"><div class="stat-card__icon '+bgIcon+'"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 '+textIcon+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">'+svgPath+'</svg></div><div class="stat-card__label">'+label+'</div><div class="stat-card__value">'+value+'</div><div class="stat-card__sub">'+sub+'</div></div>';
}

function loadRecentEntries() {
    gsRun('getLogEntries', [adminPass, '', 1, 5, 'newest'], function(data) {
        var tbody = document.getElementById('recentTableBody');
        if (!data || data.error || !data.rows) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-slate-400">لا توجد بيانات</td></tr>'; return; }
        if (data.rows.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-6 text-slate-400">لا توجد سجلات بعد</td></tr>'; return; }
        tbody.innerHTML = data.rows.map(function(r) {
            return '<tr><td class="text-xs text-slate-400">' + esc(r.date) + '</td><td class="font-bold">' + esc(r.name || '—') + '</td><td><span class="badge badge--blue">' + esc(r.month) + '</span></td><td><span class="badge badge--green">' + esc(r.status || 'نجاح') + '</span></td></tr>';
        }).join('');
    }, function() {
        document.getElementById('recentTableBody').innerHTML = '<tr><td colspan="4" class="text-center py-6 text-red-400">فشل التحميل</td></tr>';
    });
}

/* ==========================================
   الرسوم البيانية
   ========================================== */
function loadChart(type, btn) {
    currentChartType = type;
    document.querySelectorAll('.tab-pill').forEach(function(p){ p.classList.remove('active'); });
    if (btn) btn.classList.add('active');
    gsRun('getChartData', [adminPass, type], function(data) {
        renderChart(data.labels || [], data.values || [], type);
    }, function() {
        renderChart(['لا بيانات'], [0], type);
    });
}

function renderChart(labels, values, type) {
    var ctx = document.getElementById('mainChart').getContext('2d');
    var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (mainChart) { mainChart.destroy(); mainChart = null; }
    mainChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'عدد الاستعلامات',
                data: values,
                backgroundColor: isDark ? 'rgba(96,165,250,0.65)' : 'rgba(37,99,235,0.65)',
                borderColor: isDark ? '#60a5fa' : '#1d4ed8',
                borderWidth: 2, borderRadius: 8, borderSkipped: false
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: true,
            plugins: {
                legend: { display: false },
                tooltip: { rtl: true, bodyFont: { family: 'Tajawal', weight: '700' }, titleFont: { family: 'Tajawal', weight: '900' } }
            },
            scales: {
                x: { ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Tajawal', size: 12 } }, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } },
                y: { ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { family: 'Tajawal', size: 12 } }, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, beginAtZero: true }
            }
        }
    });
}

/* ==========================================
   ★ سجل الاستعلامات
   ========================================== */
function showLogLoading() {
    document.getElementById('logLoadingState').classList.remove('hidden');
    document.getElementById('logTableWrap').classList.add('hidden');
    document.getElementById('logErrorState').classList.add('hidden');
    document.getElementById('logTotalBadge').classList.add('hidden');
}
function showLogTable() {
    document.getElementById('logLoadingState').classList.add('hidden');
    document.getElementById('logTableWrap').classList.remove('hidden');
    document.getElementById('logErrorState').classList.add('hidden');
}
function showLogError(title, msg) {
    document.getElementById('logLoadingState').classList.add('hidden');
    document.getElementById('logTableWrap').classList.add('hidden');
    document.getElementById('logErrorState').classList.remove('hidden');
    document.getElementById('logErrTitle').textContent = title || 'فشل تحميل السجل';
    document.getElementById('logErrMsg').textContent   = msg   || 'يرجى المحاولة مجدداً';
    logIsLoading = false;
}

function reloadLogEntries() {
    logPage = 1;
    loadLogEntries();
}

function loadLogEntries() {
    if (logIsLoading) return;
    logIsLoading = true;
    showLogLoading();

    var search = (document.getElementById('logSearch').value || '').trim();
    var sortEl  = document.getElementById('logSortBy');
    var sortBy  = sortEl ? sortEl.value : 'newest';

    gsRun('getLogEntries', [adminPass, search, logPage, 20, sortBy],
        function(data) {
            logIsLoading = false;
            if (!data) { showLogError('استجابة فارغة', 'لم يرسل الخادم أي بيانات'); return; }
            if (data.error) { showLogError('خطأ من الخادم', data.error); return; }

            var rows  = Array.isArray(data.rows) ? data.rows : [];
            var total = parseInt(data.total) || 0;
            var page  = parseInt(data.page)  || 1;
            var pages = parseInt(data.pages) || 1;

            logPage       = page;
            logTotalPages = pages;

            renderLogTable(rows, total, page, pages);
            showLogTable();
        },
        function(err) {
            logIsLoading = false;
            var msg = err && err.message ? err.message : 'تعذر الوصول إلى الخادم';
            showLogError('فشل جلب السجل', msg);
            showToast('خطأ في سجل الاستعلامات: ' + msg, 'error');
        },
        { timeout: 45000, retries: 2 }
    );
}

/* ★ تحميل إحصائيات السجل السريعة (مستقلة عن الجدول) */
function loadLogStats() {
    gsRun('getAdminStats', [adminPass], function(data) {
        if (!data || data.error) return;
        var allTime = data.totalQueriesAllTime || data.totalQueries || 0;
        document.getElementById('logStatAllTime').textContent = allTime.toLocaleString();
        document.getElementById('logStatToday').textContent   = (data.todayQueries || 0).toLocaleString();
        document.getElementById('logStatWeek').textContent    = (data.weekQueries || 0).toLocaleString();
    }, null, { timeout: 30000, retries: 1 });
}

/* ★ عرض جدول السجل — 4 أعمدة (بدون الرقم الوطني) */
function renderLogTable(rows, total, page, pages) {
    var tbody = document.getElementById('logTableBody');
    var search = (document.getElementById('logSearch').value || '').trim();

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-slate-400 font-medium">لا توجد سجلات' + (search ? ' مطابقة للبحث' : '') + '</td></tr>';
    } else {
        tbody.innerHTML = rows.map(function(r, i) {
            return '<tr>'
                 + '<td class="text-slate-400 text-xs font-mono">' + esc(String(r.index || (i + 1))) + '</td>'
                 + '<td class="font-bold">' + esc(r.name || '—') + '</td>'
                 + '<td class="text-xs text-slate-500 whitespace-nowrap font-mono">' + esc(r.date || '—') + '</td>'
                 + '<td><span class="badge badge--blue">' + esc(r.month || '—') + '</span></td>'
                 + '</tr>';
        }).join('');
    }

    var info  = document.getElementById('logPaginationInfo');
    var badge = document.getElementById('logTotalBadge');
    info.textContent  = 'صفحة ' + page + ' من ' + pages + ' · ' + total.toLocaleString() + ' سجل';
    badge.textContent = total.toLocaleString() + ' سجل';
    badge.classList.remove('hidden');

    document.getElementById('logPageNum').textContent = page + ' / ' + pages;
    document.getElementById('logPrevBtn').disabled = (page <= 1);
    document.getElementById('logNextBtn').disabled = (page >= pages);
}

function logPrevPage() { if (logPage > 1) { logPage--; loadLogEntries(); } }
function logNextPage() { if (logPage < logTotalPages) { logPage++; loadLogEntries(); } }

function debounceLogSearch() {
    logPage = 1;
    clearTimeout(logSearchTimer);
    logSearchTimer = setTimeout(loadLogEntries, 500);
}

function confirmClearLog() {
    openConfirm('مسح سجل الاستعلامات', 'سيتم حذف جميع السجلات الظاهرة. الإجمالي الكلي للاستعلامات سيبقى محفوظاً. هذا الإجراء لا يمكن التراجع عنه.', function() {
        gsRun('clearQueryLog', [adminPass], function(res) {
            if (res && res.success) {
                showToast('تم مسح السجل بنجاح · العداد الإجمالي محفوظ', 'success');
                reloadLogEntries();
                loadLogStats();
            } else {
                showToast('خطأ: ' + (res && res.error || ''), 'error');
            }
        }, function(){ showToast('فشل الاتصال بالخادم', 'error'); });
    });
}

/* ==========================================
   تصدير السجل
   ========================================== */
function exportLogCSV() {
    showToast('جاري تجهيز ملف CSV...', 'info');
    gsRun('exportLogData', [adminPass], function(res) {
        if (!res || res.error || !res.data || res.data.length === 0) { showToast('لا توجد بيانات للتصدير', 'warn'); return; }
        var csv = res.data.map(function(r){ return r.map(function(c){ return '"' + String(c || '').replace(/"/g,'""') + '"'; }).join(','); }).join('\r\n');
        downloadFile('\uFEFF' + csv, 'سجل_الاستعلامات_' + todayStr() + '.csv', 'text/csv;charset=utf-8;');
        showToast('تم تصدير CSV بنجاح (' + (res.data.length - 1) + ' سجل)', 'success');
    }, function(){ showToast('فشل التصدير', 'error'); });
}

function exportLogExcel() {
    showToast('جاري تجهيز ملف Excel...', 'info');
    gsRun('exportLogData', [adminPass], function(res) {
        if (!res || res.error || !res.data || res.data.length === 0) { showToast('لا توجد بيانات للتصدير', 'warn'); return; }
        var ws = XLSX.utils.aoa_to_sheet(res.data);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'سجل الاستعلامات');
        XLSX.writeFile(wb, 'سجل_الاستعلامات_' + todayStr() + '.xlsx');
        showToast('تم تصدير Excel بنجاح', 'success');
    }, function(){ showToast('فشل التصدير', 'error'); });
}

function exportStatsReport() {
    gsRun('getAdminStats', [adminPass], function(data) {
        if (!data || data.error) { showToast('خطأ في جلب الإحصائيات', 'error'); return; }
        var allTime = data.totalQueriesAllTime || data.totalQueries;
        var lines = ['تقرير إحصائيات نظام استعلام الرواتب','مديرية غاز جنوب المنطقة الوسطى','================================','تاريخ التقرير: ' + (data.serverTime || ''),''
            ,'إجمالي الاستعلامات الكلي (دائم): ' + allTime,'استعلامات الشهر الحالي: ' + data.totalQueries,'استعلامات اليوم: ' + data.todayQueries,'استعلامات الأسبوع: ' + data.weekQueries,'استعلامات الشهر: ' + data.monthQueries
            ,'نسبة النجاح: ' + data.successRate + '%','عدد الأخطاء: ' + data.errorCount,'الشيتات النشطة: ' + data.dataSheets,'الشيتات المعطلة: ' + data.disabledSheets
            ,'نمو الشهر: ' + data.growthRate + '%','متوسط يومي: ' + data.avgDaily];
        downloadFile('\uFEFF' + lines.join('\r\n'), 'تقرير_الإحصائيات_' + todayStr() + '.txt', 'text/plain;charset=utf-8;');
        showToast('تم تصدير التقرير', 'success');
    }, function(){ showToast('فشل جلب الإحصائيات', 'error'); });
}

function downloadFile(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); }, 600);
}

function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate());
}
function pad2(n){ return n < 10 ? '0' + n : '' + n; }

/* ==========================================
   أكثر المستعلمين
   ========================================== */
function loadTopUsers() {
    var search = (document.getElementById('usersSearch').value || '').trim();
    var tbody  = document.getElementById('topUsersBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10"><div style="display:flex;align-items:center;justify-content:center;gap:10px;"><div class="neo-loader"></div><span class="text-slate-400 text-sm font-bold">جاري التحميل...</span></div></td></tr>';

    gsRun('getTopUsers', [adminPass, search], function(data) {
        if (!data || data.error) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-400 font-bold">خطأ: ' + esc((data && data.error) || '') + '</td></tr>'; return; }
        if (!data.users || data.users.length === 0) { tbody.innerHTML = '<tr><td colspan="4" class="text-center py-10 text-slate-400">لا توجد بيانات' + (search ? ' مطابقة' : '') + '</td></tr>'; return; }
        var medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        tbody.innerHTML = data.users.map(function(u) {
            return '<tr><td class="text-center font-black text-lg">' + (medals[u.rank] || u.rank) + '</td><td class="font-mono text-sm">' + esc(u.id) + '</td><td class="font-bold">' + esc(u.name || '—') + '</td><td><span class="badge badge--blue">' + u.count + ' مرة</span></td></tr>';
        }).join('');
    }, function(err){ tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-400 font-bold">فشل التحميل: ' + esc(err && err.message || '') + '</td></tr>'; });
}
function debounceUsersSearch() { clearTimeout(usersSearchTimer); usersSearchTimer = setTimeout(loadTopUsers, 500); }

/* ==========================================
   إدارة الشيتات
   ========================================== */
function loadSheets() {
    var grid = document.getElementById('sheetsGrid');
    grid.innerHTML = '<div class="flex items-center justify-center py-10 gap-3 text-slate-400"><div class="neo-loader"></div><span class="font-bold text-sm">جاري التحميل...</span></div>';
    gsRun('getAllSheets', [adminPass], function(data) {
        if (!data || data.error) { grid.innerHTML = '<div class="text-center py-10 text-red-400 font-bold">خطأ: ' + esc((data && data.error) || '') + '</div>'; return; }
        if (!data.sheets || data.sheets.length === 0) { grid.innerHTML = '<div class="text-center py-10 text-slate-400 font-bold">لا توجد شيتات بيانات</div>'; return; }
        grid.innerHTML = data.sheets.map(function(s) {
            var eyeOff = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
            var eyeOn  = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
            return '<div class="sheet-card' + (s.disabled ? ' disabled' : '') + '">'
                + '<div class="stat-card__icon ' + (s.disabled ? 'bg-slate-50' : 'bg-blue-50') + '" style="width:44px;height:44px;"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 ' + (s.disabled ? 'text-slate-400' : 'text-blue-600') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>'
                + '<div class="flex-1 min-w-0"><p class="font-black text-slate-800 text-sm">' + esc(s.name) + '</p><p class="text-xs text-slate-400">' + (s.rowCount || 0).toLocaleString() + ' سجل</p></div>'
                + '<span class="badge ' + (s.disabled ? 'badge--gray' : 'badge--green') + '">' + esc(s.status) + '</span>'
                + '<div class="flex gap-2">'
                + '<button onclick="toggleSheet(\'' + esc(s.name) + '\')" class="neo-btn neo-btn--icon neo-btn--sm ' + (s.disabled ? 'neo-btn--success' : 'neo-btn--neutral') + '" title="' + (s.disabled ? 'تفعيل' : 'تعطيل') + '"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + (s.disabled ? eyeOn : eyeOff) + '</svg></button>'
                + '<button onclick="confirmDeleteSheet(\'' + esc(s.name) + '\')" class="neo-btn neo-btn--icon neo-btn--sm neo-btn--danger" title="حذف"><svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></button>'
                + '</div></div>';
        }).join('');
    }, function(err){ grid.innerHTML = '<div class="text-center py-10 text-red-400 font-bold">فشل التحميل: ' + esc(err && err.message || '') + '</div>'; });
}

function confirmDeleteSheet(name) {
    openConfirm('حذف الشيت', 'سيتم حذف شيت "' + name + '" مع جميع بياناته نهائياً. هذا الإجراء لا يمكن التراجع عنه.', function() {
        gsRun('deleteSheetByName', [name, adminPass], function(res) {
            if (res && res.success) { showToast('تم حذف الشيت بنجاح', 'success'); loadSheets(); }
            else showToast('خطأ: ' + (res && res.error || ''), 'error');
        }, function(){ showToast('فشل الاتصال بالخادم', 'error'); });
    });
}

function toggleSheet(name) {
    gsRun('toggleSheetStatus', [name, adminPass], function(res) {
        if (res && res.success) { showToast(res.disabled ? 'تم تعطيل الشيت' : 'تم تفعيل الشيت', 'success'); loadSheets(); }
        else showToast('خطأ: ' + (res && res.error || ''), 'error');
    }, function(){ showToast('فشل الاتصال', 'error'); });
}

/* ==========================================
   رفع البيانات
   ========================================== */
function updateFileName(input) {
    var d = document.getElementById('fileNameDisplay');
    if (input.files && input.files[0]) { d.textContent = input.files[0].name; d.style.color = '#1e293b'; d.style.fontWeight = '700'; }
    else { d.textContent = 'اختر ملف Excel...'; d.style.color = ''; d.style.fontWeight = ''; }
}

function handleUpload() {
    var fileInput = document.getElementById('excelFile');
    var sheetName = document.getElementById('newSheetName').value.trim();
    var btn       = document.getElementById('uploadBtn');
    var resDiv    = document.getElementById('uploadResult');
    if (!fileInput.files[0] || !sheetName) { showToast('يرجى اختيار ملف وكتابة اسم الشيت', 'error'); return; }
    btn.disabled = true;
    document.getElementById('uploadContent').classList.add('hidden');
    document.getElementById('uploadLoader').classList.remove('hidden');
    resDiv.classList.add('hidden');

    var reader = new FileReader();
    reader.onload = function(e) {
        var wb  = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        var data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
        gsRun('processUpload', [data, sheetName, adminPass], function(res) {
            btn.disabled = false;
            document.getElementById('uploadContent').classList.remove('hidden');
            document.getElementById('uploadLoader').classList.add('hidden');
            if (res && res.success) {
                showToast('تم رفع الشيت بنجاح', 'success');
                resDiv.innerHTML = '<div class="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 font-bold text-sm text-center">✓ تم رفع بيانات "' + esc(sheetName) + '" بنجاح</div>';
                resDiv.classList.remove('hidden');
                document.getElementById('newSheetName').value = '';
                fileInput.value = '';
                document.getElementById('fileNameDisplay').textContent = 'اختر ملف Excel...';
            } else {
                var errMsg = (res && res.error) || 'خطأ غير معروف';
                showToast('خطأ: ' + errMsg, 'error');
                resDiv.innerHTML = '<div class="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold text-sm text-center">✗ ' + esc(errMsg) + '</div>';
                resDiv.classList.remove('hidden');
            }
        }, function(err) {
            btn.disabled = false;
            document.getElementById('uploadContent').classList.remove('hidden');
            document.getElementById('uploadLoader').classList.add('hidden');
            showToast('فشل الاتصال بالخادم', 'error');
        });
    };
    reader.readAsArrayBuffer(fileInput.files[0]);
}

/* ==========================================
   النظام
   ========================================== */
function loadSystemInfo() {
    gsRun('getSystemInfo', [adminPass], function(data) {
        if (!data || data.error) return;
        document.getElementById('sysInfoGrid').innerHTML = [
            mkStat('bg-slate-50','text-slate-600','<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>','إجمالي الشيتات', data.totalSheets, 'بما فيها النظامية'),
            mkStat('bg-blue-50','text-blue-600','<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>','شيتات البيانات', data.dataSheets, 'شيتات الرواتب'),
            mkStat('bg-emerald-50','text-emerald-600','<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>','إجمالي السجلات', data.totalLogs.toLocaleString(), 'في سجل الاستعلامات'),
            mkStat('bg-amber-50','text-amber-600','<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>','آخر دخول', (data.lastAdminLogin || '—').substring(0,16), 'قبل الدخول الحالي')
        ].join('');
    }, null);

    gsRun('getAdminActivity', [adminPass], function(data) {
        var tbody = document.getElementById('adminLogBody');
        if (!data || !data.rows || data.rows.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-slate-400">لا توجد سجلات نشاط بعد</td></tr>'; return; }
        tbody.innerHTML = data.rows.slice(0,30).map(function(r){ return '<tr><td class="text-xs text-slate-400 whitespace-nowrap">' + esc(r.date) + '</td><td class="font-bold">' + esc(r.action) + '</td><td class="text-slate-500 text-sm">' + esc(r.details) + '</td></tr>'; }).join('');
    }, function(){ document.getElementById('adminLogBody').innerHTML = '<tr><td colspan="3" class="text-center py-6 text-red-400">فشل التحميل</td></tr>'; });

    gsRun('getErrorLogEntries', [adminPass], function(data) {
        var tbody = document.getElementById('errorLogBody');
        if (!data || !data.rows || data.rows.length === 0) { tbody.innerHTML = '<tr><td colspan="3" class="text-center py-6 text-emerald-500 font-bold">✓ لا توجد أخطاء مسجلة</td></tr>'; return; }
        tbody.innerHTML = data.rows.slice(0,30).map(function(r){ return '<tr><td class="text-xs text-slate-400 whitespace-nowrap">' + esc(r.date) + '</td><td class="text-red-600 text-sm">' + esc(r.error) + '</td><td><span class="badge badge--gray">' + esc(r.source) + '</span></td></tr>'; }).join('');
    }, function(){ document.getElementById('errorLogBody').innerHTML = '<tr><td colspan="3" class="text-center py-6 text-red-400">فشل التحميل</td></tr>'; });
}

/* ==========================================
   ★ البحث الذكي بالاسم
   ========================================== */
function debounceNameSearch() {
    clearTimeout(nameSearchTimer);
    nameSearchTimer = setTimeout(function() {
        var val = (document.getElementById('adminNameSearchInput').value || '').trim();
        if (val.length >= 2) performNameSearch();
    }, 600);
}

function performNameSearch() {
    if (!adminPass) return;
    var nameQuery = (document.getElementById('adminNameSearchInput').value || '').trim();
    if (nameQuery.length < 2) {
        showToast('يرجى إدخال حرفين على الأقل للبحث', 'warn');
        return;
    }
    var monthYear = document.getElementById('adminNameSearchMonth').value;
    var btn       = document.getElementById('adminNameSearchBtn');
    btn.disabled  = true;
    document.getElementById('adminSearchBtnContent').classList.add('hidden');
    document.getElementById('adminSearchBtnLoader').classList.remove('hidden');

    gsRun('searchByName', [adminPass, nameQuery, monthYear], function(data) {
        btn.disabled = false;
        document.getElementById('adminSearchBtnContent').classList.remove('hidden');
        document.getElementById('adminSearchBtnLoader').classList.add('hidden');

        if (!data) { showToast('لم يُرسَل رد من الخادم', 'error'); return; }
        if (data.error) { showToast('خطأ: ' + data.error, 'error'); return; }

        renderNameSearchResults(data.results || [], nameQuery);
    }, function(err) {
        btn.disabled = false;
        document.getElementById('adminSearchBtnContent').classList.remove('hidden');
        document.getElementById('adminSearchBtnLoader').classList.add('hidden');
        showToast('فشل الاتصال: ' + (err && err.message || ''), 'error');
    }, { timeout: 45000, retries: 1 });
}

function renderNameSearchResults(results, query) {
    var container = document.getElementById('adminNameSearchResults');
    var tbody     = document.getElementById('adminNameSearchBody');
    var countEl   = document.getElementById('adminNameSearchCount');

    container.classList.remove('hidden');

    if (!results || results.length === 0) {
        countEl.textContent = 'لم يتم العثور على نتائج لـ "' + query + '"';
        tbody.innerHTML = '<tr><td colspan="6"><div class="admin-search-empty">لا يوجد موظف باسم يحتوي على "' + esc(query) + '"</div></td></tr>';
        return;
    }

    countEl.textContent = 'تم العثور على ' + results.length + ' نتيجة لـ "' + query + '"' + (results.length >= 80 ? ' (أول 80)' : '');

    tbody.innerHTML = results.map(function(r, i) {
        var score = parseInt(r.score) || 0;
        var scoreCls   = score >= 80 ? 'score-badge--high' : (score >= 50 ? 'score-badge--mid' : 'score-badge--low');
        var scoreLabel = score >= 80 ? 'ممتاز' : (score >= 50 ? 'جيد' : 'جزئي');
        var safeId    = esc(r.id || '').replace(/'/g, "\\'");
        var safeSheet = esc(r.sheet || '').replace(/'/g, "\\'");
        return '<tr class="admin-result-row" onclick="adminViewSlip(\'' + safeId + '\', \'' + safeSheet + '\')" title="انقر لعرض قسيمة الراتب">'
            + '<td class="text-slate-400 text-xs font-mono">' + (i + 1) + '</td>'
            + '<td class="font-black text-slate-800">' + esc(r.name) + '<br><span class="slip-link-hint">انقر لعرض القسيمة ←</span></td>'
            + '<td class="font-mono text-sm text-slate-600">' + esc(r.id || '—') + '</td>'
            + '<td><span class="badge badge--blue">' + esc(r.sheet) + '</span></td>'
            + '<td class="font-bold text-emerald-700">' + esc(r.net) + ' <span class="text-xs text-slate-400 font-normal">ل.س</span></td>'
            + '<td><span class="score-badge ' + scoreCls + '">' + scoreLabel + '</span></td>'
            + '</tr>';
    }).join('');
}

function clearNameSearchResults() {
    document.getElementById('adminNameSearchResults').classList.add('hidden');
    document.getElementById('adminNameSearchBody').innerHTML = '';
    document.getElementById('adminNameSearchCount').textContent = '';
}

/* ==========================================
   ★ عرض قسيمة راتب من نتائج البحث بالاسم
   ========================================== */
function adminViewSlip(id, sheet) {
    if (!id || !sheet) { showToast('بيانات الموظف غير مكتملة', 'warn'); return; }

    var modal   = document.getElementById('adminSlipModal');
    var loading = document.getElementById('adminSlipLoading');
    var content = document.getElementById('adminSlipContent');

    loading.style.display = 'flex';
    content.style.display = 'none';
    document.getElementById('adminSlipModalTitle').textContent = 'جاري تحميل قسيمة الراتب...';
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    gsRun('getResult', [id, sheet], function(data) {
        if (!data || data.error) {
            closeAdminSlipModal();
            var errMsgs = {
                'error_month': 'الشهر المحدد غير موجود',
                'error_id': 'الرقم الوطني غير موجود في هذا الشهر',
                'error_system': 'خطأ في النظام'
            };
            showToast(errMsgs[data && data.error] || 'فشل تحميل القسيمة', 'error');
            return;
        }

        document.getElementById('adminSlipResName').textContent = data.info && data.info[0] ? data.info[0].v : '—';
        document.getElementById('adminSlipSheet').textContent   = 'شهر: ' + sheet;
        document.getElementById('adminSlipResNet').textContent  = data.netValue || '0';
        document.getElementById('adminSlipResDate').textContent = data.salaryDate || '—';
        document.getElementById('adminSlipModalTitle').textContent = data.info && data.info[0] ? data.info[0].v : 'قسيمة الراتب';

        var infoHtml = '';
        if (data.info) {
            data.info.forEach(function(item) {
                infoHtml += '<div class="neo-field"><span class="neo-field__label">' + esc(item.h) + '</span><p class="neo-field__value">' + esc(item.v) + '</p></div>';
            });
        }
        document.getElementById('adminSlipInfoList').innerHTML = infoHtml || '<p class="text-slate-400 text-sm">لا توجد تفاصيل</p>';

        var allowHtml = '';
        if (data.allowances && data.allowances.length > 0) {
            data.allowances.forEach(function(a) {
                allowHtml += '<div class="neo-field"><span class="neo-field__label">' + esc(a.name) + '</span><p class="neo-field__value text-emerald-700">' + esc(absStr(a.val)) + ' ل.س</p></div>';
            });
        } else {
            allowHtml = '<p class="text-slate-400 text-sm text-center py-4">لا توجد تعويضات</p>';
        }
        document.getElementById('adminSlipAllowanceTable').innerHTML = allowHtml;

        var dedHtml = '';
        if (data.deductions && data.deductions.length > 0) {
            data.deductions.forEach(function(d) {
                var isRetrieval = (d.name === 'استردادات');
                var labelHtml = isRetrieval
                    ? '<span class="neo-field__label" style="display:flex;align-items:center;gap:6px;">' + esc(d.name) + ' <span style="display:inline-flex;padding:2px 8px;border-radius:99px;background:#dbeafe;color:#1d4ed8;font-size:0.65rem;font-weight:900;">استرداد</span></span>'
                    : '<span class="neo-field__label">' + esc(d.name) + '</span>';
                var valColor = isRetrieval ? 'text-blue-600' : 'text-rose-700';
                dedHtml += '<div class="neo-field">' + labelHtml + '<p class="neo-field__value ' + valColor + '">' + esc(absStr(d.val)) + ' ل.س</p></div>';
            });
        } else {
            dedHtml = '<p class="text-slate-400 text-sm text-center py-4">لا توجد حسميات</p>';
        }
        document.getElementById('adminSlipDeductionTable').innerHTML = dedHtml;

        loading.style.display = 'none';
        content.style.display = 'block';

    }, function(err) {
        closeAdminSlipModal();
        showToast('فشل الاتصال: ' + (err && err.message || ''), 'error');
    }, { timeout: 45000, retries: 1 });
}

function closeAdminSlipModal() {
    document.getElementById('adminSlipModal').classList.remove('open');
    document.body.style.overflow = '';
}

/* ==========================================
   الاستعلام العام (للمستخدمين)
   ========================================== */
function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(String(str || '')));
    return d.innerHTML;
}

/* إزالة إشارة +/- من القيم المعروضة (UI فقط — لا تأثير على البيانات) */
function absStr(val) {
    return String(val || '').replace(/^[\u202a\u202b\u200f\u200e+\-\s]+/, '').trim();
}

function fetchData() {
    var nationalId = (document.getElementById('nationalId').value || '').trim();
    var monthYear  = document.getElementById('monthSelect').value;
    if (!nationalId) { showError('يرجى إدخال الرقم الوطني'); return; }

    document.getElementById('searchBtn').disabled = true;
    document.getElementById('btnContent').classList.add('hidden');
    document.getElementById('btnLoader').classList.remove('hidden');
    document.getElementById('errorMsg').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');

    gsRun('getResult', [nationalId, monthYear], function(data) {
        document.getElementById('searchBtn').disabled = false;
        document.getElementById('btnContent').classList.remove('hidden');
        document.getElementById('btnLoader').classList.add('hidden');

        if (data && data.error) {
            var msgs = {
                'error_month': 'الشهر المحدد غير موجود أو تم تعطيله',
                'error_id': 'الرقم الوطني غير موجود في هذا الشهر',
                'error_system': 'حدث خطأ في النظام، يرجى المحاولة مجدداً'
            };
            showError(msgs[data.error] || 'خطأ غير معروف');
            return;
        }

        renderResult(data);
    }, function(err) {
        document.getElementById('searchBtn').disabled = false;
        document.getElementById('btnContent').classList.remove('hidden');
        document.getElementById('btnLoader').classList.add('hidden');
        showError('فشل الاتصال بالخادم: ' + (err && err.message || 'خطأ غير معروف'));
    }, { timeout: 45000, retries: 1 });
}

function showError(msg) {
    document.getElementById('errorText').textContent = msg;
    document.getElementById('errorMsg').classList.remove('hidden');
}

function renderResult(data) {
    if (!data) return;
    document.getElementById('resName').textContent = data.info && data.info[0] ? data.info[0].v : '—';
    document.getElementById('resNet').textContent  = data.netValue || '0';
    document.getElementById('resDate').textContent = data.salaryDate || '—';

    var infoHtml = '';
    if (data.info) {
        data.info.forEach(function(item) {
            infoHtml += '<div class="neo-field"><span class="neo-field__label">' + esc(item.h) + '</span><p class="neo-field__value">' + esc(item.v) + '</p></div>';
        });
    }
    document.getElementById('infoList').innerHTML = infoHtml;

    var allowHtml = '';
    if (data.allowances && data.allowances.length > 0) {
        data.allowances.forEach(function(a) {
            allowHtml += '<div class="neo-field"><span class="neo-field__label">' + esc(a.name) + '</span><p class="neo-field__value text-emerald-700">' + esc(absStr(a.val)) + ' ل.س</p></div>';
        });
        document.getElementById('allowanceSection').classList.remove('hidden');
    } else {
        document.getElementById('allowanceSection').classList.add('hidden');
    }
    document.getElementById('allowanceTable').innerHTML = allowHtml;

    var dedHtml = '';
    if (data.deductions && data.deductions.length > 0) {
        data.deductions.forEach(function(d) {
            var isRetrieval = (d.name === 'استردادات');
            var labelHtml = isRetrieval
                ? '<span class="neo-field__label" style="display:flex;align-items:center;gap:6px;">' + esc(d.name) + ' <span style="display:inline-flex;padding:2px 8px;border-radius:99px;background:#dbeafe;color:#1d4ed8;font-size:0.65rem;font-weight:900;">استرداد</span></span>'
                : '<span class="neo-field__label">' + esc(d.name) + '</span>';
            var valColor = isRetrieval ? 'text-blue-600' : 'text-rose-700';
            dedHtml += '<div class="neo-field">' + labelHtml + '<p class="neo-field__value ' + valColor + '">' + esc(absStr(d.val)) + ' ل.س</p></div>';
        });
        document.getElementById('deductionSection').classList.remove('hidden');
    } else {
        document.getElementById('deductionSection').classList.add('hidden');
    }
    document.getElementById('deductionTable').innerHTML = dedHtml;

    document.getElementById('results').classList.remove('hidden');
    setTimeout(function() {
        document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

/* ==========================================
   زر التمرير
   ========================================== */
var scrollBtn = document.getElementById('scrollDownBtn');
function checkScrollBtn() {
    var atBottom = (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 80;
    scrollBtn.classList.toggle('hidden-btn', atBottom);
}
window.addEventListener('scroll', checkScrollBtn, { passive: true });
checkScrollBtn();
scrollBtn.addEventListener('click', function() {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

/* Escape للمودالات */
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        if (document.getElementById('adminSlipModal').classList.contains('open')) closeAdminSlipModal();
        if (document.getElementById('confirmModal').classList.contains('open')) closeConfirm();
        if (!document.getElementById('passwordModal').classList.contains('hidden')) closePasswordModal();
    }
});

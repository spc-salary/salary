(function () {
  'use strict';
  var config = window.SALARY_APP_CONFIG;
  function withTimeout(ms) { var controller = new AbortController(); var timer = setTimeout(function () { controller.abort(); }, ms); return { controller: controller, clear: function () { clearTimeout(timer); } }; }
  function normalizeResponse(response) {
    if (!response.ok) throw new Error('الخادم أعاد الحالة ' + response.status);
    return response.text().then(function (text) {
      var value;
      try { value = text ? JSON.parse(text) : {}; } catch (e) { throw new Error('استجابة غير صالحة من الخادم'); }
      if (value && value.success === false) throw new Error(value.message || (value.error && value.error.message) || 'فشل تنفيذ الطلب');
      return value;
    });
  }
  async function request(method, name, args, options, query) {
    options = options || {}; var timeout = options.timeout || config.requestTimeoutMs; var retries = options.retries == null ? config.retries : options.retries; var lastError;
    for (var attempt = 0; attempt <= retries; attempt++) {
      var guard = withTimeout(timeout);
      try {
        var url = new URL(config.apiUrl); url.searchParams.set('action', name);
        Object.keys(query || {}).forEach(function (key) {
          if (query[key] !== undefined && query[key] !== null && query[key] !== '') url.searchParams.set(key, String(query[key]));
        });
        var init = { method: method, signal: guard.controller.signal, headers: { Accept: 'application/json' } };
        if (method === 'POST') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify({ action: name, args: args || [] }); }
        var result = await fetch(method === 'GET' ? url.toString() : config.apiUrl, init).then(normalizeResponse); guard.clear();
        if (result && result.data !== undefined) return result.data;
        return result;
      } catch (error) { guard.clear(); lastError = error.name === 'AbortError' ? new Error('انتهت مهلة الاتصال') : error; if (attempt < retries) await AppUtils.sleep(config.retryDelayMs * (attempt + 1)); }
    }
    throw lastError || new Error('تعذر الوصول إلى الخادم');
  }
  function normalizeDigits(value) { return String(value || '').replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }); }
  function formatNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-US') : '0';
  }
  function buildSalaryResult(rows, sheet) {
    rows = Array.isArray(rows) ? rows : [];
    if (!rows.length) return { error: 'error_id' };
    var first = rows[0];
    var allowances = [], deductions = [], seen = {};
    rows.forEach(function (row) {
      var label = String(row['نص'] || row['النص'] || row['البيان'] || '').trim();
      var amount = Number(row['قيمة'] !== undefined ? row['قيمة'] : row['القيمة']);
      if (!label || !Number.isFinite(amount) || amount === 0) return;
      var key = label + '_' + amount;
      if (seen[key]) return;
      seen[key] = true;
      var entry = { name: label, val: formatNumber(Math.abs(amount)) };
      if (amount > 0) allowances.push(entry); else deductions.push(entry);
    });
    return {
      info: [
        { h: 'الاسم الكامل', v: String(first['اسم'] || first['الاسم'] || '') },
        { h: 'الراتب المقطوع', v: formatNumber(first['مقطوع'] || first['المقطوع']) }
      ],
      allowances: allowances,
      deductions: deductions,
      netValue: formatNumber(first['صافي'] || first['الصافي']),
      salaryDate: String(first['تاريخ'] || first['التاريخ'] || sheet || '')
    };
  }
  async function getSheets(options) {
    var sheets = await request('GET', 'getSheets', [], options);
    return (Array.isArray(sheets) ? sheets : []).filter(function (sheet) {
      return sheet && /^\d{1,2}-202\d$/.test(String(sheet.name || ''));
    }).sort(function (a, b) {
      var pa = String(a.name).split('-'), pb = String(b.name).split('-');
      return Number(pb[1] + String(pb[0]).padStart(2, '0')) - Number(pa[1] + String(pa[0]).padStart(2, '0'));
    }).map(function (sheet) { return sheet.name; });
  }
  async function searchRows(query, sheet, options) {
    return request('GET', 'search', [], options, { q: query, sheet: sheet });
  }
  window.SalaryApi = {
    call: async function (name, args, options) {
      args = args || [];
      if (name === 'checkAdminAuth') {
        var health = await request('GET', 'health', [], options);
        if (health && health.authEnabled === false) throw new Error('المصادقة الإدارية غير مفعّلة في خدمة REST الحالية');
        return false;
      }
      if (name === 'getResult') {
        var rows = await searchRows(normalizeDigits(args[0]), args[1], options);
        return buildSalaryResult(rows, args[1]);
      }
      if (name === 'getAllSheets') {
        var names = await getSheets(options);
        return { sheets: names.map(function (name) { return { name: name, rowCount: 0, disabled: false, status: 'نشط' }; }) };
      }
      if (name === 'searchByName') {
        var nameQuery = args[1] || '';
        var target = args[2] && args[2] !== 'all' ? [args[2]] : await getSheets(options);
        var results = [];
        for (var i = 0; i < Math.min(target.length, 12); i++) {
          var found = await searchRows(nameQuery, target[i], options);
          (Array.isArray(found) ? found : []).forEach(function (row) {
            var id = normalizeDigits(row['وطني'] || row['الرقم الوطني'] || '');
            var name = String(row['اسم'] || row['الاسم'] || '');
            if (!name) return;
            if (!results.some(function (item) { return item.id === id && item.sheet === target[i]; })) {
              results.push({ name: name, id: id, sheet: target[i], net: formatNumber(row['صافي'] || row['الصافي']), base: formatNumber(row['مقطوع'] || row['المقطوع']), score: 80 });
            }
          });
        }
        return { results: results.slice(0, 80), total: Math.min(results.length, 80) };
      }
      return request('GET', name, args, options);
    },
    callPost: function (name, args, options) { return request('POST', name, args, options); },
    getMonths: getSheets,
    getSheets: getSheets
  };
})();

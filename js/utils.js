(function () {
  'use strict';
  window.AppUtils = {
    isValidNationalId: function (value) { return /^[0-9٠-٩]{3,}$/.test(String(value || '').trim()); },
    toEnglishDigits: function (value) { return String(value || '').replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)); }); },
    escapeHtml: function (value) { var el = document.createElement('textarea'); el.textContent = value == null ? '' : String(value); return el.innerHTML; },
    sleep: function (ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); },
    today: function () { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  };
})();

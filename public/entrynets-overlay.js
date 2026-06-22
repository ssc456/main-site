(function () {
  var ROOT_ID = 'entrynets-overlay-root';
  var STYLE_ID = 'entrynets-overlay-style';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = "\n      #" + ROOT_ID + " {\n        position: fixed;\n        inset: auto 1rem 1rem 1rem;\n        z-index: 9999;\n        font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;\n      }\n\n      #" + ROOT_ID + " .entrynets-banner {\n        display: flex;\n        align-items: center;\n        justify-content: space-between;\n        gap: 1rem;\n        border-radius: 20px;\n        background: rgba(10, 18, 37, 0.92);\n        color: #f8fafc;\n        padding: 1rem 1.25rem;\n        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.35);\n        backdrop-filter: blur(12px);\n      }\n\n      #" + ROOT_ID + " .entrynets-copy {\n        min-width: 0;\n      }\n\n      #" + ROOT_ID + " .entrynets-label {\n        display: block;\n        margin-bottom: 0.25rem;\n        font-size: 0.72rem;\n        letter-spacing: 0.28em;\n        text-transform: uppercase;\n        color: #7dd3fc;\n      }\n\n      #" + ROOT_ID + " .entrynets-title {\n        margin: 0;\n        font-size: 0.98rem;\n        font-weight: 600;\n        color: white;\n      }\n\n      #" + ROOT_ID + " .entrynets-subtitle {\n        margin: 0.2rem 0 0;\n        color: rgba(226, 232, 240, 0.82);\n        font-size: 0.88rem;\n      }\n\n      #" + ROOT_ID + " .entrynets-actions {\n        display: flex;\n        align-items: center;\n        gap: 0.75rem;\n        flex-shrink: 0;\n      }\n\n      #" + ROOT_ID + " .entrynets-link {\n        display: inline-flex;\n        align-items: center;\n        justify-content: center;\n        min-height: 44px;\n        border-radius: 999px;\n        background: linear-gradient(135deg, #67e8f9, #22d3ee);\n        color: #082f49;\n        text-decoration: none;\n        font-weight: 700;\n        padding: 0 1rem;\n      }\n\n      #" + ROOT_ID + " .entrynets-pill {\n        border: 1px solid rgba(148, 163, 184, 0.35);\n        border-radius: 999px;\n        color: #cbd5e1;\n        padding: 0.45rem 0.8rem;\n        font-size: 0.82rem;\n      }\n\n      @media (max-width: 720px) {\n        #" + ROOT_ID + " .entrynets-banner {\n          flex-direction: column;\n          align-items: stretch;\n        }\n\n        #" + ROOT_ID + " .entrynets-actions {\n          width: 100%;\n          justify-content: space-between;\n        }\n\n        #" + ROOT_ID + " .entrynets-link {\n          flex: 1;\n        }\n      }\n    ";

    document.head.appendChild(style);
  }

  function getRoot() {
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }

    return root;
  }

  function createOverlay(options) {
    var config = Object.assign({
      siteKey: '',
      billingBaseUrl: '',
      refreshMs: 30000,
      label: 'Entry Nets Free Version',
      title: 'You are viewing the free version of this website',
      subtitle: 'Upgrade through Entry Nets to remove this banner.',
      ctaText: 'Upgrade now'
    }, options || {});

    if (!config.siteKey) {
      throw new Error('siteKey is required to mount the Entry Nets overlay');
    }

    if (!config.billingBaseUrl) {
      throw new Error('billingBaseUrl is required to mount the Entry Nets overlay');
    }

    injectStyles();
    var root = getRoot();
    var intervalId = null;
    var destroyed = false;

    function clearBanner() {
      root.innerHTML = '';
    }

    function renderBanner(status) {
      if (status.paymentTier !== 'FREE') {
        clearBanner();
        return;
      }

      var returnUrl = encodeURIComponent(window.location.href);
      var joiner = status.upgradeUrl.indexOf('?') >= 0 ? '&' : '?';
      var upgradeUrl = status.upgradeUrl + joiner + 'returnUrl=' + returnUrl;

      root.innerHTML = "\n        <div class=\"entrynets-banner\" role=\"region\" aria-label=\"Entry Nets free version banner\">\n          <div class=\"entrynets-copy\">\n            <span class=\"entrynets-label\">" + config.label + "</span>\n            <p class=\"entrynets-title\">" + config.title + "</p>\n            <p class=\"entrynets-subtitle\">" + config.subtitle + "</p>\n          </div>\n          <div class=\"entrynets-actions\">\n            <span class=\"entrynets-pill\">" + status.displayName + "</span>\n            <a class=\"entrynets-link\" href=\"" + upgradeUrl + "\">" + config.ctaText + "</a>\n          </div>\n        </div>\n      ";
    }

    function refreshStatus() {
      if (destroyed) {
        return Promise.resolve();
      }

      return fetch(config.billingBaseUrl.replace(/\/$/, '') + '/api/overlay-site-status?siteKey=' + encodeURIComponent(config.siteKey))
        .then(function (response) {
          if (!response.ok) {
            clearBanner();
            return null;
          }

          return response.json();
        })
        .then(function (status) {
          if (status) {
            renderBanner(status);
          }
        })
        .catch(function (error) {
          console.warn('[Entry Nets Overlay] Failed to refresh status:', error);
        });
    }

    function handleFocus() {
      refreshStatus();
    }

    refreshStatus();
    intervalId = window.setInterval(refreshStatus, config.refreshMs);
    window.addEventListener('focus', handleFocus);

    return {
      refresh: refreshStatus,
      destroy: function () {
        destroyed = true;
        clearBanner();
        if (intervalId) {
          window.clearInterval(intervalId);
        }
        window.removeEventListener('focus', handleFocus);
      }
    };
  }

  window.EntryNetsOverlay = {
    init: createOverlay
  };
})();
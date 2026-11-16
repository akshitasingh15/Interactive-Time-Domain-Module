(function () {
  function dress(brand) {
    var svg = brand.querySelector('svg');
    if (!svg) return;
    var settled = brand.childNodes.length === 2 && brand.querySelector('.brand-mark > svg') && !brand.querySelector('.brand-kicker');
    if (settled) return;
    var mark = brand.querySelector('.brand-mark') || document.createElement('span');
    mark.className = 'brand-mark';
    mark.appendChild(svg);
    var copy = brand.querySelector('.brand-copy') || document.createElement('span');
    copy.className = 'brand-copy';
    copy.innerHTML = '<span class="brand-name"><span class="brand-eeg">EEG</span><span class="brand-rest">Preprocessing Lab</span></span>';
    brand.replaceChildren(mark, copy);
  }

  function dressStatus(bar) {
    var progress = bar.querySelector('.progress');
    var label = bar.querySelector('.progress-label');
    if (!progress || !label) return;
    var status = bar.querySelector('.top-status');
    if (!status) {
      status = document.createElement('div');
      status.className = 'top-status';
    }
    if (status.contains(progress) && status.contains(label)) return;
    status.append(progress, label);
    bar.appendChild(status);
  }

  function boot() {
    var brand = document.querySelector('.brand');
    var bar = document.querySelector('.topbar');
    if (!brand || !bar) return false;
    dress(brand);
    dressStatus(bar);
    if (bar.dataset.dressed) return true;
    bar.dataset.dressed = '1';
    new MutationObserver(function () {
      dress(brand);
      dressStatus(bar);
    }).observe(bar, { childList: true, subtree: true });
    return true;
  }

  if (!boot()) {
    var root = document.getElementById('root') || document.body;
    var wait = new MutationObserver(function () {
      if (boot()) wait.disconnect();
    });
    wait.observe(root, { childList: true, subtree: true });
  }
})();

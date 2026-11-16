(function () {
  var falloff = function (p) { return p * p * (3 - 2 * p); };
  var proximityRadius = 90;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var smoothing = reduce ? 1 : 110;

  function boot() {
    var nav = document.querySelector('.sidenav');
    if (!nav || nav.dataset.lineReady) return false;
    var buttons = Array.prototype.slice.call(nav.querySelectorAll(':scope > button'));
    if (buttons.length < 2) return false;
    nav.dataset.lineReady = '1';

    var labels = buttons.map(function (button) {
      var dot = button.querySelector('.dot');
      var name = Array.prototype.filter.call(button.childNodes, function (node) {
        return node.nodeType === 3;
      }).map(function (node) { return node.textContent; }).join('').trim();
      return { index: dot ? dot.textContent.trim() : '', name: name };
    });

    buttons.forEach(function (button) { button.setAttribute('aria-hidden', 'true'); button.tabIndex = -1; });

    var host = document.createElement('div');
    host.className = 'line-sidebar line-sidebar--markers line-sidebar--scale-tick';
    var list = document.createElement('ul');
    list.className = 'line-sidebar__list';
    host.appendChild(list);

    var itemEls = labels.map(function (label, index) {
      var item = document.createElement('li');
      item.className = 'line-sidebar__item';
      item.tabIndex = 0;
      item.setAttribute('role', 'button');
      item.innerHTML = '<span class="line-sidebar__marker" aria-hidden="true"></span><span class="line-sidebar__label"><span class="line-sidebar__index"></span><span class="line-sidebar__text"></span></span>';
      item.querySelector('.line-sidebar__index').textContent = label.index;
      item.querySelector('.line-sidebar__text').textContent = label.name;
      item.addEventListener('click', function () { activate(index); });
      item.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate(index);
      });
      list.appendChild(item);
      return item;
    });

    var targets = itemEls.map(function () { return 0; });
    var current = itemEls.map(function () { return 0; });
    var activeIndex = -1;
    var raf = 0;
    var last = 0;

    function stepButtons() {
      return Array.prototype.slice.call(nav.querySelectorAll(':scope > button'));
    }

    function paint(now) {
      var dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      var k = 1 - Math.exp(-dt / (Math.max(smoothing, 1) / 1000));
      var moving = false;
      for (var i = 0; i < itemEls.length; i++) {
        var target = Math.max(targets[i] || 0, activeIndex === i ? 1 : 0);
        var next = current[i] + (target - current[i]) * k;
        var settled = Math.abs(target - next) < 0.0015;
        var value = settled ? target : next;
        current[i] = value;
        itemEls[i].style.setProperty('--effect', value.toFixed(4));
        if (!settled) moving = true;
      }
      raf = moving ? requestAnimationFrame(paint) : 0;
    }

    function startLoop() {
      if (raf) cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(paint);
    }

    function sync() {
      var live = stepButtons();
      var next = 0;
      live.forEach(function (button, index) {
        if (button.classList.contains('active')) next = index;
        if (itemEls[index]) itemEls[index].classList.toggle('is-done', button.classList.contains('done'));
      });
      if (next !== activeIndex) {
        activeIndex = next;
        itemEls.forEach(function (item, index) {
          if (index === activeIndex) item.setAttribute('aria-current', 'true');
          else item.removeAttribute('aria-current');
        });
        startLoop();
      }
    }

    function activate(index) {
      var live = stepButtons();
      if (!live[index]) return;
      activeIndex = index;
      itemEls.forEach(function (item, i) {
        if (i === index) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      });
      startLoop();
      live[index].click();
    }

    list.addEventListener('pointermove', function (event) {
      var rect = list.getBoundingClientRect();
      var pointerY = event.clientY - rect.top;
      for (var i = 0; i < itemEls.length; i++) {
        var center = itemEls[i].offsetTop + itemEls[i].offsetHeight / 2;
        var distance = Math.abs(pointerY - center);
        targets[i] = falloff(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoop();
    });

    list.addEventListener('pointerleave', function () {
      targets = targets.map(function () { return 0; });
      startLoop();
    });

    nav.insertBefore(host, nav.firstChild);
    sync();
    startLoop();

    new MutationObserver(function () {
      if (!nav.contains(host)) nav.insertBefore(host, nav.firstChild);
      sync();
    }).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

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

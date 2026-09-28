/* Local theme tab. npm update replaces this file. */
(function () {
  var KEY = "pi-bg-settings";
  var IMG = "pi-bg-image";

  function clampNum(v, d, min, max) {
    var n = Number(v);
    if (!Number.isFinite(n)) return d;
    return Math.min(max, Math.max(min, n));
  }

  function normalizeSettings(raw) {
    raw = raw || {};
    return {
      opacity: clampNum(raw.opacity, 100, 0, 100),
      mask: clampNum(raw.mask, 20, 0, 80),
      contrast: clampNum(raw.contrast, 100, 50, 160),
    };
  }

  function cssUrl(url) {
    return 'url("' + String(url).replace(/["\\\n\r]/g, "") + '")';
  }

  if (typeof window === "undefined") {
    var a = normalizeSettings({ opacity: 999, mask: -4, contrast: "x" });
    var b = normalizeSettings({ opacity: 40, mask: 15, contrast: 130 });
    if (a.opacity !== 100 || a.mask !== 0 || a.contrast !== 100) throw new Error("bad " + JSON.stringify(a));
    if (b.opacity !== 40 || b.mask !== 15 || b.contrast !== 130) throw new Error("bad2");
    if (cssUrl("data:image/jpeg;base64,aa") !== 'url("data:image/jpeg;base64,aa")') throw new Error("url");
    console.log("ok");
    return;
  }

  var themeOn = false;

  function load() {
    try {
      return normalizeSettings(JSON.parse(localStorage.getItem(KEY) || "{}"));
    } catch (e) {
      return normalizeSettings();
    }
  }

  function imageUrl() {
    try {
      var saved = localStorage.getItem(IMG);
      if (saved && saved.indexOf("data:image/") === 0) return saved;
    } catch (e) {}
    return "/user-bg.png";
  }

  function apply() {
    var s = load();
    var root = document.documentElement;
    root.style.setProperty("--pi-image", cssUrl(imageUrl()));
    root.style.setProperty("--pi-opacity", String(s.opacity / 100));
    root.style.setProperty("--pi-mask", String(s.mask / 100));
    root.style.setProperty("--pi-contrast", String(s.contrast / 100));
  }

  function save(partial) {
    var next = load();
    if (partial.opacity != null) next.opacity = partial.opacity;
    if (partial.mask != null) next.mask = partial.mask;
    if (partial.contrast != null) next.contrast = partial.contrast;
    next = normalizeSettings(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch (e) {}
    apply();
    return next;
  }

  function slider(label, min, max, value, onInput) {
    var wrap = document.createElement("label");
    var row = document.createElement("span");
    row.className = "pi-row";
    var name = document.createElement("span");
    name.textContent = label;
    var num = document.createElement("span");
    num.textContent = String(value);
    row.appendChild(name);
    row.appendChild(num);
    var input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener("input", function () {
      num.textContent = input.value;
      onInput(Number(input.value));
    });
    wrap.appendChild(row);
    wrap.appendChild(input);
    return wrap;
  }

  function buildPanel() {
    var s = load();
    var panel = document.createElement("div");
    panel.id = "pi-theme-panel";
    var title = document.createElement("h3");
    title.textContent = "主题";
    panel.appendChild(title);

    var fileLabel = document.createElement("label");
    var fileName = document.createElement("span");
    fileName.textContent = "照片";
    var file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.addEventListener("change", function () {
      var f = file.files && file.files[0];
      if (!f) return;
      shrink(f).then(function (url) {
        try {
          localStorage.setItem(IMG, url);
        } catch (e) {
          fileName.textContent = "照片太大，没保存";
          return;
        }
        apply();
        fileName.textContent = "照片";
      }).catch(function () {
        fileName.textContent = "这张图打不开";
      });
    });
    fileLabel.appendChild(fileName);
    fileLabel.appendChild(file);
    panel.appendChild(fileLabel);

    panel.appendChild(slider("透明度", 0, 100, s.opacity, function (v) { save({ opacity: v }); }));
    panel.appendChild(slider("蒙版", 0, 80, s.mask, function (v) { save({ mask: v }); }));
    panel.appendChild(slider("对比度", 50, 160, s.contrast, function (v) { save({ contrast: v }); }));

    var actions = document.createElement("div");
    actions.className = "pi-actions";
    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "config-button config-button-secondary";
    reset.textContent = "恢复默认";
    reset.addEventListener("click", function () {
      try {
        localStorage.removeItem(IMG);
        localStorage.removeItem(KEY);
      } catch (e) {}
      apply();
      var old = document.getElementById("pi-theme-panel");
      if (old) old.remove();
      showPanel();
    });
    actions.appendChild(reset);
    panel.appendChild(actions);
    return panel;
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600;
        var w = img.width;
        var h = img.height;
        var scale = Math.min(1, max / Math.max(w, h));
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("bad image"));
      };
      img.src = url;
    });
  }

  function showPanel() {
    var detail = document.querySelector(".settings-dialog-main");
    if (!detail) return;
    if (!document.getElementById("pi-theme-panel")) detail.appendChild(buildPanel());
    var tab = document.getElementById("pi-theme-tab");
    if (tab) tab.setAttribute("aria-current", "page");
    var items = document.querySelectorAll(".settings-section-tab");
    for (var i = 0; i < items.length; i++) {
      if (items[i].id !== "pi-theme-tab") items[i].removeAttribute("aria-current");
    }
  }

  function hidePanel() {
    themeOn = false;
    var panel = document.getElementById("pi-theme-panel");
    if (panel) panel.remove();
    var tab = document.getElementById("pi-theme-tab");
    if (tab) tab.removeAttribute("aria-current");
  }

  function ensureTab() {
    var list = document.querySelector(".settings-section-tabs");
    if (!list) {
      themeOn = false;
      return;
    }
    var btn = document.getElementById("pi-theme-tab");
    if (!btn) {
      btn = document.createElement("button");
      btn.id = "pi-theme-tab";
      btn.type = "button";
      btn.className = "settings-section-tab";
      btn.textContent = "主题";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        themeOn = true;
        showPanel();
      });
      list.appendChild(btn);
    }
    if (themeOn) showPanel();
  }

  document.addEventListener("click", function (e) {
    var item = e.target.closest && e.target.closest(".settings-section-tab");
    if (!item || item.id === "pi-theme-tab") return;
    hidePanel();
  }, true);

  apply();
  ensureTab();
  new MutationObserver(ensureTab).observe(document.documentElement, { childList: true, subtree: true });
})();

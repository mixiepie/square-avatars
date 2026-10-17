(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const restore = [];
  const seen = {};
  let timer;

  const ZERO = {
    borderRadius: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  };

  const flat = (s) => {
    try { return ReactNative.StyleSheet.flatten(s) || {}; } catch { return {}; }
  };
  const hasAv = (v) => {
    if (typeof v === "string") return v.indexOf("avatars/") !== -1;
    if (Array.isArray(v)) return v.some(hasAv);
    if (v && typeof v === "object" && typeof v.uri === "string") return v.uri.indexOf("avatars/") !== -1;
    return false;
  };
  function hasAvatarUrl(props) {
    if (hasAv(props.source)) return true;
    const keys = Object.keys(props);
    if (keys.length > 40) return false;
    for (const k of keys) {
      if (k === "children" || k === "style") continue;
      if (hasAv(props[k])) return true;
    }
    return false;
  }
  // a big, perfectly round box (leaves buttons, bars and small dots alone)
  function isRoundBox(props) {
    const s = flat(props.style);
    return (
      typeof s.width === "number" && s.width === s.height && s.width >= 28 &&
      typeof s.borderRadius === "number" && s.borderRadius >= s.width / 2
    );
  }

  function fix(args) {
    const props = args[1];
    if (!props || typeof props !== "object") return;
    const avatar = hasAvatarUrl(props);
    if (avatar) {
      try {
        const st0 = flat(props.style);
        const key = st0.width + "x" + st0.height;
        if (!seen[key] && Object.keys(seen).length < 8) {
          seen[key] = new Error().stack
            .split("\n").slice(2, 10)
            .map((l) => ((l.match(/at\s+([^\s(]+)/) || [0, l.trim()])[1]).slice(0, 40))
            .join(" < ");
        }
      } catch {}
    }
    if (avatar || isRoundBox(props)) {
      const np = { ...props, style: [props.style, ZERO] };
      if (avatar || "borderRadius" in props) np.borderRadius = 0;
      if ("imageStyle" in props) np.imageStyle = [props.imageStyle, ZERO];
      args[1] = np;
      return args;
    }
  }

  function squareUp(node, depth) {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => squareUp(n, depth + 1)); return; }
    const p = node.props;
    if (!p || typeof p !== "object") return;
    try {
      const st = flat(p.style);
      if (!(typeof st.width === "number" && st.width < 16)) {
        p.style = [p.style, ZERO];
        if ("borderRadius" in p) p.borderRadius = 0;
        if ("imageStyle" in p) p.imageStyle = [p.imageStyle, ZERO];
      }
    } catch {}
    squareUp(p.children, depth + 1);
    if (p.maskElement) squareUp(p.maskElement, depth + 1);
  }

  function patchComp(holder, key) {
    try {
      const t = holder[key];
      const wrap = (_a, res) => { squareUp(res, 0); return res; };
      if (typeof t === "function") unpatches.push(after(key, holder, wrap));
      else if (t && t.type && typeof t.type.render === "function") unpatches.push(after("render", t.type, wrap));
      else if (t && typeof t.type === "function") unpatches.push(after("type", t, wrap));
      else if (t && typeof t.render === "function") unpatches.push(after("render", t, wrap));
    } catch {}
  }

  function setupAvatarModule() {
    try {
      const m = findByProps("CutoutableAvatarImage");
      if (!m) return;
      patchComp(m, "Avatar");
      patchComp(m, "CutoutableAvatarImage");
      const st = m.avatarStyles;
      if (st && typeof st === "object") {
        for (const k of Object.keys(st)) {
          const v = st[k];
          if (!v || typeof v !== "object") continue;
          for (const key of Object.keys(ZERO)) {
            if (typeof v[key] === "number") {
              const orig = v[key];
              try { v[key] = 0; restore.push(() => { v[key] = orig; }); } catch {}
            }
          }
        }
      }
    } catch {}
  }


  // ---- diagnostic: look at what JS hands to the native chat list ----
  const rowSamples = {};
  let chatMethods = [];
  function describe(v, d) {
    if (v === null) return "null";
    if (typeof v === "string") return "s";
    if (typeof v === "number" || typeof v === "boolean") return v;
    if (Array.isArray(v)) return d > 2 ? "[..]" : v.slice(0, 2).map((x) => describe(x, d + 1));
    if (typeof v === "object") {
      if (d > 3) return "{..}";
      const o = {};
      for (const k of Object.keys(v).slice(0, 40)) o[k] = describe(v[k], d + 1);
      return o;
    }
    return typeof v;
  }
  function watchRows(args) {
    try {
      for (const a of args) {
        if (typeof a !== "string" || a.charAt(0) !== "[") continue;
        const rows = JSON.parse(a);
        for (const r of rows) {
          const t = String(r && r.type);
          if (!rowSamples[t] && Object.keys(rowSamples).length < 3) rowSamples[t] = describe(r, 0);
        }
      }
    } catch {}
  }
  function setupChatWatch() {
    try {
      const m = ReactNative.NativeModules.DCDChatManager;
      if (!m) { chatMethods = ["no DCDChatManager"]; return; }
      chatMethods = Object.keys(m).slice(0, 30);
      for (const name of ["updateRows", "createRows"]) {
        if (typeof m[name] === "function") unpatches.push(before(name, m, (args) => { watchRows(args); }));
      }
    } catch (e) { chatMethods = ["err " + String(e).slice(0, 60)]; }
  }

  return {
    onLoad() {
      try { unpatches.push(before("createElement", React, fix)); } catch {}
      try {
        const rt = findByProps("jsx", "jsxs");
        if (rt) { unpatches.push(before("jsx", rt, fix)); unpatches.push(before("jsxs", rt, fix)); }
      } catch {}
      setupAvatarModule();
      setupChatWatch();
      try { vendetta.ui.toasts.showToast("Square Avatars: open a chat, wait 15s"); } catch {}
      timer = setTimeout(() => {
        const report = JSON.stringify({ chatMethods, rowSamples, seen }).slice(0, 3800);
        try {
          findByProps("setString").setString(report);
          vendetta.ui.toasts.showToast("Report copied. Paste it to Claude");
        } catch {}
      }, 15000);
    },
    onUnload() {
      clearTimeout(timer);
      unpatches.forEach((u) => { try { u(); } catch {} });
      restore.forEach((r) => { try { r(); } catch {} });
    },
  };
})();

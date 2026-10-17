(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps, findByName } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const restore = [];
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


  // ---- diagnostic: how does JS feed the chat list? ----
  const info = { rows: {} };
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
  function setupChatWatch() {
    try {
      let nm = null;
      try { nm = ReactNative.NativeModules.DCDChatManager; } catch {}
      let viaProxy = null;
      try { viaProxy = globalThis.nativeModuleProxy && globalThis.nativeModuleProxy.DCDChatManager; } catch {}
      info.native = { nm: !!nm, proxy: !!viaProxy };
      const m = nm || viaProxy;
      if (m) {
        try { info.nativeMethods = Object.getOwnPropertyNames(m).slice(0, 30); } catch {}
        for (const name of ["updateRows", "createRows"]) {
          try {
            if (typeof m[name] === "function") unpatches.push(before(name, m, (args) => {
              for (const a of args) {
                if (typeof a !== "string" || a.charAt(0) !== "[") continue;
                try {
                  for (const r of JSON.parse(a)) {
                    const t = "native:" + String(r && r.type);
                    if (!info.rows[t] && Object.keys(info.rows).length < 3) info.rows[t] = describe(r, 0);
                  }
                } catch {}
              }
            }));
          } catch {}
        }
      }
    } catch (e) { info.nativeErr = String(e).slice(0, 60); }
    try {
      const RM = findByName("RowManager");
      if (!RM || !RM.prototype) { info.rowManager = "not found"; return; }
      info.rowManager = Object.getOwnPropertyNames(RM.prototype).slice(0, 20);
      if (typeof RM.prototype.generate === "function") {
        unpatches.push(after("generate", RM.prototype, (_a, ret) => {
          try {
            const t = "js:" + String(ret && ret.type);
            if (!info.rows[t] && Object.keys(info.rows).length < 4) info.rows[t] = describe(ret, 0);
          } catch {}
        }));
      }
    } catch (e) { info.rowManager = "err " + String(e).slice(0, 60); }
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
        const report = JSON.stringify(info).slice(0, 3800);
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

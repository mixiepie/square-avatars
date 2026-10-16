(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const stats = { calls: 0, srcImg: 0, otherAvatar: 0, box: 0 };
  const samples = {};
  const restore = [];
  const info = {};
  let timer;

  const flat = (s) => {
    try { return ReactNative.StyleSheet.flatten(s) || {}; } catch { return {}; }
  };
  const nameOf = (t) => {
    if (typeof t === "string") return t;
    return (t && (t.displayName || t.name || (t.type && (t.type.displayName || t.type.name)) || (t.render && t.render.name))) || "?";
  };
  const short = (s) => {
    const o = {};
    for (const k of ["width", "height", "borderRadius", "overflow"]) if (s[k] !== undefined) o[k] = s[k];
    return o;
  };
  const hasAv = (v) => {
    if (typeof v === "string") return v.indexOf("avatars/") !== -1;
    if (Array.isArray(v)) return v.some(hasAv);
    if (v && typeof v === "object" && typeof v.uri === "string") return v.uri.indexOf("avatars/") !== -1;
    return false;
  };

  // returns "src" for a normal image, or the prop name for any other prop holding an avatar url
  function avatarKind(props) {
    if (hasAv(props.source)) return "src";
    const keys = Object.keys(props);
    if (keys.length > 40) return null;
    for (const k of keys) {
      if (k === "children" || k === "style") continue;
      if (hasAv(props[k])) return k;
    }
    return null;
  }

  function isRoundBox(props) {
    const s = flat(props.style);
    return (
      typeof s.width === "number" && s.width === s.height && s.width >= 28 &&
      typeof s.borderRadius === "number" && s.borderRadius >= s.width / 2
    );
  }

  function fix(args) {
    stats.calls++;
    const props = args[1];
    if (!props || typeof props !== "object") return;
    const kind = avatarKind(props);
    const box = !kind && isRoundBox(props);
    if (kind || box) {
      if (kind === "src") stats.srcImg++;
      else if (kind) {
        stats.otherAvatar++;
        const n = nameOf(args[0]);
        const id = n + ":" + kind;
        if (!samples[id] && Object.keys(samples).length < 12)
          samples[id] = { keys: Object.keys(props).slice(0, 14), style: short(flat(props.style)) };
      } else stats.box++;
      args[1] = { ...props, style: [props.style, { borderRadius: 0 }] };
      return args;
    }
  }


  function scanModules() {
    const found = {};
    try {
      const mods = vendetta.metro.modules;
      for (const id in mods) {
        let ex;
        try { ex = mods[id].publicModule && mods[id].publicModule.exports; } catch { continue; }
        if (!ex || (typeof ex !== "object" && typeof ex !== "function")) continue;
        let keys = [];
        try { keys = Object.keys(ex); } catch { continue; }
        if (keys.length > 200) continue;
        for (const k of keys) {
          if (/avatar/i.test(k) && Object.keys(found).length < 40) found[k] = id;
        }
        try {
          const d = ex.default;
          const dn = d && (d.displayName || d.name);
          if (typeof dn === "string" && /avatar/i.test(dn) && Object.keys(found).length < 40) found["default:" + dn] = id;
        } catch {}
      }
    } catch (e) { found.error = String(e).slice(0, 80); }
    return found;
  }


  function squareUp(node, depth) {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => squareUp(n, depth + 1)); return; }
    const p = node.props;
    if (!p || typeof p !== "object") return;
    try {
      const st = flat(p.style);
      const tiny = typeof st.width === "number" && st.width < 20;
      if (!tiny) p.style = [p.style, { borderRadius: 0 }];
    } catch {}
    squareUp(p.children, depth + 1);
    if (p.maskElement) squareUp(p.maskElement, depth + 1);
  }

  function patchComp(holder, key, label) {
    try {
      const t = holder[key];
      const wrap = (_a, res) => { squareUp(res, 0); return res; };
      if (typeof t === "function") { unpatches.push(after(key, holder, wrap)); info[label] = "fn"; }
      else if (t && t.type && typeof t.type.render === "function") { unpatches.push(after("render", t.type, wrap)); info[label] = "memo-fwd"; }
      else if (t && typeof t.type === "function") { unpatches.push(after("type", t, wrap)); info[label] = "memo"; }
      else if (t && typeof t.render === "function") { unpatches.push(after("render", t, wrap)); info[label] = "fwd"; }
      else info[label] = typeof t;
    } catch (e) { info[label] = "err " + String(e).slice(0, 60); }
  }

  function setupAvatarModule() {
    try {
      const m = findByProps("CutoutableAvatarImage");
      if (!m) { info.module = "not found"; return; }
      patchComp(m, "Avatar", "Avatar");
      patchComp(m, "CutoutableAvatarImage", "Cutoutable");
      const st = m.avatarStyles;
      if (st && typeof st === "object") {
        info.styles = {};
        for (const k of Object.keys(st).slice(0, 10)) {
          const v = st[k];
          if (v && typeof v === "object" && typeof v.borderRadius === "number") {
            info.styles[k] = v.borderRadius;
            const orig = v.borderRadius;
            try { v.borderRadius = 0; restore.push(() => { v.borderRadius = orig; }); } catch {}
          } else info.styles[k] = typeof v;
        }
      } else info.styles = typeof st;
    } catch (e) { info.module = "err " + String(e).slice(0, 80); }
  }

  const toast = (t) => { try { vendetta.ui.toasts.showToast(t); } catch {} };

  return {
    onLoad() {
      try { unpatches.push(before("createElement", React, fix)); } catch {}
      try {
        const rt = findByProps("jsx", "jsxs");
        if (rt) { unpatches.push(before("jsx", rt, fix)); unpatches.push(before("jsxs", rt, fix)); }
      } catch {}
      setupAvatarModule();
      toast("Square Avatars v7 on. Open a chat, scroll, wait 15s");
      timer = setTimeout(() => {
        const report = JSON.stringify({ stats, info }).slice(0, 3500);
        try {
          findByProps("setString").setString(report);
          toast("Debug info copied. Paste it to Claude");
        } catch {
          toast(`Seen ${stats.calls}, img ${stats.srcImg}, other ${stats.otherAvatar}, boxes ${stats.box}`);
        }
      }, 15000);
    },
    onUnload() {
      clearTimeout(timer);
      unpatches.forEach((u) => { try { u(); } catch {} });
      restore.forEach((r) => { try { r(); } catch {} });
    },
  };
})();

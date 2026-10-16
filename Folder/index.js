(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const restore = [];
  const info = {};
  const stats = { calls: 0, srcImg: 0, round: 0 };
  const matchedTypes = {};
  const missed = {};
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

  // Looks like a circle clip: square box fully rounded, image filling a rounded parent,
  // a rounded overflow-hidden clip, or an element whose style is only a radius
  function isRound(props) {
    const s = flat(props.style);
    const br = typeof s.borderRadius === "number" ? s.borderRadius
      : typeof props.borderRadius === "number" ? props.borderRadius : 0;
    if (br < 14) return false;
    const w = s.width, h = s.height;
    if (typeof w === "number" && w === h && w >= 16 && br >= w / 2) return true;
    if (br > 40) return false;
    if (w === "100%" && h === "100%") return true;
    if (s.overflow === "hidden") return true;
    const other = Object.keys(s).filter((k) => k !== "borderRadius");
    return other.length === 0;
  }

  function squareProps(props, withBorderRadiusProp) {
    const np = { ...props, style: [props.style, ZERO] };
    if (withBorderRadiusProp || "borderRadius" in props) np.borderRadius = 0;
    if ("imageStyle" in props) np.imageStyle = [props.imageStyle, ZERO];
    return np;
  }

  function fix(args) {
    stats.calls++;
    const props = args[1];
    if (!props || typeof props !== "object") return;
    const avatar = hasAvatarUrl(props);
    const round = !avatar && isRound(props);
    if (avatar || round) {
      const n = nameOf(args[0]);
      if (avatar) stats.srcImg++; else stats.round++;
      matchedTypes[n] = (matchedTypes[n] || 0) + 1;
      args[1] = squareProps(props, avatar);
      return args;
    }
    // record rounded things we did NOT catch, to learn from
    const s = flat(props.style);
    if (typeof s.borderRadius === "number" && s.borderRadius >= 14 && Object.keys(missed).length < 10) {
      const n = nameOf(args[0]);
      if (!missed[n]) missed[n] = Object.assign(short(s), { k: Object.keys(s).slice(0, 8) });
    }
  }

  function squareUp(node, depth) {
    if (!node || typeof node !== "object" || depth > 8) return;
    if (Array.isArray(node)) { node.forEach((n) => squareUp(n, depth + 1)); return; }
    const p = node.props;
    if (!p || typeof p !== "object") return;
    try {
      const st = flat(p.style);
      const tiny = typeof st.width === "number" && st.width < 16;
      if (!tiny) {
        p.style = [p.style, ZERO];
        if ("borderRadius" in p) p.borderRadius = 0;
        if ("imageStyle" in p) p.imageStyle = [p.imageStyle, ZERO];
      }
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
        for (const k of Object.keys(st)) {
          const v = st[k];
          if (v && typeof v === "object") {
            for (const key of Object.keys(ZERO)) {
              if (typeof v[key] === "number") {
                const orig = v[key];
                try { v[key] = 0; restore.push(() => { v[key] = orig; }); } catch {}
              }
            }
          }
        }
      }
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
      toast("Square Avatars v9 on. Open a chat, scroll, wait 15s");
      timer = setTimeout(() => {
        const report = JSON.stringify({ stats, matchedTypes, missed, info }).slice(0, 3500);
        try {
          findByProps("setString").setString(report);
          toast("Debug info copied. Paste it to Claude");
        } catch {
          toast(`Seen ${stats.calls}, avatars ${stats.srcImg}, round ${stats.round}`);
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

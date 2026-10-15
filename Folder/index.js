(function () {
  const { before } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const stats = { calls: 0, srcImg: 0, otherAvatar: 0, box: 0 };
  const samples = {};
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

  const toast = (t) => { try { vendetta.ui.toasts.showToast(t); } catch {} };

  return {
    onLoad() {
      try { unpatches.push(before("createElement", React, fix)); } catch {}
      try {
        const rt = findByProps("jsx", "jsxs");
        if (rt) { unpatches.push(before("jsx", rt, fix)); unpatches.push(before("jsxs", rt, fix)); }
      } catch {}
      toast("Square Avatars v5 on. Open a chat, scroll, wait 15s");
      timer = setTimeout(() => {
        const report = JSON.stringify({ stats, samples }).slice(0, 3500);
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
    },
  };
})();

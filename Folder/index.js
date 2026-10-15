(function () {
  const { before } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const stats = { calls: 0, img: 0, box: 0 };
  const names = {};
  const imgSamples = [];
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

  function isAvatarImage(props) {
    const src = props.source;
    const uri = Array.isArray(src) ? src[0] && src[0].uri : src && src.uri;
    return typeof uri === "string" && uri.indexOf("avatars/") !== -1;
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
    const n = nameOf(args[0]);
    if (/avatar|mask/i.test(n) || (props && props.maskElement)) {
      if (!names[n] && Object.keys(names).length < 25)
        names[n] = { keys: props ? Object.keys(props).slice(0, 12) : [], style: props ? short(flat(props.style)) : {} };
    }
    if (!props || typeof props !== "object") return;
    const img = isAvatarImage(props);
    const box = !img && isRoundBox(props);
    if (img || box) {
      if (img) {
        stats.img++;
        if (imgSamples.length < 4) imgSamples.push({ type: n, style: short(flat(props.style)), keys: Object.keys(props).slice(0, 10) });
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
      toast("Square Avatars v4 on. Open your DMs, wait 15s");
      timer = setTimeout(() => {
        const report = JSON.stringify({ stats, imgSamples, names }).slice(0, 3500);
        try {
          const cb = findByProps("setString");
          cb.setString(report);
          toast("Debug info copied. Paste it in the chat with Claude");
        } catch {
          toast(`Seen ${stats.calls}, avatars ${stats.img}, boxes ${stats.box}`);
        }
      }, 15000);
    },
    onUnload() {
      clearTimeout(timer);
      unpatches.forEach((u) => { try { u(); } catch {} });
    },
  };
})();

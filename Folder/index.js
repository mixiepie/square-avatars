(function () {
  const { before } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const stats = { calls: 0, img: 0, box: 0 };
  let timer;

  const flat = (s) => {
    try { return ReactNative.StyleSheet.flatten(s) || {}; } catch { return {}; }
  };

  function isAvatarImage(props) {
    const src = props.source;
    const uri = Array.isArray(src) ? src[0] && src[0].uri : src && src.uri;
    return typeof uri === "string" && uri.indexOf("avatars/") !== -1;
  }

  function isRoundBox(props) {
    const s = flat(props.style);
    return (
      typeof s.width === "number" &&
      s.width === s.height &&
      s.width >= 28 &&
      typeof s.borderRadius === "number" &&
      s.borderRadius >= s.width / 2
    );
  }

  function fix(args) {
    stats.calls++;
    const props = args[1];
    if (!props || typeof props !== "object") return;
    const img = isAvatarImage(props);
    const box = !img && isRoundBox(props);
    if (img || box) {
      if (img) stats.img++; else stats.box++;
      args[1] = { ...props, style: [props.style, { borderRadius: 0 }] };
      return args;
    }
  }

  const toast = (t) => {
    try { vendetta.ui.toasts.showToast(t); } catch {}
  };

  return {
    onLoad() {
      let hooks = 0;
      try { unpatches.push(before("createElement", React, fix)); hooks++; } catch {}
      try {
        const rt = findByProps("jsx", "jsxs");
        if (rt) {
          unpatches.push(before("jsx", rt, fix));
          unpatches.push(before("jsxs", rt, fix));
          hooks += 2;
        }
      } catch {}
      toast("Square Avatars v3 on, hooks: " + hooks);
      timer = setTimeout(() => {
        toast(`Seen ${stats.calls}, avatars ${stats.img}, round boxes ${stats.box}`);
      }, 8000);
    },
    onUnload() {
      clearTimeout(timer);
      unpatches.forEach((u) => { try { u(); } catch {} });
    },
  };
})();

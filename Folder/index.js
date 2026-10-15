(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];

  const stripRadius = (style) => {
    if (!style) return style;
    if (Array.isArray(style)) return style.map(stripRadius);
    if (typeof style === "object") {
      const clean = { ...style };
      for (const key of Object.keys(clean)) {
        if (key.toLowerCase().includes("radius")) {
          clean[key] = 0;
        }
      }
      return clean;
    }
    return style;
  };

  const processProps = (props) => {
    if (!props || typeof props !== "object") return;

    // Direct style patch
    if (props.style) {
      try {
        const flat = ReactNative.StyleSheet.flatten(props.style);
        if (flat && (flat.borderRadius || flat.borderBottomLeftRadius)) {
          props.style = [flat, { borderRadius: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }];
        }
      } catch {}
    }

    // Avatar container / mask patch
    if (props.avatarStyle) props.avatarStyle = stripRadius(props.avatarStyle);
    if (props.imageStyle) props.imageStyle = stripRadius(props.imageStyle);
  };

  const fixArgs = (args) => {
    if (args && args[1]) processProps(args[1]);
    return args;
  };

  const toast = (t) => { try { vendetta.ui.toasts.showToast(t); } catch {} };

  return {
    onLoad() {
      // 1. Hook into React element creation
      try { unpatches.push(before("createElement", React, fixArgs)); } catch {}
      
      try {
        const rt = findByProps("jsx", "jsxs");
        if (rt) {
          unpatches.push(before("jsx", rt, fixArgs));
          unpatches.push(before("jsxs", rt, fixArgs));
        }
      } catch {}

      // 2. Intercept StyleSheet.flatten to force radius removal on evaluated styles
      try {
        const SS = ReactNative.StyleSheet;
        if (SS && SS.flatten) {
          unpatches.push(after("flatten", SS, (args, res) => {
            if (res && (res.borderRadius > 0 || res.borderTopLeftRadius > 0)) {
              return stripRadius(res);
            }
            return res;
          }));
        }
      } catch {}

      toast("Square Avatars v8 loaded!");
    },

    onUnload() {
      unpatches.forEach((u) => { try { u(); } catch {} });
      toast("Square Avatars v8 unloaded");
    }
  };
})();

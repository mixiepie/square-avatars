(function () {
  const { before } = vendetta.patcher;
  const { React, ReactNative } = vendetta.metro.common;
  let unpatch;

  const flat = (s) => {
    try { return ReactNative.StyleSheet.flatten(s) || {}; } catch { return {}; }
  };

  function isAvatarImage(props) {
    const src = props.source;
    const uri = Array.isArray(src) ? src[0] && src[0].uri : src && src.uri;
    return typeof uri === "string" && uri.indexOf("avatars/") !== -1;
  }

  function isBigRoundBox(props) {
    const s = flat(props.style);
    return (
      typeof s.width === "number" &&
      s.width === s.height &&
      s.width >= 28 &&
      typeof s.borderRadius === "number" &&
      s.borderRadius >= s.width / 2
    );
  }

  return {
    onLoad() {
      unpatch = before("createElement", React, (args) => {
        const props = args[1];
        if (!props || typeof props !== "object") return;
        if (isAvatarImage(props) || isBigRoundBox(props)) {
          args[1] = { ...props, style: [props.style, { borderRadius: 0 }] };
          return args;
        }
      });
      try {
        vendetta.ui.toasts.showToast("Square Avatars is on");
      } catch {}
    },
    onUnload() {
      if (unpatch) unpatch();
    },
  };
})();

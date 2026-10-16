(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps, findByName } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const restore = [];

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

  return {
    onLoad() {
      try { unpatches.push(before("createElement", React, fix)); } catch {}
      try {
        const rt = findByProps("jsx", "jsxs");
        if (rt) { unpatches.push(before("jsx", rt, fix)); unpatches.push(before("jsxs", rt, fix)); }
      } catch {}
      setupAvatarModule();
      const hits = [];
      for (const n of ["MessageAvatar", "ChatMessageAvatar", "MessageHeaderAvatar", "ReplyAvatar", "UserAvatar"]) {
        try {
          const m = findByName(n, false);
          if (m) { patchComp(m, "default"); hits.push(n); }
        } catch {}
      }
      try { vendetta.ui.toasts.showToast("Square Avatars found: " + (hits.join(", ") || "none")); } catch {}
    },
    onUnload() {
      unpatches.forEach((u) => { try { u(); } catch {} });
      restore.forEach((r) => { try { r(); } catch {} });
    },
  };
})();

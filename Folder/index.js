(function () {
  const { before } = vendetta.patcher;
  const { findByProps } = vendetta.metro;
  const { React, ReactNative } = vendetta.metro.common;
  const unpatches = [];
  const stats = { calls: 0, matched: 0, box: 0 };
  const samples = {};
  let timer;

  const flat = (s) => {
    try { return ReactNative.StyleSheet.flatten(s) || {}; } catch { return {}; }
  };
  
  const nameOf = (t) => {
    if (typeof t === "string") return t;
    return (t && (t.displayName || t.name || (t.type && (t.type.displayName || t.type.name)) || (t.render && t.render.name))) || "?";
  };

  // Broader check for Discord CDN / avatar links
  const hasAv = (v) => {
    if (typeof v === "string") return v.includes("discordapp.com/avatars") || v.includes("discord.com/avatars") || v.includes("guilds/") || v.includes("users/");
    if (Array.isArray(v)) return v.some(hasAv);
    if (v && typeof v === "object" && typeof v.uri === "string") {
      return v.uri.includes("avatars") || v.uri.includes("guilds") || v.uri.includes("users");
    }
    return false;
  };

  function fix(args) {
    stats.calls++;
    const props = args[1];
    if (!props || typeof props !== "object") return;

    let isAvatar = hasAv(props.source);
    if (!isAvatar) {
      // Check other common image props just in case
      for (const k of ["src", "uri", "avatar", "icon"]) {
        if (hasAv(props[k])) { isAvatar = true; break; }
      }
    }

    const s = flat(props.style);
    const isRound = typeof s.width === "number" && s.width === s.height && s.width >= 16 &&
                    typeof s.borderRadius === "number" && s.borderRadius >= s.width / 2;

    if (isAvatar || isRound) {
      if (isAvatar) {
        stats.matched++;
        const n = nameOf(args[0]);
        if (!samples[n] && Object.keys(samples).length < 10) {
          samples[n] = { keys: Object.keys(props), style: { width: s.width, height: s.height, borderRadius: s.borderRadius } };
        }
      } else {
        stats.box++;
      }

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
      toast("Square Avatars v6 on. Scroll chat for 15s");
      timer = setTimeout(() => {
        const report = JSON.stringify({ stats, samples }).slice(0, 3500);
        try {
          findByProps("setString").setString(report);
          toast("v6 debug copied! Paste it here.");
        } catch {
          toast(`Matched: ${stats.matched}, Boxes: ${stats.box}`);
        }
      }, 15000);
    },
    onUnload() {
      clearTimeout(timer);
      unpatches.forEach((u) => { try { u(); } catch {} });
    },
  };
})();

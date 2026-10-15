(function () {
  const { after, before } = vendetta.patcher;
  const { findByProps, findByDisplayName } = vendetta.metro;
  const unpatches = [];

  const fixStyle = (style) => {
    if (!style) return style;
    if (Array.isArray(style)) return style.map(fixStyle);
    if (typeof style === "object") {
      return { ...style, borderRadius: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 };
    }
    return style;
  };

  const patchProps = (args) => {
    if (!args[0]) return;
    const props = args[0];
    if (props.style) props.style = fixStyle(props.style);
    if (props.imageStyle) props.imageStyle = fixStyle(props.imageStyle);
    if (props.avatarStyle) props.avatarStyle = fixStyle(props.avatarStyle);
  };

  const toast = (t) => { try { vendetta.ui.toasts.showToast(t); } catch {} };

  return {
    onLoad() {
      // 1. Try patching common Avatar components directly
      try {
        const AvatarModule = findByProps("Avatar", "getAvatarSource") || findByProps("getUserAvatarURL");
        if (AvatarModule) {
          if (AvatarModule.default) unpatches.push(before("default", AvatarModule, patchProps));
          if (AvatarModule.Avatar) unpatches.push(before("Avatar", AvatarModule, patchProps));
        }
      } catch (e) {}

      // 2. Patch Image / FastImage components directly for borderRadius override
      try {
        const ImageWrapper = findByProps("render", "displayName");
        const FastImage = findByProps("FastImage")?.FastImage || findByProps("src", "source");
        
        [ImageWrapper, FastImage].forEach((comp) => {
          if (comp && comp.render) {
            unpatches.push(before("render", comp, patchProps));
          }
        });
      } catch (e) {}

      // 3. Optional fallback: Override global StyleSheet.create to disable round borders on avatar classes
      try {
        const StyleSheet = vendetta.metro.common.ReactNative.StyleSheet;
        unpatches.push(before("create", StyleSheet, (args) => {
          const styles = args[0];
          if (!styles) return;
          for (const key in styles) {
            if (key.toLowerCase().includes("avatar") || key.toLowerCase().includes("round")) {
              if (styles[key].borderRadius) styles[key].borderRadius = 0;
            }
          }
        }));
      } catch (e) {}

      toast("Square Avatars v7 applied!");
    },

    onUnload() {
      unpatches.forEach((u) => { try { u(); } catch {} });
      toast("Square Avatars v7 unloaded");
    }
  };
})();

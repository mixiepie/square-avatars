(function () {
  const { before, after } = vendetta.patcher;
  const { findByProps, findByName } = vendetta.metro;
  const unpatches = [];

  const fixAvatarProps = (args) => {
    if (!args || !args[0]) return;
    const props = args[0];
    
    // Disable circular masking on avatar props
    if ('isCircle' in props) props.isCircle = false;
    if ('isRound' in props) props.isRound = false;
    if ('hasMask' in props) props.hasMask = false;
    if ('cutout' in props) props.cutout = false;
    if ('borderRadius' in props) props.borderRadius = 0;

    // Reset style rounding strictly if it's an avatar wrapper
    if (props.style) {
      if (Array.isArray(props.style)) {
        props.style = props.style.map(s => typeof s === 'object' && s ? { ...s, borderRadius: 0 } : s);
      } else if (typeof props.style === 'object') {
        props.style = { ...props.style, borderRadius: 0 };
      }
    }
  };

  const toast = (t) => { try { vendetta.ui.toasts.showToast(t); } catch {} };

  return {
    onLoad() {
      // 1. Target Avatar components directly across Metro modules
      try {
        const avatarModules = findByProps("Avatar") || findByProps("getUserAvatarURL");
        if (avatarModules) {
          for (const key of Object.keys(avatarModules)) {
            if (typeof avatarModules[key] === "function") {
              unpatches.push(before(key, avatarModules, fixAvatarProps));
            }
          }
        }
      } catch (e) {}

      // 2. Patch MaskedView (This is what actually clips avatars into circles)
      try {
        const MaskedViewModule = findByProps("MaskedView") || findByName("MaskedView", false);
        if (MaskedViewModule) {
          const comp = MaskedViewModule.MaskedView || MaskedViewModule.default || MaskedViewModule;
          if (comp) {
            unpatches.push(before("render", comp, (args) => {
              if (args && args[0] && args[0].maskElement) {
                // Bypass mask rendering for avatars
                args[0].maskElement = null;
              }
            }));
          }
        }
      } catch (e) {}

      // 3. Patch FastImage / Image renderers specifically when handling avatars
      try {
        const ImageComponents = findByProps("FastImage") || findByProps("render");
        if (ImageComponents && ImageComponents.default) {
          unpatches.push(before("default", ImageComponents, fixAvatarProps));
        }
      } catch (e) {}

      toast("Square Avatars v9 applied!");
    },

    onUnload() {
      unpatches.forEach((u) => { try { u(); } catch {} });
      toast("Square Avatars v9 unloaded");
    }
  };
})();

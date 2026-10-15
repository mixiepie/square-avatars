(function () {
  const { after } = vendetta.patcher;
  const { findByName } = vendetta.metro;
  const unpatches = [];

  // Walk the rendered avatar and remove rounding on every piece
  function squareUp(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 6) return;
    if (Array.isArray(node)) return node.forEach((n) => squareUp(n, depth + 1));
    if (node.props) {
      node.props.style = [node.props.style, { borderRadius: 0 }];
      squareUp(node.props.children, depth + 1);
    }
  }

  return {
    onLoad() {
      const Avatar = findByName("Avatar", false);
      if (!Avatar) return;
      unpatches.push(
        after("default", Avatar, (_args, res) => {
          squareUp(res);
          return res;
        })
      );
    },
    onUnload() {
      unpatches.forEach((u) => u());
    },
  };
})();

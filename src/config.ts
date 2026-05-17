import { createMeshConfig } from "@baditaflorin/mesh-common";

export const config = createMeshConfig({
  appName: "mesh-shake-dice",
  description: "Shake to roll fair dice — every peer agrees on the result.",
  accentHex: "#f4a04a",
  version: __APP_VERSION__,
  commit: __GIT_COMMIT__,
});

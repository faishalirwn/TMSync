import preact from "@preact/preset-vite";
import { defineConfig } from "wxt";

// See ../../CLAUDE.md for the settled constraints encoded here.
export default defineConfig({
  srcDir: ".",
  manifest: {
    name: "TMSync",
    description: "Passively scrobble movies & TV to Trakt on any streaming site.",
    // Constraint #5: NO broad host_permissions at install. We request per-origin
    // host access on a user gesture, then chrome.scripting.registerContentScripts.
    permissions: ["storage", "alarms", "scripting"],
    optional_host_permissions: ["*://*/*"],
  },
  hooks: {
    // Guard for constraint #5. WXT derives broad host access from the content
    // script's `matches` (even under `registration: "runtime"`): on MV3 it adds
    // `host_permissions`, on Firefox MV2 it folds `*://*/*` into required
    // `permissions`. We strip both so NOTHING broad is requested at install, and
    // express it as optional on MV2 so the runtime-grant model holds there too.
    "build:manifestGenerated"(_wxt, manifest) {
      const BROAD = "*://*/*";
      // MV3: drop broad required host access.
      if (manifest.host_permissions) {
        manifest.host_permissions = manifest.host_permissions.filter((p: string) => p !== BROAD);
        if (manifest.host_permissions.length === 0) {
          manifest.host_permissions = undefined;
        }
      }
      // MV2 folds host perms into required `permissions` — drop broad there too.
      if (manifest.permissions) {
        manifest.permissions = manifest.permissions.filter((p: string) => p !== BROAD);
      }
      // MV2 has no `optional_host_permissions`, and WXT doesn't translate it.
      // Declare the broad host as an OPTIONAL permission so Firefox can grant it
      // at runtime per the same user-gesture model as Chrome.
      if (manifest.manifest_version === 2) {
        manifest.optional_permissions = [
          ...new Set([...(manifest.optional_permissions ?? []), BROAD]),
        ];
      }
    },
  },
  vite: () => ({
    plugins: [preact()],
  }),
});

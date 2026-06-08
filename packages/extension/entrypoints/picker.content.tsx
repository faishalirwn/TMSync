import { PickerApp } from "@/lib/picker/PickerApp";
import { render } from "preact";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";

/**
 * Element-picker overlay. Injected on demand into the active tab via
 * scripting.executeScript when the user clicks "Set up this site" in the popup
 * (after granting the per-origin permission). Not in the manifest
 * (`registration: "runtime"`), so it never auto-runs.
 *
 * Renders Preact inside a Shadow DOM (style/markup isolated from the host page).
 * Styles are inlined by the component, so no web-accessible CSS is needed.
 */
export default defineContentScript({
  matches: ["*://*/*"],
  registration: "runtime",
  cssInjectionMode: "ui",
  async main(ctx) {
    // Guard against double-injection (user reopens the popup and clicks again).
    if (document.querySelector("tmsync-picker")) return;

    const ui = await createShadowRootUi(ctx, {
      name: "tmsync-picker",
      position: "overlay",
      anchor: "body",
      onMount: (container) => {
        render(<PickerApp onClose={() => ui.remove()} />, container);
      },
      onRemove: (container) => {
        if (container) render(null, container);
      },
    });
    ui.mount();
  },
});

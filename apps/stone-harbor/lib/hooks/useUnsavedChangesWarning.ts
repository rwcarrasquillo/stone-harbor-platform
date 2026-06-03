"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Stone Harbor — useUnsavedChangesWarning.
 *
 * Protects content the member has typed but not yet saved by intercepting
 * navigation attempts (tab close, refresh, back/forward buttons, clicks
 * on in-app links) when `isDirty === true`.
 *
 * Two layers of protection:
 *
 *   1. window.addEventListener("beforeunload", ...)
 *      Triggers the browser's native "Leave site? Changes you made may not
 *      be saved" dialog for tab close, page refresh, and navigation to
 *      external URLs. The browser's wording and buttons are fixed — we
 *      can't customize them. Modern browsers ignore any custom message
 *      string we provide and show their own. Returning a non-undefined
 *      value (or calling preventDefault and setting returnValue) is what
 *      actually triggers the dialog.
 *
 *   2. Document-level click capture
 *      Intercepts clicks on internal links (<a href="..."> and Next.js
 *      <Link>s, since the latter renders an <a> tag). When the user
 *      clicks any link while dirty, we prevent default navigation, save
 *      the intended href, and show a custom modal asking what to do.
 *      The modal is rendered by the caller via the returned state.
 *
 * Usage:
 *
 *   const { showModal, cancelNavigation, confirmNavigation } =
 *     useUnsavedChangesWarning(content !== savedContent);
 *
 *   return (
 *     <>
 *       <textarea ... />
 *       <UnsavedChangesModal
 *         open={showModal}
 *         onStay={cancelNavigation}
 *         onLeave={confirmNavigation}
 *       />
 *     </>
 *   );
 *
 * Tradeoffs / known limitations:
 *
 *   - The Next.js App Router does not expose router events the way the
 *     Pages Router did, so we cannot cleanly intercept `router.push()`
 *     called from arbitrary code. We catch link clicks at the DOM
 *     level, which covers the most common in-app navigation (logo,
 *     nav bar, tab bar, Link components). Programmatic
 *     `router.push("...")` calls from a button handler would NOT be
 *     guarded by this hook — but the dirty content's surface would
 *     typically own that button and could explicitly check isDirty
 *     before navigating.
 *
 *   - The browser's beforeunload dialog cannot be customized in any
 *     mainstream browser (Chrome, Safari, Firefox all ignore custom
 *     text since ~2017 for security reasons). The dialog is generic
 *     "Changes you made may not be saved" — that's acceptable;
 *     the in-app modal handles the on-brand wording.
 *
 *   - Cmd/Ctrl-click and middle-click open links in new tabs — we
 *     don't intercept those, since the user isn't actually leaving
 *     the current page.
 */

export type UnsavedChangesState = {
  /** True when a navigation attempt has been intercepted and the modal should be open. */
  showModal: boolean;
  /** Call this when the user clicks "Stay" — closes the modal, cancels navigation. */
  cancelNavigation: () => void;
  /** Call this when the user clicks "Discard and leave" — performs the deferred navigation. */
  confirmNavigation: () => void;
};

export function useUnsavedChangesWarning(
  isDirty: boolean,
): UnsavedChangesState {
  const [showModal, setShowModal] = useState(false);
  const pendingHrefRef = useRef<string | null>(null);

  // Keep the latest isDirty in a ref so the event handlers, which are
  // registered once, always read the current value.
  const isDirtyRef = useRef(isDirty);
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  // Layer 1: native beforeunload guard for tab close / refresh / external nav.
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirtyRef.current) return;
      // Two patterns required for cross-browser compatibility:
      // - event.preventDefault() — modern spec
      // - event.returnValue = "" — legacy Chrome / Edge
      event.preventDefault();
      event.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // Layer 2: document-level click capture for in-app link navigation.
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!isDirtyRef.current) return;
      // Allow user-explicit "open in new tab" gestures to pass through.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      // Only intercept the primary mouse button.
      if (event.button !== 0) return;

      // Walk up the DOM tree to find the nearest <a> ancestor.
      let target = event.target as HTMLElement | null;
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }
      if (!target) return;

      const anchor = target as HTMLAnchorElement;
      const href = anchor.getAttribute("href");
      if (!href) return;

      // Skip explicit new-tab targets.
      if (anchor.target === "_blank") return;

      // Skip same-page anchor links and mailto/tel/etc.
      if (href.startsWith("#")) return;
      if (
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      // Skip external links — beforeunload handles those.
      if (href.startsWith("http://") || href.startsWith("https://")) {
        try {
          const url = new URL(href);
          if (url.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }

      // We have an internal link click while dirty. Intercept.
      event.preventDefault();
      event.stopPropagation();
      pendingHrefRef.current = href;
      setShowModal(true);
    };

    document.addEventListener("click", handleClick, { capture: true });
    return () =>
      document.removeEventListener("click", handleClick, { capture: true });
  }, []);

  const cancelNavigation = useCallback(() => {
    pendingHrefRef.current = null;
    setShowModal(false);
  }, []);

  const confirmNavigation = useCallback(() => {
    const href = pendingHrefRef.current;
    pendingHrefRef.current = null;
    setShowModal(false);
    if (!href) return;
    // The user has explicitly chosen to discard their work via the
    // in-app modal. Suppress the beforeunload native dialog so the
    // browser doesn't prompt them a second time. We mutate the ref
    // directly — the parent's `isDirty` prop may still be true, but
    // the navigation is about to fire synchronously, so the ref's
    // value is what matters when beforeunload reads it.
    isDirtyRef.current = false;
    // Use window.location.assign for the navigation — simpler than
    // re-instantiating router.push and works regardless of whether the
    // original element was a real <a> or a Next.js <Link>. A full page
    // navigation is appropriate here (and clears any lingering local
    // state from the dirty form).
    window.location.assign(href);
  }, []);

  return {
    showModal,
    cancelNavigation,
    confirmNavigation,
  };
}

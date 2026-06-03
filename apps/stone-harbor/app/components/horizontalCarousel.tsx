import { ReactNode } from "react";

/**
 * Stone Harbor — horizontal card carousel.
 *
 * CSS-only horizontal swipe container. No JavaScript dependency, no
 * Embla, no Swiper. Each child gets snap-aligned to the start so the
 * swipe stops on a card boundary. Scrollbar is hidden but the native
 * touch momentum is preserved.
 *
 * Why CSS-only:
 *   Stone Harbor's audience doesn't need indicator dots, autoplay,
 *   or pagination. They need a quiet horizontal alternative to
 *   stacking five cards vertically. Native scroll-snap is one of
 *   the best web platform features in years — buttery on iOS Safari
 *   PWA mode, accessible (still keyboard-scrollable), no a11y
 *   regressions.
 *
 * Usage:
 *   <HorizontalCarousel>
 *     <CarouselCard>...</CarouselCard>
 *     <CarouselCard>...</CarouselCard>
 *     <CarouselCard>...</CarouselCard>
 *   </HorizontalCarousel>
 *
 * Each child is rendered as-is — wrap individual cards in
 * <CarouselCard> for the right width and snap behavior, or just
 * style your own with `className="snap-start shrink-0 w-[85%]"`.
 *
 * Responsive behavior:
 *   On md+ (>=768px) the children stack vertically (no horizontal
 *   scroll) since the desktop layout has room. Adjust by passing
 *   `desktopBehavior="carousel"` if you want the carousel on all
 *   breakpoints.
 */
type Props = {
  children: ReactNode;
  /** Visible scrollbar on desktop. Default: hidden everywhere. */
  showScrollbar?: boolean;
  /** Override the responsive collapse-to-stack behavior. */
  desktopBehavior?: "stack" | "carousel";
  /** Extra classes for the outer container. */
  className?: string;
  /** Padding-right inside the scroll area so the last card peeks at the edge. */
  trailingPeek?: boolean;
};

export function HorizontalCarousel({
  children,
  showScrollbar = false,
  desktopBehavior = "stack",
  className = "",
  trailingPeek = true,
}: Props) {
  const desktopClass =
    desktopBehavior === "stack"
      ? "md:flex-col md:overflow-visible md:snap-none md:gap-4"
      : "";
  const scrollbarClass = showScrollbar ? "" : "hide-scrollbar";

  return (
    <div
      className={`flex gap-3 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 ${trailingPeek ? "pr-8" : ""} ${desktopClass} ${scrollbarClass} ${className}`}
      style={{ scrollPaddingLeft: "1rem" }}
    >
      {children}
    </div>
  );
}

/**
 * Wrapper for a single card inside the carousel. Default width is
 * 85% of viewport so the next card peeks at the right edge — a
 * powerful visual affordance that tells users "swipe for more"
 * without needing arrows or dots.
 */
export function CarouselCard({
  children,
  width = "w-[85%]",
  className = "",
}: {
  children: ReactNode;
  /** Tailwind width utility for the card. Override for wider/narrower cards. */
  width?: string;
  className?: string;
}) {
  return (
    <div
      className={`snap-start shrink-0 ${width} md:w-full ${className}`}
    >
      {children}
    </div>
  );
}

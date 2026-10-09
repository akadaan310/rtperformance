/**
 * Editorial image slots. These are licensed Unsplash placeholders (see public/images/CREDITS.md) and do not
 * depict Raymond Tate or any client. Swap the `src` values for Raymond's own photography once permitted.
 */
export const IMAGERY = {
  hero: { src: "/images/hero-deadlift.jpg", alt: "An athlete braced over a loaded barbell in a dark gym", position: "50% 55%" },
  philosophy: { src: "/images/pullup.jpg", alt: "Black-and-white photo of an athlete holding the top of a pull-up", position: "50% 30%" },
  programming: { src: "/images/grip.jpg", alt: "Close-up of a hand gripping a barbell beside training shoes", position: "50% 50%" },
  athlete: { src: "/images/squat.jpg", alt: "Black-and-white photo of an athlete with a barbell across her shoulders", position: "50% 40%" },
  network: { src: "/images/rack.jpg", alt: "A squat rack in a quiet, dimly lit training room", position: "50% 50%" },
  cta: { src: "/images/floor-deadlift.jpg", alt: "Feet set beneath a loaded barbell on a rubber gym floor", position: "50% 60%" },
  auth: { src: "/images/rack-athlete.jpg", alt: "An athlete gripping a barbell in a squat rack, seen from behind", position: "50% 35%" },
} as const;

/** The product's mark: the card's photo window with a sitter in it. */
export function Mark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size * 0.86}
      height={size}
      viewBox="0 0 26 30"
      aria-hidden="true"
      className="flex-none"
    >
      <rect
        x="1.5"
        y="1.5"
        width="23"
        height="27"
        rx="11.5"
        ry="10"
        fill="#fff"
        stroke="var(--color-window)"
        strokeWidth="2.5"
      />
      <circle cx="13" cy="12" r="4.2" fill="var(--color-ink)" />
      <path
        d="M5.2 25.5c1.2-4.6 4.3-7 7.8-7s6.6 2.4 7.8 7"
        fill="var(--color-ink)"
      />
    </svg>
  );
}

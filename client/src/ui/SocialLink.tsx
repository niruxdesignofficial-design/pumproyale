/** The game's X (Twitter) account. */
const X_URL = "https://x.com/PumpGuysGame";

/**
 * Small, unobtrusive X (Twitter) link pinned to the bottom-left corner. Rendered
 * at the app root so it shows on the menu and throughout the game without
 * covering gameplay or HUD elements.
 */
export function SocialLink() {
  return (
    <a
      className="social-link"
      href={X_URL}
      target="_blank"
      rel="noreferrer noopener"
      title="Follow @PumpGuysGame on X"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      <span>@PumpGuysGame</span>
    </a>
  );
}

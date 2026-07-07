// Nav basse à 5 onglets (Play / Friends / Tournaments / Top Players / Shop).

export type NavTab = "play" | "friends" | "tournaments" | "top" | "shop";

const ICONS: Record<NavTab, React.ReactNode> = {
  play: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3.5" width="11" height="15" rx="2" transform="rotate(-8 9 11)" />
      <rect x="9" y="5.5" width="11" height="15" rx="2" transform="rotate(8 15 13)" />
    </svg>
  ),
  friends: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.6" />
      <path d="M15.5 14.4c2.3.2 4.3 1.7 4.9 4.6" />
    </svg>
  ),
  tournaments: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 5H4.5a3 3 0 0 0 3 4.5M17 5h2.5a3 3 0 0 1-3 4.5" />
      <path d="M12 13v3.5M8.5 20h7M10 20v-2h4v2" />
    </svg>
  ),
  top: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 20V12M12 20V5M19 20v-5" strokeLinecap="round" />
    </svg>
  ),
  shop: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="9" width="16" height="11" rx="2" />
      <path d="M4 13h16M12 9v11M12 9c-4 0-5-2.4-4-4 1.2-1.8 4 0 4 4Zm0 0c4 0 5-2.4 4-4-1.2-1.8-4 0-4 4Z" />
    </svg>
  ),
};

const LABELS: Record<NavTab, string> = {
  play: "Play",
  friends: "Friends",
  tournaments: "Tournaments",
  top: "Top Players",
  shop: "Shop",
};

const TABS: NavTab[] = ["play", "friends", "tournaments", "top", "shop"];

type BottomNavProps = {
  active: NavTab | null;
  onSelect: (tab: NavTab) => void;
};

export function BottomNav({ active, onSelect }: BottomNavProps) {
  return (
    <nav className="jk-nav">
      {TABS.map((tab) => (
        <button
          key={tab}
          className={`jk-nav__item ${active === tab ? "is-active" : ""}`}
          onClick={() => onSelect(tab)}
        >
          {ICONS[tab]}
          <span>{LABELS[tab]}</span>
        </button>
      ))}
    </nav>
  );
}

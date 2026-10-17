const PATHS: Record<string, string> = {
  dashboard: "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  new: "M12 5v14M5 12h14",
  invoices: "M6 3h9l4 4v14H6z M14 3v5h5M9 13h6M9 17h6",
  items: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4M12 11v10",
  customers: "M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .6 3.2 2.3 3.5 5.2",
  "past-bills": "M12 7v5l3 2",
  settings: "M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1",
};
export function Icon({ name }: { name: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {name === "customers" && <circle cx="9" cy="8" r="3.5" />}
      {name === "settings" && <circle cx="12" cy="12" r="3" />}
      {name === "past-bills" && <circle cx="12" cy="12" r="9" />}
      <path d={PATHS[name]} />
    </svg>
  );
}

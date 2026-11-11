const PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  bar: 'M3 10h3v4H3zM18 10h3v4h-3zM6 8h2v8H6zM16 8h2v8h-2zM8 11h8v2H8z',
  chat: 'M4 5h16v11H9l-5 4z',
  list: 'M5 6h14M5 12h14M5 18h9',
  gear: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.5 7.5 0 000-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-1.7-1L15 3.5h-4L10.7 6a7.6 7.6 0 00-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 000 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 001.7 1l.3 2.5h4l.3-2.5a7.6 7.6 0 001.7-1l2.4 1 2-3.4z',
  send: 'M20 12L4 4l3 8-3 8z',
  close: 'M6 6l12 12M18 6L6 18',
  up: 'M12 6l-6 6M12 6l6 6M12 6v12',
  down: 'M12 18l-6-6M12 18l6-6M12 18V6',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
  plus: 'M12 5v14M5 12h14',
};

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

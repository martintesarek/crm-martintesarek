const P: Record<string, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  board: 'M3 4h5v16H3zM10 4h5v11h-5zM17 4h4v7h-4z',
  house: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  user: 'M8 8a4 4 0 108 0a4 4 0 10-8 0M4 21c1-4 4-6 8-6s7 2 8 6',
  users: 'M4.5 8a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M14.5 8a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0M2 20a5 5 0 0110 0M12 20a5 5 0 0110 0',
  cal: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  gear: 'M12 9a3 3 0 100 6a3 3 0 100-6M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  search: 'M4 11a7 7 0 1014 0a7 7 0 10-14 0M20 20l-3.5-3.5',
  plus: 'M12 5v14M5 12h14',
  chevD: 'M6 9l6 6 6-6',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 18l-6-6 6-6',
  x: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12l5 5 9-10',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2',
  sms: 'M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z',
  mail: 'M3 5h18v14H3zM3 7l9 6 9-6',
  pin: 'M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM9.5 9.5a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0',
  folder: 'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z',
  image: 'M3 4h18v16H3zM7 10a2 2 0 104 0a2 2 0 10-4 0M21 16l-5-5-8 9',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM9 13a3 3 0 106 0a3 3 0 10-6 0',
  money: 'M2 6h20v12H2zM9.5 12a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0',
  tasks: 'M9 11l2.5 2.5L16 9M3 3h18v18H3z',
  logout: 'M15 4h4v16h-4M10 17l5-5-5-5M15 12H3',
  doc: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  link: 'M7 17L17 7M9 7h8v8',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  layout: 'M3 4h18v16H3zM3 10h18M9 10v10',
  grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  play: 'M7 4l12 8-12 8z',
  volume: 'M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3M8 21h8',
  bell: 'M6 9a6 6 0 0112 0c0 6 2 7.5 2 7.5H4S6 15 6 9zM10 20a2 2 0 004 0',
  clock: 'M3 12a9 9 0 1018 0a9 9 0 10-18 0M12 7v5l3 2',
}

export function Icon({ name, size = 20, className = '', stroke = 2 }: { name: keyof typeof P | string; size?: number; className?: string; stroke?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={P[name] || ''} />
    </svg>
  )
}

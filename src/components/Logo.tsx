/* Labyl logo components — inline SVG, always crisp */

/** Full wordmark (1000 × 220 viewBox). Pass width or height; the other scales automatically. */
export function Wordmark({ width, height, color = '#ffffff' }: { width?: number | string; height?: number | string; color?: string }) {
  return (
    <svg
      viewBox="0 0 1000 220"
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      style={{ display: 'block', flexShrink: 0 }}
      aria-label="Labyl"
      role="img"
    >
      <path fill={color} d="M0,0 L36,0 L36,184 L150,184 L150,220 L0,220 Z"/>
      <path fill={color} fillRule="evenodd"
            d="M252,0 L324,0 L432,220 L390,220 L368,174 L208,174 L186,220 L144,220 Z M224,140 L352,140 L288,10 Z"/>
      <path fill={color}
            d="M448,0 L568,0 C610,0 642,28 642,62 C642,82 632,98 614,106
                C638,114 652,134 652,158 C652,192 620,220 580,220 L448,220 Z
                M484,36 L484,92 L568,92 C586,92 600,80 600,64 C600,48 586,36 568,36 Z
                M484,128 L484,184 L580,184 C598,184 612,172 612,156 C612,140 598,128 580,128 Z"/>
      <path fill={color}
            d="M666,0 L710,0 L780,98 L850,0 L894,0 L800,128 L800,220 L760,220 L760,128 Z"/>
      <path fill={color} d="M910,0 L946,0 L946,184 L1000,184 L1000,220 L910,220 Z"/>
      <rect x="958" y="178" width="42" height="42" fill="#C8FF00"/>
    </svg>
  )
}

/** Square icon mark (64 × 64 viewBox). Use rx="14" for rounded app icon, rx="0" for sharp. */
export function IconMark({
  size = 32,
  rx = 14,
  bg = '#0A0A0A',
  fg = '#C8FF00',
}: {
  size?: number
  rx?: number
  bg?: string
  fg?: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0 }}
      aria-label="Labyl"
      role="img"
    >
      <rect width="64" height="64" rx={rx} fill={bg}/>
      <rect x="18" y="14" width="11" height="28" fill={fg}/>
      <rect x="18" y="46" width="32" height="11" fill={fg}/>
    </svg>
  )
}

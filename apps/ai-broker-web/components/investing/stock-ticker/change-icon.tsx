interface ChangeIconProps {
  /**
   * d - daily
   * w - weekly
   * m - monthly
   * y - yearly
   */
  letter: string
  /**
   * direction of the change: positive (green up), negative (red down), or neutral (gray)
   */
  direction: 'positive' | 'negative' | 'neutral'
  /**
   * whether the underlying value is positive (used for arrow direction in neutral state)
  */
  isPositive: boolean
}

export function ChangeIcon({ letter, direction, isPositive }: ChangeIconProps) {
  // Gray neutral triangle for small changes - arrow direction based on sign
  if (direction === 'neutral') {
    if (!isPositive) {
      // Gray down arrow for small negative changes
      return (
        <svg width="24" height="24" viewBox="0 0 256 256" className="opacity-40">
          <polygon
            points="20,36 236,36 128,232"
            fill="none"
            stroke="currentColor"
            strokeWidth="10"
            strokeLinejoin="round"
          />
          <text
            x="128"
            y="125"
            textAnchor="middle"
            fontSize="150"
            className="letter"
            fontFamily="Inter, Arial, sans-serif"
            fontWeight="700"
            fill="currentColor"
          >
            {letter}
          </text>
        </svg>
      )
    }
    // Gray up arrow for small positive changes
    return (
      <svg width="24" height="24" viewBox="0 0 256 256" className="opacity-40">
        <polygon
          points="128,24 236,220 20,220"
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <text
          x="130"
          y="200"
          textAnchor="middle"
          fontSize="150"
          fontFamily="Inter, Arial, sans-serif"
          fontWeight="700"
          fill="currentColor"
          className="letter"
        >
          {letter}
        </text>
      </svg>
    )
  }

  if (direction === 'negative') {
    // Red inverted triangle for negative changes
    return (
      <svg width="24" height="24" viewBox="0 0 256 256" className="opacity-60">
        <polygon
          points="20,36 236,36 128,232"
          fill="none"
          stroke="#ff2b2b"
          strokeWidth="10"
          strokeLinejoin="round"
        />
        <text
          x="128"
          y="125"
          textAnchor="middle"
          fontSize="150"
          className="letter"
          fontFamily="Inter, Arial, sans-serif"
          fontWeight="700"
          fill="#ff2b2b"
        >
          {letter}
        </text>
      </svg>
    )
  }

  // Green upward triangle for positive changes
  return (
    <svg width="24" height="24" viewBox="0 0 256 256" className="opacity-60">
      <polygon
        points="128,24 236,220 20,220"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeLinejoin="round"
      />
      <text
        x="130"
        y="200"
        textAnchor="middle"
        fontSize="150"
        fontFamily="Inter, Arial, sans-serif"
        fontWeight="700"
        fill="currentColor"
        className="letter"
      >
        {letter}
      </text>
    </svg>
  )
}

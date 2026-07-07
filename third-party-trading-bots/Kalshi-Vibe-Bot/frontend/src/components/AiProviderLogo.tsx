import React from 'react'
import type { AiProvider } from '../api'
import { aiProviderDisplayName } from '../api'
import geminiLogo from '../assets/ai-providers/gemini.png'
import xaiLogo from '../assets/ai-providers/xai.png'

type Props = {
  provider: AiProvider
  className?: string
}

/** Brand mark for the model that ran an analysis (Gemini or xAI). */
export const AiProviderLogo: React.FC<Props> = ({ provider, className = 'h-9 w-9' }) => {
  const label = aiProviderDisplayName(provider)
  const blend = 'mix-blend-screen'
  if (provider === 'gemini') {
    return (
      <img
        src={geminiLogo}
        alt=""
        title={label}
        className={`shrink-0 object-contain ${blend} ${className}`}
      />
    )
  }
  return (
    <img
      src={xaiLogo}
      alt=""
      title={label}
      className={`shrink-0 object-contain ${blend} ${className}`}
    />
  )
}

'use client'

import * as React from 'react'
import { Copy, Check, BotMessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface PageActionsProps {
  markdownUrl: string
}

export function CopyMarkdownButton({ markdownUrl }: PageActionsProps) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      const response = await fetch(markdownUrl)
      const text = await response.text()
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  return (
    <Button
      variant='outline'
      size='sm'
      className='gap-1.5 text-xs'
      onClick={handleCopy}
    >
      {copied ? (
        <Check className='size-3.5' />
      ) : (
        <Copy className='size-3.5' />
      )}
      {copied ? 'Copied!' : 'Copy as Markdown'}
    </Button>
  )
}

async function fetchMarkdown(markdownUrl: string): Promise<string> {
  const response = await fetch(markdownUrl)
  return response.text()
}

export function OpenInLLMButton({ markdownUrl }: PageActionsProps) {
  const handleOpen = async (llm: 'chatgpt' | 'claude' | 'deepseek' | 'grok') => {
    try {
      const text = await fetchMarkdown(markdownUrl)
      const prompt = `Here is a document in markdown. Please read it and answer any questions I have about it.\n\n${text}`

      const urls: Record<typeof llm, string> = {
        chatgpt: `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`,
        claude: `https://claude.ai/new?q=${encodeURIComponent(prompt)}`,
        deepseek: `https://chat.deepseek.com/?q=${encodeURIComponent(prompt)}`,
        grok: `https://grok.com/?q=${encodeURIComponent(prompt)}`,
      }

      window.open(urls[llm], '_blank')
    } catch (error) {
      console.error('Failed to open in LLM:', error)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' size='sm' className='gap-1.5 text-xs'>
          <BotMessageSquare className='size-3.5' />
          Open in LLM
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem onClick={() => handleOpen('chatgpt')}>
          ChatGPT
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleOpen('claude')}>
          Claude
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleOpen('deepseek')}>
          DeepSeek
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleOpen('grok')}>
          Grok
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

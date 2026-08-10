// Force dynamic rendering to avoid build-time evaluation
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { chatModel } from '@/lib/ai/providers'
import { systemPrompt } from '@/lib/ai/prompts'
import { categories } from '@/lib/constants'
import { source } from '@/lib/docs/source'
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'

// Message type for client
interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; text?: string }>
}

function getLLMsTxt() {
  const scanned: string[] = []
  scanned.push('# Docs')
  const map = new Map<string, string[]>()

  for (const page of source.getPages()) {
    const dir = page.path.split('/')[0]
    const list = map.get(dir) ?? []
    list.push(`- [${page.data.title}](${page.url}): ${page.data.description}`)
    map.set(dir, list)
  }

  for (const [key, value] of map) {
    scanned.push(`## ${categories[key]}`)
    scanned.push(value.join('\n'))
  }

  return scanned.join('\n\n')
}

// Helper to convert message content to string
function stringifyContent(content: string | Array<{ type: string; text?: string }>): string {
  if (typeof content === 'string') return content
  if (!content || !Array.isArray(content)) return ''
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
}

export async function POST(request: Request) {
  const { messages }: { messages: Message[] } = await request.json()

  // Create the prompt
  const prompt = ChatPromptTemplate.fromMessages([
    new SystemMessage(systemPrompt({ llms: getLLMsTxt() })),
    new MessagesPlaceholder('chat_history'),
    ['human', '{input}'],
  ])

  // Create the chain
  const chain = prompt.pipe(chatModel)

  // Separate the last message from the history
  const lastMessage = messages[messages.length - 1]
  const input = stringifyContent(lastMessage.content)
  const chatHistory = messages.slice(0, -1).map((m) => {
    const content = stringifyContent(m.content)
    return m.role === 'user'
      ? new HumanMessage(content)
      : new AIMessage(content)
  })

  // Stream the response using LangChain's native streaming
  const stream = await chain.stream({
    input,
    chat_history: chatHistory,
  })

  // Create a ReadableStream from the LangChain stream
  const readableStream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // Extract text content from the chunk
          const text = chunk?.content || ''
          if (text) {
            controller.enqueue(new TextEncoder().encode(text))
          }
        }
        controller.close()
      } catch (error) {
        console.error('Stream error:', error)
        controller.error(error)
      }
    },
  })

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked',
    },
  })
}

"use client"

import { useEffect, useState } from "react"
import { marked } from "marked"
import DOMPurify from "dompurify"

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = "" }: MarkdownRendererProps) {
  const [html, setHtml] = useState<string>("")

  useEffect(() => {
    const renderMarkdown = async () => {
      if (!content) {
        setHtml("")
        return
      }

      try {
        // marked.parse can be async
        const rawHtml = await marked.parse(content)
        // Sanitize the HTML
        const cleanHtml = DOMPurify.sanitize(rawHtml)
        setHtml(cleanHtml)
      } catch (error) {
        console.error("Failed to render markdown:", error)
        setHtml(content) // Fallback to raw content
      }
    }

    renderMarkdown()
  }, [content])

  return (
    <div 
      className={`prose prose-sm dark:prose-invert max-w-none ${className}`}
      dangerouslySetInnerHTML={{ __html: html }} 
    />
  )
}

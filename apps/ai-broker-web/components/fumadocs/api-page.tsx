'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

// Scalar API reference removed - using CDN version in /api/docs instead
// If you need the React component, reinstall: pnpm add @scalar/api-reference-react
const ApiReferenceReact = null

interface APIPageProps {
  document?: any
  operations?: Array<{ path: string; method: string }>
  className?: string
  children?: React.ReactNode
}

export function APIPage({ className, children, document, operations, ...props }: APIPageProps) {
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (document && typeof document === 'object') {
    let spec = document

    // Optional: Filter operations if needed
    if (operations && Array.isArray(operations) && operations.length > 0) {
      // Filter paths in the spec to only show the requested operations
      const filteredPaths: Record<string, any> = {}
      let hasMatches = false

      operations.forEach(op => {
        // Handle path matching (simple exact match for now)
        // OpenAPI paths might have variables {x}, check exact string match from prop
        const pathKey = op.path
        if (spec.paths && spec.paths[pathKey]) {
          if (!filteredPaths[pathKey]) filteredPaths[pathKey] = {}
          // If method is specified, include only that method
          if (op.method) {
            const method = op.method.toLowerCase()
            if (spec.paths[pathKey][method]) {
              filteredPaths[pathKey][method] = spec.paths[pathKey][method]
              hasMatches = true
            }
          } else {
            // Include all methods for this path?
            filteredPaths[pathKey] = spec.paths[pathKey]
            hasMatches = true
          }
        }
      })

      if (hasMatches) {
        spec = {
          ...spec,
          paths: filteredPaths
        }
      }
    }

    return (
      <div className={cn('api-page rounded-lg border bg-card overflow-hidden p-6', className)} {...props}>
        <div className="text-muted-foreground">
          <p>API Reference component not available.</p>
          <p className="text-sm mt-2">
            Use <a href="/api/docs" className="text-primary underline">/api/docs</a> for API documentation.
          </p>
        </div>
      </div>
    )
  }

  // Fallback to children (if any)
  return (
    <div
      className={cn('api-page rounded-lg border bg-card p-6', className)}
      {...props}
    >
      {children}
    </div>
  )
}

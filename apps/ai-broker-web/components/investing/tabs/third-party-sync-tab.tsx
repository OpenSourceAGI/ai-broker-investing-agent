"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useState } from "react"
import {
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  Database,
  TrendingUp,
  Users,
  BarChart3
} from "lucide-react"

interface SyncStatus {
  platform: string
  status: 'idle' | 'syncing' | 'success' | 'error'
  message?: string
  lastSync?: Date
}

export function ThirdPartySyncTab() {
  const [syncStatuses, setSyncStatuses] = useState<Record<string, SyncStatus>>({
    polymarket: { platform: 'Polymarket', status: 'idle' },
    nvstly: { platform: 'NVSTLY', status: 'idle' }
  })

  const updateSyncStatus = (platform: string, updates: Partial<SyncStatus>) => {
    setSyncStatuses(prev => ({
      ...prev,
      [platform]: { ...prev[platform], ...updates }
    }))
  }

  const syncPolymarket = async () => {
    updateSyncStatus('polymarket', { status: 'syncing', message: undefined })

    try {
      const response = await fetch('/api/cron/sync-polymarket', {
        method: 'GET'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Sync failed')
      }

      const data = await response.json()
      updateSyncStatus('polymarket', {
        status: 'success',
        message: `Synced ${data.traderCount || 0} traders successfully`,
        lastSync: new Date()
      })
    } catch (error: any) {
      updateSyncStatus('polymarket', {
        status: 'error',
        message: error.message || 'Failed to sync Polymarket data'
      })
    }
  }

  const syncNvstly = async () => {
    updateSyncStatus('nvstly', { status: 'syncing', message: undefined })

    try {
      const response = await fetch('/api/nvstly/sync', {
        method: 'GET'
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Sync failed')
      }

      const data = await response.json()
      updateSyncStatus('nvstly', {
        status: 'success',
        message: data.message || 'Sync completed successfully',
        lastSync: new Date()
      })
    } catch (error: any) {
      updateSyncStatus('nvstly', {
        status: 'error',
        message: error.message || 'Failed to sync NVSTLY data'
      })
    }
  }

  const syncAll = async () => {
    await Promise.all([
      syncPolymarket(),
      syncNvstly()
    ])
  }

  const renderSyncButton = (platform: string, syncFn: () => void, icon: any) => {
    const status = syncStatuses[platform]
    const Icon = icon

    return (
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{status.platform}</h3>
              <p className="text-sm text-muted-foreground">
                {platform === 'polymarket' && 'Prediction markets & trader leaderboards'}
                {platform === 'nvstly' && 'Copy trading leaders & order flow'}
              </p>
            </div>
          </div>

          <Badge
            variant={
              status.status === 'success' ? 'default' :
              status.status === 'error' ? 'destructive' :
              'outline'
            }
            className={status.status === 'success' ? 'bg-green-500' : ''}
          >
            {status.status === 'idle' && 'Ready'}
            {status.status === 'syncing' && 'Syncing...'}
            {status.status === 'success' && 'Success'}
            {status.status === 'error' && 'Error'}
          </Badge>
        </div>

        {status.message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            status.status === 'success' ? 'bg-green-500/10 text-green-700 dark:text-green-400' :
            status.status === 'error' ? 'bg-red-500/10 text-red-700 dark:text-red-400' :
            'bg-muted'
          }`}>
            {status.message}
          </div>
        )}

        {status.lastSync && (
          <p className="text-xs text-muted-foreground mb-4">
            Last synced: {status.lastSync.toLocaleString()}
          </p>
        )}

        <Button
          onClick={syncFn}
          disabled={status.status === 'syncing'}
          className="w-full"
        >
          {status.status === 'syncing' ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync {status.platform}
            </>
          )}
        </Button>
      </Card>
    )
  }

  const isSyncing = Object.values(syncStatuses).some(s => s.status === 'syncing')

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-2 border-primary/20">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Third-Party Data Sync</h2>
            <p className="text-muted-foreground">
              Synchronize data from external platforms to keep your trading insights up-to-date.
            </p>
          </div>
          <Database className="h-12 w-12 text-primary opacity-50" />
        </div>

        <div className="mt-6">
          <Button
            onClick={syncAll}
            disabled={isSyncing}
            size="lg"
            className="w-full md:w-auto"
          >
            {isSyncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Syncing All Platforms...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync All Platforms
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Platform Sync Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {renderSyncButton('polymarket', syncPolymarket, TrendingUp)}
        {renderSyncButton('nvstly', syncNvstly, Users)}
      </div>

      {/* Info Card */}
      <Card className="p-6">
        <h3 className="font-bold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          About Data Syncing
        </h3>
        <div className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-foreground">Polymarket:</span> Fetches top traders,
              their positions, category analytics, and market data for prediction market insights.
            </div>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-foreground">NVSTLY:</span> Syncs copy trading
              leaderboards and order flow data to track top-performing traders in stocks and options.
            </div>
          </div>
          <div className="flex items-start gap-2 pt-2 border-t">
            <XCircle className="h-4 w-4 text-yellow-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-semibold text-foreground">Note:</span> Syncing may take several
              minutes depending on data volume. API rate limits are respected automatically.
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

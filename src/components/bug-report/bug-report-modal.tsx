'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Id } from '../../../convex/_generated/dataModel'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Bug, X } from 'lucide-react'
import { startSessionRecording, getSessionId, getSessionReplayUrl } from '@/lib/analytics/posthog'
import { analytics } from '@/lib/analytics/events'
import { toast } from 'sonner'

interface BugReportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BugReportModal({
  open,
  onOpenChange,
}: BugReportModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  const currentUser = useQuery(api.users.current)
  const createBugReport = useMutation(api.bugReports.create)

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true)
  }, [])

  const updateSessionRecording = useMutation(api.bugReports.updateSessionRecording)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    setIsSubmitting(true)

    try {
      // Create bug report in Convex
      const bugReportId = await createBugReport({
        title: title.trim(),
        description: description.trim(),
        userName: currentUser?.name,
        userEmail: currentUser?.email,
      })

      // Ensure PostHog session recording is active
      startSessionRecording()
      const sessionId = getSessionId()

      // Get session replay URL with timestamp pointing to when the bug was reported
      const sessionUrl = getSessionReplayUrl()

      // Save session recording info to Convex immediately
      if (sessionUrl && sessionId) {
        await updateSessionRecording({
          bugReportId: bugReportId as Id<'bugReports'>,
          sessionRecordingUrl: sessionUrl,
          posthogSessionId: sessionId,
        })
      }

      // Track bug report submission
      analytics.bugReportSubmitted({
        bugReportId: bugReportId as string,
        title: title.trim(),
        sessionId: sessionId || undefined,
      })

      // Track recording started
      analytics.bugReportRecordingStarted({
        bugReportId: bugReportId as string,
      })

      toast.success('Bug report submitted!')

      // Don't show recording widget - session is already being recorded by PostHog
      // onRecordingStart(bugReportId as string)

      // Reset form
      setTitle('')
      setDescription('')

      // Close modal
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to submit bug report:', error)
      toast.error('Failed to submit bug report. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle escape key and click outside
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onOpenChange(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if clicking inside the modal
      if (open && !target.closest('[data-bug-report-modal]')) {
        onOpenChange(false)
      }
    }

    if (open) {
      document.addEventListener('keydown', handleEscape)
      // Small delay to prevent immediate closing
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside)
      }, 100)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onOpenChange])

  if (!open || !mounted) return null

  const modalContent = (
    <div
      data-bug-report-modal
      className="fixed left-[280px] bottom-20 w-[380px] bg-background border border-border rounded-lg shadow-2xl z-[100] animate-in slide-in-from-left duration-200"
      style={{ position: 'fixed' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bug className="h-4 w-4 text-destructive" />
          <h2 className="text-sm font-semibold">Report a Bug</h2>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenChange(false)
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="title" className="text-xs">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Brief description of the issue"
            required
            disabled={isSubmitting}
            autoFocus
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description" className="text-xs">Description</Label>
          <Textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What went wrong and what were you trying to do?"
            required
            disabled={isSubmitting}
            className="resize-none h-[100px] text-sm"
          />
        </div>

        <div className="bg-muted/50 border border-border rounded-md p-2.5 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <span>ℹ️</span>
            <span>
              Your session will be saved to help us understand and fix the issue.
            </span>
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onOpenChange(false)
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Report'}
          </Button>
        </div>
      </form>
    </div>
  )

  return createPortal(modalContent, document.body)
}

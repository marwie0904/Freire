'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../../convex/_generated/api'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Lightbulb, X } from 'lucide-react'
import { toast } from 'sonner'

interface FeatureRequestModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeatureRequestModal({
  open,
  onOpenChange,
}: FeatureRequestModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  const currentUser = useQuery(api.users.current)
  const createFeatureRequest = useMutation(api.featureRequests.create)

  // Ensure component is mounted (client-side only)
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !description.trim()) {
      toast.error('Please fill in all fields')
      return
    }

    setIsSubmitting(true)

    try {
      // Create feature request in Convex with actual user data
      await createFeatureRequest({
        title: title.trim(),
        description: description.trim(),
        userName: currentUser?.name,
        userEmail: currentUser?.email,
      })

      toast.success('Feature request submitted!')

      // Reset form
      setTitle('')
      setDescription('')

      // Close modal
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to submit feature request:', error)
      toast.error('Failed to submit feature request. Please try again.')
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
      if (open && !target.closest('[data-feature-request-modal]')) {
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
      data-feature-request-modal
      className="fixed left-[280px] bottom-20 w-[380px] bg-background border border-border rounded-lg shadow-2xl z-[100] animate-in slide-in-from-left duration-200"
      style={{ position: 'fixed' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Request a Feature</h2>
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
            placeholder="Brief description of the feature"
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
            placeholder="Describe the feature you'd like to see"
            required
            disabled={isSubmitting}
            className="resize-none h-[100px] text-sm"
          />
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
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </Button>
        </div>
      </form>
    </div>
  )

  return createPortal(modalContent, document.body)
}

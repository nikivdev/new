"use client"

import { atom, action, reatomBoolean, wrap } from '@/shared/reatom/core'
import { reatomComponent } from '@reatom/react'
import { Modal } from '@/lib/settings-components'
import { useJazzAuth } from '@/lib/jazz/hooks'

interface FeedbackModalProps {
  onClose: () => void
}

type FeedbackCategory = 'feature' | 'bug' | 'improvement' | 'other'

const feedbackContentAtom = atom('', 'feedbackContent')
const feedbackCategoryAtom = atom<FeedbackCategory>('feature', 'feedbackCategory')
const feedbackSubmittingAtom = reatomBoolean(false, 'feedbackSubmitting')
const feedbackSubmittedAtom = reatomBoolean(false, 'feedbackSubmitted')
const feedbackErrorAtom = atom<string | null>(null, 'feedbackError')

const resetFeedbackForm = action(() => {
  feedbackContentAtom.set('')
  feedbackCategoryAtom.set('feature')
  feedbackSubmittingAtom.set(false)
  feedbackSubmittedAtom.set(false)
  feedbackErrorAtom.set(null)
}, 'resetFeedbackForm')

const submitFeedback = action(async (email: string | null) => {
  const content = feedbackContentAtom().trim()
  const category = feedbackCategoryAtom()

  if (!content) {
    feedbackErrorAtom.set('Please enter your feedback')
    return
  }

  feedbackSubmittingAtom.set(true)
  feedbackErrorAtom.set(null)

  try {
    const response = await wrap(fetch('https://1f.nikiv.dev/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        project_name: 'starter.app',
        content,
        user_email: email || null,
        category,
      }),
    }))

    if (!response.ok) {
      throw new Error('Failed to submit feedback')
    }

    feedbackSubmittedAtom.set(true)
  } catch (error) {
    feedbackErrorAtom.set('Failed to submit feedback. Please try again.')
    console.error('[feedback] submit error:', error)
  } finally {
    feedbackSubmittingAtom.set(false)
  }
}, 'submitFeedback')

export const FeedbackModal = reatomComponent(({ onClose }: FeedbackModalProps) => {
  const { profile, session } = useJazzAuth()

  const content = feedbackContentAtom()
  const category = feedbackCategoryAtom()
  const isSubmitting = feedbackSubmittingAtom()
  const submitted = feedbackSubmittedAtom()
  const error = feedbackErrorAtom()

  const email = profile?.email || session?.user?.email || null

  const handleClose = () => {
    resetFeedbackForm()
    onClose()
  }

  if (submitted) {
    return (
      <Modal title="Thank you!" onClose={handleClose}>
        <p className="text-white/80">
          Your feedback has been submitted. We appreciate you taking the time to help us improve.
        </p>
        <button
          type="button"
          onClick={handleClose}
          className="w-full mt-4 py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
        >
          Close
        </button>
      </Modal>
    )
  }

  return (
    <Modal
      title="Send Feedback"
      description="Help us improve by sharing your thoughts, bug reports, or feature requests."
      onClose={handleClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Category
          </label>
          <div className="flex gap-2">
            {([
              { value: 'feature', label: 'Feature' },
              { value: 'bug', label: 'Bug' },
              { value: 'improvement', label: 'Improvement' },
              { value: 'other', label: 'Other' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => feedbackCategoryAtom.set(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  category === opt.value
                    ? 'bg-teal-500/20 text-teal-400 border border-teal-500/40'
                    : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Your feedback
          </label>
          <textarea
            value={content}
            onChange={(e) => feedbackContentAtom.set(e.target.value)}
            placeholder="What would you like to share with us?"
            rows={4}
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-rose-400">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 font-medium transition-colors border border-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submitFeedback(email)}
            disabled={isSubmitting || !content.trim()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-teal-500 hover:bg-teal-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors"
          >
            {isSubmitting ? 'Sending...' : 'Send Feedback'}
          </button>
        </div>
      </div>
    </Modal>
  )
})

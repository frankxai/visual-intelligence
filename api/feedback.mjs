/**
 * Vercel Serverless Function: Curation Feedback Endpoint
 * Handles POST /api/feedback from the deployed Luminous web app.
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const {
      asset_id,
      assetId,
      action = 'curate',
      rating,
      defects = [],
      notes,
      scope = 'asset',
      brand = 'estate',
      actor = 'luminous-web',
    } = body

    const targetId = asset_id || assetId
    if (!targetId) {
      return res.status(400).json({ ok: false, error: 'Missing asset_id' })
    }

    const ts = new Date().toISOString()
    const outboxId = `fbout_cloud_${Date.now()}_${targetId.slice(0, 8)}`

    let approvalStatus = 'candidate'
    let polarity = 'neutral'

    if (action === 'approve' || (rating && Number(rating) >= 4)) {
      approvalStatus = 'approved'
      polarity = 'positive'
    } else if (action === 'reject' || (rating && Number(rating) <= 2) || (Array.isArray(defects) && defects.length > 0)) {
      approvalStatus = 'rejected'
      polarity = 'negative'
    } else if (Number(rating) === 3) {
      approvalStatus = 'needs-review'
      polarity = 'neutral'
    }

    const receipt = {
      outbox_id: outboxId,
      asset_id: targetId,
      action,
      rating: rating ? Number(rating) : null,
      approval_status: approvalStatus,
      defects: Array.isArray(defects) ? defects : [defects].filter(Boolean),
      notes: notes || null,
      scope,
      polarity,
      brand,
      actor,
      timestamp: ts,
      cloud_receipt: true,
    }

    // If GITHUB_TOKEN is available, append event or dispatch webhook to repo
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) {
      try {
        await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`, {
          method: 'POST',
          headers: {
            Authorization: `token ${process.env.GITHUB_TOKEN}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Luminous-Studio-Vercel',
          },
          body: JSON.stringify({
            event_type: 'vis_curation_feedback',
            client_payload: receipt,
          }),
        })
      } catch (err) {
        console.error('GitHub dispatch warning:', err.message)
      }
    }

    return res.status(200).json({
      ok: true,
      receipt,
      message: `Curation recorded for ${targetId}: ${action} (${approvalStatus})`,
    })
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message })
  }
}

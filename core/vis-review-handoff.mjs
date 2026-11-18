// Reference-only GenCreator staging boundary. No network transport.
import { eligibleHandoff } from './vis-review.mjs'

const surfaces = new Set(['editorial', 'newsletter', 'linkedin', 'website', 'slides', 'interactive'])

export function prepareReviewHandoff(db, context, assetId, placement) {
  if (!placement || !surfaces.has(placement.channel)) throw new Error('unsupported channel')
  for (const key of ['campaign_id', 'content_id', 'variant_id', 'placement_id']) {
    if (typeof placement[key] !== 'string' || !/^[\w.-]{1,120}$/.test(placement[key]))
      throw new Error('invalid placement identity')
  }
  const { channel, campaign_id, content_id, variant_id, placement_id } = placement
  const destination = [channel, campaign_id, content_id, variant_id, placement_id].join('/')
  const { version, sha256, authorization_nonce, expires_at } = eligibleHandoff(
    db,
    context,
    assetId,
    destination
  )
  return {
    schema: 'vis.channel-handoff/1',
    mode: 'draft',
    tenant: context.tenant,
    channel,
    campaign_id,
    content_id,
    variant_id,
    placement_id,
    destination,
    asset_id: assetId,
    version,
    sha256,
    authorization_nonce,
    expires_at,
    delivery_state: 'awaiting_channel_review',
    provider_receipt: null
  }
}

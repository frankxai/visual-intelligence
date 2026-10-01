import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

export function generateNftMetadata(asset, options = {}) {
  const filePath = asset.primary_path || asset.absolute_path || asset.path
  const filename = path.basename(filePath)
  const title = asset.title || filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
  const collectionName = options.collectionName || 'Arcanea Universe'
  const creatorAddress = options.creatorAddress || '0x0000000000000000000000000000000000000000'

  const attributes = []

  // Lore / Gate attributes
  if (asset.category?.includes('guardian')) {
    attributes.push({ trait_type: 'Class', value: 'Guardian' })
  } else if (asset.category?.includes('luminor')) {
    attributes.push({ trait_type: 'Class', value: 'Luminor' })
  } else if (asset.category?.includes('godbeast')) {
    attributes.push({ trait_type: 'Class', value: 'Godbeast' })
  }

  // Tags & Mood
  const tags = Array.isArray(asset.tags) ? asset.tags : []
  for (const tag of tags) {
    if (['fire', 'water', 'earth', 'wind', 'light', 'void', 'lightning'].includes(tag.toLowerCase())) {
      attributes.push({ trait_type: 'Element', value: capitalize(tag) })
    }
  }
  if (asset.mood) {
    attributes.push({ trait_type: 'Mood', value: capitalize(asset.mood) })
  }

  // Palette color
  const dominantColor = asset.color_palette?.dominant || (asset.palette?.dominant)
  if (dominantColor) {
    attributes.push({ trait_type: 'Dominant Color', value: dominantColor })
  }

  // Provenance attributes
  attributes.push({ trait_type: 'Media Type', value: capitalize(asset.media_type || 'image') })
  attributes.push({ trait_type: 'Provenance Standard', value: 'VIS-3.0' })
  attributes.push({ trait_type: 'Rights Status', value: asset.rights_status || 'unknown' })

  const isMotionOrAudio = ['video', 'audio'].includes(asset.media_type)

  const metadata = {
    name: title,
    description: asset.notes || asset.summary || `${title} from the ${collectionName} ecosystem.`,
    image: options.imageCid ? `ipfs://${options.imageCid}` : 'ipfs://<PENDING_IMAGE_CID>',
    ...(isMotionOrAudio ? { animation_url: options.mediaCid ? `ipfs://${options.mediaCid}` : 'ipfs://<PENDING_MEDIA_CID>' } : {}),
    external_url: options.externalUrl || `https://arcanea.ai/gallery/${asset.asset_id || ''}`,
    attributes,
    compiler: 'Visual Intelligence OS / Arcanea Creator Engine',
    properties: {
      category: asset.media_type || 'image',
      files: [
        {
          uri: options.imageCid ? `ipfs://${options.imageCid}` : 'ipfs://<PENDING_IMAGE_CID>',
          type: asset.media_type === 'video' ? 'video/mp4' : (asset.media_type === 'audio' ? 'audio/mpeg' : 'image/png'),
        },
      ],
      creators: [
        {
          address: creatorAddress,
          share: 100,
        },
      ],
    },
  }

  return metadata
}

export function planIpfsNftBundle(assets, options = {}) {
  const collectionName = options.collectionName || 'Arcanea Guardians & Lore Masters'
  const items = assets.map((asset, index) => {
    const filePath = asset.primary_path || asset.absolute_path || asset.path
    const filename = path.basename(filePath)
    const metadata = generateNftMetadata(asset, { ...options, collectionName })
    const sizeBytes = Number(asset.byte_size || (asset.sizeKB ? Math.round(asset.sizeKB * 1024) : 0))

    let sha256 = asset.sha256 || asset.source_hash || null
    if (!sha256 && fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath)
      sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')
    }

    return {
      token_id: index + 1,
      asset_id: asset.asset_id,
      title: metadata.name,
      source_path: filePath,
      media_type: asset.media_type,
      size_bytes: sizeBytes,
      sha256,
      metadata,
      approval_status: asset.approval_status || 'candidate',
      rights_status: asset.rights_status || 'unknown',
    }
  })

  return {
    provider: 'ipfs',
    protocol: 'erc-721 / metaplex / story-protocol',
    collection_name: collectionName,
    generated_at: new Date().toISOString(),
    total_items: items.length,
    total_bytes: items.reduce((sum, item) => sum + item.size_bytes, 0),
    total_mb: Number((items.reduce((sum, item) => sum + item.size_bytes, 0) / (1024 * 1024)).toFixed(2)),
    items,
  }
}

export async function executeIpfsNftUpload(bundle, options = {}) {
  const pinataJwt = options.pinataJwt || process.env.PINATA_JWT
  if (!pinataJwt) {
    throw new Error('PINATA_JWT is required in environment or options to execute IPFS pinning')
  }

  const results = []
  for (const item of bundle.items) {
    if (!fs.existsSync(item.source_path)) {
      results.push({
        ...item,
        status: 'failed',
        error: `Source file not found: ${item.source_path}`,
      })
      continue
    }

    try {
      // 1. Pin Asset File
      const fileBuffer = fs.readFileSync(item.source_path)
      const filename = path.basename(item.source_path)
      
      const formData = new FormData()
      formData.append('file', new Blob([fileBuffer]), filename)
      formData.append('pinataMetadata', JSON.stringify({ name: `${bundle.collection_name} - ${item.title}` }))

      const fileRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pinataJwt}`,
        },
        body: formData,
      })

      if (!fileRes.ok) {
        const errText = await fileRes.text()
        throw new Error(`Failed to pin file: ${errText}`)
      }

      const fileData = await fileRes.json()
      const imageCid = fileData.IpfsHash

      // 2. Pin Metadata JSON with updated CID
      const finalMetadata = {
        ...item.metadata,
        image: `ipfs://${imageCid}`,
        properties: {
          ...item.metadata.properties,
          files: [{ uri: `ipfs://${imageCid}`, type: 'image/png' }],
        },
      }

      const metaRes = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pinataJwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          pinataMetadata: { name: `${bundle.collection_name} - ${item.title} (Metadata)` },
          pinataContent: finalMetadata,
        }),
      })

      if (!metaRes.ok) {
        const errText = await metaRes.text()
        throw new Error(`Failed to pin metadata JSON: ${errText}`)
      }

      const metaData = await metaRes.json()
      const metadataCid = metaData.IpfsHash

      results.push({
        ...item,
        status: 'pinned',
        image_cid: imageCid,
        metadata_cid: metadataCid,
        ipfs_image_uri: `ipfs://${imageCid}`,
        ipfs_metadata_uri: `ipfs://${metadataCid}`,
        gateway_url: `https://gateway.pinata.cloud/ipfs/${imageCid}`,
        pinned_at: new Date().toISOString(),
      })
    } catch (err) {
      results.push({
        ...item,
        status: 'failed',
        error: err.message,
      })
    }
  }

  return {
    provider: 'ipfs',
    collection_name: bundle.collection_name,
    executed_at: new Date().toISOString(),
    total: results.length,
    pinned_count: results.filter(r => r.status === 'pinned').length,
    failed_count: results.filter(r => r.status === 'failed').length,
    results,
  }
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
}

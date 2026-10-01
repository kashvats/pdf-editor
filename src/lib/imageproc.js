// Canvas image processing algorithms for document scan enhancement

export function autoCropCanvas(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const imgData = ctx.getImageData(0, 0, width, height)
  const d = imgData.data

  let minX = width, minY = height, maxX = 0, maxY = 0

  // Find bounding box of non-border content
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const idx = (y * width + x) * 4
      const brightness = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114
      // Look for darker pixels (content) or paper boundary
      if (brightness < 240) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  const pad = 12
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width, maxX + pad)
  maxY = Math.min(height, maxY + pad)

  const cropW = maxX - minX
  const cropH = maxY - minY

  if (cropW < 50 || cropH < 50 || (cropW > width * 0.95 && cropH > height * 0.95)) {
    return canvas // No significant crop needed
  }

  const out = document.createElement('canvas')
  out.width = cropW
  out.height = cropH
  const outCtx = out.getContext('2d')
  outCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH)
  return out
}

export function rotateCanvas(canvas, degrees) {
  if (!degrees || degrees % 360 === 0) return canvas
  const rad = ((degrees % 360 + 360) % 360) * Math.PI / 180
  const is90 = Math.abs(degrees) % 180 === 90

  const out = document.createElement('canvas')
  out.width = is90 ? canvas.height : canvas.width
  out.height = is90 ? canvas.width : canvas.height
  const ctx = out.getContext('2d')

  ctx.translate(out.width / 2, out.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2)
  return out
}

// Projection variance deskew
export function deskewCanvas(canvas) {
  const { width, height } = canvas
  // Sample downscaled version to estimate angle quickly
  const thumbW = 300
  const thumbH = Math.round(300 * (height / width))
  const thumb = document.createElement('canvas')
  thumb.width = thumbW
  thumb.height = thumbH
  const tCtx = thumb.getContext('2d')
  tCtx.drawImage(canvas, 0, 0, thumbW, thumbH)
  const d = tCtx.getImageData(0, 0, thumbW, thumbH).data

  // Test angles between -4 and +4 degrees in 0.5 step
  let bestAngle = 0
  let maxVar = -1

  for (let angle = -4; angle <= 4; angle += 0.5) {
    const rad = (angle * Math.PI) / 180
    const cos = Math.cos(rad)
    const sin = Math.sin(rad)
    const rowSums = new Float32Array(thumbH)

    for (let y = 0; y < thumbH; y += 3) {
      for (let x = 0; x < thumbW; x += 3) {
        const ry = Math.round((x - thumbW / 2) * sin + (y - thumbH / 2) * cos + thumbH / 2)
        if (ry >= 0 && ry < thumbH) {
          const idx = (y * thumbW + x) * 4
          const lum = d[idx] * 0.299 + d[idx + 1] * 0.587 + d[idx + 2] * 0.114
          if (lum < 160) rowSums[ry] += 1
        }
      }
    }

    // Variance of row sums
    let mean = 0
    for (let i = 0; i < thumbH; i++) mean += rowSums[i]
    mean /= thumbH
    let variance = 0
    for (let i = 0; i < thumbH; i++) {
      const diff = rowSums[i] - mean
      variance += diff * diff
    }

    if (variance > maxVar) {
      maxVar = variance
      bestAngle = angle
    }
  }

  if (Math.abs(bestAngle) >= 0.5) {
    return rotateCanvas(canvas, -bestAngle)
  }
  return canvas
}

// Removes shadows, cleans paper background, and enhances dark document text
export function cleanDocumentCanvas(canvas, { removeShadows = true, cleanBg = true, enhanceText = true } = {}) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const imgData = ctx.getImageData(0, 0, width, height)
  const d = imgData.data

  for (let i = 0; i < d.length; i += 4) {
    let lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114

    // Background cleaning: push off-white / gray paper backgrounds towards pure white
    if (cleanBg) {
      if (lum > 175) {
        lum = Math.min(255, lum * 1.25)
      } else if (lum < 110 && enhanceText) {
        // Deepen text
        lum = Math.max(0, lum * 0.75)
      }
    }

    // Shadow removal: threshold high-contrast document mode
    if (removeShadows) {
      if (lum > 155) lum = 255
      else if (lum < 125) lum = 0
    }

    d[i] = lum
    d[i + 1] = lum
    d[i + 2] = lum
  }

  ctx.putImageData(imgData, 0, 0)
  return canvas
}

export function processImageEdit(src, { rotateDeg = 0, filter = 'none' } = {}) {
  return new Promise((resolve) => {
    if (!src) return resolve(src)
    const img = new Image()
    img.onload = () => {
      const is90 = Math.abs(rotateDeg) % 180 === 90
      const canvas = document.createElement('canvas')
      canvas.width = is90 ? img.naturalHeight : img.naturalWidth
      canvas.height = is90 ? img.naturalWidth : img.naturalHeight
      const ctx = canvas.getContext('2d')

      if (rotateDeg) {
        ctx.translate(canvas.width / 2, canvas.height / 2)
        ctx.rotate((rotateDeg * Math.PI) / 180)
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2)
      } else {
        ctx.drawImage(img, 0, 0)
      }

      if (filter && filter !== 'none') {
        const idata = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const d = idata.data
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2]
          const lum = r * 0.299 + g * 0.587 + b * 0.114
          if (filter === 'grayscale') {
            d[i] = lum; d[i + 1] = lum; d[i + 2] = lum
          } else if (filter === 'bw') {
            const v = lum > 135 ? 255 : 0
            d[i] = v; d[i + 1] = v; d[i + 2] = v
          } else if (filter === 'invert') {
            d[i] = 255 - r; d[i + 1] = 255 - g; d[i + 2] = 255 - b
          } else if (filter === 'sepia') {
            d[i] = Math.min(255, lum * 1.25)
            d[i + 1] = Math.min(255, lum * 1.05)
            d[i + 2] = Math.min(255, lum * 0.8)
          }
        }
        ctx.putImageData(idata, 0, 0)
      }

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}


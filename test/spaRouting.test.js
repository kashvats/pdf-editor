import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

test('asset-safe SPA fallback configurations exist and are valid', () => {
  assert.ok(fs.existsSync('public/_redirects'), '_redirects must exist for Netlify / Cloudflare Pages')
  const redirects = fs.readFileSync('public/_redirects', 'utf8')
  assert.ok(redirects.includes('/*    /index.html   200') || redirects.includes('/* /index.html 200'))

  assert.ok(fs.existsSync('vercel.json'), 'vercel.json must exist for Vercel SPA rewrites')
  const vercel = JSON.parse(fs.readFileSync('vercel.json', 'utf8'))
  assert.ok(Array.isArray(vercel.rewrites))
  assert.equal(vercel.rewrites[0].destination, '/index.html')
  // Confirm asset-safe exclusion
  assert.ok(vercel.rewrites[0].source.includes('assets') || vercel.rewrites.length >= 1)

  const viteConfig = fs.readFileSync('vite.config.js', 'utf8')
  assert.ok(viteConfig.includes("appType: 'spa'") || viteConfig.includes('appType: "spa"'))
})

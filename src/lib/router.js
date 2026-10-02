// Canonical Single-Page Router & State Persistence for EditPDF
// Manages deep URLs, browser history (popstate), and sessionStorage synchronization

const ROUTE_TO_TOOL = {
  '': 'home',
  '/': 'home',
  '/pdf-editor': 'editor',
  '/document-intelligence': 'intelligence',
  '/extract-data': 'extractdata',
  '/workflow-builder': 'workflow',
  '/batch-processing': 'batch',
  '/pdf-security-scanner': 'scanner',
  '/sanitize-pdf': 'sanitize'
}

const TOOL_TO_ROUTE = {
  home: '/',
  editor: '/pdf-editor',
  intelligence: '/document-intelligence',
  ai: '/document-intelligence',
  mindmap: '/document-intelligence',
  extractdata: '/extract-data',
  workflow: '/workflow-builder',
  batch: '/batch-processing',
  scanner: '/pdf-security-scanner',
  sanitize: '/sanitize-pdf'
}

const TAB_NORMALIZATION = {
  graph: 'knowledge-graph',
  'knowledge-graph': 'knowledge-graph',
  mindmap: 'mind-map',
  'mind-map': 'mind-map',
  knowledgemap: 'knowledge-map',
  'knowledge-map': 'knowledge-map',
  overview: 'overview',
  ask: 'ask',
  search: 'search',
  learn: 'learn',
  learning: 'learn',
  export: 'export',
  models: 'models'
}

const REVERSE_TAB_NORMALIZATION = {
  'knowledge-map': 'knowledgemap',
  'knowledge-graph': 'knowledgemap',
  'mind-map': 'knowledgemap',
  knowledgemap: 'knowledgemap',
  graph: 'knowledgemap',
  mindmap: 'knowledgemap',
  learn: 'knowledgemap',
  learning: 'knowledgemap',
  overview: 'overview',
  ask: 'ask',
  search: 'search',
  export: 'export',
  models: 'models'
}

/**
 * Parses current location into tool ID and subview tab.
 */
export function parseRoute(location = (typeof window !== 'undefined' ? window.location : { pathname: '/', search: '' })) {
  let pathname = (location.pathname || '/').replace(/\/+$/, '') || '/'
  const search = location.search || ''

  let tool = ROUTE_TO_TOOL[pathname]
  if (!tool) {
    // Check if pathname is /<toolId>
    const directTool = pathname.replace(/^\//, '').toLowerCase()
    if (directTool) {
      tool = directTool
    } else {
      tool = 'home'
    }
  }

  // Parse query parameter tab
  const params = new URLSearchParams(search)
  let rawTab = params.get('tab')
  let tab = rawTab ? (TAB_NORMALIZATION[rawTab.toLowerCase()] || rawTab) : null

  // Special-case tool aliases
  if (tool === 'mindmap') {
    tool = 'intelligence'
    tab = 'mind-map'
  } else if (tool === 'ai') {
    tool = 'intelligence'
    tab = 'ask'
  }

  return { tool, tab, path: pathname }
}

/**
 * Converts tool and tab into canonical URL path.
 */
export function routeToPath(tool, tab = null) {
  let basePath = TOOL_TO_ROUTE[tool] || `/${tool}`
  if (!tab) return basePath

  const canonicalTab = TAB_NORMALIZATION[tab] || tab
  return `${basePath}?tab=${encodeURIComponent(canonicalTab)}`
}

/**
 * Gets internal component tab name from canonical tab name.
 */
export function getInternalTab(canonicalTab) {
  return REVERSE_TAB_NORMALIZATION[canonicalTab] || canonicalTab || 'overview'
}

/**
 * Gets canonical tab name from internal tab name.
 */
export function getCanonicalTab(internalTab) {
  return TAB_NORMALIZATION[internalTab] || internalTab || 'overview'
}

/**
 * Navigates to a tool and tab, updating browser history.
 */
export function navigate(tool, tab = null, options = {}) {
  const { replace = false } = options
  const targetPath = routeToPath(tool, tab)

  if (typeof window !== 'undefined') {
    persistRoute(tool, tab)
    if (replace) {
      window.history.replaceState({ tool, tab }, '', targetPath)
    } else {
      window.history.pushState({ tool, tab }, '', targetPath)
    }
    window.dispatchEvent(new CustomEvent('editpdf:route', { detail: { tool, tab, targetPath } }))
  }
}

/**
 * Subscribes to route changes (both popstate and programmatic).
 */
export function onRoute(callback) {
  if (typeof window === 'undefined') return () => {}

  const handlePop = () => {
    const route = parseRoute(window.location)
    persistRoute(route.tool, route.tab)
    callback(route)
  }

  const handleCustom = (e) => {
    callback(e.detail)
  }

  window.addEventListener('popstate', handlePop)
  window.addEventListener('editpdf:route', handleCustom)

  return () => {
    window.removeEventListener('popstate', handlePop)
    window.removeEventListener('editpdf:route', handleCustom)
  }
}

/**
 * Persists active route to sessionStorage.
 */
export function persistRoute(tool, tab) {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem('editpdf_active_tool', tool || 'home')
    if (tab) {
      sessionStorage.setItem('editpdf_active_tab', tab)
    } else {
      sessionStorage.removeItem('editpdf_active_tab')
    }
  } catch {}
}

/**
 * Reads persisted route from sessionStorage.
 */
export function getPersistedRoute() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const tool = sessionStorage.getItem('editpdf_active_tool')
    const tab = sessionStorage.getItem('editpdf_active_tab')
    return tool ? { tool, tab } : null
  } catch {
    return null
  }
}

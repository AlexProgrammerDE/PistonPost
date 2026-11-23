// Route-level page containers. Every page uses one of these so the content keeps
// the same left edge and top spacing when people move between pages.
const pageBase = "mx-auto w-full px-4 py-8 sm:px-6 sm:py-10"

// Feeds, profiles, the composer, post editing, and settings.
export const readingPageClassName = `${pageBase} max-w-3xl`

// The post detail page. Its gallery needs more room than a feed column.
export const mediaPageClassName = `${pageBase} max-w-5xl`

// Administration pages with tables and campaign tools.
export const widePageClassName = `${pageBase} max-w-7xl`

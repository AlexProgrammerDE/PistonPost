import type { MouseEvent as ReactMouseEvent } from "react"

import { settingsViews } from "@/lib/settings-views"

const ACTIVE_TRANSITION_ATTRIBUTE = "data-view-transition-active"
const POST_ROUTE_SEGMENT = "post"
const PROFILE_ROUTE_SEGMENT = "user"
const ROUTER_HISTORY_INDEX_KEY = "__TSR_index"
const TAG_ROUTE_SEGMENT = "tag"

type TransitionLocation = {
  readonly pathname: string
  readonly searchStr: string
  readonly state: object
}

export type RouteTransitionInfo = {
  readonly fromLocation?: TransitionLocation
  readonly toLocation: TransitionLocation
  readonly pathChanged: boolean
  readonly hrefChanged: boolean
  readonly hashChanged: boolean
}

export type SharedViewTransitionTarget =
  | { readonly kind: "post"; readonly postId: string }
  | { readonly kind: "profile"; readonly sourcePostId?: string; readonly username: string }
  | { readonly kind: "tag"; readonly sourcePostId?: string; readonly tag: string }

export type ActiveSharedViewTransition = {
  readonly sourcePathname: string
  readonly target: SharedViewTransitionTarget
}

let activeSharedViewTransition: ActiveSharedViewTransition | null = null

function normalizedPathname(pathname: string) {
  return pathname === "/" ? pathname : pathname.replace(/\/+$/, "")
}

function decodedRouteValue(pathname: string, routeSegment: string) {
  const parts = normalizedPathname(pathname).split("/")
  if (parts.length !== 3 || parts[1] !== routeSegment || !parts[2]) return null

  try {
    return decodeURIComponent(parts[2])
  } catch {
    return null
  }
}

function pathMatchesSharedTarget(pathname: string, target: SharedViewTransitionTarget) {
  switch (target.kind) {
    case "post":
      return decodedRouteValue(pathname, POST_ROUTE_SEGMENT) === target.postId
    case "profile":
      return (
        decodedRouteValue(pathname, PROFILE_ROUTE_SEGMENT)?.toLocaleLowerCase("en-US") ===
        target.username.toLocaleLowerCase("en-US")
      )
    case "tag":
      return (
        decodedRouteValue(pathname, TAG_ROUTE_SEGMENT)?.toLocaleLowerCase("en-US") ===
        target.tag.toLocaleLowerCase("en-US")
      )
  }

  return false
}

function targetsMatch(active: SharedViewTransitionTarget, candidate: SharedViewTransitionTarget) {
  if (active.kind !== candidate.kind) return false

  switch (active.kind) {
    case "post":
      return candidate.kind === "post" && active.postId === candidate.postId
    case "profile":
      return (
        candidate.kind === "profile" &&
        active.username.toLocaleLowerCase("en-US") ===
          candidate.username.toLocaleLowerCase("en-US") &&
        (candidate.sourcePostId === undefined ||
          active.sourcePostId === undefined ||
          candidate.sourcePostId === active.sourcePostId)
      )
    case "tag":
      return (
        candidate.kind === "tag" &&
        active.tag.toLocaleLowerCase("en-US") === candidate.tag.toLocaleLowerCase("en-US") &&
        (candidate.sourcePostId === undefined ||
          active.sourcePostId === undefined ||
          candidate.sourcePostId === active.sourcePostId)
      )
  }

  return false
}

function canActivateTransition<TElement extends Element>(event: ReactMouseEvent<TElement>) {
  const target = event.currentTarget.getAttribute("target")
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.defaultPrevented &&
    (!target || target === "_self")
  )
}

export function activateSharedViewTransition<TElement extends Element>(
  event: ReactMouseEvent<TElement>,
  target: SharedViewTransitionTarget,
  sourceElement?: Element | null,
) {
  if (!canActivateTransition(event)) return

  activeSharedViewTransition = {
    sourcePathname: normalizedPathname(window.location.pathname),
    target,
  }

  document.querySelectorAll(`[${ACTIVE_TRANSITION_ATTRIBUTE}]`).forEach((element) => {
    element.removeAttribute(ACTIVE_TRANSITION_ATTRIBUTE)
  })
  const activeElement = sourceElement ?? event.currentTarget
  activeElement.setAttribute(ACTIVE_TRANSITION_ATTRIBUTE, target.kind)
}

export function getActiveSharedViewTransition() {
  return activeSharedViewTransition
}

export function activeSharedViewTransitionKind(
  target: SharedViewTransitionTarget,
): SharedViewTransitionTarget["kind"] | undefined {
  return activeSharedViewTransition && targetsMatch(activeSharedViewTransition.target, target)
    ? target.kind
    : undefined
}

function historyTransitionType(fromLocation: TransitionLocation, toLocation: TransitionLocation) {
  const fromIndex = Reflect.get(fromLocation.state, ROUTER_HISTORY_INDEX_KEY)
  const toIndex = Reflect.get(toLocation.state, ROUTER_HISTORY_INDEX_KEY)
  return fromIndex !== undefined && toIndex !== undefined && fromIndex > toIndex
    ? "page-back"
    : "page-forward"
}

function sharedTransitionType(
  info: RouteTransitionInfo,
  activeTransition: ActiveSharedViewTransition,
) {
  const fromLocation = info.fromLocation
  if (!fromLocation) return null

  const sourcePathname = normalizedPathname(activeTransition.sourcePathname)
  const fromPathname = normalizedPathname(fromLocation.pathname)
  const toPathname = normalizedPathname(info.toLocation.pathname)
  const fromIsTarget = pathMatchesSharedTarget(fromPathname, activeTransition.target)
  const toIsTarget = pathMatchesSharedTarget(toPathname, activeTransition.target)

  if (fromPathname === sourcePathname && toIsTarget && !fromIsTarget) {
    return `${activeTransition.target.kind}-open`
  }
  if (fromIsTarget && toPathname === sourcePathname && !toIsTarget) {
    return `${activeTransition.target.kind}-close`
  }
  return null
}

function postImageIndex(location: TransitionLocation) {
  const value = new URLSearchParams(location.searchStr).get("image")
  if (value === null || value.trim() === "") return 0
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0
}

function postGalleryLayout(location: TransitionLocation) {
  return new URLSearchParams(location.searchStr).get("layout")
}

function galleryTransitionType(fromLocation: TransitionLocation, toLocation: TransitionLocation) {
  const fromPostId = decodedRouteValue(fromLocation.pathname, POST_ROUTE_SEGMENT)
  const toPostId = decodedRouteValue(toLocation.pathname, POST_ROUTE_SEGMENT)
  if (!fromPostId || fromPostId !== toPostId) return null

  if (postGalleryLayout(fromLocation) !== postGalleryLayout(toLocation)) {
    return "gallery-layout"
  }

  const fromImage = postImageIndex(fromLocation)
  const toImage = postImageIndex(toLocation)
  if (fromImage === toImage) return null
  return toImage > fromImage ? "gallery-forward" : "gallery-back"
}

function settingsViewIndex(pathname: string) {
  const prefix = "/account/settings/"
  const normalized = normalizedPathname(pathname)
  if (!normalized.startsWith(prefix)) return null
  const view = normalized.slice(prefix.length)
  const index = settingsViews.findIndex((candidate) => candidate.value === view)
  return index < 0 ? null : index
}

function settingsTransitionType(fromPathname: string, toPathname: string) {
  const fromIndex = settingsViewIndex(fromPathname)
  const toIndex = settingsViewIndex(toPathname)
  if (fromIndex === null || toIndex === null || fromIndex === toIndex) return null
  return toIndex > fromIndex ? "settings-forward" : "settings-back"
}

export function resolveRouteTransitionTypes(
  info: RouteTransitionInfo,
  activeTransition: ActiveSharedViewTransition | null,
): Array<string> | false {
  const fromLocation = info.fromLocation
  if (!fromLocation || !info.hrefChanged) return false

  const galleryType = galleryTransitionType(fromLocation, info.toLocation)
  if (galleryType) return [galleryType]

  if (!info.pathChanged) return false

  if (activeTransition) {
    const sharedType = sharedTransitionType(info, activeTransition)
    if (sharedType) return ["shared", sharedType]
  }

  const settingsType = settingsTransitionType(fromLocation.pathname, info.toLocation.pathname)
  if (settingsType) return [settingsType]

  return [historyTransitionType(fromLocation, info.toLocation)]
}

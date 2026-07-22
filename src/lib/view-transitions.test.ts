import { describe, expect, it } from "bun:test"

import {
  resolveRouteTransitionTypes,
  type ActiveSharedViewTransition,
  type RouteTransitionInfo,
} from "./view-transitions"

function location(pathname: string, index: number, searchStr = "") {
  return { pathname, searchStr, state: { __TSR_index: index } }
}

function transition(
  fromPathname: string,
  toPathname: string,
  options: {
    readonly fromIndex?: number
    readonly fromSearch?: string
    readonly hashChanged?: boolean
    readonly pathChanged?: boolean
    readonly toIndex?: number
    readonly toSearch?: string
  } = {},
): RouteTransitionInfo {
  const pathChanged = options.pathChanged ?? fromPathname !== toPathname
  const fromSearch = options.fromSearch ?? ""
  const toSearch = options.toSearch ?? ""
  return {
    fromLocation: location(fromPathname, options.fromIndex ?? 1, fromSearch),
    toLocation: location(toPathname, options.toIndex ?? 2, toSearch),
    pathChanged,
    hrefChanged: pathChanged || fromSearch !== toSearch || Boolean(options.hashChanged),
    hashChanged: options.hashChanged ?? false,
  }
}

describe("route view transitions", () => {
  it("uses browser history order for ordinary page navigation", () => {
    expect(resolveRouteTransitionTypes(transition("/", "/privacy"), null)).toEqual(["page-forward"])
    expect(
      resolveRouteTransitionTypes(transition("/privacy", "/", { fromIndex: 2, toIndex: 1 }), null),
    ).toEqual(["page-back"])
  })

  it("skips initial, hash-only, and unrelated search updates", () => {
    const initial = transition("/", "/")
    expect(
      resolveRouteTransitionTypes(
        { ...initial, fromLocation: undefined, hrefChanged: false },
        null,
      ),
    ).toBe(false)
    expect(
      resolveRouteTransitionTypes(
        transition("/post/post-1", "/post/post-1", {
          hashChanged: true,
          pathChanged: false,
        }),
        null,
      ),
    ).toBe(false)
    expect(
      resolveRouteTransitionTypes(
        transition("/", "/", {
          fromSearch: "?cursor=one",
          pathChanged: false,
          toSearch: "?cursor=two",
        }),
        null,
      ),
    ).toBe(false)
  })

  it("opens and closes only the activated shared destination and its source", () => {
    const activePost: ActiveSharedViewTransition = {
      sourcePathname: "/user/alex",
      target: { kind: "post", postId: "post-1" },
    }

    expect(
      resolveRouteTransitionTypes(transition("/user/alex", "/post/post-1"), activePost),
    ).toEqual(["shared", "post-open"])
    expect(
      resolveRouteTransitionTypes(
        transition("/post/post-1", "/user/alex", { fromIndex: 2, toIndex: 1 }),
        activePost,
      ),
    ).toEqual(["shared", "post-close"])
    expect(
      resolveRouteTransitionTypes(transition("/post/post-1", "/settings/profile"), activePost),
    ).toEqual(["page-forward"])
  })

  it("matches profile and tag destinations without case sensitivity", () => {
    const activeProfile: ActiveSharedViewTransition = {
      sourcePathname: "/",
      target: { kind: "profile", username: "Alex" },
    }
    const activeTag: ActiveSharedViewTransition = {
      sourcePathname: "/",
      target: { kind: "tag", tag: "Art-Dump" },
    }

    expect(resolveRouteTransitionTypes(transition("/", "/user/alex"), activeProfile)).toEqual([
      "shared",
      "profile-open",
    ])
    expect(resolveRouteTransitionTypes(transition("/", "/tag/art-dump"), activeTag)).toEqual([
      "shared",
      "tag-open",
    ])
  })

  it("uses gallery direction and layout changes for post search state", () => {
    expect(
      resolveRouteTransitionTypes(
        transition("/post/post-1", "/post/post-1", {
          fromSearch: "?image=1&layout=browser",
          pathChanged: false,
          toSearch: "?image=2&layout=browser",
        }),
        null,
      ),
    ).toEqual(["gallery-forward"])
    expect(
      resolveRouteTransitionTypes(
        transition("/post/post-1", "/post/post-1", {
          fromSearch: "?image=2&layout=browser",
          pathChanged: false,
          toSearch: "?image=1&layout=browser",
        }),
        null,
      ),
    ).toEqual(["gallery-back"])
    expect(
      resolveRouteTransitionTypes(
        transition("/post/post-1", "/post/post-1", {
          fromSearch: "?layout=masonry",
          pathChanged: false,
          toSearch: "?image=0&layout=browser",
        }),
        null,
      ),
    ).toEqual(["gallery-layout"])
  })

  it("moves settings panels according to their product order", () => {
    expect(
      resolveRouteTransitionTypes(transition("/settings/profile", "/settings/security"), null),
    ).toEqual(["settings-forward"])
    expect(
      resolveRouteTransitionTypes(
        transition("/settings/notifications", "/settings/account", {
          fromIndex: 4,
          toIndex: 5,
        }),
        null,
      ),
    ).toEqual(["settings-back"])
  })
})

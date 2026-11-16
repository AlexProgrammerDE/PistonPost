"use client"

import { useSession } from "@better-auth-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useLocation } from "@tanstack/react-router"
import { UserCheck, UserPlus } from "lucide-react"
import { toast } from "sonner"

import { authClient } from "@/auth/client"
import { ButtonLink } from "@/components/ButtonLink"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { followKeys, followStateQueryOptions } from "@/lib/queries/follows"
import { userFacingServerMessage } from "@/lib/server-function-error"
import { cn } from "@/lib/utils"
import { setFollow, type FollowTarget } from "@/server/follows"

export function FollowButton({
  target,
  className,
}: {
  readonly target: FollowTarget
  readonly className?: string
}) {
  const session = useSession(authClient)
  const queryClient = useQueryClient()
  const currentHref = useLocation({ select: (location) => location.href })
  const viewerId = session.data?.user.id ?? null
  const state = useQuery({
    ...followStateQueryOptions(viewerId ?? "anonymous", target),
    enabled: viewerId !== null && !session.isPending,
  })
  const mutation = useMutation({
    mutationFn: (following: boolean) => setFollow({ data: { ...target, following } }),
    onSuccess: async (nextState) => {
      if (!viewerId) return
      queryClient.setQueryData(followKeys.state(viewerId, target), nextState)
      await queryClient.invalidateQueries({
        queryKey: ["posts", "following-feed", viewerId],
      })
    },
    onError: (error) =>
      toast.error(userFacingServerMessage(error) ?? "The follow could not be saved."),
  })

  if (session.isPending || (viewerId && state.isPending)) {
    return (
      <Skeleton
        role="status"
        className={cn("h-9 w-20", className)}
        aria-label="Loading follow status"
      />
    )
  }

  if (!viewerId) {
    return (
      <ButtonLink
        variant="outline"
        className={className}
        render={
          <Link
            to="/auth/$authView"
            params={{ authView: "sign-in" }}
            search={{ redirectTo: currentHref }}
          />
        }
      >
        <UserPlus aria-hidden="true" data-icon="inline-start" />
        Follow
      </ButtonLink>
    )
  }

  if (!state.data?.canFollow) return null
  const following = mutation.isPending ? mutation.variables : state.data.following

  return (
    <Button
      variant={following ? "outline" : "default"}
      className={className}
      aria-pressed={following}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!following)}
    >
      {mutation.isPending ? (
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : following ? (
        <UserCheck aria-hidden="true" data-icon="inline-start" />
      ) : (
        <UserPlus aria-hidden="true" data-icon="inline-start" />
      )}
      {following ? "Following" : "Follow"}
    </Button>
  )
}

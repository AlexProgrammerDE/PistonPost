"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Bell, Save, TriangleAlert, UserRound } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ChangeAvatar } from "@/components/auth/settings/account/change-avatar"
import { PushDeviceSettings } from "@/components/push-device-settings"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { NotificationPreference } from "@/domain"
import { useAppForm } from "@/lib/forms/app-form"
import {
  getMyProductSettings,
  updateNotificationPreference,
  updateProfile,
} from "@/server/settings"

type ProductSettings = Awaited<ReturnType<typeof getMyProductSettings>>

function RequiredNotificationStatus({ label }: { label: string }) {
  return (
    <Badge variant="secondary" aria-label={`${label} are required`}>
      Required
    </Badge>
  )
}

function NotificationPreferenceSwitch({
  preference,
  label,
  initialChecked,
}: {
  preference: NotificationPreference
  label: string
  initialChecked: boolean
}) {
  const [checked, setChecked] = useState(initialChecked)
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateNotificationPreference({ data: { preference, enabled } }),
  })
  const feedbackId = `${preference}-feedback`

  function savePreference(enabled: boolean) {
    const previous = checked
    setChecked(enabled)
    mutation.mutate(enabled, {
      onError: () => setChecked(previous),
    })
  }

  return (
    <div
      className="grid min-w-16 justify-items-center gap-1"
      data-invalid={mutation.isError || undefined}
      aria-busy={mutation.isPending}
    >
      <Switch
        id={preference}
        name={preference}
        checked={checked}
        disabled={mutation.isPending}
        onCheckedChange={savePreference}
        aria-label={label}
        aria-describedby={mutation.isError ? feedbackId : undefined}
        aria-invalid={mutation.isError || undefined}
      />
      <span
        id={feedbackId}
        role={mutation.isError ? "alert" : "status"}
        aria-live="polite"
        aria-atomic="true"
        className={
          mutation.isError ? "h-4 text-xs text-destructive" : "h-4 text-xs text-muted-foreground"
        }
      >
        {mutation.isPending
          ? "Saving…"
          : mutation.isError
            ? "Try again"
            : mutation.isSuccess
              ? "Saved"
              : null}
      </span>
    </div>
  )
}

function NotificationRowHeader({ label, description }: { label: string; description: string }) {
  return (
    <TableHead scope="row" className="h-auto min-w-44 py-4 whitespace-normal">
      <span className="block font-medium">{label}</span>
      <span className="mt-1 block text-xs leading-relaxed font-normal text-muted-foreground">
        {description}
      </span>
    </TableHead>
  )
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <Alert variant="destructive">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Settings not saved</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null
}

export function ProfileSettingsForm({ settings }: { settings: ProductSettings }) {
  const queryClient = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const form = useAppForm({
    defaultValues: {
      name: settings.name,
      username: settings.username,
      bio: settings.bio ?? "",
      website: settings.website ?? "",
      location: settings.location ?? "",
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await updateProfile({ data: value })
        await queryClient.invalidateQueries({ queryKey: ["profiles"] })
        toast.success("Profile updated")
      } catch {
        setError("The profile could not be updated. Check the fields and try again.")
      }
    },
  })
  return (
    <form
      className="grid gap-7"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppForm>
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            <UserRound aria-hidden="true" className="size-4 text-muted-foreground" />
            Public profile
          </FieldLegend>
          <FieldGroup>
            <ChangeAvatar />
            <form.AppField name="name">
              {(field) => <field.TextField label="Display name" maxLength={80} />}
            </form.AppField>
            <form.AppField name="username">
              {(field) => <field.TextField label="Username" maxLength={32} />}
            </form.AppField>
            <form.AppField name="bio">
              {(field) => <field.BoundedTextareaField label="Bio" maxLength={500} rows={5} />}
            </form.AppField>
            <form.AppField name="website">
              {(field) => <field.TextField label="Website" type="url" />}
            </form.AppField>
            <form.AppField name="location">
              {(field) => <field.TextField label="Location" maxLength={100} />}
            </form.AppField>
          </FieldGroup>
        </FieldSet>
        <ErrorMessage message={error} />
        <FieldSeparator />
        <Field orientation="horizontal" className="justify-end">
          <form.SubmitButton>
            <Save aria-hidden="true" data-icon="inline-start" />
            Save profile
          </form.SubmitButton>
        </Field>
      </form.AppForm>
    </form>
  )
}

export function NotificationSettingsForm({ settings }: { settings: ProductSettings }) {
  return (
    <FieldSet>
      <FieldLegend className="flex items-center gap-2">
        <Bell aria-hidden="true" className="size-4 text-muted-foreground" />
        Communication preferences
      </FieldLegend>
      <FieldDescription id="notification-preferences-description">
        Choose how PistonPost reaches you. Each change saves immediately.
      </FieldDescription>
      <FieldGroup className="gap-5">
        <PushDeviceSettings vapidPublicKey={settings.vapidPublicKey} />
        <Table
          aria-label="Notification preferences"
          aria-describedby="notification-preferences-description"
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">Notification</TableHead>
              <TableHead scope="col" className="w-24 text-center">
                Email
              </TableHead>
              <TableHead scope="col" className="w-24 text-center">
                Push
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <NotificationRowHeader
                label="Comments"
                description="A new comment appears on your post."
              />
              <TableCell className="text-center">
                <NotificationPreferenceSwitch
                  preference="comment-email"
                  label="Comments by email"
                  initialChecked={settings.commentNotifications}
                />
              </TableCell>
              <TableCell className="text-center">
                <NotificationPreferenceSwitch
                  preference="comment-push"
                  label="Comments by push notification"
                  initialChecked={settings.commentPushNotifications}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <NotificationRowHeader
                label="Replies"
                description="Someone replies to one of your comments."
              />
              <TableCell className="text-center">
                <NotificationPreferenceSwitch
                  preference="reply-email"
                  label="Replies by email"
                  initialChecked={settings.replyNotifications}
                />
              </TableCell>
              <TableCell className="text-center">
                <NotificationPreferenceSwitch
                  preference="reply-push"
                  label="Replies by push notification"
                  initialChecked={settings.replyPushNotifications}
                />
              </TableCell>
            </TableRow>
            <TableRow>
              <NotificationRowHeader
                label="Security"
                description="Important account and sign-in activity."
              />
              <TableCell className="text-center">
                <RequiredNotificationStatus label="Security emails" />
              </TableCell>
              <TableCell className="text-center">
                <RequiredNotificationStatus label="Security push notifications" />
              </TableCell>
            </TableRow>
            <TableRow>
              <NotificationRowHeader
                label="Moderation"
                description="Administrator actions on your content."
              />
              <TableCell className="text-center">
                <RequiredNotificationStatus label="Moderation emails" />
              </TableCell>
              <TableCell className="text-center">
                <RequiredNotificationStatus label="Moderation push notifications" />
              </TableCell>
            </TableRow>
            <TableRow>
              <NotificationRowHeader
                label="Product updates"
                description="Occasional changes to PistonPost itself."
              />
              <TableCell className="text-center">
                <NotificationPreferenceSwitch
                  preference="product-email"
                  label="Product updates by email"
                  initialChecked={settings.productNotifications}
                />
              </TableCell>
              <TableCell className="text-center text-xs text-muted-foreground">
                Not available
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </FieldGroup>
    </FieldSet>
  )
}

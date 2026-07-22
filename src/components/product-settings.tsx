"use client"

import { useQueryClient } from "@tanstack/react-query"
import { Bell, BellRing, Save, TriangleAlert, UserRound } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ChangeAvatar } from "@/components/auth/settings/account/change-avatar"
import { PushDeviceSettings } from "@/components/push-device-settings"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { useAppForm } from "@/lib/forms/app-form"
import {
  getMyProductSettings,
  updateNotificationPreferences,
  updateProfile,
} from "@/server/settings"

type ProductSettings = Awaited<ReturnType<typeof getMyProductSettings>>

function RequiredNotificationSwitch({
  id,
  label,
  description,
}: {
  id: string
  label: string
  description: string
}) {
  return (
    <Field orientation="horizontal" data-disabled className="max-w-2xl">
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      <Switch id={id} checked disabled />
    </Field>
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
              {(field) => <field.TextareaField label="Bio" maxLength={500} rows={5} />}
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
  const [error, setError] = useState<string | null>(null)
  const form = useAppForm({
    defaultValues: {
      commentNotifications: settings.commentNotifications,
      replyNotifications: settings.replyNotifications,
      productNotifications: settings.productNotifications,
      commentPushNotifications: settings.commentPushNotifications,
      replyPushNotifications: settings.replyPushNotifications,
    },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await updateNotificationPreferences({ data: value })
        toast.success("Notification preferences updated")
      } catch {
        setError("Notification preferences could not be updated. Try again.")
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
            <Bell aria-hidden="true" className="size-4 text-muted-foreground" />
            Email notifications
          </FieldLegend>
          <FieldGroup>
            <form.AppField name="commentNotifications">
              {(field) => (
                <field.SwitchField
                  label="Comments"
                  description="A new comment appears on your post."
                />
              )}
            </form.AppField>
            <form.AppField name="replyNotifications">
              {(field) => (
                <field.SwitchField
                  label="Replies"
                  description="Someone replies to one of your comments."
                />
              )}
            </form.AppField>
            <RequiredNotificationSwitch
              id="security-notifications"
              label="Security"
              description="Important account and sign-in activity. Always on."
            />
            <RequiredNotificationSwitch
              id="moderation-notifications"
              label="Moderation"
              description="An administrator takes action on your content. Always on."
            />
            <form.AppField name="productNotifications">
              {(field) => (
                <field.SwitchField
                  label="Product updates"
                  description="Occasional changes to PistonPost itself."
                />
              )}
            </form.AppField>
          </FieldGroup>
        </FieldSet>
        <FieldSet>
          <FieldLegend className="flex items-center gap-2">
            <BellRing aria-hidden="true" className="size-4 text-muted-foreground" />
            Push notifications
          </FieldLegend>
          <FieldDescription>
            Fast alerts from PistonPost on each device you choose to enable.
          </FieldDescription>
          <FieldGroup>
            <PushDeviceSettings vapidPublicKey={settings.vapidPublicKey} />
            <form.AppField name="commentPushNotifications">
              {(field) => (
                <field.SwitchField
                  label="Comments"
                  description="A new comment appears on your post."
                />
              )}
            </form.AppField>
            <form.AppField name="replyPushNotifications">
              {(field) => (
                <field.SwitchField
                  label="Replies"
                  description="Someone replies to one of your comments."
                />
              )}
            </form.AppField>
            <RequiredNotificationSwitch
              id="push-security-notifications"
              label="Security"
              description="Important account and sign-in activity. Always on while push is enabled."
            />
            <RequiredNotificationSwitch
              id="push-moderation-notifications"
              label="Moderation"
              description="An administrator takes action on your content. Always on while push is enabled."
            />
          </FieldGroup>
        </FieldSet>
        <ErrorMessage message={error} />
        <FieldSeparator />
        <Field orientation="horizontal" className="justify-end">
          <form.SubmitButton>
            <Save aria-hidden="true" data-icon="inline-start" />
            Save preferences
          </form.SubmitButton>
        </Field>
      </form.AppForm>
    </form>
  )
}

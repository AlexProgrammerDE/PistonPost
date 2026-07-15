"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"

import { ChangeAvatar } from "@/components/auth/settings/account/change-avatar"
import { TriangleAlert } from "@/components/icons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field"
import { useAppForm } from "@/lib/forms/app-form"
import {
  getMyProductSettings,
  updateNotificationPreferences,
  updateProfile,
} from "@/server/settings"

type ProductSettings = Awaited<ReturnType<typeof getMyProductSettings>>

function ErrorMessage({ message }: { message: string | null }) {
  return message ? (
    <Alert variant="destructive">
      <TriangleAlert />
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
          <FieldLegend>Public profile</FieldLegend>
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
        <div className="flex justify-end border-t pt-5">
          <form.SubmitButton>Save profile</form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
  )
}

export function NotificationSettingsForm({ settings }: { settings: ProductSettings }) {
  const [error, setError] = useState<string | null>(null)
  const form = useAppForm({
    defaultValues: {
      emailNotifications: settings.emailNotifications,
      commentNotifications: settings.commentNotifications,
      replyNotifications: settings.replyNotifications,
      securityNotifications: settings.securityNotifications,
      moderationNotifications: settings.moderationNotifications,
      productNotifications: settings.productNotifications,
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
          <FieldLegend>Email notifications</FieldLegend>
          <FieldGroup>
            <form.AppField name="emailNotifications">
              {(field) => (
                <field.SwitchField
                  label="Email delivery"
                  description="Master switch for optional email notifications."
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.emailNotifications}>
              {(emailNotifications) => (
                <>
                  <form.AppField name="commentNotifications">
                    {(field) => (
                      <field.SwitchField
                        label="Comments"
                        description="A new comment appears on your post."
                        disabled={!emailNotifications}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="replyNotifications">
                    {(field) => (
                      <field.SwitchField
                        label="Replies"
                        description="Someone replies to one of your comments."
                        disabled={!emailNotifications}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="securityNotifications">
                    {(field) => (
                      <field.SwitchField
                        label="Security"
                        description="Important account and sign-in activity."
                        disabled={!emailNotifications}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="moderationNotifications">
                    {(field) => (
                      <field.SwitchField
                        label="Moderation"
                        description="An administrator takes action on your content."
                        disabled={!emailNotifications}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="productNotifications">
                    {(field) => (
                      <field.SwitchField
                        label="Product updates"
                        description="Occasional changes to PistonPost itself."
                        disabled={!emailNotifications}
                      />
                    )}
                  </form.AppField>
                </>
              )}
            </form.Subscribe>
          </FieldGroup>
        </FieldSet>
        <ErrorMessage message={error} />
        <div className="flex justify-end border-t pt-5">
          <form.SubmitButton>Save preferences</form.SubmitButton>
        </div>
      </form.AppForm>
    </form>
  )
}

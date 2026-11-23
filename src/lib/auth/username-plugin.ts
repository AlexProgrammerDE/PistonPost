import { createAuthPlugin, type AuthPluginBase } from "@better-auth-ui/core"
import {
  usernamePlugin as coreUsernamePlugin,
  type UsernamePluginOptions,
} from "@better-auth-ui/core/plugins/username"

import { SignInUsername } from "@/components/auth/username/sign-in-username"
import { UsernameField } from "@/components/auth/username/username-field"

type AppUsernamePluginOptions = UsernamePluginOptions & {
  /**
   * Label for the sign-in identifier field. The sign-in view reads the shared
   * `username` message, so the sign-up field keeps its own label below.
   */
  readonly signInLabel?: string
}

export const usernamePlugin = createAuthPlugin(
  coreUsernamePlugin.id,
  ({ signInLabel, ...options }: AppUsernamePluginOptions = {}) => {
    const core = coreUsernamePlugin(options)
    const signUpLabel = core.localization.username

    // Better Auth UI rebuilds additionalFields from localization when the
    // provider resolves its config, so apply the app field after each rebuild.
    function withAppUsernameUi<Plugin extends AuthPluginBase>(plugin: Plugin): Plugin {
      return {
        ...plugin,
        localization: { ...plugin.localization, username: signInLabel ?? signUpLabel },
        additionalFields: plugin.additionalFields?.map((field) =>
          field.name === "username"
            ? { ...field, label: signUpLabel, render: UsernameField }
            : field,
        ),
      }
    }

    return {
      ...withAppUsernameUi(core),
      _localizationResolver: (plugin: AuthPluginBase, context) =>
        withAppUsernameUi(core._localizationResolver(plugin, context)),
      views: {
        auth: { signIn: SignInUsername },
      },
    }
  },
)

import { createAuthPlugin } from "@better-auth-ui/core"
import {
  deleteUserPlugin as coreDeleteUserPlugin,
  type DeleteUserPluginOptions,
} from "@better-auth-ui/core/plugins"

export const deleteUserPlugin = createAuthPlugin(
  coreDeleteUserPlugin.id,
  (options: DeleteUserPluginOptions = {}) => ({
    ...coreDeleteUserPlugin(options),
    securityCards: [],
  }),
)

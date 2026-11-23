/**
 * Runs a TanStack Query mutation from a TanStack Form `onSubmit`.
 *
 * TanStack Form rethrows `onSubmit` errors from `handleSubmit`, and forms call it with
 * `void form.handleSubmit()`. The mutation's `onError` already reports the failure, so this
 * settles the submit instead of leaving an unhandled promise rejection. The form keeps its values.
 */
export async function submitMutation<TValue>(
  mutateAsync: (value: TValue) => Promise<unknown>,
  value: TValue,
): Promise<void> {
  try {
    await mutateAsync(value)
  } catch {
    // The mutation's onError callback reports the failure to the user.
  }
}

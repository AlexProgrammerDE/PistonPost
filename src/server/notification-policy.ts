export function notificationEnabled(master: boolean | null, category: boolean | null) {
  return master !== false && category !== false
}

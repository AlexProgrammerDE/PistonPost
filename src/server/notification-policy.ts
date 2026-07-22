export function notificationEnabled(category: boolean | null) {
  return category !== false
}

export function optInNotificationEnabled(category: boolean | null) {
  return category === true
}

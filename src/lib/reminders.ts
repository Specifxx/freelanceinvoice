import { addDaysIso, isoToDate, todayIso } from './dates'

/**
 * The escalating ladder. This is the product: Stripe's own invoicing sends a
 * single reminder per unpaid invoice, and that gap is the whole wedge.
 *
 * Rung keys are stable strings, not indexes — `reminders` has a unique
 * constraint on (document_id, rule_key), which is what makes the daily sweep
 * idempotent. Renaming a key would let an old invoice re-fire that rung.
 */
export type ReminderRung = {
  ruleKey: string
  offsetDays: number
  label: string
}

export const REMINDER_LADDER: readonly ReminderRung[] = [
  { ruleKey: 'before_3d', offsetDays: -3, label: '3 days before due' },
  { ruleKey: 'due_0d', offsetDays: 0, label: 'On the due date' },
  { ruleKey: 'after_3d', offsetDays: 3, label: '3 days overdue' },
  { ruleKey: 'after_7d', offsetDays: 7, label: '7 days overdue' },
  { ruleKey: 'after_14d', offsetDays: 14, label: '14 days overdue' },
]

export type ScheduledReminder = {
  ruleKey: string
  scheduledFor: Date
  label: string
}

/**
 * Anchored to 00:00 UTC so the 09:00 UTC daily sweep picks a rung up on the
 * day it falls due. The sweep selects `scheduled_for <= now`, so a late or
 * skipped cron run catches up rather than silently dropping a reminder.
 */
function scheduleInstant(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`)
}

/**
 * Rungs that already fell due before the invoice was sent are skipped, not
 * back-dated. Sending an invoice that is already a week overdue must not fire
 * four reminders at once.
 */
export function computeReminderSchedule(options: {
  dueDate: string
  sentOn?: string
  ladder?: readonly ReminderRung[]
}): ScheduledReminder[] {
  const { dueDate, sentOn = todayIso(), ladder = REMINDER_LADDER } = options
  const sentInstant = isoToDate(sentOn).getTime()

  const scheduled: ScheduledReminder[] = []
  for (const rung of ladder) {
    const dateIso = addDaysIso(dueDate, rung.offsetDays)
    // Strictly after the send date — never a reminder the same day we send.
    if (isoToDate(dateIso).getTime() <= sentInstant) continue
    scheduled.push({
      ruleKey: rung.ruleKey,
      scheduledFor: scheduleInstant(dateIso),
      label: rung.label,
    })
  }
  return scheduled
}

export type ReminderTone = 'friendly' | 'firm'

export function isReminderTone(value: unknown): value is ReminderTone {
  return value === 'friendly' || value === 'firm'
}

export type ReminderCopy = { subject: string; body: string }

type CopyVars = {
  clientName: string
  businessName: string
  invoiceNumber: string
  amount: string
  dueDate: string
  daysOverdue: number
}

/**
 * Wording escalates with the rung, and tone shifts the register. Niches can
 * override any of this — see src/niches.
 */
export function defaultReminderCopy(
  ruleKey: string,
  tone: ReminderTone,
  v: CopyVars,
): ReminderCopy {
  const who = v.clientName || 'there'
  const ref = `${v.invoiceNumber} for ${v.amount}`

  if (ruleKey === 'before_3d') {
    return {
      subject: `Upcoming: invoice ${v.invoiceNumber} due ${v.dueDate}`,
      body:
        tone === 'firm'
          ? `Hi ${who},\n\nA reminder that invoice ${ref} falls due on ${v.dueDate}. Payment by that date would be appreciated.\n\n${v.businessName}`
          : `Hi ${who},\n\nJust a heads-up that invoice ${ref} is due on ${v.dueDate}. No action needed if it's already scheduled.\n\nThanks,\n${v.businessName}`,
    }
  }

  if (ruleKey === 'due_0d') {
    return {
      subject: `Invoice ${v.invoiceNumber} is due today`,
      body:
        tone === 'firm'
          ? `Hi ${who},\n\nInvoice ${ref} is due today, ${v.dueDate}. Please arrange payment.\n\n${v.businessName}`
          : `Hi ${who},\n\nInvoice ${ref} is due today. You can pay it in one tap using the link below.\n\nThanks,\n${v.businessName}`,
    }
  }

  if (ruleKey === 'after_3d') {
    return {
      subject: `Invoice ${v.invoiceNumber} is now overdue`,
      body:
        tone === 'firm'
          ? `Hi ${who},\n\nInvoice ${ref} was due on ${v.dueDate} and is now ${v.daysOverdue} days overdue. Please settle it at your earliest convenience.\n\n${v.businessName}`
          : `Hi ${who},\n\nInvoice ${ref} was due on ${v.dueDate}. I know these things slip through — the payment link below takes a moment.\n\nThanks,\n${v.businessName}`,
    }
  }

  if (ruleKey === 'after_7d') {
    return {
      subject: `Reminder: invoice ${v.invoiceNumber} is ${v.daysOverdue} days overdue`,
      body:
        tone === 'firm'
          ? `Hi ${who},\n\nInvoice ${ref} is now ${v.daysOverdue} days past its due date of ${v.dueDate}. Please arrange payment or let me know when to expect it.\n\n${v.businessName}`
          : `Hi ${who},\n\nFollowing up on invoice ${ref}, now ${v.daysOverdue} days past due. If there's a hold-up on your end, just reply and let me know.\n\nThanks,\n${v.businessName}`,
    }
  }

  return {
    subject: `Overdue: invoice ${v.invoiceNumber} (${v.daysOverdue} days)`,
    body:
      tone === 'firm'
        ? `Hi ${who},\n\nInvoice ${ref} is ${v.daysOverdue} days overdue. Please arrange payment promptly, or reply to confirm a date.\n\n${v.businessName}`
        : `Hi ${who},\n\nInvoice ${ref} is now ${v.daysOverdue} days overdue. I'd appreciate an update on when it can be paid — reply any time.\n\nThanks,\n${v.businessName}`,
  }
}

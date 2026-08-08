import { describe, expect, it } from 'vitest'
import {
  computeReminderSchedule,
  defaultReminderCopy,
  isReminderTone,
  REMINDER_LADDER,
} from './reminders'

const iso = (d: Date) => d.toISOString().slice(0, 10)

describe('computeReminderSchedule', () => {
  it('schedules the full ladder for an invoice sent well before its due date', () => {
    const schedule = computeReminderSchedule({
      dueDate: '2026-09-30',
      sentOn: '2026-09-01',
    })
    expect(schedule.map((s) => s.ruleKey)).toEqual([
      'before_3d',
      'due_0d',
      'after_3d',
      'after_7d',
      'after_14d',
    ])
    expect(iso(schedule[0]!.scheduledFor)).toBe('2026-09-27')
    expect(iso(schedule[1]!.scheduledFor)).toBe('2026-09-30')
    expect(iso(schedule[4]!.scheduledFor)).toBe('2026-10-14')
  })

  it('skips rungs that already fell due, rather than back-dating them', () => {
    // An invoice sent a week after its due date must not fire four reminders
    // the moment it goes out.
    const schedule = computeReminderSchedule({
      dueDate: '2026-09-01',
      sentOn: '2026-09-08',
    })
    expect(schedule.map((s) => s.ruleKey)).toEqual(['after_14d'])
  })

  it('never schedules a reminder on the day of sending', () => {
    const schedule = computeReminderSchedule({
      dueDate: '2026-09-04',
      sentOn: '2026-09-01',
    })
    // before_3d would land on 2026-09-01, the send date itself.
    expect(schedule.map((s) => s.ruleKey)).not.toContain('before_3d')
    expect(schedule[0]!.ruleKey).toBe('due_0d')
  })

  it('returns nothing when every rung is in the past', () => {
    const schedule = computeReminderSchedule({
      dueDate: '2026-01-01',
      sentOn: '2026-06-01',
    })
    expect(schedule).toEqual([])
  })

  it('anchors each reminder to 00:00 UTC so the 09:00 sweep catches it same-day', () => {
    const schedule = computeReminderSchedule({
      dueDate: '2026-09-30',
      sentOn: '2026-09-01',
    })
    for (const item of schedule) {
      expect(item.scheduledFor.toISOString()).toMatch(/T00:00:00\.000Z$/)
    }
  })

  it('crosses month and year boundaries correctly', () => {
    const schedule = computeReminderSchedule({
      dueDate: '2026-12-28',
      sentOn: '2026-12-01',
    })
    expect(iso(schedule.at(-1)!.scheduledFor)).toBe('2027-01-11')
  })

  it('uses stable rule keys — renaming one would let old invoices re-fire', () => {
    expect(REMINDER_LADDER.map((r) => r.ruleKey)).toEqual([
      'before_3d',
      'due_0d',
      'after_3d',
      'after_7d',
      'after_14d',
    ])
  })

  it('produces unique rule keys, which the DB unique index depends on', () => {
    const keys = REMINDER_LADDER.map((r) => r.ruleKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('defaultReminderCopy', () => {
  const vars = {
    clientName: 'Dana',
    businessName: 'Rowan Studio',
    invoiceNumber: 'INV-2026-0007',
    amount: '$1,200.00',
    dueDate: '30 Sep 2026',
    daysOverdue: 7,
  }

  it('escalates wording across the ladder', () => {
    const before = defaultReminderCopy('before_3d', 'friendly', vars)
    const late = defaultReminderCopy('after_14d', 'friendly', vars)
    expect(before.subject).toContain('Upcoming')
    expect(late.subject).toContain('Overdue')
  })

  it('differs by tone', () => {
    const friendly = defaultReminderCopy('after_7d', 'friendly', vars)
    const firm = defaultReminderCopy('after_7d', 'firm', vars)
    expect(friendly.body).not.toBe(firm.body)
  })

  it('interpolates every variable it is given', () => {
    const copy = defaultReminderCopy('after_3d', 'friendly', vars)
    expect(copy.body).toContain('Dana')
    expect(copy.body).toContain('INV-2026-0007')
    expect(copy.body).toContain('$1,200.00')
    expect(copy.body).toContain('Rowan Studio')
  })

  it('degrades gracefully when the client name is unknown', () => {
    const copy = defaultReminderCopy('due_0d', 'friendly', { ...vars, clientName: '' })
    expect(copy.body).toContain('Hi there,')
  })

  it('covers every rung in the ladder with a non-empty subject and body', () => {
    for (const rung of REMINDER_LADDER) {
      for (const tone of ['friendly', 'firm'] as const) {
        const copy = defaultReminderCopy(rung.ruleKey, tone, vars)
        expect(copy.subject.length).toBeGreaterThan(0)
        expect(copy.body.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('isReminderTone', () => {
  it('accepts only known tones', () => {
    expect(isReminderTone('friendly')).toBe(true)
    expect(isReminderTone('firm')).toBe(true)
    expect(isReminderTone('aggressive')).toBe(false)
    expect(isReminderTone(null)).toBe(false)
  })
})

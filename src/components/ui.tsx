import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ' +
  'disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_VARIANTS = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  secondary:
    'bg-white text-slate-900 ring-1 ring-slate-300 ring-inset hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
} as const

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2.5',
  lg: 'px-6 py-3 text-base',
} as const

type ButtonStyleProps = {
  variant?: keyof typeof BUTTON_VARIANTS
  size?: keyof typeof BUTTON_SIZES
}

export function buttonClass({
  variant = 'primary',
  size = 'md',
}: ButtonStyleProps = {}) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size])
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<'button'> & ButtonStyleProps) {
  return (
    <button className={cn(buttonClass({ variant, size }), className)} {...props} />
  )
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & ButtonStyleProps) {
  return (
    <Link className={cn(buttonClass({ variant, size }), className)} {...props} />
  )
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset',
        'placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900',
        className,
      )}
      {...props}
    />
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset',
        'placeholder:text-slate-400 focus:ring-2 focus:ring-slate-900',
        className,
      )}
      {...props}
    />
  )
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 ring-1 ring-slate-300 ring-inset',
        'focus:ring-2 focus:ring-slate-900',
        className,
      )}
      {...props}
    />
  )
}

export function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('block text-xs font-medium text-slate-600', className)}
      {...props}
    />
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl bg-white p-6 ring-1 ring-slate-200',
        className,
      )}
      {...props}
    />
  )
}

export function Badge({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Alert({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'error' | 'success'
  children: ReactNode
}) {
  const tones = {
    info: 'bg-blue-50 text-blue-900 ring-blue-200',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    error: 'bg-red-50 text-red-900 ring-red-200',
    success: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  } as const
  return (
    <div
      className={cn(
        'rounded-lg px-4 py-3 text-sm ring-1 ring-inset',
        tones[tone],
      )}
    >
      {children}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  )
}

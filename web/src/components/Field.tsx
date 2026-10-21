import { useId, type ReactNode } from 'react'

export interface FieldControlProps {
  id: string
  'aria-invalid': boolean
  'aria-describedby'?: string
}

interface FieldProps {
  label: string
  /** Shown in place of the hint, and marks the control invalid. */
  error?: string
  hint?: string
  children: (control: FieldControlProps) => ReactNode
}

export function Field({ label, error, hint, children }: FieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error ?? hint

  return (
    <div className={error ? 'field has-error' : 'field'}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': message ? messageId : undefined })}
      {message && (
        <p id={messageId} className={error ? 'field__error' : 'field__hint'}>
          {message}
        </p>
      )}
    </div>
  )
}

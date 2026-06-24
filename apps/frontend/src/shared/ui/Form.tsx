import type { FormHTMLAttributes } from 'react'

interface FormProps extends Omit<FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  onSubmit: () => void
}

export default function Form({ onSubmit, ...rest }: FormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      {...rest}
    />
  )
}

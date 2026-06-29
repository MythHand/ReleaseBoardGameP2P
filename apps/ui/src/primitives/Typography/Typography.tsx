import { createElement, type ElementType, type HTMLAttributes, type ReactNode } from 'react'
import styles from '../../design/typography.module.css'

// Scale bases (role = family + size + weight + case).
// Mirrors the class names in design/typography.module.css — the single source of values.
export type TypographyBase =
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'heading-5'
  | 'heading-6'
  | 'heading-7'
  | 'heading-8'
  | 'heading-9'
  | 'subtitle'
  | 'body-lg'
  | 'body'
  | 'body-sm'
  | 'body-xs'
  | 'body-2xs'
  | 'label-lg'
  | 'tag'
  | 'pile-label'
  | 'tag-sm'
  | 'numeric-xl'
  | 'code'
  | 'value'
  | 'button'
  | 'numeric'
  | 'mono-lg'
  | 'mono'
  | 'mono-strong'
  | 'notice'
  | 'mono-md'
  | 'code-sm'
  | 'label-md'
  | 'label'
  | 'mono-sm'
  | 'label-sm'
  | 'mono-xs'
  | 'overline'

// Tracking variations (letter-spacing) — modifiers layered on top of a base.
export type TypographyTk =
  | 'tk-0'
  | 'tk-01'
  | 'tk-02'
  | 'tk-03'
  | 'tk-04'
  | 'tk-05'
  | 'tk-06'
  | 'tk-08'
  | 'tk-10'
  | 'tk-12'
  | 'tk-14'
  | 'tk-16'
  | 'tk-18'
  | 'tk-20'
  | 'tk-22'

// Curated semantic variants — the primary API. Each is a base + tk composition
// from the scale; values are not duplicated. The long tail goes through raw base/tk.
export type TypographyVariant =
  | 'pageTitle'
  | 'sectionTitle'
  | 'panelTitle'
  | 'body'
  | 'footnote'
  | 'tag'
  | 'metaLabel'
  | 'code'

interface VariantConfig {
  base: TypographyBase
  tk?: TypographyTk
  tag: ElementType
}

const VARIANTS: Record<TypographyVariant, VariantConfig> = {
  pageTitle: { base: 'heading-3', tk: 'tk-04', tag: 'h1' },
  sectionTitle: { base: 'heading-8', tk: 'tk-04', tag: 'h2' },
  panelTitle: { base: 'subtitle', tk: 'tk-02', tag: 'h3' },
  body: { base: 'body-lg', tag: 'p' },
  footnote: { base: 'body-sm', tag: 'p' },
  tag: { base: 'label', tk: 'tk-16', tag: 'span' },
  metaLabel: { base: 'label-sm', tk: 'tk-14', tag: 'span' },
  code: { base: 'code', tk: 'tk-20', tag: 'span' },
}

type CommonProps = {
  as?: ElementType
  className?: string
  children: ReactNode
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>

// Discriminated: either a semantic variant or a raw base (+tk). Exactly one path.
type VariantPath = { variant: TypographyVariant; base?: never; tk?: never }
type RawPath = { variant?: never; base: TypographyBase; tk?: TypographyTk }

export type TypographyProps = CommonProps & (VariantPath | RawPath)

export default function Typography({
  variant,
  base,
  tk,
  as,
  className,
  children,
  ...rest
}: TypographyProps) {
  const cfg: VariantConfig = variant
    ? VARIANTS[variant]
    : { base: base as TypographyBase, tk, tag: 'span' }
  const element = as ?? cfg.tag
  const cls = [styles[cfg.base], cfg.tk && styles[cfg.tk], className].filter(Boolean).join(' ')
  return createElement(element, { className: cls, ...rest }, children)
}

import { useTranslation } from '@release/translation'
import ReleaseLogo from '@/brand/ReleaseLogo'

interface AppLogoProps {
  className?: string
  // Blink the terminal cursor (RU variant only). Default on; pass false for a
  // static logo (e.g. the lobby header).
  blink?: boolean
}

// ReleaseLogo wired to the active UI language, so callers don't each re-derive
// the variant. Used by the start screen and the lobby header.
export default function AppLogo({ className, blink }: AppLogoProps) {
  const { i18n } = useTranslation()
  const variant = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  return <ReleaseLogo className={className} blink={blink} variant={variant} />
}

import Spinner from '@/primitives/Spinner'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Spinner primitive: a spinning ring, size via the size prop.
const COPY = {
  ru: { sizes: 'Размеры (size)' },
  en: { sizes: 'Sizes (size)' },
}

export default function SpinnerKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Spinner">
      <KitSection title={t.sizes}>
        <KitCell caption="16">
          <Spinner size={16} />
        </KitCell>
        <KitCell caption="24">
          <Spinner size={24} />
        </KitCell>
        <KitCell caption="40">
          <Spinner size={40} />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}

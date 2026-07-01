import Avatar from '@/primitives/Avatar'
import { useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from './KitShell'

// The real Avatar primitive — sizes from the screens + a muted look.
const COPY = {
  ru: {
    sizes: 'Размеры (size в px)',
    muted: 'Приглушённый (не в сети)',
  },
  en: {
    sizes: 'Sizes (size in px)',
    muted: 'Muted (offline)',
  },
}

export default function AvatarsKit() {
  const { lang } = useLang()
  const t = COPY[lang]
  return (
    <KitPage title="Avatars">
      <KitSection title={t.sizes}>
        <KitCell caption="28 · participants">
          <Avatar name="dimbo" size={28} />
        </KitCell>
        <KitCell caption="30 · stats">
          <Avatar name="neo" size={30} />
        </KitCell>
        <KitCell caption="34 · lobby">
          <Avatar name="trinity" size={34} />
        </KitCell>
      </KitSection>

      <KitSection title={t.muted}>
        <KitCell caption="muted">
          <Avatar name="morpheus" size={34} muted />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}

import Avatar from '@/primitives/Avatar'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Avatar — размеры из экранов + приглушённый вид.
export default function AvatarsKit() {
  return (
    <KitPage title="Avatars">
      <KitSection title="Размеры (size в px)">
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

      <KitSection title="Приглушённый (не в сети)">
        <KitCell caption="muted">
          <Avatar name="morpheus" size={34} muted />
        </KitCell>
      </KitSection>
    </KitPage>
  )
}

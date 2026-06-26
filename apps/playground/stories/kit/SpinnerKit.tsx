import Spinner from '@/primitives/Spinner'
import { KitCell, KitPage, KitSection } from './KitShell'

// Реальный примитив Spinner: крутящееся кольцо, размер через проп size.
export default function SpinnerKit() {
  return (
    <KitPage title="Spinner">
      <KitSection title="Размеры (size)">
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

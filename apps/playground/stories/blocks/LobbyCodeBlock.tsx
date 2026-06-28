import LobbyCode, { LOBBY_CODE_COPY_EN, LOBBY_CODE_COPY_RU } from '@/blocks/LobbyCode'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// Блок «код игры»: метка + кнопка копирования слева от кода.
export default function LobbyCodeBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: LOBBY_CODE_COPY_RU, en: LOBBY_CODE_COPY_EN })

  return (
    <KitPage title="Lobby code" tag="блок">
      <KitSection title="Код игры">
        <LobbyCode code="4F2A-9K" copy={copy} />
      </KitSection>
    </KitPage>
  )
}

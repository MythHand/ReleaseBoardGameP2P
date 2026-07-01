import LobbyCode, { LOBBY_CODE_COPY_EN, LOBBY_CODE_COPY_RU } from '@/blocks/LobbyCode'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// The "game code" block: a label + a copy button to the left of the code.
export default function LobbyCodeBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: LOBBY_CODE_COPY_RU, en: LOBBY_CODE_COPY_EN })

  return (
    <KitPage title="Lobby code" tag="block">
      <KitSection title={pick(lang, { ru: 'Код игры', en: 'Game code' })}>
        <LobbyCode code="4F2A-9K" copy={copy} />
      </KitSection>
    </KitPage>
  )
}

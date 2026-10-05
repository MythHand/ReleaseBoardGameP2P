import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import LobbyCode from '@/blocks/LobbyCode'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// The "game code" block: a label + copy button(s) to the left of the code.
export default function LobbyCodeBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.lobbyCode, en: enCommon.lobbyCode })

  return (
    <KitPage title="Lobby code" tag="block">
      <KitSection title={pick(lang, { ru: 'Ссылка + код', en: 'Link + code' })}>
        <LobbyCode code="4F2A-9K" link="release.game/lobby/4F2A-9K" copy={copy} />
      </KitSection>
      <KitSection title={pick(lang, { ru: 'Только код', en: 'Code only' })}>
        <LobbyCode code="4F2A-9K" copy={copy} />
      </KitSection>
    </KitPage>
  )
}

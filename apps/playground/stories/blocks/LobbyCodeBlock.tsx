import LobbyCode from '@/blocks/LobbyCode'
import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// The "game code" block: a label + a copy button to the left of the code.
export default function LobbyCodeBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.lobbyCode, en: enCommon.lobbyCode })

  return (
    <KitPage title="Lobby code" tag="block">
      <KitSection title={pick(lang, { ru: 'Код игры', en: 'Game code' })}>
        <LobbyCode code="4F2A-9K" copy={copy} />
      </KitSection>
    </KitPage>
  )
}

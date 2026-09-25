import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import BugRunner from '@/blocks/BugRunner'
import { pick, useLang } from '../../Playground/lang'
import { KitCell, KitPage, KitSection } from '../kit/KitShell'

// The lobby header's mini-game: a click wakes the bug and makes it jump. It has
// no size of its own — it takes the header's — so each example here gives it
// one, about the header's height: the full width of the page, and squeezed.
export default function BugRunnerBlock() {
  const { lang } = useLang()
  const label = pick(lang, {
    ru: ruCommon.lobbyScreen.bugRunner,
    en: enCommon.lobbyScreen.bugRunner,
  })

  return (
    <KitPage title="Bug runner" tag="block">
      <KitSection title={pick(lang, { ru: 'Во всю ширину', en: 'Full width' })}>
        <KitCell
          caption={pick(lang, {
            ru: 'как в шапке лобби, высота 60',
            en: 'as in the lobby header, 60 tall',
          })}
          wide
        >
          <div style={{ inlineSize: '100%', blockSize: 60 }}>
            <BugRunner label={label} />
          </div>
        </KitCell>
      </KitSection>
      <KitSection title={pick(lang, { ru: 'Узко', en: 'Narrow' })}>
        <KitCell caption="360 × 60">
          <div style={{ inlineSize: 360, blockSize: 60 }}>
            <BugRunner label={label} />
          </div>
        </KitCell>
      </KitSection>
    </KitPage>
  )
}

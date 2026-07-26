import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import PhysicalEdition from '@/blocks/PhysicalEdition'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './PhysicalEditionBlock.module.css'

// order/preorder link — the team's Instagram (as on the start screen)
const INSTAGRAM_URL = 'https://www.instagram.com/mythhand.team/'

// The "physical edition" block: a matte plate with a title, caption and order
// link + box art bleeding past the top edge. Copy follows the language toggle.
export default function PhysicalEditionBlock() {
  const { lang } = useLang()
  return (
    <KitPage title="Physical edition" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Плашка печатного издания — во всю доступную ширину',
          en: 'Physical edition plate — full available width',
        })}
      >
        <div className={styles.panel}>
          <PhysicalEdition
            href={INSTAGRAM_URL}
            copy={pick(lang, { ru: ruCommon.physicalEdition, en: enCommon.physicalEdition })}
            className={styles.placed}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}

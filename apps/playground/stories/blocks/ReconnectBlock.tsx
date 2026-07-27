import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import Typography from '@/primitives/Typography'
import Reconnect from '@/table/Reconnect'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './ReconnectBlock.module.css'

export default function ReconnectBlock() {
  const { lang } = useLang()
  const copy = pick(lang, { ru: ruCommon.reconnect, en: enCommon.reconnect })

  return (
    <KitPage title="Reconnect" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Терминальное окно реконнекта (прототип, моки)',
          en: 'Terminal reconnect window (prototype, mock data)',
        })}
      >
        <div className={styles.stage}>
          <Typography base="mono-md" tk="tk-10" as="div" className={styles.filler}>
            {pick(lang, { ru: 'стол под окном', en: 'table under the window' })}
          </Typography>
          {/* the real @release/ui block — mock room address in the header */}
          <Reconnect copy={copy} host="ABC-DEF" />
        </div>
      </KitSection>
    </KitPage>
  )
}

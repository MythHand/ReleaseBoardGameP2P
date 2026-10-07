import { en as enCommon, ru as ruCommon } from '@release/translation/catalog'
import { useState } from 'react'
import { PRESET_AVATARS } from '@/avatars/PresetAvatar'
import PlayerSettings from '@/blocks/PlayerSettings'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'
import styles from './PlayerSettingsBlock.module.css'

// avatars held by other players in this demo
const TAKEN = ['attack-bug', 'defense-rubber-ducky', 'support-sudo']

// The player settings block on its own: the content of the settings modal,
// without the modal around it.
export default function PlayerSettingsBlock() {
  const { lang } = useLang()
  const [avatar, setAvatar] = useState<string | null>('release-frontend')
  const [nickname, setNickname] = useState('Dimbo')

  return (
    <KitPage title="Player settings" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Содержимое модалки настроек игрока',
          en: 'Player settings modal content',
        })}
      >
        <div className={styles.panel}>
          <PlayerSettings
            avatars={PRESET_AVATARS.map((p) => ({ id: p.id, label: pick(lang, p.label) }))}
            avatar={avatar}
            taken={TAKEN}
            onAvatarChange={setAvatar}
            nickname={nickname}
            onNicknameChange={setNickname}
            copy={pick(lang, { ru: ruCommon.playerSettings, en: enCommon.playerSettings })}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}

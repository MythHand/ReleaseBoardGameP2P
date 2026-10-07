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
// without the modal around it — a player's (avatar + nickname) and a
// spectator's (nickname only).
export default function PlayerSettingsBlock() {
  const { lang } = useLang()
  const [avatar, setAvatar] = useState<string | null>('release-frontend')
  const [nickname, setNickname] = useState('Dimbo')
  const [spectatorNickname, setSpectatorNickname] = useState('oracle')
  const copy = pick(lang, { ru: ruCommon.playerSettings, en: enCommon.playerSettings })

  return (
    <KitPage title="Player settings" tag="block">
      <KitSection
        title={pick(lang, {
          ru: 'Игрок — аватар и никнейм',
          en: 'Player — avatar and nickname',
        })}
      >
        <div className={styles.panel}>
          <PlayerSettings
            avatars={{
              items: PRESET_AVATARS.map((p) => ({ id: p.id, label: pick(lang, p.label) })),
              selected: avatar,
              taken: TAKEN,
              onChange: setAvatar,
            }}
            nickname={nickname}
            onNicknameChange={setNickname}
            copy={copy}
          />
        </div>
      </KitSection>

      <KitSection
        title={pick(lang, {
          ru: 'Зритель — только никнейм',
          en: 'Spectator — nickname only',
        })}
      >
        <div className={styles.panelNarrow}>
          <PlayerSettings
            nickname={spectatorNickname}
            onNicknameChange={setSpectatorNickname}
            copy={copy}
          />
        </div>
      </KitSection>
    </KitPage>
  )
}

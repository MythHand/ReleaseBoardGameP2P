import PresetAvatar from '@/avatars/PresetAvatar'
import { randomNickname, sanitizeNickname } from '@/game/nicknames'
import DiceIcon from '@/icons/DiceIcon'
import Button from '@/primitives/Button'
import Input from '@/primitives/Input'
import Typography from '@/primitives/Typography'
import styles from './PlayerSettings.module.css'

// Side of one avatar in the grid, in px.
const AVATAR_SIZE = 88

export interface PlayerSettingsCopy {
  // names the avatar grid for assistive tech
  avatars: string
  nicknameLabel: string
  nicknamePlaceholder: string
  randomNick: string
  // shown under the field while the typed nickname belongs to someone else
  nicknameTaken: string
}

export interface PlayerSettingsAvatar {
  // preset id (a card id in PARALLAX_CARDS)
  id: string
  // localized name, read out for the avatar's button
  label: string
}

interface PlayerSettingsProps {
  avatars: PlayerSettingsAvatar[]
  // the avatar this player has picked
  avatar: string | null
  // avatars picked by other players — shown, but cannot be picked
  taken?: string[]
  onAvatarChange: (id: string) => void
  nickname: string
  onNicknameChange: (nickname: string) => void
  // the typed nickname is already someone else's — the consumer decides
  nicknameTaken?: boolean
  copy: PlayerSettingsCopy
}

// Content of the player settings modal: the stock avatars on the left, the
// nickname on the right. Holds no state — what is picked, what other players
// hold and the nickname all come from the consumer.
export default function PlayerSettings({
  avatars,
  avatar,
  taken = [],
  onAvatarChange,
  nickname,
  onNicknameChange,
  nicknameTaken = false,
  copy,
}: PlayerSettingsProps) {
  return (
    <div className={styles.grid}>
      <fieldset className={styles.avatars} aria-label={copy.avatars}>
        {avatars.map(({ id, label }) => {
          const locked = taken.includes(id)
          const selected = id === avatar
          return (
            <button
              key={id}
              type="button"
              className={`${styles.cell}${selected ? ` ${styles.selected}` : ''}`}
              aria-label={label}
              aria-pressed={selected}
              disabled={locked}
              onClick={() => onAvatarChange(id)}
            >
              <PresetAvatar id={id} size={AVATAR_SIZE} muted={locked} />
            </button>
          )
        })}
      </fieldset>

      <div className={styles.nickname}>
        <Input
          label={copy.nicknameLabel}
          value={nickname}
          onChange={(e) => onNicknameChange(sanitizeNickname(e.target.value))}
          placeholder={copy.nicknamePlaceholder}
          maxLength={20}
          plain
          error={nicknameTaken ? copy.nicknameTaken : undefined}
          trailing={
            <Button
              variant="icon"
              onClick={() => onNicknameChange(randomNickname())}
              aria-label={copy.randomNick}
              title={copy.randomNick}
            >
              <DiceIcon />
            </Button>
          }
        />
        {/* a slot of fixed height, so the error does not move what is below */}
        <div className={styles.nicknameStatus} aria-live="polite">
          {nicknameTaken && (
            <Typography as="span" base="mono-xs">
              {copy.nicknameTaken}
            </Typography>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import PlayerSlot, { EmptySlot } from '@/blocks/PlayerSlot'
import Badge from '@/primitives/Badge'
import Toggle from '@/primitives/Toggle'
import { pick, useLang } from '../../Playground/lang'
import { KitPage, KitSection } from '../kit/KitShell'

// A lobby participant row in every variation: me (toggle), player (dropdown),
// offline, spectator, empty slot. The "⋯" dropdown is rendered by the block
// itself via the Dropdown primitive.
export default function PlayerSlotBlock() {
  const { lang } = useLang()
  const [ready, setReady] = useState(true)

  const t = pick(lang, {
    ru: {
      you: 'вы',
      host: 'host',
      ready: 'готов',
      notReady: 'не готов',
      waiting: 'ожидание',
      offline: 'не в сети',
      guest: 'зритель',
      makeSpectator: 'Сделать зрителем',
      makePlayer: 'Сделать игроком',
      kick: 'Исключить',
      noSlot: 'Нет доступного слота',
      freeSlot: 'свободный слот',
    },
    en: {
      you: 'you',
      host: 'host',
      ready: 'ready',
      notReady: 'not ready',
      waiting: 'waiting',
      offline: 'offline',
      guest: 'spectator',
      makeSpectator: 'Make spectator',
      makePlayer: 'Make player',
      kick: 'Kick',
      noSlot: 'No free slot',
      freeSlot: 'free slot',
    },
  })

  return (
    <KitPage title="Player slot" tag="block">
      <KitSection title={pick(lang, { ru: 'Строка участника', en: 'Participant row' })}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, inlineSize: 380 }}>
          <PlayerSlot
            name="dimbo"
            me
            youLabel={t.you}
            badge={
              <Badge tone="success" size="sm" outlined>
                {t.host}
              </Badge>
            }
            status={
              <Toggle on={ready} onChange={() => setReady((v) => !v)}>
                {ready ? t.ready : t.notReady}
              </Toggle>
            }
          />

          <PlayerSlot
            name="neo"
            status={<Badge tone="muted">{t.waiting}</Badge>}
            dropdown={[
              { label: t.makeSpectator, onClick: () => {} },
              { label: t.kick, danger: true, onClick: () => {} },
            ]}
          />

          <PlayerSlot name="morpheus" offline status={<Badge tone="muted">{t.offline}</Badge>} />

          <PlayerSlot
            name="oracle"
            status={<Badge tone="muted">{t.guest}</Badge>}
            dropdown={[
              { label: t.makePlayer, disabled: true, hint: t.noSlot, onClick: () => {} },
              { label: t.kick, danger: true, onClick: () => {} },
            ]}
          />

          <EmptySlot>{t.freeSlot}</EmptySlot>
        </div>
      </KitSection>
    </KitPage>
  )
}
